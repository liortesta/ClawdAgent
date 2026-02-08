import logger from '../../utils/logger.js';

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'screenshot' | 'scrape' | 'wait' | 'evaluate';
  selector?: string;
  value?: string;
  url?: string;
  waitMs?: number;
  script?: string;
}

export interface BrowserResult {
  success: boolean;
  data?: string;
  screenshot?: Buffer;
  error?: string;
  url?: string;
  title?: string;
}

let puppeteer: any = null;

async function getPuppeteer() {
  if (!puppeteer) {
    try {
      puppeteer = await import('puppeteer');
    } catch {
      throw new Error('Puppeteer is not installed. Run: pnpm add puppeteer');
    }
  }
  return puppeteer;
}

export class BrowserController {
  private browser: any = null;
  private page: any = null;

  async launch(): Promise<void> {
    const pptr = await getPuppeteer();
    this.browser = await pptr.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 720 });
    await this.page.setUserAgent('ClawdAgent/1.0 (Autonomous AI Browser)');
    logger.info('Browser launched');
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info('Browser closed');
    }
  }

  private async ensurePage() {
    if (!this.browser || !this.page) await this.launch();
    return this.page;
  }

  async execute(action: BrowserAction): Promise<BrowserResult> {
    try {
      const page = await this.ensurePage();

      switch (action.type) {
        case 'navigate': {
          if (!action.url) return { success: false, error: 'URL is required for navigate' };
          await page.goto(action.url, { waitUntil: 'networkidle2', timeout: 30000 });
          return {
            success: true,
            url: page.url(),
            title: await page.title(),
            data: `Navigated to ${page.url()} — "${await page.title()}"`,
          };
        }

        case 'click': {
          if (!action.selector) return { success: false, error: 'Selector is required for click' };
          await page.waitForSelector(action.selector, { timeout: 10000 });
          await page.click(action.selector);
          return { success: true, data: `Clicked: ${action.selector}` };
        }

        case 'type': {
          if (!action.selector || !action.value) return { success: false, error: 'Selector and value required for type' };
          await page.waitForSelector(action.selector, { timeout: 10000 });
          await page.type(action.selector, action.value);
          return { success: true, data: `Typed "${action.value}" into ${action.selector}` };
        }

        case 'screenshot': {
          const screenshot = await page.screenshot({ type: 'png', fullPage: false });
          return {
            success: true,
            screenshot,
            data: `Screenshot captured (${screenshot.length} bytes)`,
            url: page.url(),
            title: await page.title(),
          };
        }

        case 'scrape': {
          const selector = action.selector ?? 'body';
          await page.waitForSelector(selector, { timeout: 10000 });
          const text = await page.$eval(selector, (el: any) => el.innerText);
          const truncated = text.length > 5000 ? text.slice(0, 5000) + '\n...(truncated)' : text;
          return {
            success: true,
            data: truncated,
            url: page.url(),
            title: await page.title(),
          };
        }

        case 'wait': {
          await new Promise(resolve => setTimeout(resolve, action.waitMs ?? 1000));
          return { success: true, data: `Waited ${action.waitMs ?? 1000}ms` };
        }

        case 'evaluate': {
          if (!action.script) return { success: false, error: 'Script is required for evaluate' };
          const result = await page.evaluate(action.script);
          return { success: true, data: JSON.stringify(result) };
        }

        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }
    } catch (error: any) {
      logger.error('Browser action failed', { action: action.type, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a sequence of browser actions
   */
  async executeSequence(actions: BrowserAction[]): Promise<BrowserResult[]> {
    const results: BrowserResult[] = [];
    for (const action of actions) {
      const result = await this.execute(action);
      results.push(result);
      if (!result.success) break; // Stop on first failure
    }
    return results;
  }

  /**
   * Quick scrape: navigate to URL and return text content
   */
  async scrapeUrl(url: string, selector?: string): Promise<string> {
    const navResult = await this.execute({ type: 'navigate', url });
    if (!navResult.success) return `Error navigating: ${navResult.error}`;

    const scrapeResult = await this.execute({ type: 'scrape', selector: selector ?? 'body' });
    return scrapeResult.data ?? scrapeResult.error ?? 'No content';
  }

  isOpen(): boolean { return !!this.browser; }
}
