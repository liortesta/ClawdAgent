/**
 * LinkedIn AI Agent — autonomous LinkedIn automation with AI-generated content.
 * Follows the same architecture as FacebookAgent but adapted for LinkedIn.
 *
 * Capabilities: posting, commenting, liking, connecting, publishing articles.
 * Uses OpenRouter/Anthropic for smart content generation with professional tone.
 * Includes scheduling, very conservative safety limits, active hours, and human-like behavior.
 *
 * IMPORTANT: LinkedIn restricts accounts VERY aggressively. All rate limits and delays
 * are intentionally very conservative. The warmup period, long read simulations, and
 * random navigation are critical for account safety. LinkedIn is the strictest platform.
 */
import { BrowserSessionManager } from './session-manager.js';
import { LinkedInAccountManager, type LinkedInAccount } from './linkedin-manager.js';
import { toPlaywrightCookies, validateLinkedInCookies } from './linkedin-cookies.js';
import { AIClient } from '../../core/ai-client.js';
import logger from '../../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────

export type LinkedInActionType = 'post' | 'comment' | 'like' | 'connect' | 'article';

export interface LinkedInAgentConfig {
  /** Account ID from LinkedInAccountManager */
  accountId: string;
  /** Enabled action types */
  actions: LinkedInActionType[];
  /** Scheduling config per action */
  schedule: Record<LinkedInActionType, { intervalMinutes: number; dailyLimit: number }>;
  /** Active hours (24h format) */
  activeHours: { weekday: { start: number; end: number }; weekend: { start: number; end: number } };
  /** Content generation settings */
  content: {
    tone: string;
    language: string;
    topics: string[];
    industry: string;
    targetAccounts: string[];
    promoLink?: string;
    promoFrequency: number;
    maxLength: number;
  };
  /** Safety limits */
  safety: {
    minDelaySeconds: number;
    maxActionsPerHour: number;
    pauseOnErrorCount: number;
    pauseDurationMinutes: number;
  };
  /** Test mode — log actions but don't execute */
  testMode: boolean;
}

export interface LinkedInAgentStatus {
  accountId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  sessionId: string | null;
  currentAction: string | null;
  stats: LinkedInAgentStats;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: LinkedInAgentConfig;
}

export interface LinkedInAgentStats {
  posts: number;
  comments: number;
  likes: number;
  connections: number;
  articles: number;
  errors: number;
  totalActions: number;
  actionsThisHour: number;
  lastActionAt: string | null;
}

export interface LinkedInAgentLogEntry {
  timestamp: string;
  action: LinkedInActionType | 'system';
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
  details?: string;
}

// ── DOM Selectors ─────────────────────────────────────────────────────

const SELECTORS = {
  // Post composition
  startPost: 'button.share-box-feed-entry__trigger, button[aria-label*="Start a post"]',
  postEditor: 'div.ql-editor[contenteditable="true"], div[role="textbox"][contenteditable="true"]',
  postSubmit: 'button.share-actions__primary-action, button[aria-label="Post"]',
  // Feed interaction
  likeButton: 'button.react-button__trigger, button[aria-label*="Like"], span.reactions-react-button',
  commentButton: 'button.comment-button, button[aria-label*="Comment"]',
  commentEditor: 'div.ql-editor[data-placeholder], div[contenteditable="true"][role="textbox"]',
  commentSubmit: 'button.comments-comment-box__submit-button, button[aria-label="Post"]',
  // Connection
  connectButton: 'button[aria-label*="Connect"], button[aria-label*="Invite"]',
  connectNote: 'button[aria-label*="Add a note"]',
  connectNoteEditor: 'textarea#custom-message',
  connectSend: 'button[aria-label*="Send"]',
  // Content reading
  feedPost: '.feed-shared-update-v2, .occludable-update',
  postText: '.feed-shared-text__text-view, .update-components-text',
  authorName: '.update-components-actor__name, .feed-shared-actor__name',
  // Navigation
  feedContainer: '.scaffold-layout__main',
  // Article
  articleNewUrl: 'https://www.linkedin.com/article/new/',
  articleTitle: 'input[placeholder*="Title"], h1[contenteditable="true"]',
  articleBody: 'div.article-editor__content[contenteditable="true"], div.ql-editor',
  articlePublish: 'button:has-text("Publish"), button[aria-label*="Publish"]',
};

// ── Default Config ────────────────────────────────────────────────────

