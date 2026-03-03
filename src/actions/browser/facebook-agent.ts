/**
 * Facebook AI Agent — autonomous Facebook automation with AI-generated content.
 * Ported from Python/Selenium to TypeScript/Playwright.
 *
 * Capabilities: posting, commenting, friend requests, group joins, messaging.
 * Uses OpenRouter/Anthropic for smart content generation with configurable tone.
 * Includes scheduling, safety limits, active hours, and self-post avoidance.
 */
import { BrowserSessionManager } from './session-manager.js';
import { FacebookAccountManager, type FacebookAccount } from './facebook-manager.js';
import { toPlaywrightCookies, validateFacebookCookies } from './facebook-cookies.js';
import { AIClient } from '../../core/ai-client.js';
import logger from '../../utils/logger.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';

const AGENT_STATE_FILE = pathResolve(process.cwd(), 'data', 'facebook-agents.json');

// ── Types ─────────────────────────────────────────────────────────────

export type ActionType = 'post' | 'comment' | 'friend_request' | 'group_join' | 'message';

export interface AgentConfig {
  /** Account ID from FacebookAccountManager */
  accountId: string;
  /** Enabled action types */
  actions: ActionType[];
  /** Scheduling config per action */
  schedule: Record<ActionType, { intervalMinutes: number; dailyLimit: number }>;
  /** Active hours (24h format) */
  activeHours: { weekday: { start: number; end: number }; weekend: { start: number; end: number } };
  /** Content generation settings */
  content: {
    tone: string;            // e.g. "friendly and professional"
    language: string;        // e.g. "Hebrew" or "English"
    topics: string[];        // e.g. ["tech", "marketing"]
    promoLink?: string;      // Optional promotional link to inject
    promoFrequency: number;  // 0-1, percentage of posts with promo link
    maxLength: number;       // Max chars per generated content
  };
  /** Safety limits */
  safety: {
    minDelaySeconds: number;     // Min delay between any actions
    maxActionsPerHour: number;
    pauseOnErrorCount: number;   // Pause after N consecutive errors
    pauseDurationMinutes: number;
  };
  /** Group URLs to interact with */
  groups: string[];
  /** Test mode — log actions but don't execute */
  testMode: boolean;
}

export interface AgentStatus {
  accountId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  sessionId: string | null;
  currentAction: string | null;
  stats: AgentStats;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: AgentConfig;
}

export interface AgentStats {
  posts: number;
  comments: number;
  friendRequests: number;
  groupJoins: number;
  messages: number;
  errors: number;
  totalActions: number;
  actionsThisHour: number;
  lastActionAt: string | null;
}

export interface AgentLogEntry {
  timestamp: string;
  action: ActionType | 'system';
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
  details?: string;
}

const DEFAULT_CONFIG: AgentConfig = {
  accountId: '',
  actions: ['post', 'comment'],
  schedule: {
    post: { intervalMinutes: 60, dailyLimit: 5 },
    comment: { intervalMinutes: 30, dailyLimit: 20 },
    friend_request: { intervalMinutes: 120, dailyLimit: 10 },
    group_join: { intervalMinutes: 180, dailyLimit: 3 },
    message: { intervalMinutes: 45, dailyLimit: 10 },
  },
  activeHours: {
    weekday: { start: 8, end: 22 },
    weekend: { start: 10, end: 23 },
  },
  content: {
    tone: 'friendly and engaging',
    language: 'Hebrew',
    topics: ['general'],
    promoFrequency: 0,
    maxLength: 500,
  },
  safety: {
    minDelaySeconds: 30,
    maxActionsPerHour: 15,
    pauseOnErrorCount: 3,
    pauseDurationMinutes: 30,
  },
  groups: [],
  testMode: false,
};

// ── Facebook Agent Class ──────────────────────────────────────────────

export class FacebookAgent {
  private static instances: Map<string, FacebookAgent> = new Map();

  private config: AgentConfig;
  private state: 'stopped' | 'running' | 'paused' | 'error' = 'stopped';
  private sessionId: string | null = null;
  private currentAction: string | null = null;
  private stats: AgentStats = this.freshStats();
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private logs: AgentLogEntry[] = [];
  private consecutiveErrors = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActionTimes: Map<ActionType, number> = new Map();
  private dailyActionCounts: Map<ActionType, number> = new Map();
  private dailyResetDate: string = '';
  private commentedPostHashes: Set<string> = new Set();
  private sentFriendNames: Set<string> = new Set();
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private aiClient: AIClient;

  private constructor(config: AgentConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiClient = new AIClient();
  }

  /** Get or create an agent for an account */
  static getAgent(accountId: string): FacebookAgent | undefined {
    return FacebookAgent.instances.get(accountId);
  }

  /** Create a new agent for an account */
  static createAgent(config: AgentConfig): FacebookAgent {
    if (FacebookAgent.instances.has(config.accountId)) {
      throw new Error(`Agent already exists for account ${config.accountId}`);
    }
    const agent = new FacebookAgent(config);
    FacebookAgent.instances.set(config.accountId, agent);
    FacebookAgent.saveToDisk();
    return agent;
  }

  /** Remove agent instance */
  static removeAgent(accountId: string): void {
    const agent = FacebookAgent.instances.get(accountId);
    if (agent) {
      agent.stop().catch(() => {});
      FacebookAgent.instances.delete(accountId);
      FacebookAgent.saveToDisk();
    }
  }

  /** List all active agents */
  static listAgents(): AgentStatus[] {
    return [...FacebookAgent.instances.values()].map(a => a.getStatus());
  }

  // ── Persistence ─────────────────────────────────────────────────────

  /** Save running agent configs to disk so they survive restarts */
  private static saveToDisk(): void {
    try {
      const configs: AgentConfig[] = [];
      for (const agent of FacebookAgent.instances.values()) {
        if (agent.state === 'running' || agent.state === 'paused') {
          configs.push(agent.config);
        }
      }
      mkdirSync(dirname(AGENT_STATE_FILE), { recursive: true });
      writeFileSync(AGENT_STATE_FILE, JSON.stringify(configs, null, 2));
    } catch (err: any) {
      logger.warn('Failed to save Facebook agent state', { error: err.message });
    }
  }

