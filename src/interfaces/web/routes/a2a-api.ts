/**
 * A2A + ACP Protocol HTTP Routes
 * Exposes the Agent-to-Agent (Google/LF) and Agent Communication Protocol (IBM/LF) endpoints.
 *
 * A2A endpoints:
 *   GET  /.well-known/agent.json        — Agent Card (public, no auth)
 *   POST /a2a                           — JSON-RPC 2.0 dispatcher
 *   POST /a2a/stream                    — SSE streaming
 *   GET  /a2a/tasks/:id                 — Get task (REST shorthand)
 *   GET  /a2a/tasks                     — List tasks
 *   POST /a2a/tasks/:id/cancel          — Cancel task
 *   GET  /a2a/tasks/:id/subscribe       — SSE subscribe to task updates
 *
 * ACP endpoints:
 *   GET  /acp/agent                     — Agent descriptor
 *   POST /acp/runs                      — Create run
 *   GET  /acp/runs                      — List runs
 *   GET  /acp/runs/:id                  — Get run
 *   POST /acp/runs/:id/cancel           — Cancel run
 *   POST /acp/runs/:id/input            — Add input to run
 */

import { Router, Request, Response } from 'express';
import { buildAgentCard } from '../../../protocols/a2a/agent-card.js';
import {
  handleJsonRpc, sendMessageStream, getTask, listTasks,
  cancelTask, subscribe, getTaskStats,
} from '../../../protocols/a2a/task-manager.js';
import {
  buildAgentDescriptor, createRun, getRun, listRuns,
  cancelRun, addInput, getRunStats,
} from '../../../protocols/acp/handler.js';
import type { Engine } from '../../../core/engine.js';
import type { JsonRpcRequest, SendMessageParams } from '../../../protocols/a2a/types.js';
import type { ACPMessage } from '../../../protocols/acp/types.js';
import logger from '../../../utils/logger.js';

/** Build the base URL from the request */
function getBaseUrl(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'http';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
  return `${proto}://${host}`;
}

// ─── A2A Routes ─────────────────────────────────────────────────────────────

export function setupA2ARoutes(engine: Engine): Router {
  const router = Router();

  // ── Agent Card (public — no auth required) ──────────────────────────────
  // Registered on /.well-known/agent.json in server.ts (outside this router)

  // ── JSON-RPC 2.0 Endpoint ──────────────────────────────────────────────
  router.post('/', async (req: Request, res: Response) => {
    const body = req.body as JsonRpcRequest;

    // Validate JSON-RPC structure
    if (!body || body.jsonrpc !== '2.0' || !body.method || body.id === undefined) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
      });
      return;
    }

    logger.info('A2A JSON-RPC request', { method: body.method, id: body.id });

    const response = await handleJsonRpc(body, engine);
    res.json(response);
  });

  // ── SSE Streaming Endpoint ─────────────────────────────────────────────
  router.post('/stream', async (req: Request, res: Response) => {
    const params = req.body as SendMessageParams;

    if (!params?.message?.parts?.length) {
      res.status(400).json({ error: 'Message with parts is required' });
      return;
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const { task, subscribe: sub } = await sendMessageStream(params, engine);

      // Send initial task event
      res.write(`event: task\ndata: ${JSON.stringify({ taskId: task.id, status: task.status })}\n\n`);

      // Subscribe to events
      const unsub = sub((event) => {
        try {
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          if (event.type === 'status' && event.final) {
            res.write('event: done\ndata: {}\n\n');
            unsub();
            res.end();
          }
        } catch {
          unsub();
        }
      });

      // Clean up on client disconnect
      req.on('close', () => { unsub(); });
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
      res.end();
    }
  });

  // ── REST Shorthand Endpoints ───────────────────────────────────────────

  // GET /a2a/tasks — list tasks
  router.get('/tasks', (_req: Request, res: Response) => {
    const contextId = _req.query.contextId as string | undefined;
    const limit = parseInt(_req.query.limit as string) || 50;
    res.json({ tasks: listTasks(contextId, limit) });
  });

  // GET /a2a/tasks/:id — get task
  router.get('/tasks/:id', (req: Request, res: Response) => {
    const taskId = String(req.params.id);
    const historyLength = req.query.historyLength ? parseInt(req.query.historyLength as string) : undefined;
    const task = getTask({ id: taskId, historyLength });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(task);
  });

  // POST /a2a/tasks/:id/cancel — cancel task
  router.post('/tasks/:id/cancel', (req: Request, res: Response) => {
    const task = cancelTask({ id: String(req.params.id) });
    if (!task) { res.status(404).json({ error: 'Task not found or not cancelable' }); return; }
    res.json(task);
  });

  // GET /a2a/tasks/:id/subscribe — SSE subscribe to task updates
  router.get('/tasks/:id/subscribe', (req: Request, res: Response) => {
    const task = getTask({ id: String(req.params.id) });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send current state
    res.write(`event: status\ndata: ${JSON.stringify({ taskId: task.id, status: task.status, final: false })}\n\n`);

    // Subscribe to future events
    const unsub = subscribe(task.id, (event) => {
      try {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'status' && event.final) {
          res.write('event: done\ndata: {}\n\n');
          unsub();
          res.end();
        }
      } catch { unsub(); }
    });

    req.on('close', () => { unsub(); });
  });

  // GET /a2a/stats — protocol statistics
  router.get('/stats', (_req: Request, res: Response) => {
    res.json({ protocol: 'a2a', version: '0.2.1', tasks: getTaskStats() });
  });

  return router;
}

