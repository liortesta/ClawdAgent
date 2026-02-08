import { SSHClient } from './ssh-client.js';
import logger from '../../utils/logger.js';

export class Deployer {
  constructor(private ssh: SSHClient) {}

  async deployGitPull(server: string, repoPath: string, branch = 'main') {
    logger.info('Deploying via git pull', { server, repoPath, branch });
    await this.ssh.exec(server, `cd ${repoPath} && git fetch origin`);
    await this.ssh.exec(server, `cd ${repoPath} && git checkout ${branch}`);
    await this.ssh.exec(server, `cd ${repoPath} && git pull origin ${branch}`);
    return { success: true, method: 'git-pull' };
  }

  async restartService(server: string, service: string) {
    logger.info('Restarting service', { server, service });
    return this.ssh.exec(server, `sudo systemctl restart ${service}`);
  }
}
