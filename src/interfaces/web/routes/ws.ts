import { WebSocketServer, WebSocket } from 'ws';
import { Engine } from '../../../core/engine.js';
import { verifyToken } from '../../../security/auth.js';
import logger from '../../../utils/logger.js';

const AUTH_TIMEOUT_MS = 10000; // 10 seconds to authenticate
const PENDING_RESPONSE_TTL_MS = 5 * 60 * 1000; // 5 minutes — keep undelivered responses for reconnection

// ─── Live Progress System ───────────────────────────────────────────────────
// Allows the engine/tools to push progress updates to connected WebSocket clients

type ProgressCallback = (event: ProgressEvent) => void;
export interface ProgressEvent {
  type: 'status' | 'agent' | 'tool' | 'thinking' | 'error';
  message: string;
  agent?: string;
  tool?: string;
}

// Per-user progress listeners (set during engine.process, cleared after)
const progressListeners = new Map<string, ProgressCallback>();

export function emitProgress(userId: string, event: ProgressEvent) {
  const listener = progressListeners.get(userId);
  if (listener) listener(event);
}

// ─── Global Notification Broadcast ──────────────────────────────────────────
// All authenticated WebSocket clients receive system notifications in real-time
const authenticatedClients = new Map<string, Set<WebSocket>>();

function registerAuthenticatedClient(userId: string, ws: WebSocket) {
  if (!authenticatedClients.has(userId)) authenticatedClients.set(userId, new Set());
  authenticatedClients.get(userId)!.add(ws);
  ws.on('close', () => {
    authenticatedClients.get(userId)?.delete(ws);
    if (authenticatedClients.get(userId)?.size === 0) authenticatedClients.delete(userId);
  });
}

/** Broadcast a notification to all connected clients */
export function emitNotification(notification: unknown) {
  const msg = JSON.stringify({ type: 'notification', data: notification });
  for (const clients of authenticatedClients.values()) {
    for (const ws of clients) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      } catch { /* ignore */ }
    }
  }
}

// ─── Pending Response Queue ─────────────────────────────────────────────────
// Stores responses that were computed while the client was disconnected
interface PendingResponse {
  conversationId?: string;
  data: any;
  timestamp: number;
}
const pendingResponses = new Map<string, PendingResponse[]>();

function storePendingResponse(userId: string, conversationId: string | undefined, data: any) {
  if (!pendingResponses.has(userId)) pendingResponses.set(userId, []);
  pendingResponses.get(userId)!.push({ conversationId, data, timestamp: Date.now() });
}

function flushPendingResponses(userId: string, ws: WebSocket): number {
  const pending = pendingResponses.get(userId);
  if (!pending || pending.length === 0) return 0;

  const now = Date.now();
  let delivered = 0;

  for (const item of pending) {
    // Skip expired responses
    if (now - item.timestamp > PENDING_RESPONSE_TTL_MS) continue;
    sendSafe(ws, { type: 'recovered_message', data: item.data });
    delivered++;
  }

  pendingResponses.delete(userId);
  return delivered;
}

// Periodic cleanup of expired pending responses (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [userId, items] of pendingResponses) {
    const alive = items.filter(i => now - i.timestamp <= PENDING_RESPONSE_TTL_MS);
    if (alive.length === 0) {
      pendingResponses.delete(userId);
    } else {
      pendingResponses.set(userId, alive);
    }
  }
}, 5 * 60 * 1000);

// ─── WebSocket Setup ────────────────────────────────────────────────────────

