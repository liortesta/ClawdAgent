import logger from '../../utils/logger.js';
import { BrowserController } from './controller.js';

export interface WatchJob {
  id: string;
  userId: string;
  url: string;
  selector: string;
  type: 'price' | 'content' | 'availability' | 'custom';
  condition?: string;
  lastValue?: string;
  intervalMs: number;
  callback: (change: { oldValue: string; newValue: string; url: string }) => Promise<void>;
}

export class WebMonitor {
  private jobs: Map<string, WatchJob> = new Map();
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private browser: BrowserController;

  constructor(browser: BrowserController) {
    this.browser = browser;
  }

  watch(job: WatchJob): void {
    this.jobs.set(job.id, job);
    const interval = setInterval(() => this.checkJob(job.id), job.intervalMs);
    this.intervals.set(job.id, interval);
    logger.info('Web monitor: watching', { id: job.id, url: job.url, type: job.type, intervalMs: job.intervalMs });
  }

  unwatch(id: string): void {
    const interval = this.intervals.get(id);
    if (interval) clearInterval(interval);
    this.intervals.delete(id);
    this.jobs.delete(id);
    logger.info('Web monitor: unwatched', { id });
  }

  private async checkJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    try {
      // Navigate and scrape
      const navResult = await this.browser.execute({ type: 'navigate', url: job.url });
      if (!navResult.success) return;

      const scrapeResult = await this.browser.execute({ type: 'scrape', selector: job.selector });
      if (!scrapeResult.success || !scrapeResult.data) return;

      const newValue = scrapeResult.data.trim();

      // Check if value changed
      if (job.lastValue !== undefined && job.lastValue !== newValue) {
        let conditionMet = true;

        // Price condition check
        if (job.condition && job.type === 'price') {
          const price = parseFloat(newValue.replace(/[^0-9.]/g, ''));
          if (!isNaN(price)) {
            // Safe condition evaluation: only allow basic numeric comparisons
            const match = job.condition.match(/^([<>=!]+)\s*(\d+\.?\d*)$/);
            if (match) {
              const op = match[1];
              const threshold = parseFloat(match[2]);
              switch (op) {
                case '<': conditionMet = price < threshold; break;
                case '>': conditionMet = price > threshold; break;
                case '<=': conditionMet = price <= threshold; break;
                case '>=': conditionMet = price >= threshold; break;
                case '==': conditionMet = price === threshold; break;
                default: conditionMet = true;
              }
            }
          }
        }

        if (conditionMet) {
          logger.info('Web monitor: change detected!', { id, oldValue: job.lastValue, newValue, url: job.url });
          await job.callback({ oldValue: job.lastValue, newValue, url: job.url });
        }
      }

      job.lastValue = newValue;
    } catch (error: any) {
      logger.debug('Web monitor check failed', { id, error: error.message });
    }
  }

  listJobs(userId?: string): Array<Omit<WatchJob, 'callback'>> {
    const jobs = Array.from(this.jobs.values());
    const filtered = userId ? jobs.filter(j => j.userId === userId) : jobs;
    return filtered.map(({ callback, ...rest }) => rest);
  }

  stopAll(): void {
    for (const [id, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
    this.jobs.clear();
    logger.info('Web monitor: all jobs stopped');
  }
}
