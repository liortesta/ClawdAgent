import { spawn } from 'child_process';
import { join } from 'path';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import logger from '../utils/logger.js';

/** Directory for temp system-prompt files */
const TEMP_DIR = join(tmpdir(), 'clawdagent');
try { mkdirSync(TEMP_DIR, { recursive: true }); } catch {}

export interface ClaudeCodeResponse {
  text: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  cost: number; // always 0 — uses Max subscription
}

/**
 * Resolve the Claude Code CLI's actual JS entry point.
 * On Windows, `claude` is a .cmd batch wrapper around `node cli.js`.
 * We call `node.exe cli.js` directly to avoid cmd.exe mangling special characters
 * (Hebrew, parentheses, pipes, etc.) in prompts.
 */
function resolveCliEntryPoint(): string | null {
  try {
    const appData = process.env.APPDATA;
    if (appData) {
      const cliJs = join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      return cliJs;
    }
  } catch {}
  return null;
}

/**
 * Run the Claude CLI via spawn — calls node.exe directly (no cmd.exe shell)
 * to avoid Windows cmd.exe breaking on Hebrew/special characters in prompts.
 */
function spawnClaude(
  cliPath: string,
  args: string[],
  options: { timeout?: number; cwd?: string; maxBuffer?: number; cliEntryPoint?: string; stdinData?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 30000;
    const maxBuffer = options.maxBuffer || 1024 * 1024 * 10;

    // Strip CLAUDECODE env var to prevent "nested session" error
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    let proc;
    if (options.cliEntryPoint) {
      // Direct node.exe invocation — bypasses cmd.exe entirely
      // Arguments pass through cleanly: Hebrew, (), |, &, etc. all work
      proc = spawn(process.execPath, [options.cliEntryPoint, ...args], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        cwd: options.cwd,
        env: cleanEnv,
      });
    } else {
      // Direct invocation without shell — avoids shell mangling Hebrew/special chars
      proc = spawn(cliPath, args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        cwd: options.cwd,
        env: cleanEnv,
      });
    }

    // Write data to stdin if provided, then close
    if (options.stdinData) {
      proc.stdin.write(options.stdinData);
    }
    proc.stdin.end();

    let stdout = '';
    let stderr = '';
    let killed = false;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > maxBuffer) {
        killed = true;
        proc.kill();
        reject(new Error('maxBuffer exceeded'));
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill();
      reject(new Error(`TIMEOUT: Claude CLI did not respond within ${timeout}ms`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return; // already rejected
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Claude CLI exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** How long to wait before retrying after a failure (5 minutes) */
const CLI_RECOVERY_MS = 5 * 60 * 1000;

export class ClaudeCodeProvider {
  available: boolean = false;
  private authenticated: boolean = false;
  private cliPath: string;
  private cliEntryPoint: string | null = null;
  private lastCheckAt: number = 0;
  private lastFailureAt: number = 0;
  private wasAvailableBeforeFailure: boolean = false;

  constructor(cliPath: string = 'claude') {
    this.cliPath = cliPath;
    // Resolve the actual JS entry point to bypass cmd.exe on Windows
    this.cliEntryPoint = resolveCliEntryPoint();
    if (this.cliEntryPoint) {
      logger.info('Claude Code CLI entry point resolved', { path: this.cliEntryPoint });
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      // Version check can use shell (simple command, no special chars)
      // Increased timeout: Claude Code CLI cold start on Windows can take 15-20s
      const { stdout: version } = await spawnClaude(this.cliPath, ['--version'], { timeout: 30000 });
      logger.info('Claude Code CLI found', { version: version.trim() });
      this.available = true;

      // Auth check — try `claude auth status` first (cleaner, faster), fall back to test prompt
      try {
        const { stdout: authStatus } = await spawnClaude(
          this.cliPath,
          ['auth', 'status'],
          { timeout: 30000, cliEntryPoint: this.cliEntryPoint ?? undefined },
        );
        const statusParsed = JSON.parse(authStatus);
        if (statusParsed.authenticated || statusParsed.loggedIn || statusParsed.status === 'authenticated' || statusParsed.account) {
          this.authenticated = true;
          this.lastCheckAt = Date.now();
          logger.info('Claude Code CLI authenticated via auth status', { account: statusParsed.account ?? statusParsed.email ?? 'unknown' });
          return true;
        }
      } catch {
        // auth status not supported in older CLI versions — fall back to test prompt
        logger.info('Claude Code auth status not available, falling back to test prompt');
      }

      const { stdout: authCheck } = await spawnClaude(
        this.cliPath,
        ['-p', 'respond with just OK', '--output-format', 'json'],
        { timeout: 90000, cliEntryPoint: this.cliEntryPoint ?? undefined },
      );

      const parsed = JSON.parse(authCheck);
      if (parsed.result || parsed.content || parsed.type === 'result') {
        this.authenticated = true;
        this.lastCheckAt = Date.now();
        logger.info('Claude Code CLI authenticated via test prompt');
        return true;
      }

      return false;
    } catch (err: any) {
      logger.warn('Claude Code CLI not available', { error: err.message });
      this.available = false;
      this.authenticated = false;
      return false;
    }
  }

  async chat(params: {
    system?: string;
    message: string;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  }): Promise<ClaudeCodeResponse> {
    // Auto-recover after CLI_RECOVERY_MS if it was previously working
    if (!this.available && this.wasAvailableBeforeFailure && this.lastFailureAt > 0) {
      if (Date.now() - this.lastFailureAt > CLI_RECOVERY_MS) {
        logger.info('Claude Code CLI auto-recovery — retrying after cooldown');
        this.available = true;
        this.authenticated = true;
        this.lastFailureAt = 0;
      }
    }

    if (!this.available || !this.authenticated) {
      throw new Error('Claude Code CLI not available or not authenticated');
    }

    const { system, message, model } = params;

    // Strategy: Claude Code CLI injects its own system prompt that tells the model
    // to ask for permission before using tools. We use --append-system-prompt-file
    // to inject our instructions directly into the SYSTEM prompt (authoritative),
    // rather than embedding them in <system> tags in the user message (ignored).
    // This ensures the model follows OUR tool-calling format, not Claude Code's defaults.
    const systemFile = join(TEMP_DIR, `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`);
    let systemContent = '';
    if (system) {
      systemContent += system + '\n\n';
    }
    systemContent += `[CRITICAL — MANDATORY OVERRIDE OF ALL TOOL INSTRUCTIONS]
CONTEXT: You are an AI agent in a HEADLESS SERVER application. There is NO terminal, NO popup, NO user interface for approvals. The user communicates ONLY via a chat window. Any reference to "Allow", "approve", "terminal", or "permission" is MEANINGLESS here and confuses the user.

TOOL CALLING: Your ONLY way to call tools is by outputting <tool_call> XML blocks:
<tool_call>{"name": "tool_name", "input": {"param": "value"}}</tool_call>

ALL tools are ALREADY approved and will execute INSTANTLY when you output <tool_call> blocks.

ABSOLUTE RULES:
1. NEVER say you need permission, approval, or that the user should click/press anything.
2. NEVER mention "pending tool requests", "Allow", "approve", "terminal", "popup", or "Y/N".
3. NEVER suggest the user run shell commands manually — YOU have tools for that.
4. NEVER say "I would need to..." or "I can't access..." — just call the tool directly.
5. When asked to search, browse, read files, or execute code → output <tool_call> IMMEDIATELY.
6. Multiple <tool_call> blocks can appear in one response.
7. If a tool fails, retry differently. NEVER ask the user to fix it.
8. Do NOT use Claude Code's native tool format. ONLY use <tool_call> XML blocks.

EXAMPLES of what to do:
- User asks "search for X" → output <tool_call>{"name":"web_search","input":{"query":"X"}}</tool_call>
- User asks "run this command" → output <tool_call>{"name":"bash","input":{"command":"..."}}</tool_call>
- WRONG: "I'll need to search the web. Please approve the tool request."
- CORRECT: <tool_call>{"name":"web_search","input":{"query":"..."}}</tool_call>
`;
    writeFileSync(systemFile, systemContent, 'utf-8');

    // User message only — system context is in --append-system-prompt-file
    const userPrompt = message;
    const STDIN_THRESHOLD = 8000;
    const usePipe = userPrompt.length > STDIN_THRESHOLD;

    const isRoot = process.getuid?.() === 0;
    const args: string[] = [
      '--output-format', 'json',
      ...(isRoot ? [] : ['--dangerously-skip-permissions']),
      '--append-system-prompt-file', systemFile,
    ];
    if (isRoot) {
      args.push('--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,TodoWrite');
    }
    if (usePipe) {
      args.push('-p');
    } else {
      args.push('-p', userPrompt);
    }
    if (model) args.push('--model', model);

    logger.debug('Claude Code CLI spawn', {
      argsCount: args.length,
      promptLength: userPrompt.length,
      systemLength: systemContent.length,
      usePipe,
      cliEntryPoint: !!this.cliEntryPoint,
    });

    try {
      const { stdout, stderr } = await spawnClaude(this.cliPath, args, {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10,
        cliEntryPoint: this.cliEntryPoint ?? undefined,
        stdinData: usePipe ? userPrompt : undefined,
      });

      if (stderr) logger.debug('Claude Code CLI stderr', { stderr: stderr.slice(0, 300) });
      return this.parseResponse(stdout, model);
    } catch (err: any) {
      const errorMsg = err.message?.toLowerCase() || '';
      const stderrMsg = (err.stderr || '').toLowerCase();
      
      // Detect authentication/token issues
      if (errorMsg.includes('not authenticated') || errorMsg.includes('login') ||
          errorMsg.includes('authentication expired') || errorMsg.includes('token') ||
          stderrMsg.includes('not authenticated') || stderrMsg.includes('login')) {
        this.wasAvailableBeforeFailure = true;
        this.lastFailureAt = Date.now();
        this.authenticated = false;
        this.available = false;
        throw new Error('Claude Code CLI: authentication expired or no tokens. Falling back to other providers.');
      }

      // Detect exit code 1 (usually means no tokens or auth failure)
      if (errorMsg.includes('exited with code 1') || errorMsg.includes('exited with code') && errorMsg.includes('1')) {
        this.wasAvailableBeforeFailure = true;
        this.lastFailureAt = Date.now();
        this.authenticated = false;
        this.available = false;
        throw new Error('Claude Code CLI: no tokens available or authentication failed. Falling back to other providers.');
      }
      
      if (errorMsg.includes('timeout') || errorMsg.includes('killed')) {
        throw new Error('Claude Code CLI: request timed out (120s). Falling back to other providers.');
      }
      
      // Generic error - mark as unavailable if it's a critical failure
      if (errorMsg.includes('exited with code') && !errorMsg.includes('0')) {
        logger.warn('Claude Code CLI failed with non-zero exit code, marking as temporarily unavailable (auto-recovers in 5min)', { error: err.message });
        this.wasAvailableBeforeFailure = true;
        this.lastFailureAt = Date.now();
        this.available = false;
      }
      
      throw new Error(`Claude Code CLI error: ${err.message}`);
    } finally {
      try { unlinkSync(systemFile); } catch {}
    }
  }

  async chatWithHistory(params: {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
  }): Promise<ClaudeCodeResponse> {
    // Pack conversation into a single prompt (CLI doesn't support multi-turn in -p mode)
    // System prompt is passed via --append-system-prompt-file in chat(), not embedded here
    let packed = '';
    for (const msg of params.messages) {
      if (msg.role === 'user') {
        packed += `Human: ${msg.content}\n\n`;
      } else {
        packed += `Assistant: ${msg.content}\n\n`;
      }
    }

    return this.chat({ system: params.system, message: packed, maxTokens: params.maxTokens });
  }

  async agenticTask(params: {
    task: string;
    workingDir?: string;
    allowedTools?: string[];
    timeout?: number;
  }): Promise<ClaudeCodeResponse> {
    if (!this.available || !this.authenticated) {
      throw new Error('Claude Code CLI not available');
    }

    const { task, workingDir, allowedTools, timeout } = params;

    // Same system prompt override for agentic tasks
    const systemFile = join(TEMP_DIR, `sys-agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`);
    writeFileSync(systemFile, `[CRITICAL — MANDATORY OVERRIDE]
CONTEXT: Headless server agent. NO terminal, NO popups, NO approval UI. All tools are pre-approved.
Use <tool_call>{"name":"tool","input":{...}}</tool_call> to call tools. They execute instantly.
NEVER ask for permission. NEVER mention approvals, terminals, or popups.
NEVER suggest shell commands — call tools directly. If a tool fails, retry differently.
`, 'utf-8');

    const STDIN_THRESHOLD = 8000;
    const usePipe = task.length > STDIN_THRESHOLD;

    const isRootAgent = process.getuid?.() === 0;
    const args: string[] = ['--output-format', 'json', ...(isRootAgent ? [] : ['--dangerously-skip-permissions']), '--append-system-prompt-file', systemFile];
    const defaultTools = 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,TodoWrite';
    if (isRootAgent) {
      args.push('--allowedTools', allowedTools && allowedTools.length > 0 ? allowedTools.join(',') : defaultTools);
    } else if (allowedTools && allowedTools.length > 0) {
      args.push('--allowedTools', allowedTools.join(','));
    }
    if (usePipe) {
      args.push('-p');
    } else {
      args.push('-p', task);
    }

    try {
      const { stdout } = await spawnClaude(this.cliPath, args, {
        timeout: timeout || 300000,
        maxBuffer: 1024 * 1024 * 50,
        cwd: workingDir,
        cliEntryPoint: this.cliEntryPoint ?? undefined,
        stdinData: usePipe ? task : undefined,
      });

      let result: any;
      try {
        result = JSON.parse(stdout);
      } catch {
        return { text: stdout.trim(), model: 'claude-code-agent', cost: 0 };
      }

      const text = result.result || (typeof result.content === 'string' ? result.content : '') || stdout.trim();

      return {
        text,
        model: 'claude-code-agent',
        usage: result.usage,
        cost: 0,
      };
    } finally {
      try { unlinkSync(systemFile); } catch {}
    }
  }

  getStatus(): { available: boolean; authenticated: boolean; cliPath: string; lastCheckAt: number } {
    return {
      available: this.available,
      authenticated: this.authenticated,
      cliPath: this.cliPath,
      lastCheckAt: this.lastCheckAt,
    };
  }

  isReady(): boolean {
    return this.available && this.authenticated;
  }

  markUnauthenticated(): void {
    this.authenticated = false;
  }

  private parseResponse(stdout: string, model?: string): ClaudeCodeResponse {
    let result: any;
    try {
      result = JSON.parse(stdout);
    } catch {
      return { text: stdout.trim(), model: model || 'claude-code-cli', cost: 0 };
    }

    let text = '';
    if (result.result) {
      text = result.result;
    } else if (result.content) {
      if (Array.isArray(result.content)) {
        text = result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      } else {
        text = String(result.content);
      }
    } else if (typeof result === 'string') {
      text = result;
    } else {
      text = stdout.trim();
    }

    return {
      text,
      model: result.model || model || 'claude-code-cli',
      usage: {
        input_tokens: result.usage?.input_tokens || 0,
        output_tokens: result.usage?.output_tokens || 0,
      },
      cost: result.total_cost_usd || 0,
    };
  }
}
