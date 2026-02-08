import logger from '../utils/logger.js';

const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+\*/i,
  /mkfs/i,
  /dd\s+if=.*of=\/dev/i,
  /:()\s*{\s*:|:&\s*};:/,
  /DROP\s+(DATABASE|TABLE)/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM\s+\w+\s*;?\s*$/i,
  /chmod\s+777\s+\//i,
  /curl.*\|\s*(bash|sh)/i,
  /wget.*\|\s*(bash|sh)/i,
  />\s*\/etc\//i,
  /git\s+push\s+--force\s+(origin\s+)?(main|master)/i,
];

const CAUTION_COMMANDS = [
  /npm\s+install/i,
  /apt(-get)?\s+install/i,
  /pip\s+install/i,
  /docker\s+(rm|stop|kill)/i,
  /systemctl\s+(restart|stop)/i,
  /git\s+push/i,
];

export interface GuardResult {
  allowed: boolean;
  level: 'safe' | 'caution' | 'blocked';
  reason?: string;
}

export function guardCommand(command: string): GuardResult {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      logger.warn('Command blocked', { command: command.slice(0, 100) });
      return { allowed: false, level: 'blocked', reason: `Blocked: matches dangerous pattern` };
    }
  }

  for (const pattern of CAUTION_COMMANDS) {
    if (pattern.test(command)) {
      return { allowed: true, level: 'caution', reason: 'Write operation — requires confirmation' };
    }
  }

  return { allowed: true, level: 'safe' };
}
