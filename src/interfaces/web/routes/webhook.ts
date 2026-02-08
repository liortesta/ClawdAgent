import { Router, Request, Response } from 'express';
import logger from '../../../utils/logger.js';
import config from '../../../config.js';

// ─── OpenClaw Webhook Event Types ────────────────────────────────────────────

export interface OpenClawEvent {
  type: 'cron_completed' | 'opportunity_found' | 'error' | 'task_completed' | 'message' | 'alert' | string;
  source?: string;
  jobName?: string;
  cronId?: string;
  summary?: string;
  message?: string;
  data?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  timestamp?: string;
  sessionKey?: string;
  runId?: string;
}

// ─── Telegram sender + OpenClaw executor (injected from index.ts) ────────────

type TelegramSender = (chatId: number | string, text: string) => Promise<void>;
type OpenClawExecutor = (action: string, params?: Record<string, unknown>) => Promise<{ output: string; success: boolean; error?: string }>;

let telegramSender: TelegramSender | null = null;
let openclawExecutor: OpenClawExecutor | null = null;

// Map to track which Telegram message IDs are OpenClaw events (for reply detection)
const openclawMessageIds = new Map<number, { sessionKey?: string; source?: string; type: string }>();

export function setWebhookTelegramSender(sender: TelegramSender) {
  telegramSender = sender;
}

export function setWebhookOpenClawExecutor(executor: OpenClawExecutor) {
  openclawExecutor = executor;
}

export function getOpenClawMessageContext(messageId: number) {
  return openclawMessageIds.get(messageId);
}

export function trackOpenClawMessage(messageId: number, context: { sessionKey?: string; source?: string; type: string }) {
  openclawMessageIds.set(messageId, context);
  // Cleanup old entries (keep last 500)
  if (openclawMessageIds.size > 500) {
    const oldest = openclawMessageIds.keys().next().value;
    if (oldest !== undefined) openclawMessageIds.delete(oldest);
  }
}

export function getOpenClawExecutor(): OpenClawExecutor | null {
  return openclawExecutor;
}

// ─── Format event for Telegram ───────────────────────────────────────────────

function formatEventForTelegram(event: OpenClawEvent): string {
  const emoji = getEventEmoji(event.type);
  const typeLabel = getEventLabel(event.type);

  const lines: string[] = [`${emoji} OpenClaw [${typeLabel}]:`];

  if (event.jobName) {
    lines.push(`Job: ${event.jobName}`);
  }

  if (event.summary) {
    lines.push('');
    lines.push(event.summary);
  } else if (event.message) {
    lines.push('');
    lines.push(event.message);
  }

  if (event.data) {
    const dataStr = Object.entries(event.data)
      .filter(([_, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    if (dataStr) {
      lines.push('');
      lines.push(dataStr);
    }
  }

  if (event.severity && event.severity !== 'low') {
    lines.push('');
    lines.push(`Severity: ${event.severity}`);
  }

  return lines.join('\n');
}

function getEventEmoji(type: string): string {
  switch (type) {
    case 'cron_completed': return '\u{1F4CB}';  // clipboard
    case 'opportunity_found': return '\u{1F4B0}'; // money bag
    case 'error': return '\u{1F534}';             // red circle
    case 'task_completed': return '\u{2705}';     // check
    case 'message': return '\u{1F4AC}';           // speech bubble
    case 'alert': return '\u{26A0}\uFE0F';        // warning
    default: return '\u{1F990}';                  // lobster (🦞)
  }
}

function getEventLabel(type: string): string {
  switch (type) {
    case 'cron_completed': return 'Cron Completed';
    case 'opportunity_found': return 'Opportunity Found';
    case 'error': return 'Error';
    case 'task_completed': return 'Task Completed';
    case 'message': return 'Message';
    case 'alert': return 'Alert';
    default: return type;
  }
}

// ─── Webhook Routes ──────────────────────────────────────────────────────────

export function setupWebhookRoutes(): Router {
  const router = Router();

  // POST /webhook/openclaw — Receive events from OpenClaw
  router.post('/openclaw', async (req: Request, res: Response) => {
    try {
      const event = req.body as OpenClawEvent;

      if (!event || !event.type) {
        res.status(400).json({ error: 'Missing event type' });
        return;
      }

      logger.info('OpenClaw webhook received', {
        type: event.type,
        jobName: event.jobName,
        source: event.source,
        severity: event.severity,
      });

      // Format and send to Telegram
      if (telegramSender && config.TELEGRAM_ADMIN_IDS.length > 0) {
        const text = formatEventForTelegram(event);

        for (const adminId of config.TELEGRAM_ADMIN_IDS) {
          try {
            await telegramSender(adminId, text);
          } catch (err: any) {
            logger.warn('Failed to forward webhook to Telegram', { adminId, error: err.message });
          }
        }
      }

      res.json({ ok: true, received: event.type });
    } catch (err: any) {
      logger.error('Webhook processing error', { error: err.message });
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /webhook/openclaw — Health check for the webhook endpoint
  router.get('/openclaw', (_req: Request, res: Response) => {
    res.json({
      status: 'active',
      endpoint: '/webhook/openclaw',
      method: 'POST',
      events: ['cron_completed', 'opportunity_found', 'error', 'task_completed', 'message', 'alert'],
    });
  });

  return router;
}
