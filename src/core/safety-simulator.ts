import logger from '../utils/logger.js';
import { GovernanceEngine } from './governance-engine.js';

/** Simulation result */
interface SimulationResult {
  id: string;
  command: string;
  riskCategory: 'safe' | 'change' | 'critical' | 'destructive';
  riskScore: number;
  impactAssessment: ImpactAssessment;
  dryRunResult?: DryRunResult;
  rollbackPlan?: RollbackPlan;
  approved: boolean;
  reason: string;
  simulatedAt: number;
}

/** Impact assessment */
interface ImpactAssessment {
  affectedServices: string[];
  affectedFiles: string[];
  estimatedDowntime: string;       // e.g. "0s", "~30s", "~5m"
  reversibility: 'easy' | 'possible' | 'difficult' | 'irreversible';
  dataLossRisk: 'none' | 'low' | 'medium' | 'high';
  networkImpact: 'none' | 'brief_disruption' | 'outage';
}

/** Dry-run result */
interface DryRunResult {
  wouldExecute: string[];
  wouldModify: string[];
  wouldDelete: string[];
  wouldCreate: string[];
  estimatedDuration: string;
  resourcesNeeded: string[];
}

/** Rollback plan */
interface RollbackPlan {
  steps: string[];
  estimatedTime: string;
  requiresSnapshot: boolean;
  snapshotType?: 'filesystem' | 'database' | 'container' | 'full';
  automatable: boolean;
}

/** Pre-execution checklist item */
interface ChecklistItem {
  check: string;
  status: 'pass' | 'fail' | 'warning' | 'skipped';
  details?: string;
}

const MAX_SIMULATIONS = 200;

/** Known command patterns and their impacts */
const IMPACT_PATTERNS: Array<{
  pattern: RegExp;
  services: string[];
  reversibility: ImpactAssessment['reversibility'];
  dataLoss: ImpactAssessment['dataLossRisk'];
  downtime: string;
}> = [
  { pattern: /docker\s+restart/, services: ['docker'], reversibility: 'easy', dataLoss: 'none', downtime: '~30s' },
  { pattern: /docker\s+stop/, services: ['docker'], reversibility: 'easy', dataLoss: 'none', downtime: 'until restart' },
  { pattern: /docker\s+rm\s+-f/, services: ['docker'], reversibility: 'difficult', dataLoss: 'medium', downtime: 'until recreate' },
  { pattern: /systemctl\s+restart\s+(\w+)/, services: ['systemd'], reversibility: 'easy', dataLoss: 'none', downtime: '~10s' },
  { pattern: /systemctl\s+stop\s+(\w+)/, services: ['systemd'], reversibility: 'easy', dataLoss: 'none', downtime: 'until restart' },
  { pattern: /nginx\s+-s\s+reload/, services: ['nginx'], reversibility: 'easy', dataLoss: 'none', downtime: '0s' },
  { pattern: /apt\s+(install|remove)/, services: ['apt'], reversibility: 'possible', dataLoss: 'low', downtime: '0s' },
  { pattern: /rm\s+-rf/, services: ['filesystem'], reversibility: 'irreversible', dataLoss: 'high', downtime: '0s' },
  { pattern: /DROP\s+(TABLE|DATABASE)/i, services: ['database'], reversibility: 'irreversible', dataLoss: 'high', downtime: '0s' },
  { pattern: /pg_dump|mysqldump/, services: ['database'], reversibility: 'easy', dataLoss: 'none', downtime: '0s' },
  { pattern: /git\s+push\s+--force/, services: ['git'], reversibility: 'difficult', dataLoss: 'medium', downtime: '0s' },
  { pattern: /iptables\s+-F/, services: ['firewall'], reversibility: 'possible', dataLoss: 'none', downtime: '~5s' },
  { pattern: /ufw\s+disable/, services: ['firewall'], reversibility: 'easy', dataLoss: 'none', downtime: '0s' },
  { pattern: /reboot/, services: ['system'], reversibility: 'easy', dataLoss: 'low', downtime: '~2m' },
  { pattern: /npm\s+publish/, services: ['npm'], reversibility: 'difficult', dataLoss: 'none', downtime: '0s' },
];

export class SafetySimulator {
  private simulations: SimulationResult[] = [];
  private governance: GovernanceEngine;
  private idCounter = 0;

  constructor(governance: GovernanceEngine) {
    this.governance = governance;
  }

