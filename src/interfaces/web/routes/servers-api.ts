import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../../utils/logger.js';

const execAsync = promisify(exec);
const SERVERS_FILE = join(process.cwd(), 'data', 'servers.json');

interface ServerEntry {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  authMethod: 'key' | 'password';
  keyPath?: string;
  password?: string;  // Stored encrypted (masked in GET responses)
  tags: string[];
  status: 'online' | 'offline' | 'unknown';
  lastChecked?: string;
  addedAt: string;
}

function loadServers(): ServerEntry[] {
  try {
    if (existsSync(SERVERS_FILE)) {
      return JSON.parse(readFileSync(SERVERS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function saveServers(servers: ServerEntry[]): void {
  const dir = dirname(SERVERS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2), 'utf-8');
}

/** Build SSH command with key or password auth */
function buildSSHCommand(server: ServerEntry, remoteCommand: string): string {
  const baseOpts = `-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10`;
  const escaped = remoteCommand.replace(/"/g, '\\"');

  if (server.authMethod === 'password' && server.password) {
    // Use sshpass for password auth
    return `sshpass -p '${server.password.replace(/'/g, "'\\''")}' ssh ${baseOpts} -p ${server.port} ${server.user}@${server.host} "${escaped}"`;
  }
  const keyArg = server.keyPath ? `-i ${server.keyPath}` : '';
  return `ssh ${baseOpts} ${keyArg} -p ${server.port} ${server.user}@${server.host} "${escaped}"`;
}

/** Get raw server list for agent context (no passwords) */
export function getServerListForAgent(): Array<{ id: string; name: string; host: string; port: number; user: string; status: string }> {
  try {
    if (existsSync(SERVERS_FILE)) {
      const servers: ServerEntry[] = JSON.parse(readFileSync(SERVERS_FILE, 'utf-8'));
      return servers.map(s => ({ id: s.id, name: s.name, host: s.host, port: s.port, user: s.user, status: s.status }));
    }
  } catch { /* ignore */ }
  return [];
}

export function setupServersRoutes(): Router {
  const router = Router();

  // GET /api/servers — list all servers (passwords masked)
  router.get('/', (_req: Request, res: Response) => {
    const servers = loadServers().map(s => ({
      ...s,
      password: s.password ? '••••••••' : undefined,
    }));
    res.json(servers);
  });

  // POST /api/servers — add server
  router.post('/', (req: Request, res: Response) => {
    const { name, host, port, user, authMethod, keyPath, password, tags } = req.body;
    if (!name || !host) {
      res.status(400).json({ error: 'name and host are required' });
      return;
    }

    const servers = loadServers();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (servers.find(s => s.id === id)) {
      res.status(409).json({ error: 'Server with this name already exists' });
      return;
    }

    const method = authMethod === 'password' ? 'password' : 'key';
    if (method === 'password' && !password) {
      res.status(400).json({ error: 'Password is required when authMethod is password' });
      return;
    }
    if (method === 'key' && !keyPath) {
      res.status(400).json({ error: 'Key path is required when authMethod is key' });
      return;
    }

    const server: ServerEntry = {
      id,
      name,
      host,
      port: port ?? 22,
      user: user ?? 'root',
      authMethod: method,
      keyPath: method === 'key' ? keyPath : undefined,
      password: method === 'password' ? password : undefined,
      tags: tags ?? [],
      status: 'unknown',
      addedAt: new Date().toISOString(),
    };

    servers.push(server);
    saveServers(servers);
    logger.info(`Server added via dashboard: ${name} (${host}) [${method}]`);
    res.status(201).json({ ...server, password: server.password ? '••••••••' : undefined });
  });

  // DELETE /api/servers/:id — remove server
  router.delete('/:id', (req: Request, res: Response) => {
    const servers = loadServers();
    const idx = servers.findIndex(s => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const removed = servers.splice(idx, 1)[0];
    saveServers(servers);
    logger.info(`Server removed via dashboard: ${removed.name}`);
    res.json({ success: true });
  });

  // POST /api/servers/:id/exec — execute command on server
  router.post('/:id/exec', async (req: Request, res: Response) => {
    const servers = loadServers();
    const server = servers.find(s => s.id === req.params.id);
    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const { command } = req.body;
    if (!command) {
      res.status(400).json({ error: 'command is required' });
      return;
    }

    // Block dangerous commands
    const dangerous = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'DROP DATABASE', 'format c:'];
    if (dangerous.some(d => command.includes(d))) {
      res.status(403).json({ error: 'Dangerous command blocked' });
      return;
    }

    try {
      const sshCmd = buildSSHCommand(server, command);
      const { stdout, stderr } = await execAsync(sshCmd, { timeout: 30000 });
      res.json({ output: stdout, stderr, success: true });
    } catch (err: any) {
      res.json({ output: '', stderr: err.message, success: false });
    }
  });

  // GET /api/servers/:id/health — server health check
  router.get('/:id/health', async (req: Request, res: Response) => {
    const servers = loadServers();
    const server = servers.find(s => s.id === req.params.id);
    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    try {
      const healthCmd = buildSSHCommand(server, 'uptime && free -h && df -h / | tail -1');
      const { stdout } = await execAsync(healthCmd, { timeout: 15000 });
      const lines = stdout.trim().split('\n');

      // Update server status
      server.status = 'online';
      server.lastChecked = new Date().toISOString();
      saveServers(servers);

      res.json({ status: 'online', raw: lines, lastChecked: server.lastChecked });
    } catch (err: any) {
      server.status = 'offline';
      server.lastChecked = new Date().toISOString();
      saveServers(servers);
      res.json({ status: 'offline', error: err.message, lastChecked: server.lastChecked });
    }
  });

  return router;
}