const DEFAULT_CONFIG: LinkedInAgentConfig = {
  accountId: '',
  actions: ['like', 'comment'],  // Safe defaults
  schedule: {
    post:    { intervalMinutes: 360, dailyLimit: 2 },
    comment: { intervalMinutes: 30,  dailyLimit: 10 },
    like:    { intervalMinutes: 15,  dailyLimit: 30 },
    connect: { intervalMinutes: 60,  dailyLimit: 10 },
    article: { intervalMinutes: 720, dailyLimit: 1 },
  },
  activeHours: {
    weekday: { start: 8, end: 22 },
    weekend: { start: 10, end: 23 },
  },
  content: {
    tone: 'professional and insightful',
    language: 'English',
    topics: ['AI', 'technology', 'startups'],
    industry: 'Technology',
    targetAccounts: [],
    promoLink: undefined,
    promoFrequency: 0,
    maxLength: 3000,
  },
  safety: {
    minDelaySeconds: 90,          // Very conservative
    maxActionsPerHour: 8,
    pauseOnErrorCount: 2,         // Lower tolerance
    pauseDurationMinutes: 60,
  },
  testMode: false,
};

// ── LinkedIn Agent Class ──────────────────────────────────────────────

export class LinkedInAgent {
  private static instances: Map<string, LinkedInAgent> = new Map();

  private config: LinkedInAgentConfig;
  private state: 'stopped' | 'running' | 'paused' | 'error' = 'stopped';
  private sessionId: string | null = null;
  private currentAction: string | null = null;
  private stats: LinkedInAgentStats = this.freshStats();
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private logs: LinkedInAgentLogEntry[] = [];
  private consecutiveErrors = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActionTimes: Map<LinkedInActionType, number> = new Map();
  private dailyActionCounts: Map<LinkedInActionType, number> = new Map();
  private dailyResetDate: string = '';
  private engagedPostIds: Set<string> = new Set();
  private connectedProfiles: Set<string> = new Set();
  private warmupComplete = false;
  private aiClient: AIClient;

  private constructor(config: LinkedInAgentConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiClient = new AIClient();
  }

  /** Get or create an agent for an account */
  static getAgent(accountId: string): LinkedInAgent | undefined {
    return LinkedInAgent.instances.get(accountId);
  }

  /** Create a new agent for an account */
  static createAgent(config: LinkedInAgentConfig): LinkedInAgent {
    if (LinkedInAgent.instances.has(config.accountId)) {
      throw new Error(`Agent already exists for account ${config.accountId}`);
    }
    const agent = new LinkedInAgent(config);
    LinkedInAgent.instances.set(config.accountId, agent);
    return agent;
  }

  /** Remove agent instance */
  static removeAgent(accountId: string): void {
    const agent = LinkedInAgent.instances.get(accountId);
    if (agent) {
      agent.stop().catch(() => {});
      LinkedInAgent.instances.delete(accountId);
    }
  }

  /** List all active agents */
  static listAgents(): LinkedInAgentStatus[] {
    return [...LinkedInAgent.instances.values()].map(a => a.getStatus());
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state === 'running') throw new Error('Agent is already running');

    const liMgr = LinkedInAccountManager.getInstance();
    const account = liMgr.getAccount(this.config.accountId);
    if (!account) throw new Error(`Account ${this.config.accountId} not found`);

