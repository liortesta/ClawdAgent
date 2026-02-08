import { Request, Response } from 'express';
import crypto from 'crypto';
import config from '../../config.js';
import logger from '../../utils/logger.js';

export function verifyWebhookSignature(req: Request): boolean {
  const secret = config.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) return false;

  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function handleWebhook(req: Request, res: Response) {
  if (!verifyWebhookSignature(req)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = req.headers['x-github-event'] as string;
  logger.info('GitHub webhook received', { event });

  switch (event) {
    case 'issues':
      logger.info('Issue event', { action: req.body.action, number: req.body.issue?.number });
      break;
    case 'pull_request':
      logger.info('PR event', { action: req.body.action, number: req.body.pull_request?.number });
      break;
    case 'push':
      logger.info('Push event', { ref: req.body.ref });
      break;
  }

  res.status(200).json({ ok: true });
}
