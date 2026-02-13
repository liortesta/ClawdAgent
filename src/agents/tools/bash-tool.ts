import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';
import { guardCommand } from '../../security/command-guard.js';
import { sandboxCommand, getSandboxedEnv, SANDBOX_LIMITS } from '../../security/bash-sandbox.js';
import { audit } from '../../security/audit-log.js';

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  name = 'bash';
  description = 'Execute bash commands safely';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    let command = input.command as string;
    const userId = (input.userId as string) ?? 'system';
    if (!command) return { success: false, output: '', error: 'No command provided' };

    // Layer 1: Command guard — block dangerous patterns
    const guardResult = guardCommand(command);
    if (!guardResult.allowed) {
      this.error('Command blocked by guard', { command: command.slice(0, 100), reason: guardResult.reason });
      await audit(userId, 'bash.blocked', { command: command.slice(0, 200), reason: guardResult.reason });
      return { success: false, output: '', error: guardResult.reason ?? 'Blocked: dangerous command' };
    }

    // Layer 2: Sandbox — check for secret exfiltration
    const sandboxResult = sandboxCommand(command);
    if (!sandboxResult.allowed) {
      this.error('Command blocked by sandbox', { command: command.slice(0, 100), reason: sandboxResult.reason });
      await audit(userId, 'bash.sandbox_blocked', { command: command.slice(0, 200), reason: sandboxResult.reason });
      return { success: false, output: '', error: sandboxResult.reason ?? 'Blocked: sandbox violation' };
    }

    // Log caution-level commands
    if (guardResult.level === 'caution') {
      this.log('Caution command executing', { command: command.slice(0, 100), reason: guardResult.reason });
      await audit(userId, 'bash.caution', { command: command.slice(0, 200) });
    }

    // Auto-SSH: if DEFAULT_SSH_SERVER is set, wrap command in SSH
    const isAlreadySSH = /^(ssh|sshpass|scp|sftp)\s/.test(command);
    if (config.DEFAULT_SSH_SERVER && !isAlreadySSH) {
      const escaped = command.replace(/"/g, '\\"');
      const keyFlag = config.DEFAULT_SSH_KEY_PATH ? `-i "${config.DEFAULT_SSH_KEY_PATH}" ` : '';
      command = `ssh -o ConnectTimeout=10 ${keyFlag}${config.DEFAULT_SSH_SERVER} "${escaped}"`;
      this.log('Auto-SSH wrapping', { server: config.DEFAULT_SSH_SERVER, originalCommand: (input.command as string).slice(0, 100) });
    }

    try {
      this.log('Executing', { command: command.slice(0, 200) });
      const { stdout, stderr } = await execAsync(command, {
        timeout: SANDBOX_LIMITS.maxExecutionTime,
        maxBuffer: SANDBOX_LIMITS.maxOutputSize,
        env: getSandboxedEnv(),
      });

      // Truncate output to prevent memory issues
      const output = stdout.slice(0, SANDBOX_LIMITS.maxOutputSize);
      const stderrTrunc = stderr ? stderr.slice(0, 10000) : '';

      return { success: true, output: output + (stderrTrunc ? `\nSTDERR: ${stderrTrunc}` : '') };
    } catch (error: any) {
      return { success: false, output: error.stdout?.slice(0, 10000) ?? '', error: error.message?.slice(0, 2000) };
    }
  }
}
