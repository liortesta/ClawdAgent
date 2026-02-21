import { Router, Request, Response } from 'express';
import logger from '../../../utils/logger.js';
import { executeTool } from '../../../core/tool-executor.js';

/**
 * OpenClaw direct chat API routes.
 * Provides a dedicated interface for communicating directly with OpenClaw,
 * separate from the main agent chat.
 */
export function setupOpenClawRoutes(): Router {
  const router = Router();

  /**
   * POST /api/openclaw/chat
   * Send a message to OpenClaw and wait for the AI response.
   * Uses the 'agent' method which waits for the full response (up to ~120s).
   */
  router.post('/chat', async (req: Request, res: Response) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    try {
      const result = await executeTool('openclaw', {
        action: 'agent',
        message: text,
        agentId: 'main',
      });

      // Extract AI response text from agent result
      // Agent response format: { runId, status, summary, result: { payloads: [{ text, mediaUrl }], meta: {...} } }
      let responseText = '';
      if (result.output) {
        try {
          const parsed = JSON.parse(result.output);
          // Primary: agent result payloads
          if (parsed?.result?.payloads?.length) {
            responseText = parsed.result.payloads.map((p: any) => p.text).filter(Boolean).join('\n');
          }
          // Fallback: various common fields
          if (!responseText) {
            responseText = parsed?.text || parsed?.message || parsed?.summary || result.output;
          }
        } catch {
          responseText = result.output;
        }
      }

      res.json({
        message: responseText || (result.success ? 'No response from OpenClaw' : 'OpenClaw request failed'),
        success: result.success,
      });
    } catch (err: any) {
      logger.error('OpenClaw chat error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/openclaw/agent
   * Run an OpenClaw agent task.
   */
  router.post('/agent', async (req: Request, res: Response) => {
    const { message, agentId } = req.body;
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    try {
      const result = await executeTool('openclaw', {
        action: 'agent',
        message,
        ...(agentId ? { agentId } : {}),
      });

      res.json({
        message: result.output || 'Agent task sent',
        success: result.success,
        raw: result,
      });
    } catch (err: any) {
      logger.error('OpenClaw agent error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/openclaw/status
   * Get OpenClaw connection status.
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const result = await executeTool('openclaw', { action: 'status' });
      let data: any = null;
      if (result.output) {
        try {
          const parsed = JSON.parse(result.output);
          data = typeof parsed === 'string' ? parsed.slice(0, 500) : parsed;
        } catch {
          data = result.output.slice(0, 500);
        }
      }
      res.json({
        status: result.success ? 'connected' : 'error',
        connected: result.success,
        data,
      });
    } catch (err: any) {
      res.json({ status: 'disconnected', connected: false, error: err.message });
    }
  });

  /**
   * GET /api/openclaw/sessions
   * List OpenClaw sessions.
   */
  router.get('/sessions', async (_req: Request, res: Response) => {
    try {
      const result = await executeTool('openclaw', { action: 'sessions_list' });
      res.json({ sessions: result.output ? JSON.parse(result.output) : [], success: result.success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/openclaw/raw
   * Send a raw method call to OpenClaw gateway.
   */
  router.post('/raw', async (req: Request, res: Response) => {
    const { method, params } = req.body;
    if (!method) {
      res.status(400).json({ error: 'method is required' });
      return;
    }

    try {
      const result = await executeTool('openclaw', {
        action: 'raw',
        method,
        params: params || {},
      });
      res.json({ output: result.output, success: result.success, error: result.error });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