  /** Restore agents from disk after server restart */
  static async restoreAgents(): Promise<void> {
    if (!existsSync(AGENT_STATE_FILE)) return;
    try {
      const raw = readFileSync(AGENT_STATE_FILE, 'utf-8');
      const configs: AgentConfig[] = JSON.parse(raw);
      if (!Array.isArray(configs) || configs.length === 0) return;
      logger.info(`Restoring ${configs.length} Facebook agent(s) from disk`);
      let restored = 0;
      for (const config of configs) {
        try {
          if (FacebookAgent.instances.has(config.accountId)) continue;
          // Verify account still exists before restoring
          const account = FacebookAccountManager.getInstance().getAccount(config.accountId);
          if (!account) {
            logger.info(`Skipping restore for deleted account ${config.accountId}`);
            continue;
          }
          const agent = FacebookAgent.createAgent(config);
          await agent.start();
          restored++;
          logger.info(`Restored Facebook agent for account ${config.accountId}`);
        } catch (err: any) {
          logger.warn(`Failed to restore Facebook agent ${config.accountId}`, { error: err.message });
        }
      }
      // Clean up state file to remove stale entries
      FacebookAgent.saveToDisk();
      if (restored > 0) logger.info(`Successfully restored ${restored} Facebook agent(s)`);
    } catch (err: any) {
      logger.warn('Failed to read Facebook agent state file', { error: err.message });
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state === 'running') throw new Error('Agent is already running');

    const fbMgr = FacebookAccountManager.getInstance();
    const account = fbMgr.getAccount(this.config.accountId);
    if (!account) throw new Error(`Account ${this.config.accountId} not found`);

    const validation = validateFacebookCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot start — missing cookies: ${validation.missing.join(', ')}`);
    }

    this.state = 'running';
    this.startedAt = new Date().toISOString();
    this.consecutiveErrors = 0;
    this.stats = this.freshStats();
    this.log('system', 'info', `Agent started for account "${account.name}"`);

    // Launch browser session
    try {
      await this.ensureSession(account);
      this.log('system', 'info', `Browser session ready: ${this.sessionId}`);
    } catch (err: any) {
      this.state = 'error';
      this.lastError = err.message;
      this.log('system', 'error', `Failed to launch browser: ${err.message}`);
      throw err;
    }

    // Start keep-alive to prevent session timeout (every 3 minutes)
    this.startKeepAlive();

    // Start the agent loop
    this.scheduleNextAction();
    FacebookAgent.saveToDisk();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    // Close browser session
    if (this.sessionId) {
      try {
        const mgr = BrowserSessionManager.getInstance();
        await mgr.closeSession(this.sessionId);
      } catch { /* best effort */ }
      this.sessionId = null;
    }

    this.log('system', 'info', 'Agent stopped');
    logger.info('Facebook agent stopped', { accountId: this.config.accountId });
    FacebookAgent.saveToDisk();
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.log('system', 'info', 'Agent paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.consecutiveErrors = 0;
    this.log('system', 'info', 'Agent resumed');
    this.scheduleNextAction();
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log('system', 'info', 'Configuration updated');
  }

  getStatus(): AgentStatus {
    // Calculate last action info
    let lastAction: string | null = null;
    let lastActionTime: string | null = this.stats.lastActionAt;
    let latestTime = 0;
    for (const [action, time] of this.lastActionTimes) {
      if (time > latestTime) {
        latestTime = time;
        lastAction = action;
      }
    }

    // Estimate next action time
    let nextActionTime: string | null = null;
    if (this.state === 'running') {
      const nextDelay = this.config.safety.minDelaySeconds * 1000;
      const lastMs = latestTime || Date.now();
      nextActionTime = new Date(lastMs + nextDelay).toISOString();
    }

    return {
      accountId: this.config.accountId,
      state: this.state,
      sessionId: this.sessionId,
      currentAction: this.currentAction,
      stats: { ...this.stats },
      lastError: this.lastError,
      startedAt: this.startedAt,
      lastAction,
      lastActionTime,
      nextActionTime,
      config: this.config,
    };
  }

  getLogs(limit = 50): AgentLogEntry[] {
    return this.logs.slice(-limit);
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  // ── Main Agent Loop ───────────────────────────────────────────────

  private scheduleNextAction(): void {
    if (this.state !== 'running') return;

    const delay = Math.max(this.config.safety.minDelaySeconds * 1000, 5000);
    this.loopTimer = setTimeout(() => this.actionLoop(), delay);
  }

  private async actionLoop(): Promise<void> {
    if (this.state !== 'running') return;

    try {
      // Check active hours
      if (!this.isWithinActiveHours()) {
        this.log('system', 'skipped', 'Outside active hours, sleeping 5 min');
        this.loopTimer = setTimeout(() => this.actionLoop(), 5 * 60_000);
        return;
      }

      // Check hourly limit
      this.updateHourlyCount();
      if (this.stats.actionsThisHour >= this.config.safety.maxActionsPerHour) {
        this.log('system', 'skipped', `Hourly limit reached (${this.stats.actionsThisHour}/${this.config.safety.maxActionsPerHour})`);
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }

      // Reset daily counters if new day
      this.resetDailyCountsIfNeeded();

      // Pick next action
      const action = this.pickNextAction();
      if (!action) {
        this.log('system', 'skipped', 'No actions available (all at daily limit or not ready)');
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }

      // Ensure we have a valid browser session
      const account = FacebookAccountManager.getInstance().getAccount(this.config.accountId);
      if (!account) {
        this.state = 'error';
        this.lastError = 'Account deleted';
        return;
      }
      await this.ensureSession(account);

      // Validate browser is responsive before executing
      const page = this.getPage();
      if (!page) {
        this.log('system', 'error', 'Browser page not available — recreating session');
        this.sessionId = null;
        await this.ensureSession(account);
        if (!this.getPage()) throw new Error('Failed to create browser session');
      } else {
        // Quick health check — can we still interact with the page?
        try {
          await page.evaluate('1 + 1');
        } catch {
          this.log('system', 'error', 'Browser unresponsive — recreating session');
          this.sessionId = null;
          await this.ensureSession(account);
        }
      }

      // Dismiss any Facebook overlays/popups before acting
      await this.dismissOverlays(page!);

      // Execute the action
      this.currentAction = action;
      await this.executeAction(action);
      this.currentAction = null;
      this.consecutiveErrors = 0;

    } catch (err: any) {
      this.consecutiveErrors++;
      this.stats.errors++;
      this.lastError = err.message;
      this.currentAction = null;
      // Include stack trace for better debugging
      const stack = err.stack ? `\n${err.stack.split('\n').slice(0, 5).join('\n')}` : '';
      this.log('system', 'error', `Action loop error: ${err.message}`, stack);

      // Auto-pause on too many consecutive errors
      if (this.consecutiveErrors >= this.config.safety.pauseOnErrorCount) {
        this.state = 'paused';
        this.log('system', 'error', `Paused after ${this.consecutiveErrors} consecutive errors. Will resume in ${this.config.safety.pauseDurationMinutes} min.`);

        this.loopTimer = setTimeout(() => {
          if (this.state === 'paused') {
            this.state = 'running';
            this.consecutiveErrors = 0;
            this.log('system', 'info', 'Auto-resumed after error pause');
            this.actionLoop();
          }
        }, this.config.safety.pauseDurationMinutes * 60_000);
        return;
      }
    }

    // Schedule next
    this.scheduleNextAction();
  }

  // ── Action Execution ──────────────────────────────────────────────

  private async executeAction(action: ActionType): Promise<void> {
    const page = this.getPage();
    if (!page) throw new Error('No active page');

    this.log(action, 'info', `Executing: ${action}`);

    switch (action) {
      case 'post':
        await this.executePost(page);
        break;
      case 'comment':
        await this.executeComment(page);
        break;
      case 'friend_request':
        await this.executeFriendRequest(page);
        break;
      case 'group_join':
        await this.executeGroupJoin(page);
        break;
      case 'message':
        await this.executeMessage(page);
        break;
    }

    // Update stats
    this.stats.totalActions++;
    this.stats.actionsThisHour++;
    this.stats.lastActionAt = new Date().toISOString();
    this.lastActionTimes.set(action, Date.now());
    this.dailyActionCounts.set(action, (this.dailyActionCounts.get(action) || 0) + 1);

    switch (action) {
      case 'post': this.stats.posts++; break;
      case 'comment': this.stats.comments++; break;
      case 'friend_request': this.stats.friendRequests++; break;
      case 'group_join': this.stats.groupJoins++; break;
      case 'message': this.stats.messages++; break;
    }
  }

  // ── Post Action (m.facebook.com — mobile React) ──────────────────
  //
  // On m.facebook.com, clicking "Write something…" doesn't open an inline
  // textarea — it navigates to a dedicated composer page.  We go directly
  // to that composer URL instead.

  private async executePost(page: any): Promise<void> {
    const groupRaw = this.config.groups.length > 0
      ? this.config.groups[Math.floor(Math.random() * this.config.groups.length)]
      : '';
    // Support both full URLs and plain slugs
    const groupSlug = groupRaw.match(/groups\/([^/?]+)/)?.[1] || groupRaw.replace(/^\/+|\/+$/g, '');

    // Generate content first (before navigating to composer)
    const content = await this.generateContent('post', {
      context: groupSlug
        ? `Writing a post in a Facebook group about AI and technology (group: ${groupSlug})`
        : 'Writing a new Facebook post on my timeline',
    });

    if (this.config.testMode) {
      this.log('post', 'success', `[TEST] Would post: "${content.slice(0, 100)}..."`);
      return;
    }

    // Strategy: navigate directly to the m.facebook.com composer page
    // For groups:  /groups/{slug}/?composer=1  or navigate to group → click composer
    // For timeline: /composer/story/create/  or  just the group discussion page
    const composerUrl = groupSlug
      ? `https://m.facebook.com/groups/${groupSlug}/`
      : 'https://m.facebook.com/';

    await page.goto(composerUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Check for group restriction
    const restriction = await page.evaluate(`(() => {
      const text = document.body.innerText || '';
      if (/temporarily turned off your ability to post/i.test(text) ||
          /can't post in this group/i.test(text)) {
        return text.match(/(temporarily.*?\\d{4}.*?(?:AM|PM|\\.))/i)?.[0] || 'Restriction detected';
      }
      return null;
    })()`).catch(() => null);

    if (restriction) {
      this.log('post', 'skipped', `Account restricted: ${restriction}`);
      return;
    }

    // Click the composer prompt — on m.facebook.com this navigates to a composer page
    const composerPrompt = await page.evaluate(`(() => {
      // Find "Write something" / "כתבו משהו" / "What's on your mind" prompts
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = (walker.currentNode.textContent || '').trim();
        if (/^(כתבו משהו|Write something|What's on your mind|מה חדש|Create.*post)/i.test(text)) {
          const el = walker.currentNode.parentElement;
          if (el) {
            // On m.facebook.com, find the parent link/button that navigates to composer
            let target = el;
            for (let i = 0; i < 5; i++) {
              if (target.tagName === 'A' || target.getAttribute('role') === 'button') break;
              if (target.parentElement) target = target.parentElement;
            }
            target.click();
            return text;
          }
        }
      }
      // Also try clicking any link to the composer URL
      const composerLinks = document.querySelectorAll('a[href*="composer"], a[href*="createpost"]');
      if (composerLinks.length > 0) {
        composerLinks[0].click();
        return 'composer-link';
      }
      return null;
    })()`);

    if (composerPrompt) {
      this.log('post', 'info', `Clicked composer: "${composerPrompt}" — waiting for composer page`);
      // Wait for navigation to composer page (m.facebook.com navigates to /composer/)
      await page.waitForTimeout(4000);
      // Check if we navigated to a composer page
      const afterUrl = page.url();
      this.log('post', 'info', `After composer click, now at: ${afterUrl}`);
    } else {
      // Fallback: try direct composer URL patterns on m.facebook.com
      this.log('post', 'info', 'No composer prompt found, trying direct composer URL');
      // On m.facebook.com, group composer might be at /groups/{slug}/post/ or similar
      const altUrl = groupSlug
        ? `https://m.facebook.com/groups/${groupSlug}/?view=permalink&id=0`
        : 'https://m.facebook.com/home.php?sk=h_chr';
      await page.goto(altUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.randomDelay(2000, 3000);
    }

    // Now look for the textarea on the composer page
    const inputSelectors = [
      'textarea[name="xc_message"]',
      'textarea[name="message"]',
      'textarea[placeholder]',
      'textarea',
      '[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
    ];

    let targetInput = null;
    for (const sel of inputSelectors) {
      targetInput = await page.$(sel);
      if (targetInput) {
        this.log('post', 'info', `Found composer input: ${sel}`);
        break;
      }
    }

    // If still no input, page may not have fully loaded — try another wait
    if (!targetInput) {
      await this.randomDelay(2000, 3000);
      for (const sel of inputSelectors) {
        targetInput = await page.$(sel);
        if (targetInput) {
          this.log('post', 'info', `Found composer input (after extra wait): ${sel}`);
          break;
        }
      }
    }

    if (!targetInput) {
      // Log what we see on the page for debugging
      const pageSnippet = await page.evaluate('document.body.innerText.slice(0, 300)').catch(() => '');
      const pageUrl = page.url();
      this.log('post', 'error', `No composer textarea found at ${pageUrl}. Page: ${pageSnippet.slice(0, 150)}`);
      throw new Error('Post composer textarea not found');
    }

    // Type the post content
    await targetInput.click();
    await this.randomDelay(300, 600);
    await page.keyboard.type(content, { delay: 40 + Math.random() * 60 });
    await this.randomDelay(1000, 2000);

    // Submit — find the Post/Submit button
    const submitBtn = await page.$('button[name="view_post"], input[name="view_post"], button[type="submit"], input[type="submit"], [aria-label*="Post" i], [aria-label*="פרסם" i], button[data-sigil*="submit"]');

    if (submitBtn) {
      await submitBtn.click();
      this.log('post', 'info', 'Clicked submit button');
    } else {
      // Look harder for submit button
      const anySubmit = await page.evaluate(`(() => {
        const btns = document.querySelectorAll('button, input[type="submit"]');
        for (const btn of btns) {
          const text = (btn.textContent || btn.value || '').trim();
          if (/^(Post|פרסם|Submit|Share|שתף)$/i.test(text)) {
            btn.click();
            return text;
          }
        }
        return null;
      })()`);
      if (anySubmit) {
        this.log('post', 'info', `Clicked submit: "${anySubmit}"`);
      } else {
        await page.keyboard.press('Enter');
        this.log('post', 'info', 'Submitted via Enter key');
      }
    }

    await this.randomDelay(3000, 5000);
    this.log('post', 'success', `Posted: "${content.slice(0, 80)}..."`);
  }

  // ── Comment Action (m.facebook.com — React mobile) ────────────

  private async executeComment(page: any): Promise<void> {
    // Navigate to group if configured, otherwise news feed
    const groupRaw = this.config.groups.length > 0
      ? this.config.groups[Math.floor(Math.random() * this.config.groups.length)]
      : '';
    // Support both full URLs (https://facebook.com/groups/xxx) and plain slugs (xxx)
    const groupSlug = groupRaw.match(/groups\/([^/?]+)/)?.[1] || groupRaw.replace(/^\/+|\/+$/g, '');
    const targetUrl = groupSlug
      ? `https://m.facebook.com/groups/${groupSlug}/`
      : 'https://m.facebook.com/';

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Check for group restriction banner (admin blocked commenting)
    const restriction = await page.evaluate(`(() => {
      const text = document.body.innerText || '';
      const patterns = [
        /temporarily turned off your ability to post/i,
        /can't comment in this group/i,
        /restricted from commenting/i,
        /your ability to.*has been turned off/i,
        /היכולת שלך ל.*הושבתה/i,
        /הושעית מהקבוצה/i,
        /אינך יכול.{0,10} לפרסם/i,
      ];
      for (const p of patterns) {
        if (p.test(text)) {
          // Extract the relevant sentence
          const match = text.match(new RegExp('.{0,40}' + p.source + '.{0,60}', 'i'));
          return match ? match[0].trim() : 'Restriction detected';
        }
      }
      return null;
    })()`).catch(() => null);

    if (restriction) {
      this.log('comment', 'skipped', `Account restricted in this group: ${restriction}`);
      return;
    }

    // Log a snippet of the page to understand what we're seeing
    const pageSnippet = await page.evaluate('document.body.innerText.slice(0, 400)').catch(() => '');
    this.log('comment', 'info', `Group page loaded: ${pageSnippet.slice(0, 200)}`);

    // Scroll to load more posts (m.facebook.com uses infinite scroll)
    const scrollCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < scrollCount; i++) {
      await page.evaluate(`window.scrollBy(0, ${400 + Math.floor(Math.random() * 300)})`);
      await this.randomDelay(1500, 2500);
    }

    // On m.facebook.com (Android Chrome UA), the group page renders full post content.
    // Each post has a "Write a comment…" / "Write an answer…" / "כתבו תגובה..." prompt.
    // There are NO <a> links for posts — it's all React components.
    // Strategy: find "Write a comment" prompts, extract surrounding post text, click to activate input.
    const postData = await page.evaluate(`(() => {
      const results = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = (walker.currentNode.textContent || '').trim();
        // Match "Write a comment…", "Write an answer…", "כתבו תגובה", etc.
        if (!/^(Write a comment|Write an answer|כתבו תגובה|הגיבו|Comment)/i.test(text)) continue;

        // Find the clickable parent element
        let clickTarget = walker.currentNode.parentElement;
        if (!clickTarget) continue;

        // Walk up to find a reasonable post container and extract post text
        let postText = '';
        let container = clickTarget;
        for (let i = 0; i < 25; i++) {
          container = container?.parentElement;
          if (!container) break;
          const ct = container.innerText || '';
          if (ct.length > 200) {
            // Extract just the post body (skip the header/footer noise)
            postText = ct.slice(0, 500);
            break;
          }
        }

        const rect = clickTarget.getBoundingClientRect();
        if (rect && rect.height > 0 && rect.y > 0) {
          // Generate a unique ID for the element so we can find it again
          const uid = 'fb_comment_' + results.length;
          clickTarget.setAttribute('data-fbagent', uid);

          results.push({
            uid,
            promptText: text.slice(0, 40),
            postText: postText.slice(0, 400),
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
          });
        }
      }
      return results;
    })()`);

    this.log('comment', 'info', `Found ${postData.length} comment prompts on group page`);

    if (postData.length === 0) {
      const pageUrl = page.url();
      this.log('comment', 'skipped', `No comment opportunities found on ${pageUrl}`);
      return;
    }

    // Shuffle to randomize
    for (let i = postData.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [postData[i], postData[j]] = [postData[j], postData[i]];
    }

    // Try commenting on posts
    let commented = false;
    for (const post of postData.slice(0, 5)) {
      const postHash = post.postText.slice(0, 100).replace(/\s+/g, ' ').trim();
      if (postHash && this.commentedPostHashes.has(postHash)) {
        this.log('comment', 'info', `Skipping already-commented: "${postHash.slice(0, 40)}..."`);
        continue;
      }

      const content = await this.generateContent('comment', {
        context: `Commenting on a Facebook post. The post says: "${post.postText.slice(0, 300)}"`,
      });

      if (this.config.testMode) {
        this.log('comment', 'success', `[TEST] Would comment: "${content.slice(0, 100)}..."`);
        if (postHash) this.commentedPostHashes.add(postHash);
        return;
      }

      try {
        // Click the "Write a comment" prompt to activate the input
        // Use page.evaluate to click via DOM (triggers React's synthetic event delegation)
        this.log('comment', 'info', `Clicking "${post.promptText}" prompt (uid: ${post.uid})`);

        const clickUid = post.uid;
        const clicked = await page.evaluate(`(() => {
          const el = document.querySelector('[data-fbagent="` + clickUid + `"]');
          if (!el) return false;
          // Simulate mousedown → mouseup → click sequence for React
          ['mousedown', 'mouseup', 'click'].forEach(evtType => {
            el.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true }));
          });
          // Also try focus
          el.focus?.();
          return true;
        })()`).catch(() => false);

        if (!clicked) {
          // Fallback: click at coordinates
          await page.mouse.click(post.x, post.y);
        }
        await this.randomDelay(2000, 3000);

        // Check what appeared after clicking
        const afterClick = await page.evaluate(`(() => {
          const textareas = document.querySelectorAll('textarea');
          const editables = document.querySelectorAll('[contenteditable="true"]');
          const textboxes = document.querySelectorAll('[role="textbox"]');
          const inputs = document.querySelectorAll('input[type="text"]');
          return {
            textareas: textareas.length,
            editables: editables.length,
            textboxes: textboxes.length,
            textInputs: inputs.length,
            focused: document.activeElement?.tagName + '.' + (document.activeElement?.className || '').slice(0, 30),
            focusedRole: document.activeElement?.getAttribute('role'),
            focusedEditable: document.activeElement?.getAttribute('contenteditable'),
          };
        })()`).catch(() => ({}));

        this.log('comment', 'info', `After click: ${JSON.stringify(afterClick)}`);

        // Try to find the comment input (textarea, contenteditable, or textbox)
        let commentInput = null;
        const inputSelectors = [
          'textarea[name="comment_text"]',
          'textarea[placeholder]',
          'textarea',
          '[role="textbox"][contenteditable="true"]',
          '[contenteditable="true"]:not([role="document"]):not([contenteditable="inherit"])',
          'div[data-contents="true"]',
          'input[type="text"][placeholder*="comment" i]',
          'input[type="text"][placeholder*="תגובה"]',
          'input[type="text"][placeholder*="Write" i]',
          'input[type="text"][placeholder*="כתבו"]',
        ];

        for (const sel of inputSelectors) {
          commentInput = await page.$(sel);
          if (commentInput) {
            this.log('comment', 'info', `Found input: ${sel}`);
            break;
          }
        }

        // If no input found, try clicking directly at coordinates (some React apps need this)
        if (!commentInput) {
          this.log('comment', 'info', `No input after DOM click, trying coordinate click at (${post.x}, ${post.y})`);
          await page.mouse.click(post.x, post.y);
          await this.randomDelay(2000, 3000);

          for (const sel of inputSelectors) {
            commentInput = await page.$(sel);
            if (commentInput) {
              this.log('comment', 'info', `Found input after coord click: ${sel}`);
              break;
            }
          }
        }

        // If still no input, check if the active element is editable (React might have focused it)
        if (!commentInput) {
          const activeIsEditable = await page.evaluate(`(() => {
            const ae = document.activeElement;
            return ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' ||
                   ae.getAttribute('contenteditable') === 'true' || ae.getAttribute('role') === 'textbox');
          })()`).catch(() => false);

          if (activeIsEditable) {
            commentInput = await page.$(':focus');
            this.log('comment', 'info', 'Using focused active element as input');
          }
        }

        if (!commentInput) {
          this.log('comment', 'info', `No comment input found for "${post.promptText}" — trying next`);
          continue;
        }

        // Type the comment
        await commentInput.click();
        await this.randomDelay(300, 600);
        await page.keyboard.type(content, { delay: 40 + Math.random() * 60 });
        await this.randomDelay(500, 1000);

        // Submit — try Enter key first (common on mobile), then look for submit button
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], [aria-label*="submit" i], [aria-label*="שלח"], [aria-label*="פרסם"], [aria-label*="Send" i], [data-sigil*="submit"]');
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }
        await this.randomDelay(2000, 4000);

        this.log('comment', 'success', `Commented: "${content.slice(0, 80)}..."`);
        if (postHash) this.commentedPostHashes.add(postHash);
        commented = true;
        break;
      } catch (err: any) {
        this.log('comment', 'info', `Comment attempt failed: ${err.message} — trying next`);
        continue;
      }
    }

