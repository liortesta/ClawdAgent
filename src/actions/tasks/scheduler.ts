import { scheduleReminder } from '../../queue/scheduler.js';
import dayjs from 'dayjs';
import logger from '../../utils/logger.js';

export async function setReminder(userId: string, message: string, when: string, platform: string) {
  const target = dayjs(when);
  const delay = target.diff(dayjs());

  if (delay <= 0) throw new Error('Reminder time must be in the future');

  await scheduleReminder({ userId, message, platform }, delay);
  logger.info('Reminder set', { userId, when: target.format(), delay });

  return { scheduledFor: target.format('YYYY-MM-DD HH:mm'), message };
}
