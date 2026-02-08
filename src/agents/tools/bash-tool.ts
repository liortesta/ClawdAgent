import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const execAsync = promisify(exec);

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /:(){ :|:& };:/,
  /fork\s+bomb/i,
  /DROP\s+DATABASE/i,
  /TRUNCATE\s+TABLE/i,
  />\s*\/dev\/sd/,
];

export class BashTool extends BaseTool {
  name = 'bash';
  description = 'Execute bash commands safely';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    let command = input.command as string;
    if (!command) return { success: false, output: '', error: 'No command provided' };

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        this.error('Blocked dangerous command', { command });
        return { success: false, output: '', error: `Blocked: dangerous command pattern detected` };
      }
    }

    // Auto-SSH: if DEFAULT_SSH_SERVER is set, wrap command in SSH
    const isAlreadySSH = /^(ssh|sshpass|scp|sftp)\s/.test(command);
    if (config.DEFAULT_SSH_SERVER && !isAlreadySSH) {
      const escaped = command.replace(/"/g, '\\"');
      const keyFlag = config.DEFAULT_SSH_KEY_PATH ? `-i "${config.DEFAULT_SSH_KEY_PATH}" ` : '';
      command = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${keyFlag}${config.DEFAULT_SSH_SERVER} "${escaped}"`;
      this.log('Auto-SSH wrapping', { server: config.DEFAULT_SSH_SERVER, originalCommand: input.command });
    }

    try {
      this.log('Executing', { command });
      const { stdout, stderr } = await execAsync(command, { timeout: 30000, maxBuffer: 1024 * 1024 });
      return { success: true, output: stdout + (stderr ? `\nSTDERR: ${stderr}` : '') };
    } catch (error: any) {
      return { success: false, output: error.stdout ?? '', error: error.message };
    }
  }
}
