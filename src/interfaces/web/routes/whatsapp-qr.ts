import { Router, Request, Response } from 'express';
import { getLatestQR, getWhatsAppStatus, generateQRDataURL } from '../../whatsapp/auth.js';
import logger from '../../../utils/logger.js';

/**
 * WhatsApp QR code API routes.
 *
 * All routes are mounted behind authMiddleware by the web server,
 * so only authenticated dashboard users can access the QR.
 */
export function setupWhatsAppQRRoutes(): Router {
  const router = Router();

  /**
   * GET /api/whatsapp/qr
   *
   * Returns the current WhatsApp auth status and QR code (if waiting).
   *
   * Response:
   *   { qr: string | null, qrDataUrl: string | null, status: 'waiting' | 'authenticated' | 'auth_failure' | 'disconnected' }
   */
  router.get('/qr', async (_req: Request, res: Response) => {
    const status = getWhatsAppStatus();
    const qr = getLatestQR();
    const qrDataUrl = await generateQRDataURL(qr);

    logger.debug('WhatsApp QR endpoint hit', { status, hasQR: !!qr });

    res.json({ qr, qrDataUrl, status });
  });

  /**
   * GET /api/whatsapp/status
   *
   * Lightweight status-only check (no QR payload).
   */
  router.get('/status', (_req: Request, res: Response) => {
    res.json({ status: getWhatsAppStatus() });
  });

  return router;
}
