import { SSHSessionManager, getSSHManager } from './session-manager.js';
import logger from '../../utils/logger.js';

// ── Interfaces ──────────────────────────────────────────────────────────────────

export interface ServerScan {
  serverId: string;
  timestamp: string;
  system: {
    os: string;
    kernel: string;
    uptime: string;
    cpu: string;
    ram: string;
    disk: string;
    ip: string;
  };
  services: Array<{
    name: string;
    status: string;
    port?: number;
    version?: string;
  }>;
  tools: Array<{
    name: string;
    version: string;
    path: string;
  }>;
  projects: Array<{
    path: string;
    name: string;
    type: string;
    framework?: string;
    description?: string;
    hasDocker: boolean;
    hasGit: boolean;
    runCommand?: string;
    envKeys?: string[]; // Just key names, NEVER values
  }>;
  scripts: Array<{
    path: string;
    name: string;
    language: string;
    firstLines: string; // First 5 lines for AI analysis
  }>;
  databases: Array<{
    type: string;
    databases: string[];
  }>;
  cronJobs: Array<{
    schedule: string;
    command: string;
  }>;
  containers: Array<{
    name: string;
    image: string;
    status: string;
    ports: string;
  }>;
  configFiles: Array<{
    path: string;
    keys: string[]; // ONLY key names, never values!
    type: string;
  }>;
}

// ── Constants ───────────────────────────────────────────────────────────────────

const EXEC_TIMEOUT = 10000;

const TOOLS_TO_CHECK = [
  'node', 'python3', 'python', 'php', 'ruby', 'go', 'java',
  'ffmpeg', 'docker', 'git', 'nginx', 'pm2', 'psql', 'mysql',
  'mongosh', 'redis-cli', 'sqlite3', 'chromium', 'curl', 'wget',
  'jq', 'pip3', 'npm', 'yarn', 'pnpm', 'cargo', 'composer',
];

// ── Scanner ─────────────────────────────────────────────────────────────────────

export class ServerScanner {
  constructor(private manager: SSHSessionManager) {}

