import logger from '../utils/logger.js';

/** Autonomy levels for agents */
type AutonomyLevel = 'full' | 'supervised' | 'approval_required' | 'disabled';

/** Risk categories */
type RiskCategory = 'safe' | 'change' | 'critical' | 'destructive';

/** Execution approval result */
interface ApprovalResult {
  approved: boolean;
  reason: string;
  riskCategory: RiskCategory;
  riskScore: number;
  budgetImpact: number;
  requiresHumanReview: boolean;
}

/** Agent governance config */
interface AgentGovernance {
  agentId: string;
  autonomyLevel: AutonomyLevel;
  maxCostPerExecution: number;   // USD
  maxExecutionsPerHour: number;
  allowedRiskCategories: RiskCategory[];
  executionCount: number;
  lastResetAt: number;
}

/** Risk budget tracking */
interface RiskBudget {
  dailyBudgetUsd: number;
  spentToday: number;
  maxCriticalOpsPerDay: number;
  criticalOpsToday: number;
  maxHighRiskPerHour: number;
  highRiskThisHour: number;
  hourResetAt: number;
  dayResetAt: number;
}

/** Dangerous command patterns */
const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs\./,
  /dd\s+if=.*of=\/dev/,
  /:(){ :|:& };:/,            // Fork bomb
  />\s*\/dev\/sd[a-z]/,
  /DROP\s+(DATABASE|TABLE)/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM\s+\w+\s*$/i, // DELETE without WHERE
  /shutdown\s+(-h|now)/,
  /reboot/,
  /init\s+0/,
  /systemctl\s+(stop|disable)\s+(sshd|networking|firewalld)/,
];

/** High-risk command patterns */
const HIGH_RISK_PATTERNS = [
  /chmod\s+777/,
  /chown\s+root/,
  /iptables\s+-F/,      // Flush firewall
  /ufw\s+disable/,
  /systemctl\s+restart/,
  /docker\s+rm\s+-f/,
  /kill\s+-9/,
  /npm\s+publish/,
  /git\s+push\s+--force/,
  /pip\s+install/,       // External package installation
];

/** Medium-risk patterns */
const CHANGE_PATTERNS = [
  /apt\s+(install|remove|purge)/,
  /yum\s+(install|remove)/,
  /docker\s+(run|build|pull)/,
  /git\s+(push|merge|rebase)/,
  /systemctl\s+(start|enable)/,
  /nano|vim|vi\s+\/etc/,
  /sed\s+-i/,
  /mv\s+.*\//,
  /cp\s+.*\//,
];

export class GovernanceEngine {
  private agentGov = new Map<string, AgentGovernance>();
  private riskBudget: RiskBudget;
  private auditLog: Array<{
    timestamp: number;
    agentId: string;
    action: string;
    approved: boolean;
    riskCategory: RiskCategory;
    reason: string;
  }> = [];

  constructor(opts?: { dailyBudgetUsd?: number; maxCriticalPerDay?: number; maxHighRiskPerHour?: number }) {
    const now = Date.now();
    this.riskBudget = {
      dailyBudgetUsd: opts?.dailyBudgetUsd ?? 10,
      spentToday: 0,
      maxCriticalOpsPerDay: opts?.maxCriticalPerDay ?? 5,
      criticalOpsToday: 0,
      maxHighRiskPerHour: opts?.maxHighRiskPerHour ?? 20,
      highRiskThisHour: 0,
      hourResetAt: now + 3600000,
      dayResetAt: now + 86400000,
    };
  }

  /** Set autonomy level for an agent */
  setAgentAutonomy(agentId: string, level: AutonomyLevel, opts?: {
    maxCostPerExecution?: number;
    maxExecutionsPerHour?: number;
    allowedRiskCategories?: RiskCategory[];
  }): void {
    this.agentGov.set(agentId, {
      agentId,
      autonomyLevel: level,
      maxCostPerExecution: opts?.maxCostPerExecution ?? 1.0,
      maxExecutionsPerHour: opts?.maxExecutionsPerHour ?? 50,
      allowedRiskCategories: opts?.allowedRiskCategories ?? ['safe', 'change'],
      executionCount: 0,
      lastResetAt: Date.now(),
    });
  }

