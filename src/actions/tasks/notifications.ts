import logger from '../../utils/logger.js';

export type SendFunction = (userId: string, message: string) => Promise<void>;

const senders: Map<string, SendFunction> = new Map();

export function registerSender(platform: string, fn: SendFunction) {
  senders.set(platform, fn);
}

export async function notifyUser(userId: string, platform: string, message: string) {
  const sender = senders.get(platform);
  if (!sender) {
    logger.warn('No sender for platform', { platform });
    return;
  }
  await sender(userId, message);
}