  /**
   * Run a complete inventory scan on a remote server.
   * Every subsection is independent — if one fails the rest still complete.
   */
  async fullScan(serverId: string): Promise<ServerScan> {
    logger.info('Starting full server scan', { serverId });
    const start = Date.now();

    const [
      system,
      services,
      tools,
      projects,
      scripts,
      databases,
      cronJobs,
      containers,
      configFiles,
    ] = await Promise.all([
      this.scanSystem(serverId),
      this.scanServices(serverId),
      this.scanTools(serverId),
      this.scanProjects(serverId),
      this.scanScripts(serverId),
      this.scanDatabases(serverId),
      this.scanCron(serverId),
      this.scanDocker(serverId),
      this.scanConfigs(serverId),
    ]);

    const elapsed = Date.now() - start;
    logger.info('Full server scan completed', { serverId, elapsed, toolsFound: tools.length, projectsFound: projects.length });

    return {
      serverId,
      timestamp: new Date().toISOString(),
      system,
      services,
      tools,
      projects,
      scripts,
      databases,
      cronJobs,
      containers,
      configFiles,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async exec(serverId: string, command: string): Promise<string> {
    const result = await this.manager.exec(serverId, command, EXEC_TIMEOUT);
    return result.stdout?.trim() ?? '';
  }

  private async safeExec(serverId: string, command: string): Promise<string> {
    try {
      return await this.exec(serverId, command);
    } catch {
      return '';
    }
  }

  // ── System info ───────────────────────────────────────────────────────────

  private async scanSystem(serverId: string): Promise<ServerScan['system']> {
    logger.info('Scanning system info', { serverId });
    try {
      const [kernel, os, uptime, cpu, ram, disk, ip] = await Promise.all([
        this.safeExec(serverId, 'uname -a'),
        this.safeExec(serverId, 'lsb_release -ds 2>/dev/null || cat /etc/os-release 2>/dev/null | head -3'),
        this.safeExec(serverId, 'uptime -p'),
        this.safeExec(serverId, 'nproc'),
        this.safeExec(serverId, 'free -h | grep Mem'),
        this.safeExec(serverId, 'df -h / | tail -1'),
        this.safeExec(serverId, "hostname -I | awk '{print $1}'"),
      ]);

      return { os, kernel, uptime, cpu: `${cpu} cores`, ram, disk, ip };
    } catch (err) {
      logger.error('System scan failed', { serverId, error: err });
      return { os: '', kernel: '', uptime: '', cpu: '', ram: '', disk: '', ip: '' };
    }
  }

  // ── Services ──────────────────────────────────────────────────────────────

  private async scanServices(serverId: string): Promise<ServerScan['services']> {
    logger.info('Scanning services', { serverId });
    const services: ServerScan['services'] = [];

    try {
      // systemctl services
      const systemctl = await this.safeExec(
        serverId,
        "systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep '.service' | head -20",
      );
      if (systemctl) {
        for (const line of systemctl.split('\n')) {
          const match = line.match(/^\s*(\S+\.service)\s+\S+\s+\S+\s+(\S+)/);
          if (match) {
            services.push({
              name: match[1].replace('.service', ''),
              status: match[2] || 'running',
            });
          }
        }
      }

      // PM2 processes
      const pm2Raw = await this.safeExec(serverId, 'pm2 jlist 2>/dev/null');
      if (pm2Raw) {
        try {
          const pm2List = JSON.parse(pm2Raw) as Array<{ name: string; pm2_env?: { status?: string }; monit?: { port?: number } }>;
          for (const proc of pm2List) {
            services.push({
              name: `pm2:${proc.name}`,
              status: proc.pm2_env?.status ?? 'unknown',
              port: proc.monit?.port,
            });
          }
        } catch { /* pm2 output was not valid JSON */ }
      }

      // Docker containers (running)
      const dockerRaw = await this.safeExec(
        serverId,
        "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null",
      );
      if (dockerRaw) {
        for (const line of dockerRaw.split('\n')) {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            services.push({
              name: `docker:${parts[0]}`,
              status: parts[2] || 'running',
            });
          }
        }
      }
    } catch (err) {
      logger.error('Services scan failed', { serverId, error: err });
    }

    return services;
  }

  // ── Tools ─────────────────────────────────────────────────────────────────

  private async scanTools(serverId: string): Promise<ServerScan['tools']> {
    logger.info('Scanning installed tools', { serverId });
    const tools: ServerScan['tools'] = [];

    // Build a single compound command to avoid N sequential SSH round-trips.
    // Each tool check outputs "TOOL_NAME<TAB>PATH<TAB>VERSION" or nothing.
    const checks = TOOLS_TO_CHECK.map(
      (t) => `(p=$(which ${t} 2>/dev/null) && v=$(${t} --version 2>/dev/null | head -1) && printf '%s\\t%s\\t%s\\n' '${t}' "$p" "$v")`,
    ).join('; ');

    try {
      const raw = await this.safeExec(serverId, checks);
      if (raw) {
        for (const line of raw.split('\n')) {
          const [name, path, version] = line.split('\t');
          if (name && path) {
            tools.push({ name, path, version: version || 'unknown' });
          }
        }
      }
    } catch (err) {
      logger.error('Tools scan failed', { serverId, error: err });
    }

    return tools;
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  private async scanProjects(serverId: string): Promise<ServerScan['projects']> {
    logger.info('Scanning projects', { serverId });
    const projects: ServerScan['projects'] = [];

    try {
      const raw = await this.safeExec(
        serverId,
        'find /var/www /home /root /opt -maxdepth 3 \\( -name "package.json" -o -name "requirements.txt" -o -name "docker-compose.yml" -o -name "Dockerfile" -o -name "manage.py" \\) 2>/dev/null | head -30',
      );
      if (!raw) return projects;

      // Deduplicate by project directory
      const seen = new Set<string>();
      const indicatorPaths = raw.split('\n').filter(Boolean);

      for (const filePath of indicatorPaths) {
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (seen.has(dir)) continue;
        seen.add(dir);

        const project = await this.analyzeProject(serverId, dir, filePath);
        if (project) projects.push(project);
      }
    } catch (err) {
      logger.error('Projects scan failed', { serverId, error: err });
    }

    return projects;
  }

  private async analyzeProject(
    serverId: string,
    dir: string,
    indicatorPath: string,
  ): Promise<ServerScan['projects'][number] | null> {
    try {
      const fileName = indicatorPath.substring(indicatorPath.lastIndexOf('/') + 1);
      const dirName = dir.substring(dir.lastIndexOf('/') + 1);

      // Check for git & docker presence concurrently
      const [hasGitRaw, hasDockerRaw] = await Promise.all([
        this.safeExec(serverId, `test -d "${dir}/.git" && echo yes || echo no`),
        this.safeExec(serverId, `test -f "${dir}/Dockerfile" -o -f "${dir}/docker-compose.yml" && echo yes || echo no`),
      ]);

      const hasGit = hasGitRaw === 'yes';
      const hasDocker = hasDockerRaw === 'yes';

      let name = dirName;
      let type = 'unknown';
      let framework: string | undefined;
      let description: string | undefined;
      let runCommand: string | undefined;
      let envKeys: string[] | undefined;

      if (fileName === 'package.json') {
        type = 'node';
        const pkgRaw = await this.safeExec(serverId, `cat "${dir}/package.json" 2>/dev/null`);
        if (pkgRaw) {
          try {
            const pkg = JSON.parse(pkgRaw) as {
              name?: string;
              description?: string;
              scripts?: Record<string, string>;
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            name = pkg.name || dirName;
            description = pkg.description;
            runCommand = pkg.scripts?.start ? `npm start` : pkg.scripts?.dev ? 'npm run dev' : undefined;

            // Detect framework from dependencies
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['next']) framework = 'Next.js';
            else if (deps['nuxt']) framework = 'Nuxt';
            else if (deps['react']) framework = 'React';
            else if (deps['vue']) framework = 'Vue';
            else if (deps['@angular/core']) framework = 'Angular';
            else if (deps['express']) framework = 'Express';
            else if (deps['fastify']) framework = 'Fastify';
            else if (deps['nest'] || deps['@nestjs/core']) framework = 'NestJS';
            else if (deps['svelte'] || deps['@sveltejs/kit']) framework = 'Svelte';
          } catch { /* malformed package.json */ }
        }
      } else if (fileName === 'requirements.txt') {
        type = 'python';
        const reqRaw = await this.safeExec(serverId, `head -10 "${dir}/requirements.txt" 2>/dev/null`);
        if (reqRaw) {
          if (reqRaw.includes('django') || reqRaw.includes('Django')) framework = 'Django';
          else if (reqRaw.includes('flask') || reqRaw.includes('Flask')) framework = 'Flask';
          else if (reqRaw.includes('fastapi') || reqRaw.includes('FastAPI')) framework = 'FastAPI';
        }
      } else if (fileName === 'manage.py') {
        type = 'python';
        framework = 'Django';
        runCommand = 'python manage.py runserver';
      } else if (fileName === 'docker-compose.yml') {
        type = 'docker-compose';
        runCommand = 'docker compose up -d';
      } else if (fileName === 'Dockerfile') {
        type = 'docker';
        runCommand = 'docker build .';
      }

      // Scan for .env key names (NEVER values)
      const envRaw = await this.safeExec(
        serverId,
        `test -f "${dir}/.env" && grep -oP '^[A-Z_][A-Z_0-9]*(?==)' "${dir}/.env" 2>/dev/null | head -30`,
      );
      if (envRaw) {
        envKeys = envRaw.split('\n').filter(Boolean);
      }

      return { path: dir, name, type, framework, description, hasDocker, hasGit, runCommand, envKeys };
    } catch (err) {
      logger.warn('Failed to analyze project', { serverId, dir, error: err });
      return null;
    }
  }

  // ── Scripts ───────────────────────────────────────────────────────────────

  private async scanScripts(serverId: string): Promise<ServerScan['scripts']> {
    logger.info('Scanning scripts', { serverId });
    const scripts: ServerScan['scripts'] = [];

    try {
      const raw = await this.safeExec(
        serverId,
        'find /root /home /opt -maxdepth 3 -name "*.py" -o -name "*.sh" 2>/dev/null | grep -v node_modules | grep -v __pycache__ | head -20',
      );
      if (!raw) return scripts;

      const paths = raw.split('\n').filter(Boolean);

      // Batch reads: for each script get first 5 lines
      const readCommands = paths.map((p) => `echo "===FILE:${p}===" && head -5 "${p}" 2>/dev/null`).join(' && ');
      const batchOutput = await this.safeExec(serverId, readCommands);

      if (batchOutput) {
        const sections = batchOutput.split(/===FILE:/).filter(Boolean);
        for (const section of sections) {
          const endOfPath = section.indexOf('===');
          if (endOfPath === -1) continue;
          const filePath = section.substring(0, endOfPath);
          const firstLines = section.substring(endOfPath + 3).trim();
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
          const language = fileName.endsWith('.py') ? 'python' : 'bash';

          scripts.push({ path: filePath, name: fileName, language, firstLines });
        }
      }
    } catch (err) {
      logger.error('Scripts scan failed', { serverId, error: err });
    }

    return scripts;
  }

  // ── Databases ─────────────────────────────────────────────────────────────

  private async scanDatabases(serverId: string): Promise<ServerScan['databases']> {
    logger.info('Scanning databases', { serverId });
    const databases: ServerScan['databases'] = [];

    try {
      // PostgreSQL
      const pgRaw = await this.safeExec(
        serverId,
        "psql -l -t 2>/dev/null | awk -F'|' '{print $1}' | grep -v template | grep -v '^$' | head -10",
      );
      if (pgRaw) {
        const dbs = pgRaw.split('\n').map((d) => d.trim()).filter(Boolean);
        if (dbs.length > 0) databases.push({ type: 'postgresql', databases: dbs });
      }

      // MySQL / MariaDB
      const mysqlRaw = await this.safeExec(
        serverId,
        'mysql -e "SHOW DATABASES" 2>/dev/null | tail -n +2',
      );
      if (mysqlRaw) {
        const dbs = mysqlRaw.split('\n').map((d) => d.trim()).filter(Boolean);
        if (dbs.length > 0) databases.push({ type: 'mysql', databases: dbs });
      }

      // MongoDB
      const mongoRaw = await this.safeExec(
        serverId,
        'mongosh --quiet --eval "db.adminCommand(\'listDatabases\').databases.map(d=>d.name).join(\'\\n\')" 2>/dev/null',
      );
      if (mongoRaw) {
        const dbs = mongoRaw.split('\n').map((d) => d.trim()).filter(Boolean);
        if (dbs.length > 0) databases.push({ type: 'mongodb', databases: dbs });
      }
    } catch (err) {
      logger.error('Databases scan failed', { serverId, error: err });
    }

    return databases;
  }

  // ── Cron ──────────────────────────────────────────────────────────────────

  private async scanCron(serverId: string): Promise<ServerScan['cronJobs']> {
    logger.info('Scanning cron jobs', { serverId });
    const cronJobs: ServerScan['cronJobs'] = [];

    try {
      const raw = await this.safeExec(
        serverId,
        "crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$'",
      );
      if (!raw) return cronJobs;

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Cron format: min hour dom month dow command
        // Match 5 time fields then capture the rest as command
        const match = trimmed.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
        if (match) {
          cronJobs.push({ schedule: match[1], command: match[2] });
        } else {
          // Might be a special string like @reboot, @daily, etc.
          const specialMatch = trimmed.match(/^(@\w+)\s+(.+)$/);
          if (specialMatch) {
            cronJobs.push({ schedule: specialMatch[1], command: specialMatch[2] });
          }
        }
      }
    } catch (err) {
      logger.error('Cron scan failed', { serverId, error: err });
    }

    return cronJobs;
  }

  // ── Docker containers ─────────────────────────────────────────────────────

  private async scanDocker(serverId: string): Promise<ServerScan['containers']> {
    logger.info('Scanning Docker containers', { serverId });
    const containers: ServerScan['containers'] = [];

    try {
      const raw = await this.safeExec(
        serverId,
        "docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null",
      );
      if (!raw) return containers;

      for (const line of raw.split('\n')) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          containers.push({
            name: parts[0] || '',
            image: parts[1] || '',
            status: parts[2] || '',
            ports: parts[3] || '',
          });
        }
      }
    } catch (err) {
      logger.error('Docker scan failed', { serverId, error: err });
    }

    return containers;
  }

  // ── Config files ──────────────────────────────────────────────────────────

  private async scanConfigs(serverId: string): Promise<ServerScan['configFiles']> {
    logger.info('Scanning config files', { serverId });
    const configFiles: ServerScan['configFiles'] = [];

    try {
      const raw = await this.safeExec(
        serverId,
        'find / -maxdepth 4 -name ".env" -not -path "*/node_modules/*" 2>/dev/null | head -10',
      );
      if (!raw) return configFiles;

      const paths = raw.split('\n').filter(Boolean);

      for (const envPath of paths) {
        try {
          // SECURITY: Extract ONLY key names, never values
          const keysRaw = await this.safeExec(
            serverId,
            `grep -oP '^[A-Z_][A-Z_0-9]*(?==)' "${envPath}" 2>/dev/null`,
          );

          const keys = keysRaw ? keysRaw.split('\n').filter(Boolean) : [];
          configFiles.push({ path: envPath, keys, type: 'env' });
        } catch {
          // Individual config read failed, skip it
        }
      }
    } catch (err) {
      logger.error('Config scan failed', { serverId, error: err });
    }

    return configFiles;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function getServerScanner(): ServerScanner {
  return new ServerScanner(getSSHManager());
}