    const validation = validateLinkedInCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot start — missing cookies: ${validation.missing.join(', ')}`);
    }

    this.state = 'running';
    this.startedAt = new Date().toISOString();
    this.consecutiveErrors = 0;
    this.stats = this.freshStats();
    this.warmupComplete = false;
    this.engagedPostIds.clear();
    this.connectedProfiles.clear();
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

    // Perform warmup before starting actions
    this.log('system', 'info', 'Starting warmup phase (5 minutes of passive browsing)');
    await this.performWarmup();

    // Start the agent loop
    this.scheduleNextAction();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
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
    logger.info('LinkedIn agent stopped', { accountId: this.config.accountId });
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

  updateConfig(updates: Partial<LinkedInAgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log('system', 'info', 'Configuration updated');
  }

  getStatus(): LinkedInAgentStatus {
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

  getLogs(limit = 50): LinkedInAgentLogEntry[] {
    return this.logs.slice(-limit);
  }

  getConfig(): LinkedInAgentConfig {
    return { ...this.config };
  }

  // ── Warmup Phase ────────────────────────────────────────────────────
  // LinkedIn users typically browse before engaging. Warm up for ~5 minutes
  // with passive scrolling to establish a natural session fingerprint.

  private async performWarmup(): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    try {
      // Navigate to feed
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.randomDelay(3000, 5000);

      // Passive browsing: scroll, read, navigate — no actions
      for (let i = 0; i < 5; i++) {
        if (this.state !== 'running') return;

        // Scroll down randomly
        const scrollAmount = 300 + Math.floor(Math.random() * 500);
        await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
        await this.randomDelay(5000, 10000); // LinkedIn users read carefully

        // Occasionally navigate to a different section
        if (i === 2) {
          await page.goto('https://www.linkedin.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await this.randomDelay(3000, 6000);
        }
        if (i === 4) {
          await page.goto('https://www.linkedin.com/mynetwork/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await this.randomDelay(3000, 6000);
        }
      }

      // Return to feed
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.randomDelay(2000, 4000);

      this.warmupComplete = true;
      this.log('system', 'info', 'Warmup phase complete — starting actions');
    } catch (err: any) {
      this.log('system', 'error', `Warmup error (non-fatal): ${err.message}`);
      this.warmupComplete = true; // Continue anyway
    }
  }

  // ── Main Agent Loop ───────────────────────────────────────────────

  private scheduleNextAction(): void {
    if (this.state !== 'running') return;

    const delay = Math.max(this.config.safety.minDelaySeconds * 1000, 5000);
    // Add randomness to the delay (90-180s instead of exactly 90s)
    const jitter = delay + Math.floor(Math.random() * delay);
    this.loopTimer = setTimeout(() => this.actionLoop(), jitter);
  }

  private async actionLoop(): Promise<void> {
    if (this.state !== 'running') return;

    try {
      // Wait for warmup to complete before taking any actions
      if (!this.warmupComplete) {
        this.log('system', 'skipped', 'Warmup not yet complete, waiting...');
        this.loopTimer = setTimeout(() => this.actionLoop(), 30_000);
        return;
      }

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
      const account = LinkedInAccountManager.getInstance().getAccount(this.config.accountId);
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

      // Random navigation before action (human-like browsing)
      await this.randomBrowse();

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

      // Auto-pause on too many consecutive errors (lower tolerance for LinkedIn)
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

  // ── Random Browse (human-like behavior) ─────────────────────────────

  private async randomBrowse(): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    try {
      // 30% chance of navigating to a different section before acting
      const rand = Math.random();
      if (rand < 0.1) {
        await page.goto('https://www.linkedin.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(3000, 6000);
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(2000, 4000);
      } else if (rand < 0.2) {
        await page.goto('https://www.linkedin.com/mynetwork/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(3000, 6000);
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(2000, 4000);
      } else if (rand < 0.3) {
        await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(2000, 5000);
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(2000, 4000);
      }

      // Always do a random scroll on the feed
      const scrollAmount = 200 + Math.floor(Math.random() * 400);
      await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
      await this.randomDelay(3000, 6000);
    } catch {
      // Non-fatal — continue with the action
    }
  }

  // ── Action Execution ──────────────────────────────────────────────

  private async executeAction(action: LinkedInActionType): Promise<void> {
    const page = this.getPage();
    if (!page) throw new Error('No active page');

    this.log(action, 'info', `Executing: ${action}`);

    switch (action) {
      case 'like':
        await this.executeLike(page);
        break;
      case 'comment':
        await this.executeComment(page);
        break;
      case 'connect':
        await this.executeConnect(page);
        break;
      case 'post':
        await this.executePost(page);
        break;
      case 'article':
        await this.executeArticle(page);
        break;
    }

    // Update stats
    this.stats.totalActions++;
    this.stats.actionsThisHour++;
    this.stats.lastActionAt = new Date().toISOString();
    this.lastActionTimes.set(action, Date.now());
    this.dailyActionCounts.set(action, (this.dailyActionCounts.get(action) || 0) + 1);

    switch (action) {
      case 'like': this.stats.likes++; break;
      case 'comment': this.stats.comments++; break;
      case 'connect': this.stats.connections++; break;
      case 'post': this.stats.posts++; break;
      case 'article': this.stats.articles++; break;
    }
  }

  // ── Like Action ─────────────────────────────────────────────────────

  private async executeLike(page: any): Promise<void> {
    // Navigate to feed
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Scroll randomly to simulate browsing
    const scrollAmount = 300 + Math.floor(Math.random() * 400);
    await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);

    // Wait 3-6s to simulate reading (LinkedIn users read more carefully)
    await this.randomDelay(3000, 6000);

    if (this.config.testMode) {
      this.log('like', 'success', '[TEST] Would like a post');
      return;
    }

    // Find like buttons that aren't already active
    try {
      const likeSelectors = SELECTORS.likeButton.split(', ');
      let likeButtons: any[] = [];

      for (const sel of likeSelectors) {
        try {
          const found = await page.$$(sel);
          if (found.length > 0) {
            likeButtons = found;
            break;
          }
        } catch { /* try next selector */ }
      }

      if (likeButtons.length === 0) {
        this.log('like', 'skipped', 'No like buttons found in feed');
        return;
      }

      // Filter out already-liked buttons
      const unliked: any[] = [];
      for (const btn of likeButtons) {
        try {
          const isActive = await btn.evaluate((el: any) => {
            // Check if button or parent indicates already liked
            const ariaPressed = el.getAttribute('aria-pressed');
            if (ariaPressed === 'true') return true;
            const ariaLabel = el.getAttribute('aria-label') || '';
            if (ariaLabel.toLowerCase().includes('unlike')) return true;
            // Check for active/selected class
            const classList = el.className || '';
            if (classList.includes('react-button--active') || classList.includes('active')) return true;
            return false;
          });
          if (!isActive) unliked.push(btn);
        } catch { /* skip this button */ }
      }

      if (unliked.length === 0) {
        this.log('like', 'skipped', 'All visible posts already liked');
        return;
      }

      // Pick a random unliked button
      const idx = Math.floor(Math.random() * Math.min(5, unliked.length));
      await unliked[idx].click();
      await this.randomDelay(1500, 3000);

      this.log('like', 'success', 'Liked a post in the feed');
    } catch (err: any) {
      this.log('like', 'error', `Failed to like: ${err.message}`);
      throw err;
    }
  }

  // ── Comment Action ──────────────────────────────────────────────────

  private async executeComment(page: any): Promise<void> {
    // Navigate to feed
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Scroll to find posts
    const scrollAmount = 300 + Math.floor(Math.random() * 400);
    await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
    await this.randomDelay(3000, 6000);

    // Find posts in the feed
    const postSelectors = SELECTORS.feedPost.split(', ');
    let posts: any[] = [];
    for (const sel of postSelectors) {
      try {
        posts = await page.$$(sel);
        if (posts.length > 0) break;
      } catch { /* try next */ }
    }

    if (posts.length === 0) {
      this.log('comment', 'skipped', 'No posts found in feed');
      return;
    }

    // Pick a random post (skip first 1-2 which may be promoted)
    const startIdx = Math.min(2, posts.length - 1);
    const postIdx = startIdx + Math.floor(Math.random() * Math.min(5, posts.length - startIdx));
    const post = posts[Math.min(postIdx, posts.length - 1)];

    // Check if we already engaged with this post
    let postId = '';
    try {
      postId = await post.evaluate((el: any) =>
        el.getAttribute('data-urn') || el.getAttribute('data-id') || el.getAttribute('id') || ''
      );
    } catch { /* */ }

    if (postId && this.engagedPostIds.has(postId)) {
      this.log('comment', 'skipped', 'Already engaged with this post');
      return;
    }

    // Read the post text for context
    let postText = '';
    try {
      const textSelectors = SELECTORS.postText.split(', ');
      for (const sel of textSelectors) {
        const textEl = await post.$(sel);
        if (textEl) {
          postText = await textEl.evaluate((el: any) => (el.textContent || '').trim());
          if (postText) break;
        }
      }
      // Fallback: read any text content
      if (!postText) {
        postText = await post.evaluate((el: any) => {
          const textDiv = el.querySelector('div[dir="ltr"], span[dir="ltr"]');
          return (textDiv?.textContent || el.textContent || '').slice(0, 500);
        });
      }
    } catch { /* */ }

    // Read the author name for context
    let authorName = '';
    try {
      const authorSelectors = SELECTORS.authorName.split(', ');
      for (const sel of authorSelectors) {
        const authorEl = await post.$(sel);
        if (authorEl) {
          authorName = await authorEl.evaluate((el: any) => (el.textContent || '').trim());
          if (authorName) break;
        }
      }
    } catch { /* */ }

    // Generate professional, insightful comment via AI
    const content = await this.generateContent('comment', {
      context: `Commenting on a LinkedIn post${authorName ? ` by ${authorName}` : ''}. The post says: "${postText.slice(0, 300)}"`,
    });

    if (this.config.testMode) {
      this.log('comment', 'success', `[TEST] Would comment: "${content.slice(0, 100)}..."`);
      return;
    }

    // Click the comment button on the post
    try {
      const commentBtnSelectors = SELECTORS.commentButton.split(', ');
      let clicked = false;
      for (const sel of commentBtnSelectors) {
        try {
          const commentBtn = await post.$(sel);
          if (commentBtn) {
            await commentBtn.click();
            clicked = true;
            break;
          }
        } catch { /* try next */ }
      }
      if (!clicked) {
        // Fallback: find any button with "Comment" in aria-label
        const btns = await post.$$('button');
        for (const btn of btns) {
          const label = await btn.evaluate((el: any) => el.getAttribute('aria-label') || el.textContent || '');
          if (/comment/i.test(label)) {
            await btn.click();
            clicked = true;
            break;
          }
        }
      }
      if (!clicked) throw new Error('Comment button not found on post');
      await this.randomDelay(2000, 3000);
    } catch (err: any) {
      this.log('comment', 'error', `Could not click comment button: ${err.message}`);
      throw err;
    }

    // Wait for comment editor and type the comment
    try {
      const editorSelectors = SELECTORS.commentEditor.split(', ');
      let commentBox: any = null;

      for (const sel of editorSelectors) {
        try {
          commentBox = await post.$(sel);
          if (commentBox) break;
        } catch { /* */ }
      }

      // Fallback: find any contenteditable within the post or last on page
      if (!commentBox) {
        const allEditable = await page.$$('[contenteditable="true"]');
        commentBox = allEditable[allEditable.length - 1] || null;
      }

      if (commentBox) {
        await commentBox.click();
        await this.randomDelay(500, 1000);
        await this.typeHumanLike(page, commentBox, content);
        await this.randomDelay(1000, 2000);

        // Try to click submit button, fallback to Enter key
        let submitted = false;
        const submitSelectors = SELECTORS.commentSubmit.split(', ');
        for (const sel of submitSelectors) {
          try {
            const submitBtn = await page.$(sel);
            if (submitBtn) {
              const isEnabled = await submitBtn.isEnabled().catch(() => true);
              if (isEnabled) {
                await submitBtn.click();
                submitted = true;
                break;
              }
            }
          } catch { /* try next */ }
        }

        if (!submitted) {
          // Fallback: press Enter to submit
          await page.keyboard.press('Enter');
        }

        await this.randomDelay(2000, 4000);

        // Track this post as engaged
        if (postId) this.engagedPostIds.add(postId);

        this.log('comment', 'success', `Commented on ${authorName || 'a post'}: "${content.slice(0, 80)}..."`);
      } else {
        throw new Error('Comment editor not found');
      }
    } catch (err: any) {
      this.log('comment', 'error', `Failed to type comment: ${err.message}`);
      throw err;
    }
  }

  // ── Connect Action ──────────────────────────────────────────────────

  private async executeConnect(page: any): Promise<void> {
    // Navigate to My Network page
    await page.goto('https://www.linkedin.com/mynetwork/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 6000);

    // Scroll a bit to load suggestions
    await page.evaluate('window.scrollBy(0, 300)');
    await this.randomDelay(2000, 4000);

    if (this.config.testMode) {
      this.log('connect', 'success', '[TEST] Would send a connection request');
      return;
    }

    // Find "Connect" buttons
    try {
      const connectSelectors = SELECTORS.connectButton.split(', ');
      let connectButtons: any[] = [];

      for (const sel of connectSelectors) {
        try {
          const found = await page.$$(sel);
          if (found.length > 0) {
            connectButtons = found;
            break;
          }
        } catch { /* try next selector */ }
      }

      if (connectButtons.length === 0) {
        // Fallback: find buttons containing "Connect" text
        const allButtons = await page.$$('button');
        for (const btn of allButtons) {
          const text = await btn.evaluate((el: any) => el.textContent?.trim() || '');
          const label = await btn.evaluate((el: any) => el.getAttribute('aria-label') || '');
          if (/^Connect$/i.test(text) || /connect/i.test(label)) {
            connectButtons.push(btn);
          }
        }
      }

      if (connectButtons.length === 0) {
        this.log('connect', 'skipped', 'No connect buttons found');
        return;
      }

      // Pick a random connect button (not the first — more natural)
      const idx = Math.floor(Math.random() * Math.min(5, connectButtons.length));
      const chosenBtn = connectButtons[idx];

      // Try to get the profile name near this button for logging
      let profileName = '';
      try {
        profileName = await chosenBtn.evaluate((el: any) => {
          const card = el.closest('[data-view-name]') || el.closest('.discover-entity-type-card') || el.parentElement?.parentElement;
          const nameEl = card?.querySelector('.discover-person-card__name, span[dir="ltr"]');
          return nameEl ? nameEl.textContent.trim() : '';
        });
      } catch { /* */ }

      // Check if we already sent a request to this profile
      if (profileName && this.connectedProfiles.has(profileName)) {
        this.log('connect', 'skipped', `Already connected with ${profileName} this session`);
        return;
      }

      await chosenBtn.click();
      await this.randomDelay(2000, 3000);

      // Check if a modal appeared asking to add a note
      try {
        const noteBtn = await page.$(SELECTORS.connectNote);
        if (noteBtn) {
          await noteBtn.click();
          await this.randomDelay(1000, 2000);

          // Generate a personalized connection note
          const note = await this.generateContent('connect', {
            context: `Sending a LinkedIn connection request${profileName ? ` to ${profileName}` : ''}. Write a brief, personalized connection note.`,
          });

          // Find the note textarea and type
          const noteEditor = await page.$(SELECTORS.connectNoteEditor);
          if (noteEditor) {
            await noteEditor.click();
            await this.typeHumanLike(page, noteEditor, note);
            await this.randomDelay(1000, 2000);
          }

          // Click send
          const sendBtn = await page.$(SELECTORS.connectSend);
          if (sendBtn) {
            await sendBtn.click();
          } else {
            // Fallback: find any "Send" button
            const sendBtns = await page.$$('button');
            for (const btn of sendBtns) {
              const text = await btn.evaluate((el: any) => el.textContent?.trim() || '');
              if (/^Send$/i.test(text)) {
                await btn.click();
                break;
              }
            }
          }

          await this.randomDelay(2000, 4000);
          if (profileName) this.connectedProfiles.add(profileName);
          this.log('connect', 'success', `Connection request sent to ${profileName || 'someone'} with note`);
        } else {
          // No note modal — connection sent directly
          await this.randomDelay(2000, 3000);
          if (profileName) this.connectedProfiles.add(profileName);
          this.log('connect', 'success', `Connection request sent to ${profileName || 'someone'}`);
        }
      } catch (err: any) {
        // Connection might have been sent even if note modal handling failed
        if (profileName) this.connectedProfiles.add(profileName);
        this.log('connect', 'success', `Connection request likely sent to ${profileName || 'someone'} (note step unclear)`);
      }
    } catch (err: any) {
      this.log('connect', 'error', `Failed to send connection request: ${err.message}`);
      throw err;
    }
  }

  // ── Post Action ─────────────────────────────────────────────────────

  private async executePost(page: any): Promise<void> {
    // Navigate to feed
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Generate professional content via AI (longer than Twitter — up to 3000 chars)
    const content = await this.generateContent('post', {
      context: 'Writing a new LinkedIn post to share on the feed. Make it professional, insightful, and add value to the network.',
    });

    if (this.config.testMode) {
      this.log('post', 'success', `[TEST] Would post: "${content.slice(0, 100)}..."`);
      return;
    }

    // Click "Start a post" button
    let composerOpened = false;
    const startPostSelectors = SELECTORS.startPost.split(', ');

    for (const sel of startPostSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          composerOpened = true;
          this.log('post', 'info', `Post composer opened via: ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    // Fallback: scan buttons for "Start a post" text
    if (!composerOpened) {
      try {
        const buttons = await page.$$('button, div[role="button"]');
        for (const btn of buttons.slice(0, 30)) {
          const text = await btn.evaluate((el: any) => el.textContent || '');
          const label = await btn.evaluate((el: any) => el.getAttribute('aria-label') || '');
          if (/start a post/i.test(text) || /start a post/i.test(label) || /create a post/i.test(label)) {
            await btn.click();
            composerOpened = true;
            this.log('post', 'info', `Post composer opened via text match: "${text.trim().slice(0, 40)}"`);
            break;
          }
        }
      } catch { /* */ }
    }

