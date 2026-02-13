import QRCode from 'qrcode';
import logger from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Shared WhatsApp auth state — accessed by client.ts and the web QR route
// ---------------------------------------------------------------------------

export type WhatsAppAuthStatus = 'waiting' | 'authenticated' | 'auth_failure' | 'disconnected';

/** Current authentication status */
let currentStatus: WhatsAppAuthStatus = 'disconnected';

/** Latest raw QR string (null when already authenticated or not yet received) */
let latestQR: string | null = null;

// ---------------------------------------------------------------------------
// Setters (called from WhatsAppClient lifecycle events)
// ---------------------------------------------------------------------------

export function setWhatsAppStatus(status: WhatsAppAuthStatus): void {
  currentStatus = status;
  logger.debug('WhatsApp auth status changed', { status });
}

export function setLatestQR(qr: string | null): void {
  latestQR = qr;
  if (qr) {
    logger.info('WhatsApp QR stored for web/Telegram retrieval');
  }
}

// ---------------------------------------------------------------------------
// Getters (called from the web route / Telegram admin)
// ---------------------------------------------------------------------------

/** Return the current auth status */
export function getWhatsAppStatus(): WhatsAppAuthStatus {
  return currentStatus;
}

/** Return the raw QR string (to be rendered by the consumer) */
export function getLatestQR(): string | null {
  return latestQR;
}

/**
 * Generate a data-URL PNG image of the current QR code.
 * Returns null when there is no QR pending.
 */
export async function generateQRDataURL(qr: string | null): Promise<string | null> {
  if (!qr) return null;

  try {
    return await QRCode.toDataURL(qr, { width: 300, margin: 2 });
  } catch {
    logger.error('Failed to generate QR data URL');
    return null;
  }
}

/**
 * Original helper kept for backward-compat — returns the raw QR string.
 */
export function generateQRForWeb(qr: string): string {
  logger.info('WhatsApp QR generated');
  return qr;
}
