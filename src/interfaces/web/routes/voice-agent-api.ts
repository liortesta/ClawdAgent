/**
 * Voice Agent API routes — manage voice calls via Twilio + OpenAI Realtime.
 * Includes Twilio webhook endpoints (no auth) and authenticated management routes.
 */
import { Router, Request, Response } from 'express';
import { TwilioVoiceAgent } from '../../../actions/voice/twilio-voice-agent.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../../../utils/logger.js';

export function setupVoiceAgentRoutes(): Router {
  const router = Router();
  const agent = TwilioVoiceAgent.getInstance();

  // ── Twilio Webhooks (NO auth — Twilio cannot authenticate) ────────

  /** POST /api/voice-agent/twilio-webhook — Twilio voice webhook, returns TwiML */
  router.post('/twilio-webhook', async (req: Request, res: Response) => {
    try {
      const twiml = await agent.handleIncomingCall(req.body ?? {});
      res.type('text/xml').send(twiml);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Twilio webhook error', { error: msg });
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say></Response>');
    }
  });

  /** POST /api/voice-agent/call-status — Twilio status callback */
  router.post('/call-status', async (req: Request, res: Response) => {
    try {
      await agent.handleCallStatus(req.body ?? {});
      res.sendStatus(200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Call status webhook error', { error: msg });
      res.sendStatus(200); // Always return 200 to Twilio
    }
  });

  // ── Authenticated Management Routes ───────────────────────────────

  /** GET /api/voice-agent/calls — call history */
  router.get('/calls', authMiddleware, async (_req: Request, res: Response) => {
    try {
      const limit = parseInt(_req.query.limit as string) || 50;
      const calls = await agent.getCallHistory(limit);
      res.json({ calls });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  /** GET /api/voice-agent/stats — aggregate call statistics */
  router.get('/stats', authMiddleware, async (_req: Request, res: Response) => {
    try {
      const stats = await agent.getCallStats();
      res.json(stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  /** GET /api/voice-agent/active — active calls */
  router.get('/active', authMiddleware, (_req: Request, res: Response) => {
    res.json({ calls: agent.getActiveCalls() });
  });

  /** POST /api/voice-agent/call — initiate outbound call */
  router.post('/call', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { to, instructions } = req.body ?? {};
      if (!to) { res.status(400).json({ error: 'Phone number (to) is required' }); return; }

      const callSid = await agent.initiateOutboundCall(to, instructions);
      res.json({ ok: true, callSid });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Outbound call failed', { error: msg });
      res.status(400).json({ error: msg });
    }
  });

  /** POST /api/voice-agent/hangup/:callSid — end a call */
  router.post('/hangup/:callSid', authMiddleware, async (req: Request, res: Response) => {
    try {
      await agent.hangupCall(req.params.callSid as string);
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  /** GET /api/voice-agent/config — get voice agent config */
  router.get('/config', authMiddleware, (_req: Request, res: Response) => {
    res.json(agent.getConfig());
  });

  /** PUT /api/voice-agent/config — update voice agent config */
  router.put('/config', authMiddleware, (req: Request, res: Response) => {
    try {
      const updated = agent.updateConfig(req.body ?? {});
      res.json({ ok: true, config: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  return router;
}
