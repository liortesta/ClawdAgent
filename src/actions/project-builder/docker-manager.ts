import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
}

export class DockerManager {
  private timeout = 120_000;

  private async run(command: string): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execAsync(command, { timeout: this.timeout });
    } catch (err: any) {
      logger.error('Docker command failed', { command, error: err.message });
      throw err;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.run('docker info');
      return true;
    } catch {
      return false;
    }
  }

  async buildImage(dockerfilePath: string, contextPath: string, imageName: string): Promise<string> {
    logger.info('Building Docker image', { imageName, contextPath });
    const { stdout } = await this.run(
      `docker build -f "${dockerfilePath}" -t "${imageName}" "${contextPath}"`
    );
    return stdout;
  }

  async runContainer(imageName: string, containerName: string, port: number, envVars?: Record<string, string>): Promise<string> {
    // Stop existing container with same name if any
    await this.stopContainer(containerName).catch(() => {});
    await this.removeContainer(containerName).catch(() => {});

    let cmd = `docker run -d --name "${containerName}" -p ${port}:${port}`;
    if (envVars) {
      for (const [key, value] of Object.entries(envVars)) {
        cmd += ` -e "${key}=${value}"`;
      }
    }
    cmd += ` "${imageName}"`;

    logger.info('Running Docker container', { containerName, imageName, port });
    const { stdout } = await this.run(cmd);
    return stdout.trim(); // container ID
  }

  async stopContainer(containerName: string): Promise<void> {
    await this.run(`docker stop "${containerName}"`);
    logger.info('Container stopped', { containerName });
  }

  async removeContainer(containerName: string): Promise<void> {
    await this.run(`docker rm -f "${containerName}"`);
    logger.info('Container removed', { containerName });
  }

  async getContainerLogs(containerName: string, tail = 50): Promise<string> {
    const { stdout } = await this.run(`docker logs --tail ${tail} "${containerName}"`);
    return stdout;
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const { stdout } = await this.run(
      'docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"'
    );
    if (!stdout.trim()) return [];

    return stdout.trim().split('\n').map(line => {
      const [id, name, image, status, ports] = line.split('|');
      return { id, name, image, status, ports };
    });
  }

  async getContainerStatus(containerName: string): Promise<string> {
    try {
      const { stdout } = await this.run(
        `docker inspect --format "{{.State.Status}}" "${containerName}"`
      );
      return stdout.trim();
    } catch {
      return 'not_found';
    }
  }

  generateDockerfile(stack: string, baseImage: string): string {
    switch (stack) {
      case 'node':
        return `FROM ${baseImage}
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
`;

      case 'react':
      case 'html':
        return `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM ${baseImage}
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

      case 'nextjs':
        return `FROM ${baseImage} AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM ${baseImage}
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
`;

      case 'python':
        return `FROM ${baseImage}
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

      default:
        return `FROM ${baseImage}\nWORKDIR /app\nCOPY . .\nEXPOSE 3000\n`;
    }
  }
}
