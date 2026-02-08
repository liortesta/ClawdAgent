import { SSHClient } from './ssh-client.js';

export interface ServerMetrics {
  cpu: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  uptime: string;
  loadAvg: number[];
}

export class ServerMonitor {
  constructor(private ssh: SSHClient) {}

  async getMetrics(server: string): Promise<ServerMetrics> {
    const [cpuResult, memResult, diskResult, uptimeResult] = await Promise.all([
      this.ssh.exec(server, "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
      this.ssh.exec(server, "free -b | grep Mem | awk '{print $2,$3}'"),
      this.ssh.exec(server, "df -B1 / | tail -1 | awk '{print $2,$3}'"),
      this.ssh.exec(server, 'uptime -p'),
    ]);

    const [memTotal, memUsed] = memResult.stdout.trim().split(' ').map(Number);
    const [diskTotal, diskUsed] = diskResult.stdout.trim().split(' ').map(Number);

    return {
      cpu: parseFloat(cpuResult.stdout.trim()) || 0,
      memoryUsed: memUsed || 0,
      memoryTotal: memTotal || 0,
      diskUsed: diskUsed || 0,
      diskTotal: diskTotal || 0,
      uptime: uptimeResult.stdout.trim(),
      loadAvg: [],
    };
  }
}
