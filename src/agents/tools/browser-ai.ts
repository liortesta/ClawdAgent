import { BrowserTool } from './browser-tool.js';

/**
 * High-level AI browser actions that combine multiple browser operations.
 */
export class BrowserAI {
  private browser: BrowserTool;

  constructor() {
    this.browser = new BrowserTool();
  }

  /** Sign up for a website. Fills in form fields intelligently. */
  async signUp(url: string, userData: {
    email: string; name: string; password?: string;
    username?: string; phone?: string;
  }): Promise<string> {
    const results: string[] = [];

    const nav = await this.browser.execute({ action: 'navigate', url });
    results.push(nav.output);

    const fieldMappings: Record<string, string[]> = {
      email: ['input[type="email"]', '#email', 'input[name="email"]', '[name*="email"]'],
      name: ['input[name="name"]', '#name', 'input[name="fullname"]', '#fullName', '[name*="name"]'],
      password: ['input[type="password"]', '#password', 'input[name="password"]'],
      username: ['input[name="username"]', '#username', '[name*="user"]'],
      phone: ['input[type="tel"]', '#phone', 'input[name="phone"]', '[name*="phone"]'],
    };

    for (const [field, selectors] of Object.entries(fieldMappings)) {
      const value = (userData as any)[field];
      if (!value) continue;

      for (const selector of selectors) {
        try {
          const res = await this.browser.execute({ action: 'type', selector, text: value });
          if (res.success) {
            results.push(`Filled ${field}: ${selector}`);
            break;
          }
        } catch { /* try next selector */ }
      }
    }

    const submitSelectors = [
      'button[type="submit"]', 'input[type="submit"]',
      'button:has-text("Sign Up")', 'button:has-text("Register")',
      'button:has-text("Create Account")', 'button:has-text("Create account")',
    ];

    for (const selector of submitSelectors) {
      try {
        const res = await this.browser.execute({ action: 'click', selector });
        if (res.success) {
          results.push(`Submitted form: ${selector}`);
          break;
        }
      } catch { /* try next */ }
    }

    return results.join('\n');
  }

  /** Scrape structured data from a page. */
  async scrape(url: string, selectors: Record<string, string>): Promise<Record<string, string>> {
    await this.browser.execute({ action: 'navigate', url });
    const data: Record<string, string> = {};

    for (const [key, selector] of Object.entries(selectors)) {
      const res = await this.browser.execute({ action: 'extract', selector });
      data[key] = res.success ? res.output : '';
    }

    return data;
  }

  async cleanup() {
    await this.browser.cleanup();
  }
}
