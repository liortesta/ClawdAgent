/**
 * TikTok AI Agent — autonomous TikTok engagement with AI-generated comments.
 * Follows the same architecture as TwitterAgent but adapted for TikTok.
 *
 * Capabilities: liking videos, commenting, following creators, saving content.
 * Uses AI for smart comment generation with configurable tone.
 * Includes scheduling, very conservative safety limits, and human-like behavior.
 *
 * IMPORTANT: TikTok bans MORE aggressively than Twitter. All limits are strict.
 * The warmup period (10 min) and random scrolling are critical for account safety.
 */
import { BrowserSessionManager } from './session-manager.js';
import { TikTokAccountManager, type TikTokAccount, dismissTikTokBanners } from './tiktok-manager.js';
import { toPlaywrightCookies, validateTikTokCookies } from './tiktok-cookies.js';
import { AIClient } from '../../core/ai-client.js';
import logger from '../../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────

export type TikTokActionType = 'like' | 'comment' | 'follow' | 'save';

export interface TikTokAgentConfig {
  accountId: string;
  actions: TikTokActionType[];
  schedule: Record<TikTokActionType, { intervalMinutes: number; dailyLimit: number }>;
  activeHours: { weekday: { start: number; end: number }; weekend: { start: number; end: number } };
  content: {
    tone: string;
    language: string;
    topics: string[];
    hashtags: string[];
    targetAccounts: string[];
    maxLength: number;
  };
  safety: {
    minDelaySeconds: number;
    maxActionsPerHour: number;
    pauseOnErrorCount: number;
    pauseDurationMinutes: number;
  };
  testMode: boolean;
}

export interface TikTokAgentStatus {
  accountId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  sessionId: string | null;
  currentAction: string | null;
  stats: TikTokAgentStats;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: TikTokAgentConfig;
}

export interface TikTokAgentStats {
  likes: number;
  comments: number;
  follows: number;
  saves: number;
  errors: number;
  totalActions: number;
  actionsThisHour: number;
  lastActionAt: string | null;
}

export interface TikTokAgentLogEntry {
  timestamp: string;
  action: TikTokActionType | 'system';
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
  details?: string;
}

// ── DOM Selectors ─────────────────────────────────────────────────────

const SELECTORS = {
  // Video items
  videoItem: '[data-e2e="recommend-list-item-container"]',
  videoPlayer: 'video',
  // Engagement buttons
  likeButton: '[data-e2e="like-icon"]',
  commentButton: '[data-e2e="comment-icon"]',
  shareButton: '[data-e2e="share-icon"]',
  // Comment UI
  commentInput: '[data-e2e="comment-input"]',
  commentPost: '[data-e2e="comment-post"]',
  // Follow
  followButton: '[data-e2e="follow-button"]',
  // Video metadata
  videoDesc: '[data-e2e="video-desc"]',
  authorName: '[data-e2e="video-author-uniqueid"]',
  authorAvatar: '[data-e2e="video-avatar"]',
  // Login detection
  navUser: '[data-e2e="nav-user"]',
  profileIcon: '[data-e2e="profile-icon"]',
  loginButton: '[data-e2e="login-button"]',
  // Save / Bookmark (within share menu)
  saveButton: '[data-e2e="video-bookmark"]',
  bookmarkIcon: '[data-e2e="bookmark-icon"]',
};

// ── Default Configuration ─────────────────────────────────────────────

const DEFAULT_CONFIG: TikTokAgentConfig = {
  accountId: '',
  actions: ['like', 'follow'],
  schedule: {
    like:    { intervalMinutes: 15, dailyLimit: 30 },
    comment: { intervalMinutes: 60, dailyLimit: 5 },
    follow:  { intervalMinutes: 30, dailyLimit: 10 },
    save:    { intervalMinutes: 20, dailyLimit: 20 },
  },
  activeHours: {
    weekday: { start: 8, end: 22 },
    weekend: { start: 10, end: 23 },
  },
  content: {
    tone: 'AI enthusiast, authentic and friendly',
    language: 'English',
    topics: ['AI', 'technology'],
    hashtags: ['#AI', '#Tech'],
    targetAccounts: [],
    maxLength: 150,
  },
  safety: {
    minDelaySeconds: 180,
    maxActionsPerHour: 5,
    pauseOnErrorCount: 2,
    pauseDurationMinutes: 120,
  },
  testMode: false,
};

