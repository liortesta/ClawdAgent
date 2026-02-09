import { readFileSync } from 'fs';
import { NodeSSH } from 'node-ssh';
import logger from '../../utils/logger.js';
import config from '../../config.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SSHServer {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  keyPath: string;
  workDir?: string;
  tags: string[];
  /** Auto-discovered by scanner */
  os?: string;
  /** Auto-discovered by scanner */
  specs?: { cpu: string; ram: string; disk: string; diskFree: string };
  /** Auto-discovered by scanner */
  services?: string[];
  /** ISO timestamp of last scan */
  lastScan?: string;
}

export interface SSHSession {
  serverId: string;
  ssh: NodeSSH;
  connected: boolean;
  lastActivity: Date;
  currentDir: string;
  history: string[];
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

// ---------------------------------------------------------------------------
// SSHSessionManager
// ---------------------------------------------------------------------------

export class SSHSessionManager {
  private servers: Map<string, SSHServer> = new Map();
  private sessions: Map<string, SSHSession> = new Map();
  private activeServerId: string | undefined;

  // -----------------------------------------------------------------------
  // Server registry
  // -----------------------------------------------------------------------

  /**
   * Parse SSH_SERVER_1 .. SSH_SERVER_10 environment variables plus the legacy
   * DEFAULT_SSH_SERVER / DEFAULT_SSH_KEY_PATH pair.
   *
   * Env var format: `id|name|user@host:port|keyPath|workDir|tag1,tag2`
   *   - workDir and tags are optional segments.
   *   - If port is omitted it defaults to 22.
   */
  loadServersFromEnv(): void {
    // Legacy default server
    const legacyServer = config.DEFAULT_SSH_SERVER;   // e.g. "root@37.60.225.76"
    const legacyKey = config.DEFAULT_SSH_KEY_PATH;

    if (legacyServer && legacyKey) {
      try {
        const parsed = this.parseLegacyServer(legacyServer, legacyKey);
        this.servers.set(parsed.id, parsed);
        logger.info('SSH: loaded legacy default server', { id: parsed.id, host: parsed.host });
      } catch (err) {
        logger.warn('SSH: failed to parse legacy DEFAULT_SSH_SERVER', { error: String(err) });
      }
    }

    // Numbered servers SSH_SERVER_1 .. SSH_SERVER_10
    for (let i = 1; i <= 10; i++) {
      const raw = process.env[`SSH_SERVER_${i}`];
      if (!raw) continue;

      try {
        const server = this.parseServerEnv(raw);
        this.servers.set(server.id, server);
        logger.info('SSH: loaded server from env', { index: i, id: server.id, host: server.host });
      } catch (err) {
        logger.warn(`SSH: failed to parse SSH_SERVER_${i}`, { value: raw, error: String(err) });
      }
    }

    logger.info('SSH: server registry loaded', { count: this.servers.size });
  }

  addServer(server: SSHServer): void {
    this.servers.set(server.id, server);
    logger.info('SSH: server added', { id: server.id, host: server.host });
  }

  removeServer(id: string): void {
    // Disconnect first if there is an active session
    const session = this.sessions.get(id);
    if (session?.connected) {
      session.ssh.dispose();
      session.connected = false;
    }
    this.sessions.delete(id);
    this.servers.delete(id);

    if (this.activeServerId === id) {
      this.activeServerId = undefined;
    }

    logger.info('SSH: server removed', { id });
  }

  getServer(id: string): SSHServer | undefined {
    return this.servers.get(id);
  }

  listServers(): SSHServer[] {
    return Array.from(this.servers.values());
  }

  // -----------------------------------------------------------------------
  // Connection management
  // -----------------------------------------------------------------------

  async connect(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`SSH: unknown server "${serverId}"`);
    }

    // If already connected, skip
    const existing = this.sessions.get(serverId);
    if (existing?.connected) {
      logger.debug('SSH: already connected', { serverId });
      return;
    }

    logger.info('SSH: connecting', { serverId, host: server.host, port: server.port, user: server.user });