  /** Simulate a command before execution */
  simulate(command: string, context?: {
    serverId?: string;
    osType?: string;
    runningServices?: string[];
    agentId?: string;
  }): SimulationResult {
    const id = `sim_${++this.idCounter}`;
    const riskCategory = this.governance.classifyCommand(command);
    const riskScore = this.computeDetailedRisk(command, riskCategory);
    const impactAssessment = this.assessImpact(command, context);
    const dryRunResult = this.dryRun(command);
    const rollbackPlan = this.generateRollback(command, impactAssessment);

    // Run pre-execution checklist
    const checklist = this.preExecutionChecklist(command, context);
    const hasFailures = checklist.some(c => c.status === 'fail');

    const approved = !hasFailures && riskScore < 0.9;
    const reason = hasFailures
      ? `Pre-execution check failed: ${checklist.filter(c => c.status === 'fail').map(c => c.check).join(', ')}`
      : riskScore >= 0.9
        ? `Risk score too high: ${riskScore.toFixed(2)}`
        : 'Simulation passed';

    const result: SimulationResult = {
      id, command, riskCategory, riskScore,
      impactAssessment, dryRunResult, rollbackPlan,
      approved, reason, simulatedAt: Date.now(),
    };

    this.simulations.push(result);
    if (this.simulations.length > MAX_SIMULATIONS) this.simulations.shift();

    logger.info('Safety simulation', {
      id, riskCategory, riskScore: riskScore.toFixed(2),
      approved, reversibility: impactAssessment.reversibility,
    });

    return result;
  }

  /** Run pre-execution checklist */
  preExecutionChecklist(command: string, context?: {
    serverId?: string;
    osType?: string;
    runningServices?: string[];
  }): ChecklistItem[] {
    const items: ChecklistItem[] = [];

    // 1. OS detection
    items.push({
      check: 'OS detection',
      status: context?.osType ? 'pass' : 'warning',
      details: context?.osType ?? 'OS not detected — proceed with caution',
    });

    // 2. Service map
    items.push({
      check: 'Service map',
      status: context?.runningServices ? 'pass' : 'warning',
      details: context?.runningServices
        ? `${context.runningServices.length} services running`
        : 'Service map unavailable',
    });

    // 3. Resource check (basic pattern analysis)
    const resourceHeavy = /apt\s+install|docker\s+build|npm\s+install|pip\s+install/.test(command);
    items.push({
      check: 'Resource check',
      status: resourceHeavy ? 'warning' : 'pass',
      details: resourceHeavy ? 'Command may consume significant resources' : 'Normal resource usage expected',
    });

    // 4. Risk level classification
    const riskCategory = this.governance.classifyCommand(command);
    items.push({
      check: 'Risk classification',
      status: riskCategory === 'destructive' ? 'fail' :
              riskCategory === 'critical' ? 'warning' : 'pass',
      details: `Risk category: ${riskCategory}`,
    });

    // 5. Dry run check for destructive commands
    if (riskCategory === 'destructive' || riskCategory === 'critical') {
      items.push({
        check: 'Dry run required',
        status: 'warning',
        details: 'High-risk command — snapshot recommended before execution',
      });
    }

    // 6. Check for dangerous flag combinations
    const hasDangerousFlags = /--force|--no-preserve-root|-rf\s+\/|--hard/.test(command);
    items.push({
      check: 'Flag safety check',
      status: hasDangerousFlags ? 'fail' : 'pass',
      details: hasDangerousFlags ? 'Dangerous flags detected' : 'Flags are safe',
    });

    return items;
  }

  /** Get recent simulations */
  getSimulations(limit = 20): SimulationResult[] {
    return this.simulations.slice(-limit);
  }

  /** Get simulation stats */
  getStats(): {
    total: number;
    approved: number;
    blocked: number;
    byRiskCategory: Record<string, number>;
  } {
    const byRiskCategory: Record<string, number> = {};
    for (const s of this.simulations) {
      byRiskCategory[s.riskCategory] = (byRiskCategory[s.riskCategory] ?? 0) + 1;
    }

    return {
      total: this.simulations.length,
      approved: this.simulations.filter(s => s.approved).length,
      blocked: this.simulations.filter(s => !s.approved).length,
      byRiskCategory,
    };
  }

  private assessImpact(command: string, _context?: {
    runningServices?: string[];
  }): ImpactAssessment {
    const affectedServices: string[] = [];
    let reversibility: ImpactAssessment['reversibility'] = 'easy';
    let dataLossRisk: ImpactAssessment['dataLossRisk'] = 'none';
    let downtime = '0s';
    const affectedFiles: string[] = [];

    for (const pattern of IMPACT_PATTERNS) {
      if (pattern.pattern.test(command)) {
        affectedServices.push(...pattern.services);
        if (this.reversibilityRank(pattern.reversibility) > this.reversibilityRank(reversibility)) {
          reversibility = pattern.reversibility;
        }
        if (this.dataLossRank(pattern.dataLoss) > this.dataLossRank(dataLossRisk)) {
          dataLossRisk = pattern.dataLoss;
        }
        downtime = pattern.downtime;
      }
    }

    // Extract file paths from command
    const pathMatches = command.match(/\/[\w/.-]+/g);
    if (pathMatches) affectedFiles.push(...pathMatches);

    // Check if running services are affected
    const networkImpact: ImpactAssessment['networkImpact'] =
      affectedServices.some(s => ['nginx', 'firewall', 'system'].includes(s))
        ? 'brief_disruption' : 'none';

    return { affectedServices, affectedFiles, estimatedDowntime: downtime, reversibility, dataLossRisk, networkImpact };
  }

