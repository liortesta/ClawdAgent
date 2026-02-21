import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';

/**
 * Human-in-the-loop Approval Gate.
 * High-risk actions are queued here, awaiting human approval via
 * the web dashboard or Telegram before execution proceeds.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface PendingApproval {
  id: string;
  agentId: string;
  action: string;
  description: string;
  riskCategory: string;
  riskScore: number;
  estimatedCost: number;
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
  resolvedBy?: string;
  resolvedAt?: number;
}

type ApprovalCallback = (approved: boolean) => void;

export class ApprovalGate {
  private pending = new Map<string, PendingApproval>();
  private callbacks = new Map<string, ApprovalCallback>();
  private history: PendingApproval[] = [];
  private notifyFn?: (approval: PendingApproval) => void;

  /** Register a notification callback (e.g., send Telegram alert) */
  onApprovalNeeded(fn: (approval: PendingApproval) => void): void {
    this.notifyFn = fn;
  }

  /**
   * Request human approval for a high-risk action.
   * Returns a promise that resolves with true (approved) or false (denied/expired).
   * Timeout: 5 minutes by default.
   */
  async requestApproval(opts: {
    agentId: string;
    action: string;
    description: string;
    riskCategory: string;
    riskScore: number;
    estimatedCost?: number;
    timeoutMs?: number;
  }): Promise<boolean> {
    const timeoutMs = opts.timeoutMs ?? 300_000; // 5 minutes
    const approval: PendingApproval = {
      id: randomUUID(),
      agentId: opts.agentId,
      action: opts.action,
      description: opts.description,
      riskCategory: opts.riskCategory,
      riskScore: opts.riskScore,
      estimatedCost: opts.estimatedCost ?? 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + timeoutMs,
      status: 'pending',
    };

    this.pending.set(approval.id, approval);
    logger.info('Approval requested', { id: approval.id, agent: opts.agentId, action: opts.action.slice(0, 100) });

    // Notify (e.g., Telegram admin)
    this.notifyFn?.(approval);

    return new Promise<boolean>((resolve) => {
      this.callbacks.set(approval.id, resolve);

      // Auto-expire after timeout.
      // Default: deny on timeout (safe). Set APPROVAL_AUTO_APPROVE_ON_TIMEOUT=true to auto-approve low-risk.
      setTimeout(() => {
        if (approval.status === 'pending') {
          const allowAutoApprove = process.env.APPROVAL_AUTO_APPROVE_ON_TIMEOUT === 'true';
          const autoApprove = allowAutoApprove && approval.riskScore < 0.5;
          approval.status = autoApprove ? 'approved' : 'expired';
          this.finalize(approval.id, autoApprove, autoApprove ? 'system:auto_approve_timeout' : 'system:timeout');
          logger.info('Approval timeout', { id: approval.id, autoApproved: autoApprove, risk: approval.riskScore });
        }
      }, timeoutMs);
    });
  }

  /** Approve a pending request */
  approve(id: string, resolvedBy = 'admin'): boolean {
    const approval = this.pending.get(id);
    if (!approval || approval.status !== 'pending') return false;
    approval.status = 'approved';
    this.finalize(id, true, resolvedBy);
    logger.info('Approval granted', { id, by: resolvedBy });
    return true;
  }

  /** Deny a pending request */
  deny(id: string, resolvedBy = 'admin'): boolean {
    const approval = this.pending.get(id);
    if (!approval || approval.status !== 'pending') return false;
    approval.status = 'denied';
    this.finalize(id, false, resolvedBy);
    logger.info('Approval denied', { id, by: resolvedBy });
    return true;
  }

  /** Get all pending approvals */
  getPending(): PendingApproval[] {
    this.expireStale();
    return Array.from(this.pending.values()).filter(a => a.status === 'pending');
  }

  /** Get approval history (last 100) */
  getHistory(): PendingApproval[] {
    return this.history.slice(-100);
  }

  /** Get counts for dashboard */
  getStats(): { pending: number; approvedToday: number; deniedToday: number } {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ts = todayStart.getTime();

    return {
      pending: this.getPending().length,
      approvedToday: this.history.filter(a => a.status === 'approved' && (a.resolvedAt ?? 0) >= ts).length,
      deniedToday: this.history.filter(a => a.status === 'denied' && (a.resolvedAt ?? 0) >= ts).length,
    };
  }

  private finalize(id: string, approved: boolean, resolvedBy: string): void {
    const approval = this.pending.get(id);
    if (approval) {
      approval.resolvedBy = resolvedBy;
      approval.resolvedAt = Date.now();
      this.history.push(approval);
      if (this.history.length > 200) this.history.shift();
    }
    this.pending.delete(id);
    const cb = this.callbacks.get(id);
    if (cb) {
      cb(approved);
      this.callbacks.delete(id);
    }
  }

  private expireStale(): void {
    const now = Date.now();
    for (const [id, a] of this.pending) {
      if (a.status === 'pending' && now > a.expiresAt) {
        a.status = 'expired';
        this.finalize(id, false, 'system:timeout');
      }
    }
  }
}

/** Singleton instance */
let gate: ApprovalGate | null = null;

export function getApprovalGate(): ApprovalGate {
  if (!gate) gate = new ApprovalGate();
  return gate;
}
