import { SSHClient } from './ssh-client.js';
import { ServerMonitor } from './monitor.js';
import logger from '../../utils/logger.js';

export class AutoFixer {
  private monitor: ServerMonitor;

  constructor(private ssh: SSHClient) {
    this.monitor = new ServerMonitor(ssh);
  }

  async diagnoseAndFix(server: string): Promise<string[]> {
    const actions: string[] = [];
    const metrics = await this.monitor.getMetrics(server);

    if (metrics.diskUsed / metrics.diskTotal > 0.9) {
      logger.warn('Disk usage high, cleaning', { server });
      await this.ssh.exec(server, 'docker system prune -f');
      actions.push('Cleaned Docker unused resources (disk > 90%)');
    }

    if (metrics.cpu > 90) {
      actions.push(`High CPU detected: ${metrics.cpu}% — manual investigation recommended`);
    }

    if (metrics.memoryUsed / metrics.memoryTotal > 0.9) {
      actions.push(`High memory usage: ${Math.round(metrics.memoryUsed / metrics.memoryTotal * 100)}% — check for memory leaks`);
    }

    return actions.length > 0 ? actions : ['All systems normal'];
  }
}
