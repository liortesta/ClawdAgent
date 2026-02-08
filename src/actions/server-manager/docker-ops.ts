import { SSHClient } from './ssh-client.js';
import logger from '../../utils/logger.js';

export class DockerOps {
  constructor(private ssh: SSHClient) {}

  async listContainers(server: string) {
    const { stdout } = await this.ssh.exec(server, 'docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Image}}"');
    return stdout.split('\n').filter(Boolean).map(line => {
      const [id, name, status, image] = line.split('\t');
      return { id, name, status, image };
    });
  }

  async restartContainer(server: string, container: string) {
    logger.info('Restarting container', { server, container });
    return this.ssh.exec(server, `docker restart ${container}`);
  }

  async containerLogs(server: string, container: string, lines = 50) {
    const { stdout } = await this.ssh.exec(server, `docker logs --tail ${lines} ${container}`);
    return stdout;
  }

  async deployCompose(server: string, path: string) {
    logger.info('Deploying via compose', { server, path });
    await this.ssh.exec(server, `cd ${path} && docker compose pull`);
    return this.ssh.exec(server, `cd ${path} && docker compose up -d`);
  }
}
