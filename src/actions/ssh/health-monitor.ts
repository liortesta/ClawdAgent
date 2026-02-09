import { SSHSessionManager, getSSHManager } from './session-manager.js';
import logger from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HealthAlert {
  type: 'disk_full' | 'high_cpu' | 'high_ram' | 'service_down' | 'unreachable';
  message: string;
  severity: 'warning' | 'critical';
  serverId: string;
}

export interface ServerHealth {
  serverId: string;
  serverName: string;
  host: string;
  timestamp: string;
  status: 'healthy' | 'warning' | 'critical' | 'unreachable';
  metrics: {
    cpuPercent: number;
    ramPercent: number;
    diskPercent: number;
    loadAverage: number[];
    uptime: string;
  };
  alerts: HealthAlert[];
}

export interface HealthThresholds {
  diskWarning: number;
  diskCritical: number;
  ramWarning: number;
  ramCritical: number;
  cpuWarning: number;
  cpuCritical: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: HealthThresholds = {
  diskWarning: 80,
  diskCritical: 95,
  ramWarning: 85,
  ramCritical: 95,
  cpuWarning: 90,
  cpuCritical: 98,
};

// ---------------------------------------------------------------------------
// Health check SSH command
// Portable across most Linux distributions.
// ---------------------------------------------------------------------------

const HEALTH_CHECK_CMD = [
  'echo "CPU:$(top -bn1 | grep \'Cpu(s)\' | awk \'{print $2}\' 2>/dev/null || echo 0)"',
  'echo "RAM:$(free | grep Mem | awk \'{printf "%.0f", $3/$2 * 100}\')"',
  'echo "DISK:$(df / | tail -1 | awk \'{print $5}\' | tr -d \'%\')"',
  'echo "LOAD:$(cat /proc/loadavg | awk \'{print $1,$2,$3}\')"',
  'echo "UP:$(uptime -p 2>/dev/null || uptime)"',
].join(' && ');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a numeric value from raw output, returning 0 when the value is not a number. */
function safeParseFloat(raw: string): number {
  const n = parseFloat(raw.trim());
  return Number.isFinite(n) ? n : 0;
}

/** Build a simple percentage bar, e.g. `[████████░░] 80%` */
function percentBar(value: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${clamped.toFixed(0)}%`;
}

/** Return an emoji indicator for a given status. */
function statusIcon(status: ServerHealth['status']): string {
  switch (status) {
    case 'healthy':
      return '\u{1F7E2}'; // green circle
    case 'warning':
      return '\u{1F7E1}'; // yellow circle
    case 'critical':
      return '\u{1F534}'; // red circle
    case 'unreachable':
      return '\u26AB';     // black circle
  }
}

/** Severity sort weight – lower = more severe. */
function statusWeight(status: ServerHealth['status']): number {
  switch (status) {
    case 'critical':
      return 0;
    case 'unreachable':
      return 1;
    case 'warning':
      return 2;
    case 'healthy':
      return 3;
  }
}

// ---------------------------------------------------------------------------
// HealthMonitor
// ---------------------------------------------------------------------------

export class HealthMonitor {
  private manager: SSHSessionManager;
  private thresholds: HealthThresholds;

  constructor(manager: SSHSessionManager, thresholds?: Partial<HealthThresholds>) {
    this.manager = manager;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // -----------------------------------------------------------------------
  // Check a single server
  // -----------------------------------------------------------------------

  async checkServer(serverId: string): Promise<ServerHealth> {
    const server = this.manager.getServer(serverId);
    const serverName = server?.name ?? serverId;
    const host = server?.host ?? 'unknown';

    const baseHealth: ServerHealth = {
      serverId,
      serverName,
      host,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      metrics: {
        cpuPercent: 0,
        ramPercent: 0,
        diskPercent: 0,
        loadAverage: [0, 0, 0],
        uptime: 'unknown',
      },
      alerts: [],
    };

    // Attempt SSH health check
    let stdout: string;
    try {
      const result = await this.manager.exec(serverId, HEALTH_CHECK_CMD);
      stdout = result.stdout;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Health check failed – server unreachable', { serverId, error: message });

      baseHealth.status = 'unreachable';
      baseHealth.alerts.push({
        type: 'unreachable',
        message: `Server unreachable: ${message}`,
        severity: 'critical',
        serverId,
      });

      return baseHealth;
    }

    // Parse metrics from command output
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('CPU:')) {
        baseHealth.metrics.cpuPercent = safeParseFloat(trimmed.slice(4));
      } else if (trimmed.startsWith('RAM:')) {
        baseHealth.metrics.ramPercent = safeParseFloat(trimmed.slice(4));
      } else if (trimmed.startsWith('DISK:')) {
        baseHealth.metrics.diskPercent = safeParseFloat(trimmed.slice(5));
      } else if (trimmed.startsWith('LOAD:')) {
        const parts = trimmed.slice(5).trim().split(/\s+/);
        baseHealth.metrics.loadAverage = parts.map(safeParseFloat).slice(0, 3);
        // Pad to length 3 if the output was partial
        while (baseHealth.metrics.loadAverage.length < 3) {
          baseHealth.metrics.loadAverage.push(0);
        }
      } else if (trimmed.startsWith('UP:')) {
        baseHealth.metrics.uptime = trimmed.slice(3).trim() || 'unknown';
      }
    }

    // Generate alerts based on thresholds
    this.evaluateThresholds(baseHealth);

    // Determine overall status
    const hasCritical = baseHealth.alerts.some((a) => a.severity === 'critical');
    const hasWarning = baseHealth.alerts.some((a) => a.severity === 'warning');

    if (hasCritical) {
      baseHealth.status = 'critical';
    } else if (hasWarning) {
      baseHealth.status = 'warning';
    } else {
      baseHealth.status = 'healthy';
    }

    logger.info('Health check completed', {
      serverId,
      status: baseHealth.status,
      cpu: baseHealth.metrics.cpuPercent,
      ram: baseHealth.metrics.ramPercent,
      disk: baseHealth.metrics.diskPercent,
    });

    return baseHealth;
  }

  // -----------------------------------------------------------------------
  // Check all configured servers
  // -----------------------------------------------------------------------

  async checkAll(): Promise<ServerHealth[]> {
    const serverIds = this.manager.listServers().map(s => s.id);

    const results = await Promise.allSettled(
      serverIds.map((id) => this.checkServer(id)),
    );

    const healthList: ServerHealth[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        healthList.push(result.value);
      } else {
        // If the promise itself rejected unexpectedly, produce an unreachable entry
        const serverId = serverIds[i];
        const server = this.manager.getServer(serverId);
        healthList.push({
          serverId,
          serverName: server?.name ?? serverId,
          host: server?.host ?? 'unknown',
          timestamp: new Date().toISOString(),
          status: 'unreachable',
          metrics: {
            cpuPercent: 0,
            ramPercent: 0,
            diskPercent: 0,
            loadAverage: [0, 0, 0],
            uptime: 'unknown',
          },
          alerts: [
            {
              type: 'unreachable',
              message: `Server unreachable: ${result.reason}`,
              severity: 'critical',
              serverId,
            },
          ],
        });
      }
    }

    // Sort by severity – critical first, healthy last
    healthList.sort((a, b) => statusWeight(a.status) - statusWeight(b.status));

    return healthList;
  }

  // -----------------------------------------------------------------------
  // Formatting
  // -----------------------------------------------------------------------

  formatReport(health: ServerHealth): string {
    const icon = statusIcon(health.status);
    const header = `${icon} ${health.serverName} (${health.host}) — ${health.status.toUpperCase()}`;

    if (health.status === 'unreachable') {
      const alertLines = health.alerts.map((a) => `  \u26A0 ${a.message}`).join('\n');
      return [header, alertLines, `  Checked at ${health.timestamp}`].join('\n');
    }

    const { cpuPercent, ramPercent, diskPercent, loadAverage, uptime } = health.metrics;

    const metricsBlock = [
      `  CPU:  ${percentBar(cpuPercent)}`,
      `  RAM:  ${percentBar(ramPercent)}`,
      `  Disk: ${percentBar(diskPercent)}`,
      `  Load: ${loadAverage.map((l) => l.toFixed(2)).join(', ')}`,
      `  Up:   ${uptime}`,
    ].join('\n');

    const parts = [header, metricsBlock];

    if (health.alerts.length > 0) {
      const alertLines = health.alerts
        .map((a) => `  ${a.severity === 'critical' ? '\u{1F534}' : '\u{1F7E1}'} [${a.severity.toUpperCase()}] ${a.message}`)
        .join('\n');
      parts.push(alertLines);
    }

    parts.push(`  Checked at ${health.timestamp}`);

    return parts.join('\n');
  }

  formatAllReport(healthList: ServerHealth[]): string {
    const divider = '\u2500'.repeat(50);

    // Header
    const header = `\u{1F5A5}\uFE0F  Server Health Dashboard`;
    const summary = `${healthList.length} server(s) checked at ${new Date().toISOString()}`;

    // Status counts
    const counts: Record<ServerHealth['status'], number> = {
      healthy: 0,
      warning: 0,
      critical: 0,
      unreachable: 0,
    };
    for (const h of healthList) {
      counts[h.status]++;
    }

    const statusSummary = [
      `\u{1F7E2} ${counts.healthy} healthy`,
      `\u{1F7E1} ${counts.warning} warning`,
      `\u{1F534} ${counts.critical} critical`,
      `\u26AB ${counts.unreachable} unreachable`,
    ].join('  |  ');

    // Individual reports
    const serverBlocks = healthList.map((h) => this.formatReport(h)).join(`\n${divider}\n`);

    // Collect all alerts
    const allAlerts = healthList.flatMap((h) => h.alerts);

    const parts = [header, summary, statusSummary, divider, serverBlocks];

    if (allAlerts.length > 0) {
      parts.push(divider);
      parts.push(`\u26A0  Alert Summary (${allAlerts.length})`);
      for (const alert of allAlerts) {
        const icon = alert.severity === 'critical' ? '\u{1F534}' : '\u{1F7E1}';
        parts.push(`  ${icon} [${alert.serverId}] ${alert.message}`);
      }
    }

    return parts.join('\n');
  }

  // -----------------------------------------------------------------------
  // Internal: threshold evaluation
  // -----------------------------------------------------------------------

  private evaluateThresholds(health: ServerHealth): void {
    const { cpuPercent, ramPercent, diskPercent } = health.metrics;
    const t = this.thresholds;

    // CPU
    if (cpuPercent >= t.cpuCritical) {
      health.alerts.push({
        type: 'high_cpu',
        message: `CPU usage critically high at ${cpuPercent.toFixed(1)}%`,
        severity: 'critical',
        serverId: health.serverId,
      });
    } else if (cpuPercent >= t.cpuWarning) {
      health.alerts.push({
        type: 'high_cpu',
        message: `CPU usage elevated at ${cpuPercent.toFixed(1)}%`,
        severity: 'warning',
        serverId: health.serverId,
      });
    }

    // RAM
    if (ramPercent >= t.ramCritical) {
      health.alerts.push({
        type: 'high_ram',
        message: `RAM usage critically high at ${ramPercent.toFixed(1)}%`,
        severity: 'critical',
        serverId: health.serverId,
      });
    } else if (ramPercent >= t.ramWarning) {
      health.alerts.push({
        type: 'high_ram',
        message: `RAM usage elevated at ${ramPercent.toFixed(1)}%`,
        severity: 'warning',
        serverId: health.serverId,
      });
    }

    // Disk
    if (diskPercent >= t.diskCritical) {
      health.alerts.push({
        type: 'disk_full',
        message: `Disk usage critically high at ${diskPercent.toFixed(1)}%`,
        severity: 'critical',
        serverId: health.serverId,
      });
    } else if (diskPercent >= t.diskWarning) {
      health.alerts.push({
        type: 'disk_full',
        message: `Disk usage elevated at ${diskPercent.toFixed(1)}%`,
        severity: 'warning',
        serverId: health.serverId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getHealthMonitor(): HealthMonitor {
  return new HealthMonitor(getSSHManager());
}