export function setupWebSocket(wss: WebSocketServer, engine: Engine) {
  wss.on('connection', (ws: WebSocket, req) => {
    let user: { userId: string; role: string } | null = null;

    // Support both: token in query string (legacy) and token in first message (secure)
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('token');

    // Also check Sec-WebSocket-Protocol header for token (more secure than query string)
    const protocolToken = req.headers['sec-websocket-protocol'] as string | undefined;

    // Try to authenticate from headers/query immediately
    const initialToken = protocolToken ?? queryToken;
    if (initialToken) {
      try {
        user = verifyToken(initialToken);
        logger.info('WebSocket connected (header auth)', { userId: user.userId });
      } catch {
        ws.close(4001, 'Invalid token');
        return;
      }
    }

    // If not authenticated yet, wait for auth message
    if (!user) {
      const authTimer = setTimeout(() => {
        if (!user) {
          ws.close(4001, 'Authentication timeout');
        }
      }, AUTH_TIMEOUT_MS);

      ws.once('message', (data) => {
        clearTimeout(authTimer);
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth' && msg.token) {
            user = verifyToken(msg.token);
            logger.info('WebSocket connected (message auth)', { userId: user.userId });
            ws.send(JSON.stringify({ type: 'auth', data: { ok: true, userId: user.userId } }));
            // Flush any pending responses from before disconnect
            const recovered = flushPendingResponses(user.userId, ws);
            if (recovered > 0) {
              logger.info(`Delivered ${recovered} pending response(s) after reconnect`, { userId: user.userId });
            }
            setupMessageHandler(ws, engine, user);
          } else {
            ws.close(4001, 'First message must be auth');
          }
        } catch {
          ws.close(4001, 'Invalid token');
        }
      });
      return;
    }

    // Flush any pending responses (header-auth path)
    const recovered = flushPendingResponses(user.userId, ws);
    if (recovered > 0) {
      logger.info(`Delivered ${recovered} pending response(s) after reconnect`, { userId: user.userId });
    }
    setupMessageHandler(ws, engine, user);
  });
}

function sendSafe(ws: WebSocket, data: unknown) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch { /* client disconnected */ }
}