const NAV_SECTIONS = [
  'https://www.tiktok.com/foryou',
  'https://www.tiktok.com/explore',
  'https://www.tiktok.com/following',
];

// ── TikTok Agent Class ───────────────────────────────────────────────

export class TikTokAgent {
  private static instances: Map<string, TikTokAgent> = new Map();

  private config: TikTokAgentConfig;
  private state: 'stopped' | 'running' | 'paused' | 'error' = 'stopped';
  private sessionId: string | null = null;
  private currentAction: string | null = null;
  private stats: TikTokAgentStats = this.freshStats();
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private logs: TikTokAgentLogEntry[] = [];
  private consecutiveErrors = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActionTimes: Map<TikTokActionType, number> = new Map();
  private dailyActionCounts: Map<TikTokActionType, number> = new Map();
  private dailyResetDate = '';
  private engagedVideoIds: Set<string> = new Set();
  private followedHandles: Set<string> = new Set();
  private aiClient: AIClient;

  private constructor(config: TikTokAgentConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiClient = new AIClient();
  }

  static getAgent(accountId: string): TikTokAgent | undefined {
    return TikTokAgent.instances.get(accountId);
  }

  static createAgent(config: TikTokAgentConfig): TikTokAgent {
    if (TikTokAgent.instances.has(config.accountId)) {
      throw new Error(`Agent already exists for account ${config.accountId}`);
    }
    const agent = new TikTokAgent(config);
    TikTokAgent.instances.set(config.accountId, agent);
    return agent;
  }

  static removeAgent(accountId: string): void {
    const agent = TikTokAgent.instances.get(accountId);
    if (agent) {
      agent.stop().catch(() => {});
      TikTokAgent.instances.delete(accountId);
    }
  }

  static listAgents(): TikTokAgentStatus[] {
    return [...TikTokAgent.instances.values()].map(a => a.getStatus());
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state === 'running') throw new Error('Agent is already running');

    const tiktokMgr = TikTokAccountManager.getInstance();
    const account = tiktokMgr.getAccount(this.config.accountId);
    if (!account) throw new Error(`Account ${this.config.accountId} not found`);

