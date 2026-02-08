import logger from '../../utils/logger.js';

export async function handleMedia(mimetype: string): Promise<string> {
  logger.info('WhatsApp media received', { mimetype });
  return 'Media processing coming soon.';
}