  private dryRun(command: string): DryRunResult {
    const wouldExecute: string[] = [command];
    const wouldModify: string[] = [];
    const wouldDelete: string[] = [];
    const wouldCreate: string[] = [];
    const resourcesNeeded: string[] = [];

    // Parse what the command would do
    if (/rm\s/.test(command)) {
      const paths = command.match(/\/[\w/.-]+/g) ?? [];
      wouldDelete.push(...paths);
    }
    if (/mkdir/.test(command)) {
      const paths = command.match(/\/[\w/.-]+/g) ?? [];
      wouldCreate.push(...paths);
    }
    if (/sed\s+-i|tee\s/.test(command)) {
      const paths = command.match(/\/[\w/.-]+/g) ?? [];
      wouldModify.push(...paths);
    }
    if (/docker\s+build/.test(command)) resourcesNeeded.push('CPU', 'disk space', 'network');
    if (/apt\s+install/.test(command)) resourcesNeeded.push('disk space', 'network');

    return {
      wouldExecute, wouldModify, wouldDelete, wouldCreate,
      estimatedDuration: this.estimateDuration(command),
      resourcesNeeded,
    };
  }

  private generateRollback(command: string, impact: ImpactAssessment): RollbackPlan {
    const steps: string[] = [];
    let requiresSnapshot = false;
    let snapshotType: RollbackPlan['snapshotType'];
    let automatable = true;

    if (impact.reversibility === 'irreversible') {
      steps.push('WARNING: This operation cannot be automatically rolled back');
      steps.push('Ensure a backup exists before proceeding');
      requiresSnapshot = true;
      snapshotType = 'full';
      automatable = false;
    } else if (impact.reversibility === 'difficult') {
      requiresSnapshot = true;
      snapshotType = impact.affectedServices.includes('database') ? 'database' :
                     impact.affectedServices.includes('docker') ? 'container' : 'filesystem';
      steps.push(`Create ${snapshotType} snapshot before execution`);
      steps.push('If failed: restore from snapshot');
      automatable = true;
    } else if (impact.reversibility === 'possible') {
      steps.push('If failed: reverse the operation manually');
      if (/apt\s+install/.test(command)) steps.push('Run: apt remove <package>');
      if (/docker\s+run/.test(command)) steps.push('Run: docker stop && docker rm <container>');
    } else {
      steps.push('No special rollback needed — operation is easily reversible');
      if (/systemctl\s+restart/.test(command)) steps.push('Service will auto-recover');
    }

    return {
      steps, requiresSnapshot, snapshotType, automatable,
      estimatedTime: requiresSnapshot ? '~2m' : '~10s',
    };
  }

  private computeDetailedRisk(command: string, category: string): number {
    const baseScores: Record<string, number> = { safe: 0.1, change: 0.4, critical: 0.7, destructive: 0.95 };
    let score = baseScores[category] ?? 0.5;

    if (/sudo|as\s+root/.test(command)) score = Math.min(1, score + 0.15);
    if (/\/etc\/|\/var\/|\/opt\//.test(command)) score = Math.min(1, score + 0.1);
    if (/--force|--hard|--no-preserve/.test(command)) score = Math.min(1, score + 0.15);
    if (/\|/.test(command)) score = Math.min(1, score + 0.05); // Pipes add complexity
    if (/&&/.test(command)) score = Math.min(1, score + 0.05); // Chained commands

    return score;
  }

  private estimateDuration(command: string): string {
    if (/docker\s+build/.test(command)) return '~2-10m';
    if (/apt\s+(install|upgrade)/.test(command)) return '~1-5m';
    if (/npm\s+install/.test(command)) return '~30s-3m';
    if (/git\s+clone/.test(command)) return '~10s-2m';
    if (/reboot/.test(command)) return '~1-3m';
    return '< 5s';
  }

  private reversibilityRank(r: ImpactAssessment['reversibility']): number {
    return { easy: 0, possible: 1, difficult: 2, irreversible: 3 }[r];
  }

  private dataLossRank(d: ImpactAssessment['dataLossRisk']): number {
    return { none: 0, low: 1, medium: 2, high: 3 }[d];
  }
}
