import { BaseTool, ToolResult } from './base-tool.js';
import { getSSHManager } from '../../actions/ssh/session-manager.js';
import type { SSHSessionManager, SSHServer, ExecResult } from '../../actions/ssh/session-manager.js';
import { guardCommand } from '../../security/command-guard.js';
import { sandboxCommand } from '../../security/bash-sandbox.js';
import { audit } from '../../security/audit-log.js';

// ---------------------------------------------------------------------------
// Optional modules — these may not exist yet. We lazy-import and degrade
// gracefully so the core SSH functionality (connect, exec, transfer) always
// works even if scanner / health / cross-server haven't been built.
// ---------------------------------------------------------------------------

let _serverScanner: any = null;
let _healthMonitor: any = null;
let _crossServerExecutor: any = null;

async function loadServerScanner(): Promise<any> {
  if (_serverScanner !== null) return _serverScanner;
  try {
    const mod = await import('../../actions/ssh/server-scanner.js');
    _serverScanner = mod.getServerScanner();
    return _serverScanner;
  } catch {
    _serverScanner = false;
    return null;
  }
}

async function loadHealthMonitor(): Promise<any> {
  if (_healthMonitor !== null) return _healthMonitor;
  try {
    const mod = await import('../../actions/ssh/health-monitor.js');
    _healthMonitor = mod.getHealthMonitor();
    return _healthMonitor;
  } catch {
    _healthMonitor = false;
    return null;
  }
}