    if (!composerOpened) {
      this.log('post', 'error', 'Could not find post composer');
      throw new Error('Post composer not found');
    }

    // Wait for the post modal/editor to appear
    await this.randomDelay(2000, 3000);

    // Type content into the editor
    try {
      const editorSelectors = SELECTORS.postEditor.split(', ');
      let editor: any = null;

      for (const sel of editorSelectors) {
        try {
          editor = await page.$(sel);
          if (editor) break;
        } catch { /* */ }
      }

      // Fallback: any contenteditable textbox
      if (!editor) {
        editor = await page.$('[contenteditable="true"][role="textbox"]');
      }
      if (!editor) {
        editor = await page.$('[contenteditable="true"]');
      }

      if (editor) {
        await editor.click();
        await this.randomDelay(500, 1000);
        await this.typeHumanLike(page, editor, content);
        await this.randomDelay(1500, 3000);
      } else {
        throw new Error('Post editor not found');
      }
    } catch (err: any) {
      this.log('post', 'error', `Failed to type post: ${err.message}`);
      // Try to close the modal
      await page.keyboard.press('Escape').catch(() => {});
      throw err;
    }

    // Click "Post" button
    let posted = false;
    const submitSelectors = SELECTORS.postSubmit.split(', ');

    for (const sel of submitSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          const isEnabled = await btn.isEnabled().catch(() => true);
          if (isEnabled) {
            await btn.click();
            posted = true;
            break;
          }
        }
      } catch { /* try next */ }
    }

    // Fallback: find any Post/Publish button
    if (!posted) {
      try {
        const allBtns = await page.$$('button');
        for (const btn of allBtns) {
          const text = await btn.evaluate((el: any) => (el.textContent || '').trim());
          if (/^Post$/i.test(text) || /^Publish$/i.test(text)) {
            const isEnabled = await btn.isEnabled().catch(() => true);
            if (isEnabled) {
              await btn.click();
              posted = true;
              break;
            }
          }
        }
      } catch { /* */ }
    }

    if (posted) {
      await this.randomDelay(3000, 5000);
      this.log('post', 'success', `Posted: "${content.slice(0, 80)}..."`);
    } else {
      this.log('post', 'error', 'Failed to find submit button');
      await page.keyboard.press('Escape').catch(() => {});
      throw new Error('Submit button not found');
    }
  }

  // ── Article Action ──────────────────────────────────────────────────

  private async executeArticle(page: any): Promise<void> {
    // Generate article content via AI
    const titleContent = await this.generateContent('article', {
      context: 'Generate ONLY a catchy, professional article title (under 100 characters) for a LinkedIn article. Output just the title, nothing else.',
    });

    const articleBody = await this.generateArticleBody();

    if (this.config.testMode) {
      this.log('article', 'success', `[TEST] Would publish article: "${titleContent.slice(0, 60)}..." (${articleBody.length} chars body)`);
      return;
    }

    // Navigate to article editor
    await page.goto(SELECTORS.articleNewUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Fill title
    try {
      const titleSelectors = SELECTORS.articleTitle.split(', ');
      let titleEditor: any = null;
      for (const sel of titleSelectors) {
        try {
          titleEditor = await page.$(sel);
          if (titleEditor) break;
        } catch { /* */ }
      }

      if (!titleEditor) {
        // Fallback: first input or h1 in the editor
        titleEditor = await page.$('input[type="text"], h1[contenteditable], [placeholder*="itle"]');
      }

      if (titleEditor) {
        await titleEditor.click();
        await this.randomDelay(500, 1000);
        // Title: type faster
        await this.typeHumanLike(page, titleEditor, titleContent.slice(0, 100), true);
        await this.randomDelay(1000, 2000);
      } else {
        throw new Error('Article title editor not found');
      }
    } catch (err: any) {
      this.log('article', 'error', `Failed to fill article title: ${err.message}`);
      throw err;
    }

    // Fill body with human-like typing (faster for articles — long content)
    try {
      const bodySelectors = SELECTORS.articleBody.split(', ');
      let bodyEditor: any = null;
      for (const sel of bodySelectors) {
        try {
          bodyEditor = await page.$(sel);
          if (bodyEditor) break;
        } catch { /* */ }
      }

      if (!bodyEditor) {
        bodyEditor = await page.$('[contenteditable="true"][role="textbox"], div[contenteditable="true"]');
      }

      if (bodyEditor) {
        await bodyEditor.click();
        await this.randomDelay(500, 1000);
        // Use faster typing for article body (10-30ms per char)
        await this.typeHumanLike(page, bodyEditor, articleBody, true);
        await this.randomDelay(2000, 4000);
      } else {
        throw new Error('Article body editor not found');
      }
    } catch (err: any) {
      this.log('article', 'error', `Failed to fill article body: ${err.message}`);
      throw err;
    }

    // Click "Publish"
    let published = false;
    const publishSelectors = SELECTORS.articlePublish.split(', ');

    for (const sel of publishSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          published = true;
          break;
        }
      } catch { /* try next */ }
    }

    // Fallback: find Publish button by text
    if (!published) {
      try {
        const allBtns = await page.$$('button');
        for (const btn of allBtns) {
          const text = await btn.evaluate((el: any) => (el.textContent || '').trim());
          if (/publish/i.test(text)) {
            await btn.click();
            published = true;
            break;
          }
        }
      } catch { /* */ }
    }

    // LinkedIn may show a publish confirmation modal
    if (published) {
      await this.randomDelay(2000, 3000);
      // Look for a final "Publish" confirmation button in a modal
      try {
        const confirmBtns = await page.$$('button');
        for (const btn of confirmBtns) {
          const text = await btn.evaluate((el: any) => (el.textContent || '').trim());
          if (/^Publish$/i.test(text)) {
            await btn.click();
            break;
          }
        }
      } catch { /* best effort */ }

      await this.randomDelay(3000, 5000);
      this.log('article', 'success', `Published article: "${titleContent.slice(0, 60)}..."`);
    } else {
      this.log('article', 'error', 'Failed to find publish button');
      throw new Error('Publish button not found');
    }
  }

  // ── AI Content Generation ─────────────────────────────────────────

  private async generateContent(action: LinkedInActionType, opts: { context: string }): Promise<string> {
    const { tone, language, topics, industry, promoLink, promoFrequency, maxLength } = this.config.content;

    const shouldIncludePromo = promoLink && Math.random() < promoFrequency;

    let maxChars = maxLength;
    // Action-specific length limits
    if (action === 'comment') maxChars = 300;
    if (action === 'connect') maxChars = 200;

    const systemPrompt = `You are a professional LinkedIn content creator.
Write in ${language}. Tone: ${tone}.
Industry: ${industry}. Topics of interest: ${topics.join(', ')}.
${shouldIncludePromo ? `Include this promotional link naturally: ${promoLink}` : ''}
Rules:
- Maximum ${maxChars} characters
- Sound natural, professional, and genuinely insightful
- For comments: be brief (under 300 chars), add genuine value, ask thoughtful questions
- For posts: share industry insights, lessons learned, thought leadership. Include 2-3 relevant hashtags at the end
- For articles: well-structured, with clear sections and key takeaways
- For connection notes: brief, personalized, mention mutual interests or industry
- Use professional language, avoid slang and overly casual phrases
- NEVER mention being an AI, automated, or a bot
- NEVER use hashtags in comments — only in posts
- Output ONLY the content text, nothing else`;

    const userPrompt = `Action: ${action}
Context: ${opts.context}

Generate the content:`;

    try {
      const response = await this.aiClient.chat({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: Math.ceil(maxChars / 2),
        temperature: 0.8,
        isSubAgent: true,
      });

      let text = response.content.trim();
      // Strip quotes if the AI wrapped it
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }

      return text.slice(0, maxChars);
    } catch (err: any) {
      this.log(action, 'error', `AI generation failed: ${err.message}`);
      throw new Error(`Content generation failed: ${err.message}`);
    }
  }

  /** Generate a full article body (500-1500 words) with structured sections */
  private async generateArticleBody(): Promise<string> {
    const { tone, language, topics, industry } = this.config.content;

    const systemPrompt = `You are a professional LinkedIn article writer.
Write in ${language}. Tone: ${tone}.
Industry: ${industry}. Topics: ${topics.join(', ')}.
Rules:
- Write 500-1500 words
- Use clear paragraphs and sections
- Include key takeaways or actionable insights
- Sound authoritative yet approachable
- Use professional language
- NEVER mention being an AI
- Output ONLY the article body text (no title — that's separate)`;

    const userPrompt = `Write a LinkedIn article body about a relevant topic in ${industry}.
Focus on: ${topics.join(', ')}.
Make it insightful with practical value for professionals in this space.

Generate the article body:`;

    try {
      const response = await this.aiClient.chat({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 2000,
        temperature: 0.7,
        isSubAgent: true,
      });

      let text = response.content.trim();
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }

      return text;
    } catch (err: any) {
      this.log('article', 'error', `AI article generation failed: ${err.message}`);
      throw new Error(`Article content generation failed: ${err.message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async ensureSession(account: LinkedInAccount): Promise<void> {
    const mgr = BrowserSessionManager.getInstance();

    // Check if existing session is still valid
    if (this.sessionId) {
      const session = mgr.getSession(this.sessionId);
      if (session && session.status === 'running') return;
      this.sessionId = null;
    }

    // Create new headless session
    const session = await mgr.createSession(undefined, false);
    this.sessionId = session.id;

    // Inject cookies
    const page = mgr.getPage(session.id);
    if (!page) throw new Error('Failed to get page');

    await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const context = page.context();
    await context.addCookies(toPlaywrightCookies(account.cookies));
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);
  }

  private getPage(): any {
    if (!this.sessionId) return null;
    return BrowserSessionManager.getInstance().getPage(this.sessionId);
  }

  private async typeHumanLike(_page: any, element: any, text: string, fast = false): Promise<void> {
    // Type character by character with random delays for human-like behavior
    // LinkedIn typing: 30-100ms per character with occasional long pauses
    // Fast mode (for articles): 10-30ms per character
    const minDelay = fast ? 10 : 30;
    const maxDelay = fast ? 30 : 100;

    for (const char of text) {
      await element.type(char, { delay: minDelay + Math.random() * (maxDelay - minDelay) });
      // 5% chance of a thinking pause (300-800ms)
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

  private pickNextAction(): LinkedInActionType | null {
    const now = Date.now();
    const available: { action: LinkedInActionType; priority: number }[] = [];

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
      this.engagedPostIds.clear();       // Reset daily to avoid stale IDs
      this.connectedProfiles.clear();     // Reset daily
    }
  }

  private freshStats(): LinkedInAgentStats {
    return {
      posts: 0, comments: 0, likes: 0, connections: 0, articles: 0,
      errors: 0, totalActions: 0, actionsThisHour: 0, lastActionAt: null,
    };
  }

  private log(action: LinkedInActionType | 'system', status: LinkedInAgentLogEntry['status'], message: string, details?: string): void {
    const entry: LinkedInAgentLogEntry = {
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
    logger.info(`[LI-Agent] ${action}: ${message}`, { accountId: this.config.accountId, status });
  }
}