// ─── ACP Routes ─────────────────────────────────────────────────────────────

export function setupACPRoutes(engine: Engine): Router {
  const router = Router();

  // GET /acp/agent — agent descriptor
  router.get('/agent', (_req: Request, res: Response) => {
    res.json(buildAgentDescriptor());
  });

  // POST /acp/runs — create a new run
  router.post('/runs', async (req: Request, res: Response) => {
    const { messages, agentId } = req.body as { messages?: ACPMessage[]; agentId?: string };

    if (!messages?.length) {
      res.status(400).json({ error: 'messages array is required', statusCode: 400 });
      return;
    }

    try {
      const run = await createRun(messages, engine, agentId);
      res.status(201).json(run);
    } catch (err) {
      logger.error('ACP run creation failed', { error: String(err) });
      res.status(500).json({ error: 'Run creation failed', message: String(err), statusCode: 500 });
    }
  });

  // GET /acp/runs — list runs
  router.get('/runs', (_req: Request, res: Response) => {
    const limit = parseInt(_req.query.limit as string) || 50;
    res.json({ runs: listRuns(limit) });
  });

  // GET /acp/runs/:id — get run
  router.get('/runs/:id', (req: Request, res: Response) => {
    const run = getRun(String(req.params.id));
    if (!run) { res.status(404).json({ error: 'Run not found', statusCode: 404 }); return; }
    res.json(run);
  });

  // POST /acp/runs/:id/cancel — cancel run
  router.post('/runs/:id/cancel', (req: Request, res: Response) => {
    const run = cancelRun(String(req.params.id));
    if (!run) { res.status(404).json({ error: 'Run not found or not cancelable', statusCode: 404 }); return; }
    res.json(run);
  });

  // POST /acp/runs/:id/input — add input to run
  router.post('/runs/:id/input', async (req: Request, res: Response) => {
    const { messages } = req.body as { messages?: ACPMessage[] };
    if (!messages?.length) {
      res.status(400).json({ error: 'messages array is required', statusCode: 400 });
      return;
    }

    const run = await addInput(String(req.params.id), messages, engine);
    if (!run) { res.status(404).json({ error: 'Run not found or not accepting input', statusCode: 404 }); return; }
    res.json(run);
  });

  // GET /acp/stats — protocol statistics
  router.get('/stats', (_req: Request, res: Response) => {
    res.json({ protocol: 'acp', version: '0.1.0', runs: getRunStats() });
  });

  return router;
}

// ─── Agent Card Route (for server.ts to register at /.well-known/) ──────────

export function setupAgentCardRoute(_engine: Engine): Router {
  const router = Router();

  router.get('/agent.json', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    const card = buildAgentCard(baseUrl);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache 1h
    res.json(card);
  });

  return router;
}
