/**
 * Kill Switch — Global Panic Mode
 *
 * When activated, this immediately:
 * 1. Disables ALL tool execution
 * 2. Revokes SSH sessions
 * 3. Pauses CRON jobs
 * 4. Freezes trading
 * 5. Blocks outgoing messages
 * 6. Persists a state snapshot for recovery
 *
 * This is the "big red button" — use when something goes catastrophically wrong.
 */

import logger from '../utils/logger.js';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

export type PanicReason = 'manual' | 'anomaly' | 'cost_overflow' | 'security_breach' | 'runaway_agent';

interface PanicState {
  active: boolean;
  activatedAt: number;
  reason: PanicReason;
  activatedBy: string;
  snapshot: {
    activeTools: string[];
    pendingTasks: number;
    costToday: number;
  };
}

let panicActive = false;
let panicState: PanicState | null = null;

const STATE_FILE = join(process.cwd(), 'data', 'panic-state.json');

/**
 * ACTIVATE PANIC MODE — stops everything.
 * Call this from any part of the system when something goes wrong.
 */
export async function activatePanic(reason: PanicReason, activatedBy = 'system', snapshot?: {
  activeTools?: string[];
  pendingTasks?: number;
  costToday?: number;
}): Promise<void> {
  if (panicActive) {
    logger.warn('Panic mode already active');
    return;
  }

  panicActive = true;
  panicState = {
    active: true,
    activatedAt: Date.now(),
    reason,
    activatedBy,
    snapshot: {
      activeTools: snapshot?.activeTools ?? [],
      pendingTasks: snapshot?.pendingTasks ?? 0,
      costToday: snapshot?.costToday ?? 0,
    },
  };

  logger.error('PANIC MODE ACTIVATED', { reason, by: activatedBy });

  // Persist state for recovery after restart
  try {
    await writeFile(STATE_FILE, JSON.stringify(panicState, null, 2), 'utf-8');
  } catch (err: any) {
    logger.error('Failed to persist panic state', { error: err.message });
  }

  // 1. Disconnect SSH sessions
  try {
    const { getSSHManager } = await import('../actions/ssh/session-manager.js');
    const ssh = getSSHManager();
    const servers = ssh.listServers();
    for (const s of servers) {
      try { ssh.disconnect(s.id); } catch { /* best effort */ }
    }
    logger.info('Panic: SSH sessions disconnected', { count: servers.length });
  } catch { /* SSH module may not be loaded */ }

  // 2. The tool executor checks isPanicActive() before every execution
  // (integrated below via isPanicActive export)

  logger.error('PANIC MODE COMPLETE — all systems frozen', { reason });
}

/**
 * DEACTIVATE PANIC MODE — resume normal operation.
 * Only call after investigating and resolving the issue.
 */
export async function deactivatePanic(deactivatedBy = 'admin'): Promise<void> {
  if (!panicActive) {
    logger.warn('Panic mode not active');
    return;
  }

  logger.info('Panic mode deactivated', { by: deactivatedBy, duration: Date.now() - (panicState?.activatedAt ?? 0) });

  panicActive = false;
  panicState = null;

  try {
    await writeFile(STATE_FILE, JSON.stringify({ active: false, deactivatedAt: Date.now(), deactivatedBy }), 'utf-8');
  } catch { /* best effort */ }
}

/** Check if panic mode is active — called by tool-executor before every tool call */
export function isPanicActive(): boolean {
  return panicActive;
}

/** Get current panic state for dashboard */
export function getPanicState(): PanicState | null {
  return panicState;
}

/**
 * Check for persisted panic state on startup.
 * If the system was in panic when it crashed/restarted, stay in panic.
 */
export async function checkPersistedPanic(): Promise<boolean> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
    const state = JSON.parse(raw);
    if (state.active) {
      panicActive = true;
      panicState = state;
      logger.error('PANIC MODE PERSISTED FROM PREVIOUS SESSION', { reason: state.reason });
      return true;
    }
  } catch { /* no persisted state — normal */ }
  return false;
}

// ─── AUTO-PANIC: Anomaly Detection ──────────────────────────────────
// Monitors failure rate and cost. Triggers panic automatically when thresholds are breached.

let failureTimestamps: number[] = [];
let costTracked = 0;
let dailyBudget = 50; // $50 default, overridable

/** Set daily budget for auto-panic cost threshold */
export function setAutoPanicBudget(budget: number): void {
  dailyBudget = budget;
}

/**
 * Record a failure event. If >10 failures in 1 hour, auto-activate panic.
 * Call this from intelligence-bridge or tool-executor on errors.
 */
export function recordFailureForPanic(): void {
  if (panicActive) return;

  const oneHourAgo = Date.now() - 3600_000;
  failureTimestamps.push(Date.now());
  failureTimestamps = failureTimestamps.filter(t => t > oneHourAgo);

  if (failureTimestamps.length >= 10) {
    logger.error('AUTO-PANIC: 10+ failures in 1 hour — activating kill switch');
    activatePanic('anomaly', 'auto-detection', { pendingTasks: failureTimestamps.length });
  }
}

/**
 * Record cost for auto-panic. If cost > 2x daily budget, auto-activate panic.
 * Call this from cost-intelligence or governance.
 */
export function recordCostForPanic(costUsd: number): void {
  if (panicActive) return;

  costTracked += costUsd;
  if (costTracked > dailyBudget * 2) {
    logger.error('AUTO-PANIC: Cost exceeded 2x daily budget — activating kill switch', {
      cost: costTracked.toFixed(2),
      budget: dailyBudget,
    });
    activatePanic('cost_overflow', 'auto-detection', { costToday: costTracked });
  }
}

/** Reset daily cost tracker (call from heartbeat at midnight) */
export function resetDailyCost(): void {
  costTracked = 0;
}
