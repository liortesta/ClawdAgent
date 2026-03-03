import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
/** Blocked command patterns — prevent destructive operations */
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,      // rm -rf / (root)
  /mkfs\./,                     // format filesystem
  /dd\s+if=/,                   // raw disk write
  /:\(\)\s*\{/,                 // fork bomb
  />\s*\/dev\/sd/,              // overwrite disk
  /shutdown/,                   // shutdown server
  /reboot/,                     // reboot server
  /init\s+0/,                   // halt
  /format\s+c:/i,              // windows format
];

/** Check if a command is blocked */
function isBlocked(command: string): boolean {
  return BLOCKED_PATTERNS.some(p => p.test(command));
}

export function setupTerminalRoutes(): Router {
  const router = Router();

  // POST /api/terminal/exec — execute a local shell command
  router.post('/exec', async (req: Request, res: Response) => {
    const { command, cwd } = req.body;

    if (!command || typeof command !== 'string') {
      res.status(400).json({ error: 'command is required' });
      return;
    }

    if (isBlocked(command)) {
      res.status(403).json({ error: 'פקודה מסוכנת — חסומה', output: '', exitCode: 1 });
      return;
    }

    const workDir = cwd || '/home/clickdrop-clawdagent/htdocs/clawdagent.clickdrop.online';

    try {
      const result = await executeCommand(command, workDir);
      res.json(result);
    } catch (err: any) {
      res.json({ output: err.message, exitCode: 1, error: err.message });
    }
  });

  // GET /api/terminal/info — system info for terminal header
  router.get('/info', async (_req: Request, res: Response) => {
    try {
      const hostname = await quickExec('hostname');
      const whoami = await quickExec('whoami');
      const uptime = await quickExec('uptime -p');
      const cwd = '/home/clickdrop-clawdagent/htdocs/clawdagent.clickdrop.online';
      res.json({ hostname: hostname.trim(), user: whoami.trim(), uptime: uptime.trim(), cwd });
    } catch {
      res.json({ hostname: 'server', user: 'unknown', uptime: '', cwd: '/' });
    }
  });

  return router;
}

/** Execute a command and return stdout + stderr combined */
function executeCommand(command: string, cwd: string): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], {
      cwd,
      timeout: 60_000,
      env: { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8' },
    });

    let output = '';

    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });

    child.on('close', (code) => {
      resolve({ output, exitCode: code ?? 0 });
    });

    child.on('error', (err) => {
      resolve({ output: `Error: ${err.message}`, exitCode: 1 });
    });
  });
}

/** Quick exec for single-value commands */
function quickExec(command: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], { timeout: 5000 });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('close', () => resolve(out));
    child.on('error', () => resolve(''));
  });
}