function setupMessageHandler(ws: WebSocket, engine: Engine, user: { userId: string; role: string }) {
  // Register for global notification broadcasts
  registerAuthenticatedClient(user.userId, ws);

  let processing = false;
  let cancelled = false;
  let currentKeepAlive: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    if (currentKeepAlive) { clearInterval(currentKeepAlive); currentKeepAlive = null; }
    progressListeners.delete(user.userId);
    processing = false;
  }

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // ── Cancel request ──────────────────────────────────────────
      if (msg.type === 'cancel') {
        if (processing) {
          cancelled = true;
          cleanup();
          sendSafe(ws, { type: 'cancelled', data: { message: 'Request cancelled' } });
          logger.info('Request cancelled by user', { userId: user.userId });
        }
        return;
      }

      const { text, conversationId, responseMode, model } = msg;
      if (!text) return;

      // ── Direct command execution: !command ──────────────────────
      // Bypass AI entirely — run bash directly for instant results
      // Supports multiple commands: each line starting with ! is a separate command
      if (text.startsWith('!')) {
        if (processing) {
          sendSafe(ws, { type: 'error', data: { message: 'Still processing previous message, please wait...' } });
          return;
        }
        processing = true;

        // Parse commands: split by newline, each line starting with ! is a command
        const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
        const commands: string[] = [];
        for (const line of lines) {
          if (line.startsWith('!')) {
            commands.push(line.slice(1).trim());
          } else if (commands.length === 0) {
            // First line without ! — treat everything as one command
            commands.push(text.slice(1).trim());
            break;
          }
        }

        if (commands.length === 0 || commands.every(c => !c)) { processing = false; return; }

        const startTime = Date.now();
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        // Block dangerous commands
        const dangerous = [/rm\s+-rf\s+\/(?!\w)/, /mkfs\./, /dd\s+if=/, /:\(\)\s*\{/, /shutdown/, /reboot/];

        const results: string[] = [];
        for (const command of commands) {
          if (!command) continue;
          sendSafe(ws, { type: 'progress', data: { type: 'tool', message: `⚡ ${command.slice(0, 100)}` } });

          if (dangerous.some(p => p.test(command))) {
            results.push(`$ ${command}\n🚫 פקודה מסוכנת — חסומה`);
            continue;
          }

          try {
            const { stdout, stderr } = await execAsync(command, {
              timeout: 60000,
              maxBuffer: 1024 * 1024,
              cwd: process.cwd(),
            });
            const output = (stdout || '') + (stderr ? `\nSTDERR: ${stderr}` : '');
            results.push(`$ ${command}\n${output.trim() || '(no output)'}`);
          } catch (err: any) {
            const errOut = [err.stdout, err.stderr].filter(Boolean).join('\n');
            results.push(`$ ${command}\n❌ ${err.message}${errOut ? '\n' + errOut : ''}`);
          }
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        sendSafe(ws, { type: 'message', data: {
          text: results.join('\n\n'),
          agent: 'terminal',
          elapsed,
          conversationId,
        } });
        processing = false;
        return;
      }

      // Prevent concurrent requests from same user
      if (processing) {
        sendSafe(ws, { type: 'error', data: { message: 'Still processing previous message, please wait...' } });
        return;
      }
      processing = true;
      cancelled = false;

      // ── Smart progress tracking ──
      let lastRealEventTime = Date.now();
      let currentAgent = '';
      let currentTool = '';
      let toolIterations = 0;

      // Register progress listener for this user
      progressListeners.set(user.userId, (event) => {
        if (cancelled) return;
        lastRealEventTime = Date.now();
        if (event.agent) currentAgent = event.agent;
        if (event.tool) currentTool = event.tool;
        if (event.type === 'tool') toolIterations++;
        sendSafe(ws, { type: 'progress', data: event });
      });

      // Send initial "processing" status
      sendSafe(ws, { type: 'progress', data: {
        type: 'status',
        message: 'Processing your message...',
      } });

      const startTime = Date.now();

      // Smart keepalive — only sends when no real event for 10s, with context
      currentKeepAlive = setInterval(() => {
        if (cancelled) return;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const sinceLast = Date.now() - lastRealEventTime;

        // Skip if a real event was sent recently (within 10s)
        if (sinceLast < 10000) return;

        // Build contextual message
        const parts: string[] = [];
        if (currentAgent) parts.push(currentAgent);
        if (currentTool) parts.push(`${currentTool}`);
        if (toolIterations > 0) parts.push(`${toolIterations} steps`);
        parts.push(`${elapsed}s`);

        sendSafe(ws, { type: 'progress', data: {
          type: 'status',
          message: parts.length > 1
            ? `${parts[0]} — working... (${parts.slice(1).join(', ')})`
            : `Working... (${elapsed}s)`,
        } });
      }, 10000);

      try {
        // Signal streaming start to client
        sendSafe(ws, { type: 'stream_start', data: { conversationId } });

        const response = await engine.process({
          platform: 'web', userId: user.userId, userName: user.userId, chatId: 'ws', text, userRole: user.role,
          conversationId, responseMode, model,
          onProgress: (event) => {
            if (cancelled) return;
            lastRealEventTime = Date.now();
            if (event.agent) currentAgent = event.agent;
            if (event.tool) currentTool = event.tool;
            if (event.type === 'tool') toolIterations++;
            sendSafe(ws, { type: 'progress', data: event });
          },
          // Stream text tokens to client as they arrive
          onTextChunk: (text) => {
            if (cancelled) return;
            sendSafe(ws, { type: 'text_chunk', data: { text } });
          },
          // Reset streaming when a new tool iteration starts
          onStreamReset: () => {
            if (cancelled) return;
            sendSafe(ws, { type: 'stream_reset', data: {} });
          },
        });

        cleanup();

        // If cancelled while processing, discard the response silently
        if (cancelled) return;

        const elapsed = Math.round((Date.now() - startTime) / 1000);

        const responseData = {
          text: response.text,
          thinking: response.thinking,
          agent: response.agentUsed,
          provider: response.provider,
          model: response.modelUsed,
          modelDisplay: (response as any).modelDisplay || response.modelUsed, // Human-readable model name
          tokens: response.tokensUsed ? {
            input: response.tokensUsed.input,
            output: response.tokensUsed.output,
            total: response.tokensUsed.input + response.tokensUsed.output,
          } : undefined,
          elapsed,
          conversationId,
        };

        // If WS disconnected during processing, store for later delivery
        if (ws.readyState !== WebSocket.OPEN) {
          storePendingResponse(user.userId, conversationId, responseData);
          logger.info('Response stored in pending queue (client disconnected)', { userId: user.userId, conversationId });
        } else {
          sendSafe(ws, { type: 'message', data: responseData });
        }
      } catch (error: any) {
        cleanup();
        if (!cancelled) {
          sendSafe(ws, { type: 'error', data: { message: error.message } });
        }
      }
    } catch {
      processing = false;
      sendSafe(ws, { type: 'error', data: { message: 'Invalid message format' } });
    }
  });

  ws.on('close', () => {
    cleanup();
    logger.debug('WebSocket disconnected', { userId: user.userId });
  });
}
