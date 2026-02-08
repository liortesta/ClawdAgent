import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { getTemplate, listTemplates, ProjectTemplate } from './templates.js';
import { DockerManager } from './docker-manager.js';

const execAsync = promisify(exec);

export interface BuildResult {
  success: boolean;
  projectPath: string;
  filesCreated: string[];
  message: string;
}

export interface DeployResult {
  success: boolean;
  containerName?: string;
  port?: number;
  url?: string;
  message: string;
}

export class ProjectBuilder {
  private baseDir: string;
  private docker: DockerManager;

  constructor() {
    this.baseDir = (config as any).PROJECTS_DIR || './data/projects';
    this.docker = new DockerManager();
  }

  getTemplateList() {
    return listTemplates();
  }

  /**
   * Scaffold a project from a template
   */
  async scaffold(templateId: string, projectName: string, vars?: Record<string, string>): Promise<BuildResult> {
    const template = getTemplate(templateId);
    if (!template) {
      return { success: false, projectPath: '', filesCreated: [], message: `Template "${templateId}" not found. Available: ${listTemplates().map(t => t.id).join(', ')}` };
    }

    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const projectPath = path.resolve(this.baseDir, safeName);

    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });
    logger.info('Scaffolding project', { template: templateId, projectName: safeName, path: projectPath });

    const replacements: Record<string, string> = {
      '{{PROJECT_NAME}}': projectName,
      '{{DESCRIPTION}}': vars?.description ?? `A ${template.name} project`,
      ...Object.fromEntries(Object.entries(vars ?? {}).map(([k, v]) => [`{{${k.toUpperCase()}}}`, v])),
    };

    const filesCreated: string[] = [];

    // Write template files
    for (const [filePath, content] of Object.entries(template.files)) {
      let processed = content;
      for (const [placeholder, value] of Object.entries(replacements)) {
        processed = processed.replaceAll(placeholder, value);
      }

      const fullPath = path.join(projectPath, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, processed, 'utf-8');
      filesCreated.push(filePath);
    }

    // Generate package.json for Node-based projects
    if (template.dependencies || template.devDependencies) {
      const pkg = {
        name: safeName,
        version: '1.0.0',
        description: vars?.description ?? `A ${template.name} project`,
        type: 'module',
        scripts: template.scripts ?? {},
        dependencies: template.dependencies ?? {},
        devDependencies: template.devDependencies ?? {},
      };
      await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');
      filesCreated.push('package.json');
    }

    // Generate .gitignore
    const gitignore = template.stack === 'python'
      ? 'venv/\n__pycache__/\n*.pyc\n.env\n'
      : 'node_modules/\ndist/\n.next/\n.env\n';
    await fs.writeFile(path.join(projectPath, '.gitignore'), gitignore, 'utf-8');
    filesCreated.push('.gitignore');

    logger.info('Project scaffolded', { projectPath, filesCreated: filesCreated.length });

    return {
      success: true,
      projectPath,
      filesCreated,
      message: `Project "${projectName}" scaffolded with ${filesCreated.length} files at ${projectPath}`,
    };
  }

  /**
   * Install dependencies for a project
   */
  async installDeps(projectPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const hasPkg = await fs.access(path.join(projectPath, 'package.json')).then(() => true).catch(() => false);
      const hasReqs = await fs.access(path.join(projectPath, 'requirements.txt')).then(() => true).catch(() => false);

      if (hasPkg) {
        logger.info('Installing npm dependencies', { projectPath });
        await execAsync('npm install', { cwd: projectPath, timeout: 120_000 });
        return { success: true, message: 'npm dependencies installed' };
      } else if (hasReqs) {
        logger.info('Installing Python dependencies', { projectPath });
        await execAsync('pip install -r requirements.txt', { cwd: projectPath, timeout: 120_000 });
        return { success: true, message: 'Python dependencies installed' };
      }

      return { success: true, message: 'No dependencies to install' };
    } catch (err: any) {
      return { success: false, message: `Install failed: ${err.message}` };
    }
  }

  /**
   * Build a project
   */
  async build(projectPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const hasPkg = await fs.access(pkgPath).then(() => true).catch(() => false);

      if (hasPkg) {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        if (pkg.scripts?.build) {
          logger.info('Building project', { projectPath });
          const { stdout } = await execAsync('npm run build', { cwd: projectPath, timeout: 120_000 });
          return { success: true, message: `Build complete: ${stdout.slice(-200)}` };
        }
      }

      return { success: true, message: 'No build step required' };
    } catch (err: any) {
      return { success: false, message: `Build failed: ${err.message}` };
    }
  }

  /**
   * Dockerize a project — generate Dockerfile and build image
   */
  async dockerize(projectPath: string, imageName: string, stack?: string): Promise<{ success: boolean; message: string }> {
    const available = await this.docker.isAvailable();
    if (!available) {
      return { success: false, message: 'Docker is not available. Please install Docker.' };
    }

    // Detect stack from project files
    const detectedStack = stack ?? await this.detectStack(projectPath);

    // Find base image from templates
    const template = listTemplates().find(t => t.stack === detectedStack);
    const baseImage = (getTemplate(template?.id ?? '') as any)?.dockerBase ?? 'node:20-alpine';

    // Generate Dockerfile
    const dockerfile = this.docker.generateDockerfile(detectedStack, baseImage);
    const dockerfilePath = path.join(projectPath, 'Dockerfile');
    await fs.writeFile(dockerfilePath, dockerfile, 'utf-8');

    // Build image
    try {
      await this.docker.buildImage(dockerfilePath, projectPath, imageName);
      return { success: true, message: `Docker image "${imageName}" built successfully` };
    } catch (err: any) {
      return { success: false, message: `Docker build failed: ${err.message}` };
    }
  }

  /**
   * Deploy a project — run as Docker container
   */
  async deploy(imageName: string, containerName: string, port: number, envVars?: Record<string, string>): Promise<DeployResult> {
    const available = await this.docker.isAvailable();
    if (!available) {
      return { success: false, message: 'Docker is not available' };
    }

    try {
      const containerId = await this.docker.runContainer(imageName, containerName, port, envVars);
      const url = `http://localhost:${port}`;
      logger.info('Project deployed', { containerName, port, url, containerId });

      return { success: true, containerName, port, url, message: `Deployed at ${url} (container: ${containerName})` };
    } catch (err: any) {
      return { success: false, message: `Deploy failed: ${err.message}` };
    }
  }

  /**
   * Full pipeline: scaffold → install → build → dockerize → deploy
   */
  async fullPipeline(
    templateId: string,
    projectName: string,
    port: number,
    vars?: Record<string, string>,
  ): Promise<{ scaffold: BuildResult; install?: any; build?: any; docker?: any; deploy?: DeployResult }> {
    // 1. Scaffold
    const scaffold = await this.scaffold(templateId, projectName, vars);
    if (!scaffold.success) return { scaffold };

    // 2. Install deps
    const install = await this.installDeps(scaffold.projectPath);

    // 3. Build
    const buildResult = await this.build(scaffold.projectPath);

    // 4. Dockerize
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const imageName = `clawdagent/${safeName}`;
    const docker = await this.dockerize(scaffold.projectPath, imageName);

    // 5. Deploy
    let deploy: DeployResult | undefined;
    if (docker.success) {
      deploy = await this.deploy(imageName, safeName, port);
    }

    return { scaffold, install, build: buildResult, docker, deploy };
  }

  /**
   * Write a custom file to a project
   */
  async writeFile(projectPath: string, filePath: string, content: string): Promise<void> {
    const fullPath = path.join(projectPath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<string[]> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Get container status for a project
   */
  async getStatus(containerName: string): Promise<string> {
    return this.docker.getContainerStatus(containerName);
  }

  /**
   * Get container logs
   */
  async getLogs(containerName: string, tail = 50): Promise<string> {
    return this.docker.getContainerLogs(containerName, tail);
  }

  private async detectStack(projectPath: string): Promise<string> {
    const hasFile = async (name: string) =>
      fs.access(path.join(projectPath, name)).then(() => true).catch(() => false);

    if (await hasFile('next.config.mjs') || await hasFile('next.config.js')) return 'nextjs';
    if (await hasFile('vite.config.ts') || await hasFile('vite.config.js')) return 'react';
    if (await hasFile('requirements.txt') || await hasFile('main.py')) return 'python';
    if (await hasFile('package.json')) return 'node';
    if (await hasFile('index.html')) return 'html';
    return 'node';
  }
}