    const validation = validateTikTokCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot start — missing cookies: ${validation.missing.join(', ')}`);
    }

    this.state = 'running';
    this.startedAt = new Date().toISOString();
    this.consecutiveErrors = 0;
    this.stats = this.freshStats();
    this.engagedVideoIds.clear();
    this.followedHandles.clear();
    this.log('system', 'info', `Agent started for account "${account.name}" (${account.handle || 'no handle'})`);

    try {
      await this.ensureSession(account);
      this.log('system', 'info', `Browser session ready: ${this.sessionId}`);
    } catch (err: unknown) {
      this.state = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.log('system', 'error', `Failed to launch browser: ${msg}`);
      throw err;
    }

    this.startWarmup();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    if (this.sessionId) {
      try {
        const mgr = BrowserSessionManager.getInstance();
        await mgr.closeSession(this.sessionId);
      } catch { /* best effort */ }
      this.sessionId = null;
    }

    this.log('system', 'info', 'Agent stopped');
    logger.info('TikTok agent stopped', { accountId: this.config.accountId });
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

  updateConfig(updates: Partial<TikTokAgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log('system', 'info', 'Configuration updated');
  }

  getStatus(): TikTokAgentStatus {
    let lastAction: string | null = null;
    let lastActionTime: string | null = this.stats.lastActionAt;
    let latestTime = 0;
    for (const [action, time] of this.lastActionTimes) {
      if (time > latestTime) {
        latestTime = time;
        lastAction = action;
      }
    }

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

  getLogs(limit = 50): TikTokAgentLogEntry[] {
    return this.logs.slice(-limit);
  }

  getConfig(): TikTokAgentConfig {
    return { ...this.config };
  }

  // ── Warmup Phase ────────────────────────────────────────────────────
  // 10 minutes: only scroll and watch videos to look like a real user

  private startWarmup(): void {
    this.log('system', 'info', 'Starting 10-minute warmup phase (scroll-only, no actions)');
    this.performWarmupScroll();
  }

  private async performWarmupScroll(): Promise<void> {
    if (this.state !== 'running') return;

    const page = this.getPage();
    if (!page) {
      this.scheduleNextAction();
      return;
    }

    try {
      // Scroll down to next video (TikTok is vertical video feed)
      await page.evaluate('window.scrollBy(0, window.innerHeight)');
      // Simulate watching: 5-15 seconds per video
      await this.randomDelay(5000, 15000);

      // Occasionally navigate to a different section
      if (Math.random() < 0.2) {
        const section = NAV_SECTIONS[Math.floor(Math.random() * NAV_SECTIONS.length)];
        await page.goto(section, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(3000, 6000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('system', 'error', `Warmup scroll error: ${msg}`);
    }

    // 10-minute warmup
    const elapsedMs = Date.now() - new Date(this.startedAt!).getTime();
    if (elapsedMs >= 10 * 60_000) {
      this.log('system', 'info', 'Warmup complete — beginning action loop');
      this.scheduleNextAction();
    } else {
      const nextDelay = 15_000 + Math.floor(Math.random() * 20_000);
      this.loopTimer = setTimeout(() => this.performWarmupScroll(), nextDelay);
    }
  }

  // ── Main Agent Loop ───────────────────────────────────────────────

  private scheduleNextAction(): void {
    if (this.state !== 'running') return;

    const baseDelay = this.config.safety.minDelaySeconds * 1000;
    const delay = baseDelay + Math.floor(Math.random() * baseDelay * 2);
    this.log('system', 'info', `Next action scheduled in ${Math.round(delay / 1000)}s`);
    this.loopTimer = setTimeout(() => this.actionLoop(), delay);
  }

  private async actionLoop(): Promise<void> {
    if (this.state !== 'running') return;

    try {
      if (!this.isWithinActiveHours()) {
        this.log('system', 'skipped', 'Outside active hours, sleeping 5 min');
        this.loopTimer = setTimeout(() => this.actionLoop(), 5 * 60_000);
        return;
      }

      this.updateHourlyCount();
      if (this.stats.actionsThisHour >= this.config.safety.maxActionsPerHour) {
        this.log('system', 'skipped', `Hourly limit reached (${this.stats.actionsThisHour}/${this.config.safety.maxActionsPerHour})`);
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }

      this.resetDailyCountsIfNeeded();

      const action = this.pickNextAction();
      if (!action) {
        this.log('system', 'skipped', 'No actions available (all at daily limit or not ready)');
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }

      const account = TikTokAccountManager.getInstance().getAccount(this.config.accountId);
      if (!account) {
        this.state = 'error';
        this.lastError = 'Account deleted';
        return;
      }
      await this.ensureSession(account);

      const page = this.getPage();
      if (!page) {
        this.log('system', 'error', 'Browser page not available — recreating session');
        this.sessionId = null;
        await this.ensureSession(account);
        if (!this.getPage()) throw new Error('Failed to create browser session');
      } else {
        try {
          await page.evaluate('1 + 1');
        } catch {
          this.log('system', 'error', 'Browser unresponsive — recreating session');
          this.sessionId = null;
          await this.ensureSession(account);
        }
      }

      // Simulate browsing before action
      await this.simulateBrowsing();

      this.currentAction = action;
      await this.executeAction(action);
      this.currentAction = null;
      this.consecutiveErrors = 0;

      // Random navigation after action (human-like)
      if (Math.random() < 0.15) {
        const section = NAV_SECTIONS[Math.floor(Math.random() * NAV_SECTIONS.length)];
        const navPage = this.getPage();
        if (navPage) {
          await navPage.goto(section, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await this.randomDelay(5000, 10000);
        }
      }

    } catch (err: unknown) {
      this.consecutiveErrors++;
      this.stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error && err.stack ? `\n${err.stack.split('\n').slice(0, 5).join('\n')}` : '';
      this.lastError = msg;
      this.currentAction = null;
      this.log('system', 'error', `Action loop error: ${msg}`, stack);

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

    this.scheduleNextAction();
  }

  // ── Browsing Simulation ─────────────────────────────────────────────

  private async simulateBrowsing(): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    try {
      // Navigate to For You page if not already there
      const currentUrl = page.url();
      if (!currentUrl.includes('tiktok.com')) {
        await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(3000, 6000);
      }

      // Scroll through 1-3 videos (like watching)
      const scrollCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate('window.scrollBy(0, window.innerHeight)');
        await this.randomDelay(3000, 8000);
      }
    } catch {
      // Non-critical
    }
  }

  // ── Action Execution ──────────────────────────────────────────────

  private async executeAction(action: TikTokActionType): Promise<void> {
    const page = this.getPage();
    if (!page) throw new Error('No active page');

    this.log(action, 'info', `Executing: ${action}`);

    switch (action) {
      case 'like':    await this.executeLike(page); break;
      case 'comment': await this.executeComment(page); break;
      case 'follow':  await this.executeFollow(page); break;
      case 'save':    await this.executeSave(page); break;
    }

    this.stats.totalActions++;
    this.stats.actionsThisHour++;
    this.stats.lastActionAt = new Date().toISOString();
    this.lastActionTimes.set(action, Date.now());
    this.dailyActionCounts.set(action, (this.dailyActionCounts.get(action) || 0) + 1);

    switch (action) {
      case 'like':    this.stats.likes++; break;
      case 'comment': this.stats.comments++; break;
      case 'follow':  this.stats.follows++; break;
      case 'save':    this.stats.saves++; break;
    }
  }

  // ── Like Action ─────────────────────────────────────────────────────

  private async executeLike(page: unknown): Promise<void> {
    const p = page as any;
    const targetUrl = this.pickFeedUrl();
    await p.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 6000);

    // Scroll to a random video
    const scrollCount = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < scrollCount; i++) {
      await p.evaluate('window.scrollBy(0, window.innerHeight)');
      await this.randomDelay(3000, 6000);
    }

    // Find like buttons
    const likeButtons = await p.$$(SELECTORS.likeButton);
    if (likeButtons.length === 0) {
      this.log('like', 'skipped', 'No like buttons found in feed');
      return;
    }

    if (this.config.testMode) {
      this.log('like', 'success', `[TEST] Would like a video (${likeButtons.length} available)`);
      return;
    }

    // Pick a random like button (skip first — often already visible/engaged)
    const startIdx = Math.min(1, likeButtons.length - 1);
    const idx = startIdx + Math.floor(Math.random() * Math.max(1, likeButtons.length - startIdx));
    const targetBtn = likeButtons[Math.min(idx, likeButtons.length - 1)];

    try {
      const videoId = await this.getVideoIdFromButton(targetBtn);
      if (videoId && this.engagedVideoIds.has(`like:${videoId}`)) {
        this.log('like', 'skipped', 'Already liked this video in current session');
        return;
      }

      // Check if already liked (button color/state)
      const isLiked = await targetBtn.evaluate((el: any) => {
        return el.classList.contains('liked') || el.getAttribute('fill') === 'rgb(254, 44, 85)' ||
               el.closest('button')?.classList.contains('css-1ok4pbl-ButtonActionItem');
      }).catch(() => false);

      if (isLiked) {
        this.log('like', 'skipped', 'Video already liked');
        return;
      }

      await targetBtn.click();
      await this.randomDelay(1000, 2000);

      if (videoId) this.engagedVideoIds.add(`like:${videoId}`);
      this.log('like', 'success', 'Liked a video');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('like', 'error', `Failed to like: ${msg}`);
      throw err;
    }
  }

  // ── Comment Action ────────────────────────────────────────────────

  private async executeComment(page: unknown): Promise<void> {
    const p = page as any;
    const targetUrl = this.pickFeedUrl();
    await p.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 6000);

    // Scroll to find videos with content
    const scrollCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < scrollCount; i++) {
      await p.evaluate('window.scrollBy(0, window.innerHeight)');
      await this.randomDelay(4000, 8000);
    }

    // Read video description for context
    let videoContext = '';
    try {
      const descEls = await p.$$(SELECTORS.videoDesc);
      if (descEls.length > 0) {
        const randomDesc = descEls[Math.floor(Math.random() * descEls.length)];
        videoContext = await randomDesc.evaluate((el: any) => el.textContent || '');
      }
    } catch { /* use empty context */ }

    if (!videoContext) {
      videoContext = `A TikTok video about ${this.config.content.topics[Math.floor(Math.random() * this.config.content.topics.length)]}`;
    }

    // Generate comment via AI
    const commentText = await this.generateContent('comment', {
      context: `Commenting on a TikTok video. Video description: "${videoContext.slice(0, 200)}"`,
    });

    if (this.config.testMode) {
      this.log('comment', 'success', `[TEST] Would comment: "${commentText.slice(0, 80)}..." on: "${videoContext.slice(0, 60)}..."`);
      return;
    }

    try {
      // Click comment icon to open comment panel
      const commentButtons = await p.$$(SELECTORS.commentButton);
      if (commentButtons.length === 0) {
        this.log('comment', 'skipped', 'No comment buttons found');
        return;
      }

      const targetBtn = commentButtons[Math.floor(Math.random() * Math.min(3, commentButtons.length))];
      await targetBtn.click();
      await this.randomDelay(2000, 4000);

      // Find comment input
      const commentInput = await p.$(SELECTORS.commentInput);
      if (!commentInput) {
        // Try fallback selectors
        const fallbackInput = await p.$('div[contenteditable="true"][data-e2e="comment-input"]') ||
                              await p.$('div[contenteditable="true"]');
        if (!fallbackInput) {
          this.log('comment', 'error', 'Comment input not found');
          await p.keyboard.press('Escape').catch(() => {});
          throw new Error('Comment input not found');
        }

        await fallbackInput.click();
        await this.typeHumanLike(p, fallbackInput, commentText);
      } else {
        await commentInput.click();
        await this.typeHumanLike(p, commentInput, commentText);
      }

      await this.randomDelay(1000, 2000);

      // Click post button
      const postBtn = await p.$(SELECTORS.commentPost);
      if (!postBtn) {
        // Try submitting with Enter
        await p.keyboard.press('Enter');
      } else {
        await postBtn.click();
      }

      await this.randomDelay(2000, 4000);

      this.log('comment', 'success', `Commented: "${commentText.slice(0, 80)}..." on: "${videoContext.slice(0, 60)}..."`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('comment', 'error', `Failed to comment: ${msg}`);
      await p.keyboard.press('Escape').catch(() => {});
      throw err;
    }
  }

  // ── Follow Action ───────────────────────────────────────────────────

  private async executeFollow(page: unknown): Promise<void> {
    const p = page as any;
    const { targetAccounts } = this.config.content;
    let targetUrl: string;

    if (targetAccounts.length > 0 && Math.random() < 0.6) {
      // Visit a target account's profile to follow them or their followers
      const handle = targetAccounts[Math.floor(Math.random() * targetAccounts.length)];
      const cleanHandle = handle.replace(/^@/, '');
      targetUrl = `https://www.tiktok.com/@${cleanHandle}`;
    } else {
      // Browse For You page and follow interesting creators
      targetUrl = 'https://www.tiktok.com/foryou';
    }

    await p.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 6000);

    // Scroll a bit
    await p.evaluate('window.scrollBy(0, 300)');
    await this.randomDelay(2000, 4000);

    if (this.config.testMode) {
      this.log('follow', 'success', `[TEST] Would follow someone from ${targetUrl}`);
      return;
    }

    // Find follow buttons
    const followButtons = await p.$$(SELECTORS.followButton);
    if (followButtons.length === 0) {
      this.log('follow', 'skipped', 'No follow buttons found');
      return;
    }

    // Pick a random follow button
    const idx = Math.floor(Math.random() * Math.min(5, followButtons.length));
    const btn = followButtons[Math.min(idx, followButtons.length - 1)];

    try {
      // Try to get the creator handle
      let handle = '';
      try {
        const authorEl = await p.$(SELECTORS.authorName);
        if (authorEl) {
          handle = await authorEl.evaluate((el: any) => el.textContent || '');
        }
      } catch { /* non-critical */ }

      if (handle && this.followedHandles.has(handle)) {
        this.log('follow', 'skipped', `Already followed @${handle} this session`);
        return;
      }

      // Check if already following
      const btnText = await btn.evaluate((el: any) => el.textContent || '');
      if (btnText.toLowerCase().includes('following')) {
        this.log('follow', 'skipped', 'Already following this user');
        return;
      }

      await btn.click();
      await this.randomDelay(1500, 3000);

      if (handle) this.followedHandles.add(handle);
      this.log('follow', 'success', `Followed${handle ? ` @${handle}` : ' a creator'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('follow', 'error', `Failed to follow: ${msg}`);
      throw err;
    }
  }

  // ── Save / Bookmark Action ──────────────────────────────────────────

  private async executeSave(page: unknown): Promise<void> {
    const p = page as any;
    const targetUrl = this.pickFeedUrl();
    await p.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 6000);

    // Scroll to random video
    const scrollCount = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < scrollCount; i++) {
      await p.evaluate('window.scrollBy(0, window.innerHeight)');
      await this.randomDelay(3000, 6000);
    }

    if (this.config.testMode) {
      this.log('save', 'success', '[TEST] Would save/bookmark a video');
      return;
    }

    try {
      // Try direct bookmark button first
      let saveBtn = await p.$(SELECTORS.saveButton) || await p.$(SELECTORS.bookmarkIcon);

      if (!saveBtn) {
        // Try clicking share to open the share menu
        const shareButtons = await p.$$(SELECTORS.shareButton);
        if (shareButtons.length > 0) {
          const targetShare = shareButtons[Math.floor(Math.random() * Math.min(3, shareButtons.length))];
          await targetShare.click();
          await this.randomDelay(1500, 3000);

          // Look for save/bookmark option in share menu
          saveBtn = await p.$('[data-e2e="video-bookmark"]') ||
                    await p.$('button:has-text("Save video")') ||
                    await p.$('button:has-text("Favorites")');
        }
      }

      if (!saveBtn) {
        this.log('save', 'skipped', 'Save/bookmark button not found');
        await p.keyboard.press('Escape').catch(() => {});
        return;
      }

      await saveBtn.click();
      await this.randomDelay(1500, 3000);

      // Dismiss any open menus
      await p.keyboard.press('Escape').catch(() => {});

      this.log('save', 'success', 'Saved/bookmarked a video');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('save', 'error', `Failed to save: ${msg}`);
      await p.keyboard.press('Escape').catch(() => {});
      throw err;
    }
  }

  // ── AI Content Generation ─────────────────────────────────────────

  private async generateContent(action: TikTokActionType, opts: { context: string }): Promise<string> {
    const { tone, language, topics, maxLength } = this.config.content;

    const systemPrompt = `You are a real person commenting on TikTok.
Write in ${language}. Tone: ${tone}.
Topics of interest: ${topics.join(', ')}.
Rules:
- Maximum ${maxLength} characters (TikTok comments should be short and punchy)
- Sound like a real TikTok user — casual, authentic, engaging
- For comments: react to the video content, add value, ask questions, share genuine thoughts
- Use TikTok-style language (short, emoji-friendly, but not excessive)
- You may use 1-2 emojis naturally (fire, 100, clap, etc.) but don't overdo it
- NEVER mention being an AI, bot, or automated
- NEVER use generic comments like "Great video!" or "Nice content!"
- Be specific and show you actually watched/understood the content
- Output ONLY the comment text, nothing else — no quotes, no labels`;

    const userPrompt = `Action: ${action}
Context: ${opts.context}

Generate the content:`;

    try {
      const response = await this.aiClient.chat({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: Math.ceil(maxLength / 2),
        temperature: 0.85,
        isSubAgent: true,
      });

      let text = response.content.trim();
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }

      return text.slice(0, maxLength);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(action, 'error', `AI generation failed: ${msg}`);
      throw new Error(`Content generation failed: ${msg}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async ensureSession(account: TikTokAccount): Promise<void> {
    const mgr = BrowserSessionManager.getInstance();

    if (this.sessionId) {
      const session = mgr.getSession(this.sessionId);
      if (session && session.status === 'running') return;
      this.sessionId = null;
    }

    const session = await mgr.createSession(undefined, false);
    this.sessionId = session.id;

    const page = mgr.getPage(session.id);
    if (!page) throw new Error('Failed to get page');

    // Inject cookies BEFORE navigation (TikTok fingerprinting)
    const context = page.context();
    await context.addCookies(toPlaywrightCookies(account.cookies));
    await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Dismiss GDPR cookie consent + notification banners (shadow DOM)
    await dismissTikTokBanners(page);
  }

  private getPage(): any {
    if (!this.sessionId) return null;
    return BrowserSessionManager.getInstance().getPage(this.sessionId);
  }

  private pickFeedUrl(): string {
    const { targetAccounts } = this.config.content;

    // 30% chance to visit a target account
    if (targetAccounts.length > 0 && Math.random() < 0.3) {
      const handle = targetAccounts[Math.floor(Math.random() * targetAccounts.length)];
      return `https://www.tiktok.com/@${handle.replace(/^@/, '')}`;
    }

    // 15% chance to visit explore
    if (Math.random() < 0.15) {
      return 'https://www.tiktok.com/explore';
    }

    return 'https://www.tiktok.com/foryou';
  }

  private async getVideoIdFromButton(button: any): Promise<string | null> {
    try {
      const videoContainer = await button.evaluateHandle((el: any) =>
        el.closest('[data-e2e="recommend-list-item-container"]') || el.closest('div[class*="DivItemContainer"]')
      );
      if (videoContainer) {
        const link = await videoContainer.$('a[href*="/video/"]');
        if (link) {
          const href = await link.evaluate((el: any) => el.getAttribute('href') || '');
          const match = href.match(/\/video\/(\d+)/);
          if (match) return match[1];
        }
        // Fallback: hash the description
        const text = await videoContainer.evaluate((el: any) => (el.textContent || '').slice(0, 200));
        return text ? `text:${this.simpleHash(text)}` : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async typeHumanLike(_page: unknown, element: any, text: string): Promise<void> {
    for (const char of text) {
      await element.type(char, { delay: 30 + Math.random() * 90 });
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

  private pickNextAction(): TikTokActionType | null {
    const now = Date.now();
    const available: { action: TikTokActionType; priority: number }[] = [];

    for (const action of this.config.actions) {
      const schedule = this.config.schedule[action];
      const lastTime = this.lastActionTimes.get(action) || 0;
      const dailyCount = this.dailyActionCounts.get(action) || 0;

      if (dailyCount >= schedule.dailyLimit) continue;

      const elapsed = now - lastTime;
      const intervalMs = schedule.intervalMinutes * 60_000;
      if (elapsed < intervalMs) continue;

      const priority = elapsed / intervalMs;
      available.push({ action, priority });
    }

    if (available.length === 0) return null;

    const totalPriority = available.reduce((sum, a) => sum + a.priority, 0);
    let rand = Math.random() * totalPriority;
    for (const { action, priority } of available) {
      rand -= priority;
      if (rand <= 0) return action;
    }

    return available[0].action;
  }

  private updateHourlyCount(): void {
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

  private freshStats(): TikTokAgentStats {
    return {
      likes: 0, comments: 0, follows: 0, saves: 0,
      errors: 0, totalActions: 0, actionsThisHour: 0, lastActionAt: null,
    };
  }

  private log(action: TikTokActionType | 'system', status: TikTokAgentLogEntry['status'], message: string, details?: string): void {
    const entry: TikTokAgentLogEntry = { timestamp: new Date().toISOString(), action, status, message, details };
    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs = this.logs.slice(-500);
    }
    logger.info(`[TikTok-Agent] ${action}: ${message}`, { accountId: this.config.accountId, status });
  }
}