    let privateKeyContent: string;
    try {
      privateKeyContent = readFileSync(server.keyPath, 'utf-8');
    } catch (err) {
      throw new Error(`SSH: cannot read private key at "${server.keyPath}": ${String(err)}`);
    }

    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.user,
        privateKey: privateKeyContent,
        readyTimeout: 10000,
        tryKeyboard: false,
      });
    } catch (err) {
      throw new Error(`SSH: connection to "${serverId}" (${server.host}:${server.port}) failed: ${String(err)}`);
    }

    const session: SSHSession = {
      serverId,
      ssh,
      connected: true,
      lastActivity: new Date(),
      currentDir: server.workDir ?? '~',
      history: [],
    };

    this.sessions.set(serverId, session);

    // If no active server yet, auto-select this one
    if (!this.activeServerId) {
      this.activeServerId = serverId;
    }

    logger.info('SSH: connected successfully', { serverId, host: server.host });
  }

  async disconnect(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) {
      logger.debug('SSH: no session to disconnect', { serverId });
      return;
    }

    try {
      if (session.connected) {
        session.ssh.dispose();
      }
    } catch (err) {
      logger.warn('SSH: error during dispose', { serverId, error: String(err) });
    }

    session.connected = false;
    this.sessions.delete(serverId);

    if (this.activeServerId === serverId) {
      // Promote another connected session, if any
      const nextConnected = Array.from(this.sessions.entries()).find(([_id, s]) => s.connected);
      this.activeServerId = nextConnected ? nextConnected[0] : undefined;
    }

    logger.info('SSH: disconnected', { serverId });
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.allSettled(ids.map(id => this.disconnect(id)));
    this.activeServerId = undefined;
    logger.info('SSH: all sessions disconnected');
  }

  // -----------------------------------------------------------------------
  // Active session
  // -----------------------------------------------------------------------

  switchActive(serverId: string): void {
    if (!this.servers.has(serverId)) {
      throw new Error(`SSH: unknown server "${serverId}"`);
    }
    const session = this.sessions.get(serverId);
    if (!session?.connected) {
      throw new Error(`SSH: server "${serverId}" is not connected – connect first`);
    }
    this.activeServerId = serverId;
    logger.info('SSH: active session switched', { serverId });
  }

  getActive(): string | undefined {
    return this.activeServerId;
  }

  // -----------------------------------------------------------------------
  // Command execution
  // -----------------------------------------------------------------------

  async exec(serverId: string, command: string, timeout?: number): Promise<ExecResult> {
    const session = this.sessions.get(serverId);
    if (!session || !session.connected) {
      throw new Error(`SSH: server "${serverId}" is not connected`);
    }

    const effectiveTimeout = timeout ?? 30_000;

    logger.debug('SSH: exec', { serverId, command, timeout: effectiveTimeout });
    session.lastActivity = new Date();

    try {
      const result = await session.ssh.execCommand(command, {
        cwd: session.currentDir,
        execOptions: { timeout: effectiveTimeout },
      });

      const execResult: ExecResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code ?? 0,
      };

      // Keep history (last 200 entries)
      session.history.push(command);
      if (session.history.length > 200) {
        session.history.splice(0, session.history.length - 200);
      }

      logger.debug('SSH: exec completed', { serverId, code: execResult.code });
      return execResult;
    } catch (err) {
      // Connection may have dropped
      const errMsg = String(err);
      if (
        errMsg.includes('Not connected') ||
        errMsg.includes('ECONNRESET') ||
        errMsg.includes('ETIMEDOUT') ||
        errMsg.includes('Channel open failure')
      ) {
        session.connected = false;
        logger.error('SSH: connection lost during exec', { serverId, error: errMsg });
        throw new Error(`SSH: connection to "${serverId}" lost: ${errMsg}`);
      }
      throw new Error(`SSH: exec on "${serverId}" failed: ${errMsg}`);
    }
  }

  async execAll(command: string): Promise<Map<string, ExecResult>> {
    const results = new Map<string, ExecResult>();
    const connectedIds = Array.from(this.sessions.entries())
      .filter(([_id, s]) => s.connected)
      .map(([id]) => id);

    if (connectedIds.length === 0) {
      logger.warn('SSH: execAll called with no connected sessions');
      return results;
    }

    logger.info('SSH: execAll', { command, servers: connectedIds });

    const promises = connectedIds.map(async (id) => {
      try {
        const result = await this.exec(id, command);
        results.set(id, result);
      } catch (err) {
        results.set(id, {
          stdout: '',
          stderr: String(err),
          code: -1,
        });
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  // -----------------------------------------------------------------------
  // Status helpers
  // -----------------------------------------------------------------------

  isConnected(serverId: string): boolean {
    const session = this.sessions.get(serverId);
    return session?.connected === true;
  }

  getSession(serverId: string): SSHSession | undefined {
    return this.sessions.get(serverId);
  }

  // -----------------------------------------------------------------------
  // File transfer (SCP)
  // -----------------------------------------------------------------------

  async upload(serverId: string, localPath: string, remotePath: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session || !session.connected) {
      throw new Error(`SSH: server "${serverId}" is not connected`);
    }

    logger.info('SSH: uploading file', { serverId, localPath, remotePath });
    session.lastActivity = new Date();

    try {
      await session.ssh.putFile(localPath, remotePath);
      logger.info('SSH: upload complete', { serverId, localPath, remotePath });
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes('Not connected') || errMsg.includes('ECONNRESET')) {
        session.connected = false;
        logger.error('SSH: connection lost during upload', { serverId, error: errMsg });
      }
      throw new Error(`SSH: upload to "${serverId}" failed: ${errMsg}`);
    }
  }

  async download(serverId: string, remotePath: string, localPath: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session || !session.connected) {
      throw new Error(`SSH: server "${serverId}" is not connected`);
    }

    logger.info('SSH: downloading file', { serverId, remotePath, localPath });
    session.lastActivity = new Date();

    try {
      await session.ssh.getFile(localPath, remotePath);
      logger.info('SSH: download complete', { serverId, remotePath, localPath });
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes('Not connected') || errMsg.includes('ECONNRESET')) {
        session.connected = false;
        logger.error('SSH: connection lost during download', { serverId, error: errMsg });
      }
      throw new Error(`SSH: download from "${serverId}" failed: ${errMsg}`);
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Parse the numbered env var format:
   *   `id|name|user@host:port|keyPath|workDir|tag1,tag2`
   */
  private parseServerEnv(raw: string): SSHServer {
    const parts = raw.split('|');
    if (parts.length < 4) {
      throw new Error(`Invalid SSH_SERVER format – expected at least 4 pipe-separated segments, got ${parts.length}`);
    }

    const [id, name, userHostPort, keyPath, workDir, tagsStr] = parts;

    if (!id || !name || !userHostPort || !keyPath) {
      throw new Error('Invalid SSH_SERVER format – id, name, user@host:port, and keyPath are required');
    }

    const { user, host, port } = this.parseUserHostPort(userHostPort);

    return {
      id: id.trim(),
      name: name.trim(),
      host,
      port,
      user,
      keyPath: keyPath.trim(),
      workDir: workDir?.trim() || undefined,
      tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [],
    };
  }

  /**
   * Parse the legacy DEFAULT_SSH_SERVER value (e.g. "root@37.60.225.76") combined
   * with DEFAULT_SSH_KEY_PATH into an SSHServer with id "default".
   */
  private parseLegacyServer(serverStr: string, keyPath: string): SSHServer {
    const { user, host, port } = this.parseUserHostPort(serverStr);

    return {
      id: 'default',
      name: 'Default Server',
      host,
      port,
      user,
      keyPath: keyPath.trim(),
      tags: ['default', 'legacy'],
    };
  }

  /**
   * Parse `user@host:port` or `user@host` into components.
   */
  private parseUserHostPort(value: string): { user: string; host: string; port: number } {
    const trimmed = value.trim();
    const atIndex = trimmed.indexOf('@');
    if (atIndex === -1) {
      throw new Error(`Invalid user@host format: "${trimmed}" – missing @`);
    }

    const user = trimmed.slice(0, atIndex);
    const hostPort = trimmed.slice(atIndex + 1);

    let host: string;
    let port = 22;

    const colonIndex = hostPort.lastIndexOf(':');
    if (colonIndex !== -1) {
      host = hostPort.slice(0, colonIndex);
      const portStr = hostPort.slice(colonIndex + 1);
      const parsed = parseInt(portStr, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
      } else {
        // Might be IPv6 without brackets – treat whole thing as host
        host = hostPort;
      }
    } else {
      host = hostPort;
    }

    if (!user || !host) {
      throw new Error(`Invalid user@host format: "${trimmed}"`);
    }

    return { user, host, port };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: SSHSessionManager | null = null;

export function getSSHManager(): SSHSessionManager {
  if (!instance) {
    instance = new SSHSessionManager();
    instance.loadServersFromEnv();
  }
  return instance;
}
