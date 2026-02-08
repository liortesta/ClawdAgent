import { ClaudeClient } from '../../core/claude-client.js';
import { BrowserController } from './controller.js';
import logger from '../../utils/logger.js';

interface ElementRef {
  ref: number;
  tag: string;
  type?: string;
  text?: string;
  placeholder?: string;
  href?: string;
  role?: string;
}

interface AIDecision {
  action: 'click' | 'type' | 'select' | 'scroll' | 'navigate' | 'done' | 'impossible';
  selector?: string;
  value?: string;
  explanation: string;
}

export class AISnapshot {
  private claude: ClaudeClient;
  private browser: BrowserController;

  constructor(claude: ClaudeClient, browser: BrowserController) {
    this.claude = claude;
    this.browser = browser;
  }

  /** Create a compact snapshot of interactive elements on the current page */
  async snapshot(): Promise<{ elements: ElementRef[]; url: string; title: string }> {
    // Use the browser's evaluate to get interactive elements
    const result = await this.browser.execute({
      type: 'evaluate',
      script: `(() => {
        const elements = [];
        const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [onclick]';
        const nodes = document.querySelectorAll(selectors);
        let ref = 1;
        nodes.forEach(node => {
          const el = node;
          if (!el.offsetParent && el.tagName !== 'BODY') return;
          elements.push({
            ref: ref++,
            tag: el.tagName.toLowerCase(),
            type: el.type || undefined,
            text: (el.textContent || '').trim().slice(0, 80) || undefined,
            placeholder: el.placeholder || undefined,
            href: el.href || undefined,
            role: el.getAttribute('role') || undefined,
          });
        });
        return JSON.stringify({ elements, url: location.href, title: document.title });
      })()`,
    });

    if (!result.success || !result.data) {
      return { elements: [], url: '', title: '' };
    }

    try {
      return JSON.parse(result.data);
    } catch {
      return { elements: [], url: result.url ?? '', title: result.title ?? '' };
    }
  }

  /** AI analyzes the page and decides what to do next */
  async analyze(userGoal: string, progress?: string[]): Promise<AIDecision> {
    const { elements, url, title } = await this.snapshot();

    const elementsList = elements.map(e =>
      `[ref=${e.ref}] ${e.tag}${e.type ? `[${e.type}]` : ''} "${e.text || e.placeholder || ''}" ${e.href ? `→ ${e.href}` : ''}`
    ).join('\n');

    try {
      const response = await this.claude.chat({
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: `You are a browser automation AI. You see a web page as a list of interactive elements.
Decide what action to take to achieve the user's goal.

Respond with ONLY valid JSON:
{
  "action": "click|type|select|scroll|navigate|done|impossible",
  "selector": "<CSS selector or element text>",
  "value": "<text to type or URL to navigate>",
  "explanation": "why this action"
}`,
        messages: [{ role: 'user', content: `
PAGE: ${title} (${url})
ELEMENTS:
${elementsList || '(no interactive elements found)'}
${progress?.length ? `\nPROGRESS SO FAR: ${progress.join(' → ')}` : ''}

USER GOAL: ${userGoal}

What should I do next?` }],
        maxTokens: 300,
        temperature: 0.1,
      });

      return JSON.parse(response.content);
    } catch (err: any) {
      logger.warn('AI snapshot analysis failed', { error: err.message });
      return { action: 'impossible', explanation: `Analysis failed: ${err.message}` };
    }
  }

  /** Execute a full AI-driven browser task step by step */
  async executeTask(task: string, maxSteps = 15): Promise<string> {
    const results: string[] = [];

    for (let step = 0; step < maxSteps; step++) {
      const decision = await this.analyze(task, results);

      if (decision.action === 'done') {
        results.push(`Done: ${decision.explanation}`);
        break;
      }
      if (decision.action === 'impossible') {
        results.push(`Cannot do: ${decision.explanation}`);
        break;
      }

      try {
        switch (decision.action) {
          case 'click':
            await this.browser.execute({ type: 'click', selector: decision.selector });
            results.push(`Clicked: ${decision.selector}`);
            break;
          case 'type':
            await this.browser.execute({ type: 'type', selector: decision.selector, value: decision.value });
            results.push(`Typed: "${decision.value}" in ${decision.selector}`);
            break;
          case 'navigate':
            await this.browser.execute({ type: 'navigate', url: decision.value });
            results.push(`Navigated to: ${decision.value}`);
            break;
          case 'scroll':
            await this.browser.execute({ type: 'evaluate', script: 'window.scrollBy(0, 500)' });
            results.push('Scrolled down');
            break;
        }
        // Wait for page to settle
        await this.browser.execute({ type: 'wait', waitMs: 1000 });
      } catch (error: any) {
        results.push(`Error: ${error.message}`);
      }
    }

    return results.join('\n');
  }
}
