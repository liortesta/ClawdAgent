import { WebSocketServer, WebSocket } from 'ws';
import { Engine } from '../../../core/engine.js';
import { verifyToken } from '../../../security/auth.js';
import logger from '../../../utils/logger.js';

const AUTH_TIMEOUT_MS = 10000; // 10 seconds to authenticate

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

      const { text } = msg;
      if (!text) return;

      // Prevent concurrent requests from same user
      if (processing) {
        sendSafe(ws, { type: 'error', data: { message: 'Still processing previous message, please wait...' } });
        return;
      }
      processing = true;
      cancelled = false;

      // Register progress listener for this user
      progressListeners.set(user.userId, (event) => {
        if (!cancelled) sendSafe(ws, { type: 'progress', data: event });
      });

      // Send initial "processing" status
      sendSafe(ws, { type: 'progress', data: {
        type: 'status',
        message: 'Processing your message...',
      } });

      const startTime = Date.now();

      // Set a timeout to send "still working" updates
      currentKeepAlive = setInterval(() => {
        if (cancelled) return;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        sendSafe(ws, { type: 'progress', data: {
          type: 'status',
          message: `Still working... (${elapsed}s)`,
        } });
      }, 8000);

      try {
        const response = await engine.process({
          platform: 'web', userId: user.userId, userName: user.userId, chatId: 'ws', text, userRole: user.role,
          onProgress: (event) => {
            if (!cancelled) sendSafe(ws, { type: 'progress', data: event });
          },
        });

        cleanup();

        // If cancelled while processing, discard the response silently
        if (cancelled) return;

        const elapsed = Math.round((Date.now() - startTime) / 1000);

        sendSafe(ws, { type: 'message', data: {
          text: response.text,
          thinking: response.thinking,
          agent: response.agentUsed,
          provider: response.provider,
          tokens: response.tokensUsed ? response.tokensUsed.input + response.tokensUsed.output : undefined,
          elapsed,
        } });
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
