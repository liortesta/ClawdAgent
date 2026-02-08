import logger from '../../utils/logger.js';

export function generateQRForWeb(qr: string): string {
  // Return QR as text for terminal display
  logger.info('WhatsApp QR generated');
  return qr;
}
