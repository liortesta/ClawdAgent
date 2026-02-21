import { NodeSSH } from 'node-ssh';
import logger from '../../utils/logger.js';

export interface SSHConnection {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
}

export class SSHClient {
  private connections: Map<string, NodeSSH> = new Map();

  async connect(name: string, config: SSHConnection): Promise<NodeSSH> {
    if (this.connections.has(name)) return this.connections.get(name)!;

    const ssh = new NodeSSH();
    await ssh.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      privateKey: config.privateKey,
      password: config.password,
      readyTimeout: 10000,
    });

    this.connections.set(name, ssh);
    logger.info('SSH connected', { name, host: config.host });
    return ssh;
  }

  async exec(name: string, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const ssh = this.connections.get(name);
    if (!ssh) throw new Error(`No SSH connection: ${name}`);

    const result = await ssh.execCommand(command, { execOptions: { timeout: 30000 } });
    return { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 0 };
  }

  async disconnect(name: string) {
    const ssh = this.connections.get(name);
    if (ssh) { ssh.dispose(); this.connections.delete(name); }
  }

  async disconnectAll() {
    for (const [, ssh] of this.connections) { ssh.dispose(); }
    this.connections.clear();
  }
}