async function loadCrossServerExecutor(): Promise<any> {
  if (_crossServerExecutor !== null) return _crossServerExecutor;
  try {
    const mod = await import('../../actions/ssh/cross-server.js');
    _crossServerExecutor = mod.getCrossServerExecutor();
    return _crossServerExecutor;
  } catch {
    _crossServerExecutor = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// SSHTool
// ---------------------------------------------------------------------------

class SSHTool extends BaseTool {
  name = 'ssh';
  description =
    'Multi-server SSH management \u2014 connect, execute, scan, transfer files, health monitoring, cross-server workflows';

  private get manager(): SSHSessionManager {
    return getSSHManager();
  }

  /**
   * SSH Command Guard — applies the same command-guard + sandbox checks
   * that protect bash commands. Blocks dangerous patterns and secret exfil.
   */
  private async guardSSHCommand(command: string, userId = 'system'): Promise<ToolResult | null> {
    // Layer 1: Command guard — block dangerous patterns (rm -rf /, DROP TABLE, etc.)
    const guardResult = guardCommand(command);
    if (!guardResult.allowed) {
      this.error('SSH command blocked by guard', { command: command.slice(0, 100), reason: guardResult.reason });
      await audit(userId, 'ssh.blocked', { command: command.slice(0, 200), reason: guardResult.reason });
      return { success: false, output: '', error: `SSH blocked: ${guardResult.reason ?? 'dangerous command'}` };
    }

    // Layer 2: Sandbox — check for secret exfiltration attempts
    const sandboxResult = sandboxCommand(command);
    if (!sandboxResult.allowed) {
      this.error('SSH command blocked by sandbox', { command: command.slice(0, 100), reason: sandboxResult.reason });
      await audit(userId, 'ssh.sandbox_blocked', { command: command.slice(0, 200), reason: sandboxResult.reason });
      return { success: false, output: '', error: `SSH blocked: ${sandboxResult.reason ?? 'sandbox violation'}` };
    }

    // Log caution-level commands (installs, service restarts, etc.)
    if (guardResult.level === 'caution') {
      this.log('SSH caution command', { command: command.slice(0, 100) });
    }

    return null; // null = command is allowed
  }

  // -------------------------------------------------------------------------
  // Main dispatch
  // -------------------------------------------------------------------------

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    if (!action) {
      return { success: false, output: '', error: 'No action specified. Available actions: add_server, remove_server, list_servers, connect, disconnect, switch, active, status, exec, exec_all, scan, scan_all, upload, download, health, health_all, workflow_run' };
    }

    try {
      switch (action) {
        // Server management
        case 'add_server':    return await this.addServer(input);
        case 'remove_server': return await this.removeServer(input);
        case 'list_servers':  return this.listServers();

        // Session control
        case 'connect':    return await this.connectServer(input);
        case 'disconnect': return await this.disconnectServer(input);
        case 'switch':     return this.switchServer(input);
        case 'active':     return this.activeServer();
        case 'status':     return this.serverStatus();

        // Command execution
        case 'exec':     return await this.execCommand(input);
        case 'exec_all': return await this.execAll(input);

        // Discovery
        case 'scan':     return await this.scanServer(input);
        case 'scan_all': return await this.scanAllServers();

        // File transfer
        case 'upload':   return await this.uploadFile(input);
        case 'download': return await this.downloadFile(input);

        // Health
        case 'health':     return await this.healthCheck(input);
        case 'health_all': return await this.healthCheckAll();

        // Cross-server
        case 'workflow_run': return await this.workflowRun(input);

        default:
          return {
            success: false,
            output: '',
            error: `Unknown action: ${action}. Available actions: add_server, remove_server, list_servers, connect, disconnect, switch, active, status, exec, exec_all, scan, scan_all, upload, download, health, health_all, workflow_run`,
          };
      }
    } catch (err: any) {
      this.error(`Action "${action}" failed`, { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // -------------------------------------------------------------------------
  // Server Management
  // -------------------------------------------------------------------------

  private async addServer(input: Record<string, unknown>): Promise<ToolResult> {
    const id = input.id as string;
    let host = input.host as string;
    let user = input.user as string;
    const keyPath = input.keyPath as string;

    if (!id) return { success: false, output: '', error: 'Missing required param: id' };
    if (!host) return { success: false, output: '', error: 'Missing required param: host' };
    if (!keyPath) return { success: false, output: '', error: 'Missing required param: keyPath' };

    // Parse host — may include user@ prefix and :port suffix
    let port = (input.port as number) ?? 22;

    if (host.includes('@')) {
      const atIdx = host.indexOf('@');
      if (!user) {
        user = host.slice(0, atIdx);
      }
      host = host.slice(atIdx + 1);
    }

    if (host.includes(':')) {
      const colonIdx = host.lastIndexOf(':');
      const portCandidate = parseInt(host.slice(colonIdx + 1), 10);
      if (!isNaN(portCandidate) && portCandidate > 0 && portCandidate <= 65535) {
        if (!input.port) {
          port = portCandidate;
        }
        host = host.slice(0, colonIdx);
      }
    }

    if (!user) {
      user = 'root';
    }

    const name = (input.name as string) ?? id;
    const workDir = input.workDir as string | undefined;
    const tags = input.tags as string[] ?? [];

    const server: SSHServer = {
      id,
      name,
      host,
      port,
      user,
      keyPath,
      workDir,
      tags,
    };

    this.manager.addServer(server);
    this.log('Server added', { id, host, port, user });

    return {
      success: true,
      output: `Server added successfully:\n  ID:   ${id}\n  Name: ${name}\n  Host: ${user}@${host}:${port}\n  Key:  ${keyPath}${workDir ? `\n  Dir:  ${workDir}` : ''}${tags.length ? `\n  Tags: ${tags.join(', ')}` : ''}`,
    };
  }

  private async removeServer(input: Record<string, unknown>): Promise<ToolResult> {
    const id = input.id as string;
    if (!id) return { success: false, output: '', error: 'Missing required param: id' };

    const server = this.manager.getServer(id);
    if (!server) {
      return { success: false, output: '', error: `Server "${id}" not found` };
    }

    this.manager.removeServer(id);
    this.log('Server removed', { id });

    return { success: true, output: `Server "${id}" (${server.host}) removed.` };
  }

  private listServers(): ToolResult {
    const servers = this.manager.listServers();
    if (servers.length === 0) {
      return { success: true, output: 'No servers configured. Use add_server to add one.' };
    }

    const activeId = this.manager.getActive();

    const header = 'ID              | Name                 | Host                      | Status       | Tags';
    const sep    = '----------------|----------------------|---------------------------|--------------|----------------';

    const rows = servers.map(s => {
      const connected = this.manager.isConnected(s.id);
      const isActive = s.id === activeId;
      const status = connected
        ? (isActive ? 'connected *' : 'connected')
        : 'disconnected';

      return `${s.id.padEnd(16)}| ${(s.name || s.id).padEnd(21)}| ${(s.user + '@' + s.host + ':' + s.port).padEnd(26)}| ${status.padEnd(13)}| ${s.tags.join(', ')}`;
    });

    return { success: true, output: `${header}\n${sep}\n${rows.join('\n')}` };
  }

  // -------------------------------------------------------------------------
  // Session Control
  // -------------------------------------------------------------------------

  private async connectServer(input: Record<string, unknown>): Promise<ToolResult> {
    const serverId = input.serverId as string;
    if (!serverId) return { success: false, output: '', error: 'Missing required param: serverId' };

    const server = this.manager.getServer(serverId);
    if (!server) {
      return { success: false, output: '', error: `Server "${serverId}" not found. Use list_servers to see available servers.` };
    }

    this.log('Connecting', { serverId, host: server.host });
    await this.manager.connect(serverId);

    return {
      success: true,
      output: `Connected to ${serverId} (${server.user}@${server.host}:${server.port})`,
    };
  }

  private async disconnectServer(input: Record<string, unknown>): Promise<ToolResult> {
    const serverId = input.serverId as string;
    if (!serverId) return { success: false, output: '', error: 'Missing required param: serverId' };

    await this.manager.disconnect(serverId);
    this.log('Disconnected', { serverId });

    return { success: true, output: `Disconnected from ${serverId}.` };
  }

  private switchServer(input: Record<string, unknown>): ToolResult {
    const serverId = input.serverId as string;
    if (!serverId) return { success: false, output: '', error: 'Missing required param: serverId' };

    this.manager.switchActive(serverId);
    this.log('Switched active server', { serverId });

    const server = this.manager.getServer(serverId);
    return {
      success: true,
      output: `Active server switched to ${serverId}${server ? ` (${server.user}@${server.host})` : ''}`,
    };
  }

  private activeServer(): ToolResult {
    const activeId = this.manager.getActive();
    if (!activeId) {
      return { success: true, output: 'No active server. Connect to a server first.' };
    }

    const server = this.manager.getServer(activeId);
    if (!server) {
      return { success: true, output: `Active server ID: ${activeId} (server details not found)` };
    }

    return {
      success: true,
      output: `Active server: ${activeId}\n  Name: ${server.name}\n  Host: ${server.user}@${server.host}:${server.port}${server.workDir ? `\n  Dir:  ${server.workDir}` : ''}${server.tags.length ? `\n  Tags: ${server.tags.join(', ')}` : ''}`,
    };
  }

  private serverStatus(): ToolResult {
    const servers = this.manager.listServers();
    if (servers.length === 0) {
      return { success: true, output: 'No servers configured.' };
    }

    const activeId = this.manager.getActive();
    const lines = servers.map(s => {
      const connected = this.manager.isConnected(s.id);
      const isActive = s.id === activeId;
      const indicator = connected ? '\u{1F7E2}' : '\u{1F534}';
      const activeMarker = isActive ? ' [ACTIVE]' : '';
      return `${indicator} ${s.id} (${s.user}@${s.host}:${s.port}) — ${connected ? 'connected' : 'disconnected'}${activeMarker}`;
    });

    return { success: true, output: `Server Status:\n${lines.join('\n')}` };
  }

  // -------------------------------------------------------------------------
  // Command Execution
  // -------------------------------------------------------------------------

  private async execCommand(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input.command as string;
    if (!command) return { success: false, output: '', error: 'Missing required param: command' };

    // Security: apply command-guard + sandbox checks
    const blocked = await this.guardSSHCommand(command, (input._userId as string) ?? 'system');
    if (blocked) return blocked;

    let serverId = input.serverId as string;
    if (!serverId) {
      serverId = this.manager.getActive() as string;
      if (!serverId) {
        return { success: false, output: '', error: 'No serverId specified and no active server. Connect to a server first.' };
      }
    }

    this.log('Exec', { serverId, command: command.slice(0, 100) });

    const result = await this.manager.exec(serverId, command);
    return this.formatExecResult(serverId, command, result);
  }

  private async execAll(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input.command as string;
    if (!command) return { success: false, output: '', error: 'Missing required param: command' };

    // Security: apply command-guard + sandbox checks
    const blocked = await this.guardSSHCommand(command, (input._userId as string) ?? 'system');
    if (blocked) return blocked;

    this.log('ExecAll', { command: command.slice(0, 100) });

    const results = await this.manager.execAll(command);
    if (results.size === 0) {
      return { success: false, output: '', error: 'No connected servers. Connect to at least one server first.' };
    }

    const sections: string[] = [];
    let allSuccess = true;

    for (const [serverId, result] of results) {
      const server = this.manager.getServer(serverId);
      const label = server ? `${serverId} (${server.host})` : serverId;
      const statusIcon = result.code === 0 ? '\u2705' : '\u274C';

      let section = `${statusIcon} ${label} [exit ${result.code}]`;
      if (result.stdout.trim()) {
        section += `\n${result.stdout.trim()}`;
      }
      if (result.stderr.trim()) {
        section += `\nSTDERR: ${result.stderr.trim()}`;
      }
      sections.push(section);

      if (result.code !== 0) allSuccess = false;
    }

    return {
      success: allSuccess,
      output: `Command: ${command}\nServers: ${results.size}\n${'='.repeat(60)}\n${sections.join('\n' + '-'.repeat(40) + '\n')}`,
    };
  }

  // -------------------------------------------------------------------------
  // Discovery (Scanning)
  // -------------------------------------------------------------------------

  private async scanServer(input: Record<string, unknown>): Promise<ToolResult> {
    let serverId = input.serverId as string;
    if (!serverId) {
      serverId = this.manager.getActive() as string;
      if (!serverId) {
        return { success: false, output: '', error: 'No serverId specified and no active server.' };
      }
    }

    const server = this.manager.getServer(serverId);
    if (!server) {
      return { success: false, output: '', error: `Server "${serverId}" not found.` };
    }

    if (!this.manager.isConnected(serverId)) {
      return { success: false, output: '', error: `Server "${serverId}" is not connected. Connect first.` };
    }

    // Try the dedicated scanner module first
    const scanner = await loadServerScanner();
    if (scanner) {
      this.log('Scanning server (full)', { serverId });
      try {
        const scanResult = await scanner.fullScan(serverId);
        return { success: true, output: this.formatScanResult(server, scanResult) };
      } catch (err: any) {
        this.error('Scanner fullScan failed, falling back to manual scan', { serverId, error: err.message });
      }
    }

    // Fallback: manual scan via SSH commands
    this.log('Scanning server (manual fallback)', { serverId });
    return await this.manualScan(serverId, server);
  }

  private async scanAllServers(): Promise<ToolResult> {
    const servers = this.manager.listServers();
    const connectedServers = servers.filter(s => this.manager.isConnected(s.id));

    if (connectedServers.length === 0) {
      return { success: false, output: '', error: 'No connected servers to scan.' };
    }

    this.log('Scanning all servers', { count: connectedServers.length });

    const sections: string[] = [];
    for (const server of connectedServers) {
      try {
        const result = await this.scanServer({ serverId: server.id });
        sections.push(result.output);
      } catch (err: any) {
        sections.push(`\u274C Scan failed for ${server.id}: ${err.message}`);
      }
    }

    return {
      success: true,
      output: sections.join('\n\n' + '='.repeat(70) + '\n\n'),
    };
  }

  /**
   * Fallback scan when the server-scanner module is not available.
   * Runs basic system commands to gather server information.
   */
  private async manualScan(serverId: string, server: SSHServer): Promise<ToolResult> {
    const exec = async (cmd: string): Promise<string> => {
      try {
        const r = await this.manager.exec(serverId, cmd, 15_000);
        return r.stdout.trim();
      } catch {
        return '';
      }
    };

    // Run all discovery commands in parallel
    const [
      osRelease,
      hostname,
      cpuInfo,
      memInfo,
      diskInfo,
      uptime,
      loadAvg,
      nodeVersion,
      pythonVersion,
      goVersion,
      dockerVersion,
      gitVersion,
      nginxVersion,
      pmVersion,
      containerList,
      listeningPorts,
    ] = await Promise.all([
      exec('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\''),
      exec('hostname'),
      exec('nproc 2>/dev/null || echo "?"'),
      exec('free -h 2>/dev/null | awk \'/Mem:/{print $2}\''),
      exec('df -h / 2>/dev/null | awk \'NR==2{print $5}\''),
      exec('uptime -p 2>/dev/null || uptime'),
      exec('cat /proc/loadavg 2>/dev/null | awk \'{print $1, $2, $3}\''),
      exec('node -v 2>/dev/null'),
      exec('python3 --version 2>/dev/null || python --version 2>/dev/null'),
      exec('go version 2>/dev/null'),
      exec('docker --version 2>/dev/null'),
      exec('git --version 2>/dev/null'),
      exec('nginx -v 2>&1 | head -1'),
      exec('pm2 -v 2>/dev/null'),
      exec('docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}" 2>/dev/null'),
      exec('ss -tlnp 2>/dev/null | tail -n +2 || netstat -tlnp 2>/dev/null | tail -n +2'),
    ]);

    // Format output
    const lines: string[] = [];
    lines.push(`\u{1F50D} Server Scan: ${serverId} (${server.host})`);
    lines.push('');

    // System
    lines.push('\u2550\u2550\u2550 System \u2550\u2550\u2550');
    lines.push(`Hostname: ${hostname || '?'}`);
    lines.push(`OS: ${osRelease || '?'}`);
    lines.push(`CPU: ${cpuInfo || '?'} cores | RAM: ${memInfo || '?'} | Disk: ${diskInfo || '?'} used`);
    lines.push(`Uptime: ${uptime || '?'}`);
    lines.push(`Load: ${loadAvg || '?'}`);
    lines.push('');

    // Tools
    lines.push('\u2550\u2550\u2550 Tools \u2550\u2550\u2550');
    const tools: [string, string][] = [
      ['node', nodeVersion],
      ['python', pythonVersion],
      ['go', goVersion],
      ['docker', dockerVersion],
      ['git', gitVersion],
      ['nginx', nginxVersion],
      ['pm2', pmVersion],
    ];
    const foundTools = tools.filter(([, v]) => v);
    if (foundTools.length > 0) {
      for (const [name, version] of foundTools) {
        lines.push(`- ${name} ${version}`);
      }
    } else {
      lines.push('(no common tools detected)');
    }
    lines.push('');

    // Containers
    if (containerList) {
      lines.push('\u2550\u2550\u2550 Containers \u2550\u2550\u2550');
      const containers = containerList.split('\n').filter(Boolean);
      for (const c of containers) {
        const parts = c.split('\t');
        lines.push(`\u{1F4E6} ${parts[0] || '?'} (${parts[1] || '?'}) \u2014 ${parts[2] || '?'}`);
      }
      lines.push('');
    }

    // Listening ports
    if (listeningPorts) {
      lines.push('\u2550\u2550\u2550 Listening Ports \u2550\u2550\u2550');
      const ports = listeningPorts.split('\n').filter(Boolean).slice(0, 20);
      for (const p of ports) {
        lines.push(`  ${p.trim()}`);
      }
      if (listeningPorts.split('\n').length > 20) {
        lines.push(`  ... and more`);
      }
      lines.push('');
    }

    lines.push(`Scan completed at ${new Date().toISOString()}`);

    return { success: true, output: lines.join('\n') };
  }

  /**
   * Format a structured scan result from the ServerScanner module.
   */
  private formatScanResult(server: SSHServer, scan: Record<string, any>): string {
    const lines: string[] = [];
    lines.push(`\u{1F50D} Server Scan: ${server.id} (${server.host})`);
    lines.push('');

    // System info
    if (scan.system) {
      lines.push('\u2550\u2550\u2550 System \u2550\u2550\u2550');
      const sys = scan.system;
      if (sys.os) lines.push(`OS: ${sys.os}`);
      if (sys.hostname) lines.push(`Hostname: ${sys.hostname}`);
      if (sys.cpu || sys.ram || sys.disk) {
        lines.push(`CPU: ${sys.cpu || '?'} | RAM: ${sys.ram || '?'} | Disk: ${sys.disk || '?'}`);
      }
      if (sys.uptime) lines.push(`Uptime: ${sys.uptime}`);
      if (sys.load) lines.push(`Load: ${sys.load}`);
      lines.push('');
    }

    // Tools
    if (scan.tools && Array.isArray(scan.tools) && scan.tools.length > 0) {
      lines.push('\u2550\u2550\u2550 Tools \u2550\u2550\u2550');
      for (const tool of scan.tools) {
        if (typeof tool === 'string') {
          lines.push(`- ${tool}`);
        } else if (tool.name) {
          lines.push(`- ${tool.name}${tool.version ? ' ' + tool.version : ''}`);
        }
      }
      lines.push('');
    }

    // Projects
    if (scan.projects && Array.isArray(scan.projects) && scan.projects.length > 0) {
      lines.push('\u2550\u2550\u2550 Projects \u2550\u2550\u2550');
      for (const proj of scan.projects) {
        const desc = proj.description ? ` \u2014 ${proj.description}` : '';
        const type = proj.type ? ` (${proj.type})` : '';
        lines.push(`\u{1F4C1} ${proj.path || proj.name || '?'}${type}${desc}`);
      }
      lines.push('');
    }

    // Scripts
    if (scan.scripts && Array.isArray(scan.scripts) && scan.scripts.length > 0) {
      lines.push('\u2550\u2550\u2550 Scripts \u2550\u2550\u2550');
      for (const script of scan.scripts) {
        lines.push(`  ${typeof script === 'string' ? script : script.path || script.name || '?'}`);
      }
      lines.push('');
    }

    // Databases
    if (scan.databases && Array.isArray(scan.databases) && scan.databases.length > 0) {
      lines.push('\u2550\u2550\u2550 Databases \u2550\u2550\u2550');
      for (const db of scan.databases) {
        if (typeof db === 'string') {
          lines.push(`- ${db}`);
        } else {
          lines.push(`- ${db.type || '?'}${db.version ? ' ' + db.version : ''}${db.port ? ' :' + db.port : ''}`);
        }
      }
      lines.push('');
    }

    // Containers
    if (scan.containers && Array.isArray(scan.containers) && scan.containers.length > 0) {
      lines.push('\u2550\u2550\u2550 Containers \u2550\u2550\u2550');
      for (const c of scan.containers) {
        if (typeof c === 'string') {
          lines.push(`\u{1F4E6} ${c}`);
        } else {
          lines.push(`\u{1F4E6} ${c.name || '?'} (${c.image || '?'}) \u2014 ${c.status || '?'}`);
        }
      }
      lines.push('');
    }

    // Configs
    if (scan.configs && Array.isArray(scan.configs) && scan.configs.length > 0) {
      lines.push('\u2550\u2550\u2550 Configs \u2550\u2550\u2550');
      for (const cfg of scan.configs) {
        lines.push(`  ${typeof cfg === 'string' ? cfg : cfg.path || cfg.name || '?'}`);
      }
      lines.push('');
    }

    lines.push(`Scan completed at ${new Date().toISOString()}`);
    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // File Transfer
  // -------------------------------------------------------------------------

  /** Block access to sensitive local paths during file transfer */
  private isLocalPathSafe(p: string): boolean {
    const normalized = p.replace(/\\/g, '/').toLowerCase();
    const blocked = ['/etc/', '/.ssh/', '/.env', '/.git/', '/passwd', '/shadow', '/id_rsa', '/id_ed25519', '/credentials'];
    return !blocked.some(b => normalized.includes(b));
  }

  private async uploadFile(input: Record<string, unknown>): Promise<ToolResult> {
    let serverId = input.serverId as string;
    const localPath = input.localPath as string;
    const remotePath = input.remotePath as string;

    if (!localPath) return { success: false, output: '', error: 'Missing required param: localPath' };
    if (!remotePath) return { success: false, output: '', error: 'Missing required param: remotePath' };
    if (!this.isLocalPathSafe(localPath)) return { success: false, output: '', error: `Blocked: local path "${localPath}" targets a sensitive location` };

    if (!serverId) {
      serverId = this.manager.getActive() as string;
      if (!serverId) {
        return { success: false, output: '', error: 'No serverId specified and no active server.' };
      }
    }

    this.log('Upload', { serverId, localPath, remotePath });
    await this.manager.upload(serverId, localPath, remotePath);

    const server = this.manager.getServer(serverId);
    return {
      success: true,
      output: `File uploaded successfully.\n  From: ${localPath}\n  To:   ${serverId}${server ? ` (${server.host})` : ''}:${remotePath}`,
    };
  }

  private async downloadFile(input: Record<string, unknown>): Promise<ToolResult> {
    let serverId = input.serverId as string;
    const remotePath = input.remotePath as string;
    const localPath = input.localPath as string;

    if (!remotePath) return { success: false, output: '', error: 'Missing required param: remotePath' };
    if (!localPath) return { success: false, output: '', error: 'Missing required param: localPath' };
    if (!this.isLocalPathSafe(localPath)) return { success: false, output: '', error: `Blocked: local path "${localPath}" targets a sensitive location` };

    if (!serverId) {
      serverId = this.manager.getActive() as string;
      if (!serverId) {
        return { success: false, output: '', error: 'No serverId specified and no active server.' };
      }
    }

    this.log('Download', { serverId, remotePath, localPath });
    await this.manager.download(serverId, remotePath, localPath);

    const server = this.manager.getServer(serverId);
    return {
      success: true,
      output: `File downloaded successfully.\n  From: ${serverId}${server ? ` (${server.host})` : ''}:${remotePath}\n  To:   ${localPath}`,
    };
  }

  // -------------------------------------------------------------------------
  // Health Monitoring
  // -------------------------------------------------------------------------

  private async healthCheck(input: Record<string, unknown>): Promise<ToolResult> {
    let serverId = input.serverId as string;
    if (!serverId) {
      serverId = this.manager.getActive() as string;
      if (!serverId) {
        return { success: false, output: '', error: 'No serverId specified and no active server.' };
      }
    }

    const server = this.manager.getServer(serverId);
    if (!server) {
      return { success: false, output: '', error: `Server "${serverId}" not found.` };
    }

    if (!this.manager.isConnected(serverId)) {
      return { success: false, output: '', error: `Server "${serverId}" is not connected. Connect first.` };
    }

    // Try the dedicated health monitor module
    const monitor = await loadHealthMonitor();
    if (monitor) {
      this.log('Health check (monitor)', { serverId });
      try {
        const report = await monitor.check(serverId);
        return { success: true, output: this.formatHealthReport(server, report) };
      } catch (err: any) {
        this.error('Health monitor failed, falling back to manual check', { serverId, error: err.message });
      }
    }

    // Fallback: manual health check via SSH commands
    this.log('Health check (manual fallback)', { serverId });
    return await this.manualHealthCheck(serverId, server);
  }

  private async healthCheckAll(): Promise<ToolResult> {
    const servers = this.manager.listServers();
    const connectedServers = servers.filter(s => this.manager.isConnected(s.id));

    if (connectedServers.length === 0) {
      return { success: false, output: '', error: 'No connected servers to check.' };
    }

    this.log('Health check all', { count: connectedServers.length });

    const sections: string[] = [];
    sections.push(`\u{1F3E5} Health Dashboard \u2014 ${connectedServers.length} server(s)`);
    sections.push('='.repeat(60));

    for (const server of connectedServers) {
      try {
        const result = await this.healthCheck({ serverId: server.id });
        sections.push(result.output);
      } catch (err: any) {
        sections.push(`\u274C ${server.id}: Health check failed \u2014 ${err.message}`);
      }
      sections.push('-'.repeat(40));
    }

    return { success: true, output: sections.join('\n') };
  }

  /**
   * Fallback health check when the health-monitor module is not available.
   */
  private async manualHealthCheck(serverId: string, _server: SSHServer): Promise<ToolResult> {
    const exec = async (cmd: string): Promise<string> => {
      try {
        const r = await this.manager.exec(serverId, cmd, 10_000);
        return r.stdout.trim();
      } catch {
        return '';
      }
    };

    const [cpuUsage, memUsage, diskUsage, loadAvg, uptimeStr] = await Promise.all([
      exec("top -bn1 2>/dev/null | grep 'Cpu(s)' | awk '{print 100 - $8}' || echo '?'"),
      exec("free 2>/dev/null | awk '/Mem:/{printf \"%.0f\", $3/$2*100}' || echo '?'"),
      exec("df -h / 2>/dev/null | awk 'NR==2{print $5}' || echo '?'"),
      exec("cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || echo '?'"),
      exec("uptime -p 2>/dev/null || uptime"),
    ]);

    const cpuNum = parseFloat(cpuUsage) || 0;
    const memNum = parseFloat(memUsage) || 0;
    const diskNum = parseFloat(diskUsage) || 0;

    // Determine overall health
    let status: string;
    let statusIcon: string;

    if (cpuNum > 90 || memNum > 95 || diskNum > 95) {
      status = 'Critical';
      statusIcon = '\u{1F534}';
    } else if (cpuNum > 70 || memNum > 80 || diskNum > 85) {
      status = 'Warning';
      statusIcon = '\u{1F7E1}';
    } else {
      status = 'Healthy';
      statusIcon = '\u{1F7E2}';
    }

    const lines: string[] = [];
    lines.push(`\u{1F5A5}\uFE0F Server Health: ${serverId}`);
    lines.push(`${statusIcon} ${status}`);
    lines.push(`CPU: ${cpuUsage}% | RAM: ${memUsage}% | Disk: ${diskUsage}`);
    lines.push(`Load: ${loadAvg}`);
    lines.push(`Uptime: ${uptimeStr}`);

    return { success: true, output: lines.join('\n') };
  }

  /**
   * Format a structured health report from the HealthMonitor module.
   */
  private formatHealthReport(server: SSHServer, report: Record<string, any>): string {
    const lines: string[] = [];
    lines.push(`\u{1F5A5}\uFE0F Server Health: ${server.id}`);

    // Determine status from report
    const status = report.status || report.health || 'unknown';
    let statusIcon: string;
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'ok':
      case 'good':
        statusIcon = '\u{1F7E2}';
        break;
      case 'warning':
      case 'warn':
      case 'degraded':
        statusIcon = '\u{1F7E1}';
        break;
      case 'critical':
      case 'error':
      case 'unhealthy':
        statusIcon = '\u{1F534}';
        break;
      default:
        statusIcon = '\u26AA';
    }

    lines.push(`${statusIcon} ${status.charAt(0).toUpperCase() + status.slice(1)}`);

    const cpu = report.cpu ?? report.cpuUsage ?? '?';
    const ram = report.ram ?? report.memUsage ?? report.memory ?? '?';
    const disk = report.disk ?? report.diskUsage ?? '?';
    lines.push(`CPU: ${cpu}% | RAM: ${ram}% | Disk: ${disk}%`);

    if (report.load || report.loadAvg) {
      lines.push(`Load: ${report.load || report.loadAvg}`);
    }

    if (report.uptime) {
      lines.push(`Uptime: ${report.uptime}`);
    }

    if (report.alerts && Array.isArray(report.alerts) && report.alerts.length > 0) {
      lines.push('');
      lines.push('Alerts:');
      for (const alert of report.alerts) {
        lines.push(`  \u26A0\uFE0F ${typeof alert === 'string' ? alert : alert.message || JSON.stringify(alert)}`);
      }
    }

    if (report.services && Array.isArray(report.services)) {
      lines.push('');
      lines.push('Services:');
      for (const svc of report.services) {
        if (typeof svc === 'string') {
          lines.push(`  ${svc}`);
        } else {
          const svcIcon = svc.running ? '\u{1F7E2}' : '\u{1F534}';
          lines.push(`  ${svcIcon} ${svc.name || '?'} \u2014 ${svc.running ? 'running' : 'stopped'}`);
        }
      }
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Cross-Server Workflows
  // -------------------------------------------------------------------------

  private async workflowRun(input: Record<string, unknown>): Promise<ToolResult> {
    const steps = input.steps as Array<Record<string, unknown>>;
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return { success: false, output: '', error: 'Missing or empty required param: steps (array of workflow steps)' };
    }

    const variables = (input.variables as Record<string, unknown>) ?? {};

    // Try the dedicated cross-server executor module
    const executor = await loadCrossServerExecutor();
    if (executor) {
      this.log('Cross-server workflow', { stepCount: steps.length });
      try {
        const result = await executor.execute(steps, variables);
        return this.formatWorkflowResult(result);
      } catch (err: any) {
        this.error('CrossServerExecutor failed', { error: err.message });
        return { success: false, output: '', error: `Cross-server workflow failed: ${err.message}` };
      }
    }

    // Fallback: execute steps sequentially via the session manager
    this.log('Cross-server workflow (manual fallback)', { stepCount: steps.length });
    return await this.manualWorkflowRun(steps, variables);
  }

  /**
   * Fallback sequential workflow execution when the cross-server module
   * is not available. Supports basic step format:
   *   { serverId, command, name?, onError? }
   */
  private async manualWorkflowRun(
    steps: Array<Record<string, unknown>>,
    variables: Record<string, unknown>,
  ): Promise<ToolResult> {
    const results: Array<{ step: number; name: string; serverId: string; success: boolean; output: string }> = [];
    let overallSuccess = true;
    const vars = { ...variables } as Record<string, string>;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepName = (step.name as string) || `Step ${i + 1}`;
      const serverId = step.serverId as string;
      let command = step.command as string;
      const onError = (step.onError as string) || 'stop';

      if (!serverId || !command) {
        results.push({
          step: i + 1,
          name: stepName,
          serverId: serverId || '?',
          success: false,
          output: 'Missing serverId or command',
        });
        if (onError === 'stop') {
          overallSuccess = false;
          break;
        }
        continue;
      }

      // Simple variable substitution: {{varName}} -> value
      for (const [key, val] of Object.entries(vars)) {
        command = command.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
      }

      // Security: apply command-guard + sandbox checks to each workflow step
      const blocked = await this.guardSSHCommand(command);
      if (blocked) {
        results.push({
          step: i + 1,
          name: stepName,
          serverId,
          success: false,
          output: blocked.error ?? 'Command blocked by security guard',
        });
        if (onError === 'stop') {
          overallSuccess = false;
          break;
        }
        continue;
      }

      try {
        const execResult = await this.manager.exec(serverId, command);
        const success = execResult.code === 0;

        // Store stdout in vars for use by subsequent steps
        vars[`step_${i + 1}_stdout`] = execResult.stdout.trim();

        results.push({
          step: i + 1,
          name: stepName,
          serverId,
          success,
          output: execResult.stdout.trim() + (execResult.stderr.trim() ? `\nSTDERR: ${execResult.stderr.trim()}` : ''),
        });

        if (!success && onError === 'stop') {
          overallSuccess = false;
          break;
        }
        if (!success) overallSuccess = false;
      } catch (err: any) {
        results.push({
          step: i + 1,
          name: stepName,
          serverId,
          success: false,
          output: err.message,
        });
        if (onError === 'stop') {
          overallSuccess = false;
          break;
        }
        overallSuccess = false;
      }
    }

    // Format output
    const lines: string[] = [];
    lines.push(`\u{1F504} Cross-Server Workflow \u2014 ${steps.length} step(s)`);
    lines.push('='.repeat(60));

    for (const r of results) {
      const icon = r.success ? '\u2705' : '\u274C';
      lines.push(`${icon} [${r.step}] ${r.name} (${r.serverId})`);
      if (r.output) {
        // Indent output lines
        const indented = r.output.split('\n').map(l => `    ${l}`).join('\n');
        lines.push(indented);
      }
    }

    lines.push('');
    lines.push(`Result: ${overallSuccess ? 'SUCCESS' : 'FAILED'} (${results.filter(r => r.success).length}/${results.length} steps passed)`);

    return { success: overallSuccess, output: lines.join('\n') };
  }

  /**
   * Format a structured workflow result from the CrossServerExecutor module.
   */
  private formatWorkflowResult(result: Record<string, any>): ToolResult {
    const lines: string[] = [];
    const success = result.success ?? result.status === 'success';

    lines.push(`\u{1F504} Cross-Server Workflow`);
    lines.push('='.repeat(60));

    if (result.steps && Array.isArray(result.steps)) {
      for (const step of result.steps) {
        const icon = step.success ? '\u2705' : '\u274C';
        const label = step.name || step.serverId || '?';
        lines.push(`${icon} ${label}`);
        if (step.output) {
          const indented = String(step.output).split('\n').map((l: string) => `    ${l}`).join('\n');
          lines.push(indented);
        }
      }
    } else if (result.output) {
      lines.push(String(result.output));
    }

    if (result.summary) {
      lines.push('');
      lines.push(String(result.summary));
    }

    lines.push('');
    lines.push(`Result: ${success ? 'SUCCESS' : 'FAILED'}`);

    return { success, output: lines.join('\n') };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private formatExecResult(serverId: string, command: string, result: ExecResult): ToolResult {
    const server = this.manager.getServer(serverId);
    const label = server ? `${serverId} (${server.host})` : serverId;

    let output = `[${label}] $ ${command}\n`;
    if (result.stdout.trim()) {
      output += result.stdout.trim() + '\n';
    }
    if (result.stderr.trim()) {
      output += `STDERR: ${result.stderr.trim()}\n`;
    }
    output += `Exit code: ${result.code}`;

    return {
      success: result.code === 0,
      output,
      error: result.code !== 0 ? `Command exited with code ${result.code}` : undefined,
    };
  }
}

export { SSHTool };