    if (!commented) {
      this.log('comment', 'skipped', 'Could not comment on any post');
    }
  }

  // ── Friend Request Action ─────────────────────────────────────────

  private async executeFriendRequest(page: any): Promise<void> {
    // Navigate to "People You May Know" — try multiple URLs
    const friendUrls = [
      'https://www.facebook.com/friends/suggestions',
      'https://www.facebook.com/find-friends/browser/',
      'https://www.facebook.com/friends',
    ];
    let loaded = false;
    for (const url of friendUrls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await this.randomDelay(3000, 5000);
        loaded = true;
        break;
      } catch { /* try next URL */ }
    }
    if (!loaded) {
      this.log('friend_request', 'skipped', 'Could not load friend suggestions page');
      return;
    }

    if (this.config.testMode) {
      this.log('friend_request', 'success', '[TEST] Would send friend request');
      return;
    }

    // Find "Add Friend" buttons (Hebrew + English)
    try {
      await this.dismissOverlays(page);
      const addButtons = await page.$$('[aria-label="Add friend"], [aria-label="הוסף חבר"], [aria-label="הוספת חבר/ה"], button:has-text("Add Friend"), button:has-text("הוסף חבר"), div[role="button"]:has-text("הוסף חבר"), div[role="button"]:has-text("Add Friend")');
      if (addButtons.length === 0) {
        this.log('friend_request', 'skipped', 'No friend suggestions found');
        return;
      }

      // Try to find one we haven't sent to yet
      let targetBtn = null;
      let targetName = '';
      const shuffled = addButtons.sort(() => Math.random() - 0.5).slice(0, 8);
      for (const btn of shuffled) {
        // Extract nearby user name for dedup
        const name = await btn.evaluate((el: any) => {
          const card = el.closest('[data-pagelet], [class*="card"], div[role="listitem"]') || el.parentElement?.parentElement;
          const nameEl = card?.querySelector('a[href*="/profile"], a[role="link"] span, strong, h2, h3');
          return nameEl?.textContent?.trim() || '';
        }).catch(() => '');
        if (name && this.sentFriendNames.has(name)) continue;
        targetBtn = btn;
        targetName = name;
        break;
      }

      if (!targetBtn) {
        this.log('friend_request', 'skipped', 'All visible suggestions already sent');
        return;
      }

      await this.forceClick(page, targetBtn);
      await this.randomDelay(2000, 4000);
      if (targetName) this.sentFriendNames.add(targetName);
      this.log('friend_request', 'success', `Friend request sent${targetName ? ` to "${targetName}"` : ''}`);
    } catch (err: any) {
      this.log('friend_request', 'error', `Failed: ${err.message}`);
      throw err;
    }
  }

  // ── Group Join Action (m.facebook.com) ────────────────────────────

  private async executeGroupJoin(page: any): Promise<void> {
    // Strategy: search for groups related to our topics on m.facebook.com
    const { topics } = this.config.content;
    const searchTerms = topics.length > 0 ? topics : ['AI', 'technology'];
    const searchQuery = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    // Use m.facebook.com search to find groups
    const searchUrl = `https://m.facebook.com/search/groups/?q=${encodeURIComponent(searchQuery)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    if (this.config.testMode) {
      this.log('group_join', 'success', `[TEST] Would search and join group for: "${searchQuery}"`);
      return;
    }

    try {
      // Scroll to load some results
      for (let i = 0; i < 2; i++) {
        await page.evaluate(`window.scrollBy(0, ${400 + Math.floor(Math.random() * 200)})`);
        await this.randomDelay(1500, 2500);
      }

      // On m.facebook.com search results, look for "Join" / "הצטרפות" buttons
      const joinResult = await page.evaluate(`(() => {
        const buttons = document.querySelectorAll('a, button, div[role="button"], span[role="button"]');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (/^(Join|הצטרפ|Join Group)$/i.test(text)) {
            // Find the group name nearby
            let groupName = '';
            let parent = btn.parentElement;
            for (let i = 0; i < 10; i++) {
              if (!parent) break;
              const links = parent.querySelectorAll('a[href*="/groups/"]');
              for (const link of links) {
                const name = (link.textContent || '').trim();
                if (name.length > 3 && name !== text) { groupName = name; break; }
              }
              if (groupName) break;
              parent = parent.parentElement;
            }
            btn.click();
            return { clicked: true, groupName: groupName || 'unknown', buttonText: text };
          }
        }
        return { clicked: false };
      })()`).catch(() => ({ clicked: false }));

      if (joinResult.clicked) {
        await this.randomDelay(2000, 4000);
        this.log('group_join', 'success', `Sent join request for group: "${joinResult.groupName}"`);
      } else {
        // Fallback: try navigating to a configured group directly
        if (this.config.groups.length > 0) {
          const groupRaw = this.config.groups[Math.floor(Math.random() * this.config.groups.length)];
          const slug = groupRaw.match(/groups\/([^/?]+)/)?.[1] || groupRaw.replace(/^\/+|\/+$/g, '');
          if (slug) {
            await page.goto(`https://m.facebook.com/groups/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await this.randomDelay(2000, 3000);

            const directJoin = await page.evaluate(`(() => {
              const btns = document.querySelectorAll('a, button, div[role="button"], span[role="button"]');
              for (const btn of btns) {
                const text = (btn.textContent || '').trim();
                if (/^(Join|הצטרפ|Join Group)$/i.test(text)) {
                  btn.click();
                  return text;
                }
              }
              return null;
            })()`).catch(() => null);

            if (directJoin) {
              await this.randomDelay(2000, 4000);
              this.log('group_join', 'success', `Joined configured group: ${slug}`);
            } else {
              this.log('group_join', 'skipped', `Already a member of ${slug} (no join button)`);
            }
          }
        } else {
          this.log('group_join', 'skipped', `No joinable groups found for "${searchQuery}"`);
        }
      }
    } catch (err: any) {
      this.log('group_join', 'error', `Failed to join: ${err.message}`);
      throw err;
    }
  }

  // ── Message Action ────────────────────────────────────────────────

  private async executeMessage(page: any): Promise<void> {
    // Navigate to Messenger
    await page.goto('https://www.facebook.com/messages/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Find recent conversations
    const convos = await page.$$('[data-testid="mwthreadlist-item"], [role="row"][aria-label], a[href*="/messages/t/"]');
    if (convos.length === 0) {
      this.log('message', 'skipped', 'No conversations found');
      return;
    }

    // Pick a recent conversation
    const idx = Math.floor(Math.random() * Math.min(5, convos.length));
    await convos[idx].click();
    await this.randomDelay(2000, 4000);

    // Read the last few messages for context
    let lastMessages = '';
    try {
      lastMessages = await page.evaluate(`(() => {
        const msgs = document.querySelectorAll('[data-scope="messages_table"] div[dir="auto"], [role="row"] div[dir="auto"]');
        return [...msgs].slice(-5).map(m => m.textContent?.trim()).filter(Boolean).join(' | ');
      })()`);
    } catch { /* */ }

    // Generate response
    const content = await this.generateContent('message', {
      context: `Replying to a Facebook Messenger conversation. Recent messages: "${lastMessages.slice(0, 300)}"`,
    });

    if (this.config.testMode) {
      this.log('message', 'success', `[TEST] Would message: "${content.slice(0, 100)}..."`);
      return;
    }

    // Type and send
    try {
      const msgBox = await page.$('[contenteditable="true"][role="textbox"], [aria-label*="message" i][contenteditable="true"]');
      if (msgBox) {
        await msgBox.click();
        await this.typeHumanLike(page, msgBox, content);
        await this.randomDelay(500, 1500);
        await page.keyboard.press('Enter');
        await this.randomDelay(2000, 3000);
        this.log('message', 'success', `Sent message: "${content.slice(0, 80)}..."`);
      } else {
        throw new Error('Message box not found');
      }
    } catch (err: any) {
      this.log('message', 'error', `Failed to send message: ${err.message}`);
      throw err;
    }
  }

  // ── AI Content Generation ─────────────────────────────────────────

  private async generateContent(action: ActionType, opts: { context: string }): Promise<string> {
    const { tone, language, topics, promoLink, promoFrequency, maxLength } = this.config.content;

    // Promo links ONLY in posts — never in comments, messages, or other actions
    const shouldIncludePromo = action === 'post' && promoLink && Math.random() < promoFrequency;

    const commentRules = action === 'comment' ? `
- Keep it SHORT (1-3 sentences max)
- Be authentic and add genuine value to the discussion
- NEVER include links or promotional content
- React to what the post actually says
- Sound like a real person engaging in conversation` : '';

    const promoInstructions = shouldIncludePromo ? `
- Weave this link into the post NATURALLY: ${promoLink}
- Do NOT say "check out my website" or "visit my site" — instead, reference it casually
- Examples of natural placement: "כתבתי על זה ב-${promoLink}", "יש לי סיכום מפורט ב-${promoLink}", "פרסמתי מדריך על זה — ${promoLink}"
- The link should feel like sharing a resource, NOT advertising` : '';

    const systemPrompt = `You are a social media content generator for Facebook.
Write in ${language}. Tone: ${tone}.
Topics of interest: ${topics.join(', ')}.${promoInstructions}
Rules:
- Maximum ${action === 'comment' ? Math.min(maxLength, 200) : maxLength} characters
- Sound natural and human, never robotic
- No hashtag spam (max 2-3 relevant ones for posts only)
- NEVER include hashtags in comments
- For messages: be conversational and friendly
- NEVER mention being an AI or automated
- Output ONLY the content text, nothing else${commentRules}`;

    const userPrompt = `Action: ${action}
Context: ${opts.context}

Generate the content:`;

    try {
      const response = await this.aiClient.chat({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: Math.ceil(maxLength / 2),
        temperature: 0.8,
        isSubAgent: true, // Use cheaper models
      });

      let text = response.content.trim();
      // Strip quotes if the AI wrapped it
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }

      return text.slice(0, maxLength);
    } catch (err: any) {
      this.log(action, 'error', `AI generation failed: ${err.message}`);
      throw new Error(`Content generation failed: ${err.message}`);
    }
  }

  // ── Overlay / Popup Handling ─────────────────────────────────────

  /** Dismiss Facebook overlays, popups, cookie banners, and modals that block clicks */
  private async dismissOverlays(page: any): Promise<void> {
    try {
      await page.evaluate(`(() => {
        // 1. Remove dark-mode overlays that intercept pointer events
        document.querySelectorAll('div.__fb-dark-mode').forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'absolute') {
            const rect = el.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
              el.style.pointerEvents = 'none';
            }
          }
        });

        // 2. Close cookie consent / GDPR banners
        document.querySelectorAll(
          '[data-cookiebanner="accept_button"], ' +
          'button[title="Allow all cookies"], ' +
          'button[title="אפשר את כל העוגיות"], ' +
          '[aria-label="Allow all cookies"], ' +
          '[aria-label="אפשר את כל העוגיות"], ' +
          '[data-testid="cookie-policy-manage-dialog-accept-button"]'
        ).forEach(btn => btn.click());

        // 3. Close notification/dialog popups (including notification dropdown)
        document.querySelectorAll(
          '[aria-label="Close"], [aria-label="סגור"], [aria-label="Not Now"], [aria-label="לא עכשיו"], ' +
          '[aria-label="Notifications"], [aria-label="התראות"]'
        ).forEach(btn => {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const parent = btn.closest('[role="dialog"], [role="banner"]');
            if (parent) btn.click();
          }
        });

        // 4. Close open notification/chat popover panels
        document.querySelectorAll('[role="dialog"][aria-label*="התראות"], [role="dialog"][aria-label*="Notification"]').forEach(el => {
          // Press Escape to close it
          const btn = el.querySelector('[aria-label="Close"], [aria-label="סגור"]');
          if (btn) btn.click();
        });

        // 5. Remove fullscreen overlays with high z-index
        document.querySelectorAll('div[style*="z-index"]').forEach(el => {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex);
          if (zIndex > 9000 && style.position === 'fixed') {
            const rect = el.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
              el.style.pointerEvents = 'none';
            }
          }
        });
      })()`);

      // Also press Escape to close any open popovers/panels
      await page.keyboard.press('Escape').catch(() => {});
      await new Promise(r => setTimeout(r, 500));
    } catch {
      // Non-critical — continue even if overlay dismissal fails
    }
  }

  /** Force-click an element using JavaScript (bypasses Playwright's pointer event checks) */
  private async forceClick(page: any, element: any): Promise<void> {
    try {
      // First try normal click
      await element.click({ timeout: 5000 });
    } catch {
      // If blocked by overlay, use JS click
      await page.evaluate((el: any) => el.click(), element);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async ensureSession(account: FacebookAccount): Promise<void> {
    const mgr = BrowserSessionManager.getInstance();

    // Check if existing session is still valid
    if (this.sessionId) {
      const session = mgr.getSession(this.sessionId);
      if (session && session.status === 'running') {
        // Verify page is still responsive
        const page = mgr.getPage(this.sessionId);
        if (page) {
          try {
            await page.evaluate('document.readyState');
            return; // Session is healthy
          } catch {
            this.log('system', 'info', 'Session unresponsive — recreating');
          }
        }
      }
      // Session dead — clean up
      try { await mgr.closeSession(this.sessionId); } catch { /* */ }
      this.sessionId = null;
    }

    // Create new headless session
    this.log('system', 'info', 'Creating new browser session...');
    const session = await mgr.createSession(undefined, false);
    this.sessionId = session.id;

    // Inject cookies
    const page = mgr.getPage(session.id);
    if (!page) throw new Error('Failed to get page');

    // Use m.facebook.com with iPhone UA — it authenticates reliably with cookies.
    // m.facebook.com doesn't accept cookies from www sessions.
    // Android Chrome UA — renders full post content on m.facebook.com (iPhone UA shows app download prompts)
    const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';
    await page.route('**/*', async (route: any) => {
      const headers = { ...route.request().headers(), 'user-agent': MOBILE_UA };
      await route.continue({ headers });
    });

    // Navigate first to set the domain context, then inject cookies
    await page.goto('https://m.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const context = page.context();
    await context.addCookies(toPlaywrightCookies(account.cookies));
    // Reload with cookies to establish full session
    await page.goto('https://m.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Handle "Continue as X" interstitial dialog — Facebook shows this when
    // cookies are recognized but require confirmation to complete login
    const clickedContinue = await page.evaluate(`(() => {
      // Look for "Continue" button text in buttons/links
      const buttons = document.querySelectorAll('button, a, div[role="button"], span[role="button"]');
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (/^(Continue|המשך|המשיכו)$/i.test(text)) {
          btn.click();
          return text;
        }
      }
      // Look for any element containing "Continue as" text
      const allEls = document.querySelectorAll('[role="dialog"] button, [role="dialog"] a, [data-testid*="login"] button');
      for (const el of allEls) {
        const text = (el.textContent || '').trim();
        if (/continue/i.test(text)) {
          el.click();
          return text;
        }
      }
      return null;
    })()`).catch(() => null);

    if (clickedContinue) {
      this.log('system', 'info', `Clicked "${clickedContinue}" to complete login`);
      await page.waitForTimeout(3000);
      // Re-inject cookies after login redirect
      await context.addCookies(toPlaywrightCookies(account.cookies));
    }

    // Check if we're still on a login/interstitial page and try again
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('checkpoint')) {
      this.log('system', 'error', 'Session created but login failed — stuck on login/checkpoint page');
    } else {
      // Verify we can see logged-in content on m.facebook.com
      const pageText = await page.evaluate('document.body.innerText.substring(0, 800)').catch(() => '');
      // On m.facebook.com, unauthenticated page shows "Open app" + "Log in" at top
      // Authenticated page shows news feed content or profile elements
      const loginIndicators = ['Log in to see posts', 'Log in to connect', 'Create new account'];
      const isNotLoggedIn = loginIndicators.some(indicator => pageText.includes(indicator));
      // Also check for feed/home indicators that show we ARE logged in
      const hasLoggedInContent = !isNotLoggedIn && pageText.length > 200;
      if (hasLoggedInContent) {
        this.log('system', 'info', `Browser session ready (mobile mode) and authenticated. Page starts: "${pageText.slice(0, 80)}..."`);
      } else {
        this.log('system', 'error', `Session created but NOT authenticated. Page: "${pageText.slice(0, 150)}..." — may need fresh cookies`);
      }
    }
  }

  /** Keep the browser session alive by periodically checking and refreshing cookies */
  private startKeepAlive(): void {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);

    // Every 3 minutes: verify session is alive, re-inject cookies if needed
    this.keepAliveTimer = setInterval(async () => {
      if (this.state !== 'running' && this.state !== 'paused') return;

      try {
        const page = this.getPage();
        if (!page) {
          this.log('system', 'info', 'Keep-alive: no page — will recreate on next action');
          this.sessionId = null;
          return;
        }

        // Quick health check
        await page.evaluate('1 + 1');

        // Re-inject cookies every keep-alive cycle to prevent expiry
        const account = FacebookAccountManager.getInstance().getAccount(this.config.accountId);
        if (account) {
          const context = page.context();
          await context.addCookies(toPlaywrightCookies(account.cookies));
        }
      } catch (err: any) {
        this.log('system', 'error', `Keep-alive failed: ${err.message} — session will be recreated`);
        this.sessionId = null;
      }
    }, 3 * 60_000);
  }

  private getPage(): any {
    if (!this.sessionId) return null;
    return BrowserSessionManager.getInstance().getPage(this.sessionId);
  }

  private async typeHumanLike(_page: any, element: any, text: string): Promise<void> {
    // Type character by character with random delays for human-like behavior
    for (const char of text) {
      await element.type(char, { delay: 30 + Math.random() * 80 });
      // Occasional longer pause (like thinking)
      if (Math.random() < 0.05) {
        await this.randomDelay(300, 800);
      }
    }
  }

  private async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise(r => setTimeout(r, delay));
  }

  private isWithinActiveHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const hours = isWeekend ? this.config.activeHours.weekend : this.config.activeHours.weekday;
    return hour >= hours.start && hour < hours.end;
  }

  private pickNextAction(): ActionType | null {
    const now = Date.now();
    const available: { action: ActionType; priority: number }[] = [];

    for (const action of this.config.actions) {
      const schedule = this.config.schedule[action];
      const lastTime = this.lastActionTimes.get(action) || 0;
      const dailyCount = this.dailyActionCounts.get(action) || 0;

      // Check daily limit
      if (dailyCount >= schedule.dailyLimit) continue;

      // Check interval
      const elapsed = now - lastTime;
      const intervalMs = schedule.intervalMinutes * 60_000;
      if (elapsed < intervalMs) continue;

      // Priority: actions that haven't been done recently get higher priority
      const priority = elapsed / intervalMs;
      available.push({ action, priority });
    }

    if (available.length === 0) return null;

    // Weighted random selection based on priority
    const totalPriority = available.reduce((sum, a) => sum + a.priority, 0);
    let rand = Math.random() * totalPriority;
    for (const { action, priority } of available) {
      rand -= priority;
      if (rand <= 0) return action;
    }

    return available[0].action;
  }

  private updateHourlyCount(): void {
    // Simple hourly tracking — reset if last action was more than 1 hour ago
    const now = Date.now();
    const lastAction = this.stats.lastActionAt ? new Date(this.stats.lastActionAt).getTime() : 0;
    if (now - lastAction > 3600_000) {
      this.stats.actionsThisHour = 0;
    }
  }

  private resetDailyCountsIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyResetDate !== today) {
      this.dailyResetDate = today;
      this.dailyActionCounts.clear();
    }
  }

  private freshStats(): AgentStats {
    return {
      posts: 0, comments: 0, friendRequests: 0, groupJoins: 0, messages: 0,
      errors: 0, totalActions: 0, actionsThisHour: 0, lastActionAt: null,
    };
  }

  private log(action: ActionType | 'system', status: AgentLogEntry['status'], message: string, details?: string): void {
    const entry: AgentLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      status,
      message,
      details,
    };
    this.logs.push(entry);
    // Keep last 500 entries
    if (this.logs.length > 500) {
      this.logs = this.logs.slice(-500);
    }
    logger.info(`[FB-Agent] ${action}: ${message}`, { accountId: this.config.accountId, status });
  }
}
