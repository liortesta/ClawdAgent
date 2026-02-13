import { spawn, ChildProcess } from 'child_process';
import logger from '../utils/logger.js';
import config from '../config.js';

/**
 * Persistent SSH reverse tunnel with auto-reconnect.
 *
 * Creates a reverse tunnel: remoteHost:remotePort → localhost:localPort
 * so the remote server can reach ClawdAgent's webhook endpoint.
 *
 * Example: server:13000 → localhost:3000
 */

interface TunnelConfig {
  remoteHost: string;
  remoteUser: string;
  remotePort: number;  // Port on the remote server to bind
  localPort: number;   // Local port to forward to
  keyPath?: string;    // SSH private key path
  retryIntervalMs?: number;
  maxRetries?: number;
  healthCheckMs?: number;
}

export class SSHTunnel {
  private proc: ChildProcess | null = null;
  private running = false;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private config: Required<TunnelConfig>;
  private lastConnected = 0;

  constructor(tunnelConfig: TunnelConfig) {
    this.config = {
      ...tunnelConfig,
      retryIntervalMs: tunnelConfig.retryIntervalMs ?? 10_000,
      maxRetries: tunnelConfig.maxRetries ?? Infinity,
      healthCheckMs: tunnelConfig.healthCheckMs ?? 30_000,
      keyPath: tunnelConfig.keyPath ?? '',
    };
  }

  /**
   * Start the SSH tunnel. Reconnects automatically on failure.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
    logger.info('SSH tunnel starting', {
      remote: `${this.config.remoteUser}@${this.config.remoteHost}:${this.config.remotePort}`,
      local: `localhost:${this.config.localPort}`,
    });
  }

  /**
   * Stop the tunnel and disable auto-reconnect.
   */
  stop(): void {
    this.running = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.killProcess();
    logger.info('SSH tunnel stopped');
  }

  isConnected(): boolean {
    return this.proc !== null && !this.proc.killed;
  }

  getStatus(): { connected: boolean; retries: number; upSince: number } {
    return {
      connected: this.isConnected(),
      retries: this.retryCount,
      upSince: this.lastConnected,
    };
  }

  private connect(): void {
    if (!this.running) return;

    // Kill any existing process
    this.killProcess();

    const args: string[] = [
      '-N',                                    // No remote command
      '-T',                                    // Disable pseudo-terminal
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ServerAliveInterval=15',          // Send keepalive every 15s
      '-o', 'ServerAliveCountMax=3',           // Disconnect after 3 missed keepalives
      '-o', 'ExitOnForwardFailure=yes',        // Exit if tunnel binding fails
      '-o', 'ConnectTimeout=10',
      '-R', `${this.config.remotePort}:localhost:${this.config.localPort}`,
    ];

    if (this.config.keyPath) {
      args.push('-i', this.config.keyPath);
    }

    args.push(`${this.config.remoteUser}@${this.config.remoteHost}`);

    logger.info('SSH tunnel connecting', {
      attempt: this.retryCount + 1,
      remote: `${this.config.remoteHost}:${this.config.remotePort}`,
    });

    this.proc = spawn('ssh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.stdout?.on('data', (data: Buffer) => {
      logger.debug('SSH tunnel stdout', { data: data.toString().trim() });
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('Warning: Permanently added')) {
        logger.warn('SSH tunnel stderr', { data: msg });
      }
    });

    this.proc.on('error', (err) => {
      logger.error('SSH tunnel process error', { error: err.message });
      this.scheduleReconnect();
    });

    this.proc.on('close', (code) => {
      this.proc = null;
      if (this.running) {
        logger.warn('SSH tunnel disconnected', { code, retries: this.retryCount });
        this.scheduleReconnect();
      }
    });

    // Mark connected after 3 seconds (if process hasn't died)
    setTimeout(() => {
      if (this.proc && !this.proc.killed) {
        this.lastConnected = Date.now();
        this.retryCount = 0; // Reset on successful connection
        logger.info('SSH tunnel connected', {
          tunnel: `${this.config.remoteHost}:${this.config.remotePort} → localhost:${this.config.localPort}`,
        });
      }
    }, 3000);
  }

  private scheduleReconnect(): void {
    if (!this.running) return;

    this.retryCount++;
    if (this.retryCount > this.config.maxRetries) {
      logger.error('SSH tunnel max retries exceeded, giving up', {
        retries: this.retryCount,
      });
      this.running = false;
      return;
    }

    // Exponential backoff: 10s, 20s, 40s, 80s, capped at 5 minutes
    const delay = Math.min(
      this.config.retryIntervalMs * Math.pow(2, Math.min(this.retryCount - 1, 5)),
      5 * 60_000,
    );

    logger.info('SSH tunnel reconnecting', { delay: `${delay / 1000}s`, retry: this.retryCount });

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private killProcess(): void {
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
      this.proc = null;
    }
  }
}

/**
 * Create the default webhook tunnel from config.
 * Tunnel: server:13000 → localhost:3000
 */
export function createWebhookTunnel(): SSHTunnel | null {
  if (!config.DEFAULT_SSH_SERVER || !config.DEFAULT_SSH_KEY_PATH) {
    return null;
  }

  // Parse DEFAULT_SSH_SERVER: "root@37.60.225.76" or "user@host"
  const parts = config.DEFAULT_SSH_SERVER.split('@');
  const user = parts.length > 1 ? parts[0] : 'root';
  const host = parts.length > 1 ? parts[1] : parts[0];

  return new SSHTunnel({
    remoteHost: host,
    remoteUser: user,
    remotePort: 13000,         // Remote port for webhook forwarding
    localPort: config.PORT,     // Local ClawdAgent port (3000)
    keyPath: config.DEFAULT_SSH_KEY_PATH,
    retryIntervalMs: 10_000,
    maxRetries: Infinity,       // Never give up
  });
}
