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
  // Encoded/obfuscated command execution — blocks base64 decode piped to shell,
  // eval of encoded strings, python/perl -e with shell calls, etc.
  /base64\s+-d\s*\|\s*(bash|sh|zsh)/i,
  /\|\s*base64\s+-d\s*\|\s*(bash|sh)/i,
  /eval\s*\$\(.*base64/i,
  /python[23]?\s+-c\s+.*import\s+os/i,
  /perl\s+-e\s+.*system\s*\(/i,
  /\|\s*(bash|sh|zsh)\s*$/i,         // anything piped to shell at end of command
  /xargs\s+.*rm\b/i,                  // xargs rm (bulk delete bypass)
  /find\s+\/\s+-.*-delete/i,          // find / -delete (recursive root delete)
  />\s*\/dev\/[sh]d[a-z]/i,           // write to disk devices
  /shutdown|reboot|halt|poweroff/i,   // system power commands
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