  /** Request approval for an execution */
  requestApproval(agentId: string, action: string, estimatedCost: number): ApprovalResult {
    this.resetBudgetsIfNeeded();

    const riskCategory = this.classifyCommand(action);
    const riskScore = this.computeRiskScore(action, riskCategory);
    const gov = this.agentGov.get(agentId);

    // Default governance for unknown agents: supervised mode
    const autonomy = gov?.autonomyLevel ?? 'supervised';
    const maxCost = gov?.maxCostPerExecution ?? 1.0;
    const allowedRisks = gov?.allowedRiskCategories ?? ['safe', 'change'];
    const maxExec = gov?.maxExecutionsPerHour ?? 50;
    const execCount = gov?.executionCount ?? 0;

    let approved = true;
    let reason = 'Approved';
    let requiresHumanReview = false;

    // Check 1: Autonomy level
    if (autonomy === 'disabled') {
      approved = false;
      reason = 'Agent is disabled';
    }

    // Check 2: Risk category allowed
    if (approved && !allowedRisks.includes(riskCategory)) {
      if (riskCategory === 'destructive') {
        approved = false;
        reason = `Destructive operation blocked: ${riskCategory}`;
      } else {
        requiresHumanReview = true;
        reason = `Risk category ${riskCategory} requires human review`;
      }
    }

    // Check 3: Cost budget
    if (approved && estimatedCost > maxCost) {
      approved = false;
      reason = `Cost $${estimatedCost.toFixed(4)} exceeds agent limit $${maxCost.toFixed(2)}`;
    }

    // Check 4: Daily risk budget
    if (approved && this.riskBudget.spentToday + estimatedCost > this.riskBudget.dailyBudgetUsd) {
      approved = false;
      reason = `Daily budget exhausted: $${this.riskBudget.spentToday.toFixed(2)}/$${this.riskBudget.dailyBudgetUsd}`;
    }

    // Check 5: Critical ops limit
    if (approved && riskCategory === 'critical' && this.riskBudget.criticalOpsToday >= this.riskBudget.maxCriticalOpsPerDay) {
      approved = false;
      reason = `Critical ops limit reached: ${this.riskBudget.criticalOpsToday}/${this.riskBudget.maxCriticalOpsPerDay}`;
    }

    // Check 6: Hourly rate limit
    if (approved && execCount >= maxExec) {
      approved = false;
      reason = `Agent hourly execution limit reached: ${execCount}/${maxExec}`;
    }

    // Check 7: High-risk hourly limit
    if (approved && (riskCategory === 'critical' || riskCategory === 'destructive') &&
        this.riskBudget.highRiskThisHour >= this.riskBudget.maxHighRiskPerHour) {
      approved = false;
      reason = `High-risk hourly limit reached`;
    }

    // Check 8: Approval required mode
    if (approved && autonomy === 'approval_required') {
      requiresHumanReview = true;
      reason = 'Agent requires human approval';
    }

    // Update counters
    if (approved && !requiresHumanReview) {
      this.riskBudget.spentToday += estimatedCost;
      if (riskCategory === 'critical') this.riskBudget.criticalOpsToday++;
      if (riskCategory === 'critical' || riskCategory === 'destructive') this.riskBudget.highRiskThisHour++;
      if (gov) gov.executionCount++;
    }

    // Audit log
    this.auditLog.push({
      timestamp: Date.now(),
      agentId, action: action.slice(0, 200),
      approved: approved && !requiresHumanReview,
      riskCategory, reason,
    });
    if (this.auditLog.length > 1000) this.auditLog.shift();

    if (!approved || requiresHumanReview) {
      logger.warn('Governance check', { agentId, riskCategory, riskScore, approved, requiresHumanReview, reason });
    }

    return { approved: approved && !requiresHumanReview, reason, riskCategory, riskScore, budgetImpact: estimatedCost, requiresHumanReview };
  }

  /** Classify a command into risk category */
  classifyCommand(command: string): RiskCategory {
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command)) return 'destructive';
    }
    for (const pattern of HIGH_RISK_PATTERNS) {
      if (pattern.test(command)) return 'critical';
    }
    for (const pattern of CHANGE_PATTERNS) {
      if (pattern.test(command)) return 'change';
    }
    return 'safe';
  }

  /** Get current risk budget status */
  getRiskBudgetStatus(): {
    dailyBudgetUsd: number;
    spentToday: number;
    remainingToday: number;
    criticalOps: string;
    highRiskHourly: string;
  } {
    this.resetBudgetsIfNeeded();
    return {
      dailyBudgetUsd: this.riskBudget.dailyBudgetUsd,
      spentToday: this.riskBudget.spentToday,
      remainingToday: this.riskBudget.dailyBudgetUsd - this.riskBudget.spentToday,
      criticalOps: `${this.riskBudget.criticalOpsToday}/${this.riskBudget.maxCriticalOpsPerDay}`,
      highRiskHourly: `${this.riskBudget.highRiskThisHour}/${this.riskBudget.maxHighRiskPerHour}`,
    };
  }

  /** Get agent governance configs */
  getAgentGovernance(): Array<{ agentId: string; autonomy: AutonomyLevel; execCount: number }> {
    return Array.from(this.agentGov.values()).map(g => ({
      agentId: g.agentId, autonomy: g.autonomyLevel, execCount: g.executionCount,
    }));
  }

  /** Get recent audit log */
  getAuditLog(limit = 50): typeof this.auditLog {
    return this.auditLog.slice(-limit);
  }

  /** Set daily budget */
  setDailyBudget(usd: number): void {
    this.riskBudget.dailyBudgetUsd = usd;
  }

  private computeRiskScore(command: string, category: RiskCategory): number {
    const baseScores: Record<RiskCategory, number> = { safe: 0.1, change: 0.4, critical: 0.7, destructive: 1.0 };
    let score = baseScores[category];

    // Bonus risk for root/sudo
    if (/sudo|as\s+root/.test(command)) score = Math.min(1, score + 0.2);
    // Bonus risk for production paths
    if (/\/var\/www|\/opt\/|\/etc\//.test(command)) score = Math.min(1, score + 0.1);

    return score;
  }

  private resetBudgetsIfNeeded(): void {
    const now = Date.now();
    if (now >= this.riskBudget.hourResetAt) {
      this.riskBudget.highRiskThisHour = 0;
      this.riskBudget.hourResetAt = now + 3600000;
      // Reset per-agent hourly counts
      for (const gov of this.agentGov.values()) {
        gov.executionCount = 0;
        gov.lastResetAt = now;
      }
    }
    if (now >= this.riskBudget.dayResetAt) {
      this.riskBudget.spentToday = 0;
      this.riskBudget.criticalOpsToday = 0;
      this.riskBudget.dayResetAt = now + 86400000;
    }
  }
}
