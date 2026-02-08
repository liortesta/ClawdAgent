import logger from '../utils/logger.js';
import { MetaAgent } from './meta-agent.js';

interface RepairRecord {
  timestamp: Date;
  issue: string;
  action: string;
  success: boolean;
}

export class SelfRepair {
  private meta: MetaAgent;
  private repairHistory: RepairRecord[] = [];

  constructor(meta: MetaAgent) {
    this.meta = meta;
  }

  async diagnoseAndRepair(): Promise<{ repaired: string[]; failed: string[] }> {
    const diagnosis = await this.meta.selfDiagnose();
    if (diagnosis.healthy) return { repaired: [], failed: [] };

    const repaired: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < diagnosis.issues.length; i++) {
      const issue = diagnosis.issues[i];
      const suggestedFix = diagnosis.fixes[i] ?? 'No fix available';

      logger.warn('Self-repair: attempting fix', { issue, suggestedFix });

      try {
        const success = await this.executeRepair(issue, suggestedFix);
        this.repairHistory.push({ timestamp: new Date(), issue, action: suggestedFix, success });

        if (success) {
          repaired.push(issue);
          logger.info('Self-repair: fixed!', { issue });
        } else {
          failed.push(issue);
          logger.error('Self-repair: failed', { issue });
        }
      } catch (error: any) {
        failed.push(issue);
        this.repairHistory.push({ timestamp: new Date(), issue, action: suggestedFix, success: false });
        logger.error('Self-repair: error', { issue, error: error.message });
      }
    }

    return { repaired, failed };
  }

  private async executeRepair(issue: string, suggestedFix: string): Promise<boolean> {
    // High memory
    if (issue.includes('memory')) {
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection');
        return true;
      }
      return false;
    }

    // Database connection
    if (issue.includes('Database') || issue.includes('database')) {
      try {
        const { initDatabase } = await import('../memory/database.js');
        await initDatabase();
        return true;
      } catch {
        return false;
      }
    }

    // Redis
    if (issue.includes('Redis') || issue.includes('redis')) {
      try {
        const { initCache } = await import('../memory/cache.js');
        initCache();
        return true;
      } catch {
        return false;
      }
    }

    // Low success rate — just log, need manual intervention
    if (issue.includes('success rate')) {
      logger.warn('Low success rate detected — reviewing error patterns', {
        recentErrors: this.meta.getRecentErrors().slice(-5),
      });
      return false;
    }

    // Unknown issue
    logger.warn('Self-repair: no automatic fix available', { issue, suggestedFix });
    return false;
  }

  getRepairHistory(): RepairRecord[] { return [...this.repairHistory]; }
  getLastRepair(): RepairRecord | null { return this.repairHistory[this.repairHistory.length - 1] ?? null; }
}
