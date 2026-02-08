import logger from '../../utils/logger.js';

// Sender function injected by index.ts after interfaces are started
let sendFn: ((userId: string, platform: string, text: string) => Promise<void>) | null = null;

export function setReminderSender(fn: typeof sendFn) {
  sendFn = fn;
}

export async function handleReminder(data: { userId: string; message: string; platform: string }) {
  logger.info('Sending reminder', { userId: data.userId, platform: data.platform });

  if (!sendFn) {
    logger.warn('Reminder sender not configured — cannot deliver reminder');
    return;
  }

  try {
    await sendFn(data.userId, data.platform, `⏰ **Reminder:** ${data.message}`);
    logger.info('Reminder delivered', { userId: data.userId });
  } catch (err: any) {
    logger.error('Failed to send reminder', { userId: data.userId, error: err.message });
  }
}
