/**
 * Twitter/X AI Agent — autonomous Twitter automation with AI-generated content.
 * Follows the same architecture as FacebookAgent but adapted for X/Twitter.
 *
 * Capabilities: tweeting, replying, liking, retweeting, following, threads.
 * Uses OpenRouter/Anthropic for smart content generation with configurable tone.
 * Includes scheduling, conservative safety limits, active hours, and human-like behavior.
 *
 * IMPORTANT: X/Twitter bans aggressively. All rate limits and delays are intentionally
 * conservative. The warmup period and random navigation are critical for account safety.
 */
import { BrowserSessionManager } from './session-manager.js';
import { TwitterAccountManager, type TwitterAccount } from './twitter-manager.js';
import { toPlaywrightCookies, validateTwitterCookies } from './twitter-cookies.js';
import { AIClient } from '../../core/ai-client.js';
import logger from '../../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────

export type TwitterActionType = 'tweet' | 'reply' | 'like' | 'retweet' | 'follow' | 'thread';

export interface TwitterAgentConfig {
  /** Account ID from TwitterAccountManager */
  accountId: string;
  /** Enabled action types */
  actions: TwitterActionType[];
  /** Scheduling config per action */
  schedule: Record<TwitterActionType, { intervalMinutes: number; dailyLimit: number }>;
  /** Active hours (24h format) */
  activeHours: { weekday: { start: number; end: number }; weekend: { start: number; end: number } };
  /** Content generation settings */
  content: {
    tone: string;               // e.g. "insightful and authentic"
    language: string;           // e.g. "English"
    topics: string[];           // e.g. ["AI", "technology"]
    hashtags: string[];         // e.g. ["#AI", "#Tech"]
    targetAccounts: string[];   // @handles to engage with
    promoLink?: string;         // Optional promotional link
    promoFrequency: number;     // 0-1, percentage of tweets with promo link
    maxLength: number;          // Max chars (280 for tweets)
  };
  /** Safety limits */
  safety: {
    minDelaySeconds: number;       // Min delay between any actions
    maxActionsPerHour: number;
    pauseOnErrorCount: number;     // Pause after N consecutive errors
    pauseDurationMinutes: number;
  };
  /** Test mode — log actions but don't execute */
  testMode: boolean;
}

export interface TwitterAgentStatus {
  accountId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  sessionId: string | null;
  currentAction: string | null;
  stats: TwitterAgentStats;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: TwitterAgentConfig;
}

export interface TwitterAgentStats {
  tweets: number;
  replies: number;
  likes: number;
  retweets: number;
  follows: number;
  threads: number;
  errors: number;
  totalActions: number;
  actionsThisHour: number;
  lastActionAt: string | null;
}

export interface TwitterAgentLogEntry {
  timestamp: string;
  action: TwitterActionType | 'system';
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
  details?: string;
}

// ── DOM Selectors ─────────────────────────────────────────────────────

const SELECTORS = {
  // Tweet composition
  tweetBox: '[data-testid="tweetTextarea_0"]',
  tweetButton: '[data-testid="tweetButton"]',
  composeButton: '[data-testid="SideNav_NewTweet_Button"]',
  // Feed interaction
  likeButton: '[data-testid="like"]',
  unlikeButton: '[data-testid="unlike"]',
  retweetButton: '[data-testid="retweet"]',
  retweetConfirm: '[data-testid="retweetConfirm"]',
  replyButton: '[data-testid="reply"]',
  // User interaction
  followButton: '[data-testid*="-follow"]',
  unfollowButton: '[data-testid*="-unfollow"]',
  // Content reading
  tweetArticle: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  // Navigation
  primaryColumn: '[data-testid="primaryColumn"]',
  // Compose reply
  replyTextarea: '[data-testid="tweetTextarea_0"]',
};

// ── Default Configuration ─────────────────────────────────────────────

const DEFAULT_CONFIG: TwitterAgentConfig = {
  accountId: '',
  actions: ['like', 'reply'],  // Safe defaults
  schedule: {
    tweet:   { intervalMinutes: 180, dailyLimit: 3 },
    reply:   { intervalMinutes: 30,  dailyLimit: 15 },
    like:    { intervalMinutes: 10,  dailyLimit: 50 },
    retweet: { intervalMinutes: 120, dailyLimit: 5 },
    follow:  { intervalMinutes: 45,  dailyLimit: 20 },
    thread:  { intervalMinutes: 360, dailyLimit: 1 },
  },
  activeHours: {
    weekday: { start: 8, end: 22 },
    weekend: { start: 10, end: 23 },
  },
  content: {
    tone: 'insightful and authentic',
    language: 'English',
    topics: ['AI', 'technology'],
    hashtags: ['#AI', '#Tech'],
    targetAccounts: [],
    promoLink: undefined,
    promoFrequency: 0,
    maxLength: 280,
  },
  safety: {
    minDelaySeconds: 60,          // More conservative than Facebook
    maxActionsPerHour: 10,
    pauseOnErrorCount: 3,
    pauseDurationMinutes: 60,     // Longer pause for X
  },
  testMode: false,
};

// ── Navigation Sections (for random browsing) ─────────────────────────

const NAV_SECTIONS = [
  'https://x.com/home',
  'https://x.com/explore',
  'https://x.com/notifications',
];

// ── Twitter Agent Class ───────────────────────────────────────────────

export class TwitterAgent {
  private static instances: Map<string, TwitterAgent> = new Map();

  private config: TwitterAgentConfig;
  private state: 'stopped' | 'running' | 'paused' | 'error' = 'stopped';
  private sessionId: string | null = null;
  private currentAction: string | null = null;
  private stats: TwitterAgentStats = this.freshStats();
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private logs: TwitterAgentLogEntry[] = [];
  private consecutiveErrors = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActionTimes: Map<TwitterActionType, number> = new Map();
  private dailyActionCounts: Map<TwitterActionType, number> = new Map();
  private dailyResetDate: string = '';
  private engagedTweetIds: Set<string> = new Set(); // Track engaged tweets to avoid duplicates
  private followedHandles: Set<string> = new Set(); // Track followed accounts this session
  private aiClient: AIClient;
  private ownHandle: string = '';

  private constructor(config: TwitterAgentConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiClient = new AIClient();
  }

  /** Get or create an agent for an account */
  static getAgent(accountId: string): TwitterAgent | undefined {
    return TwitterAgent.instances.get(accountId);
  }

  /** Create a new agent for an account */
  static createAgent(config: TwitterAgentConfig): TwitterAgent {
    if (TwitterAgent.instances.has(config.accountId)) {
      throw new Error(`Agent already exists for account ${config.accountId}`);
    }
    const agent = new TwitterAgent(config);
    TwitterAgent.instances.set(config.accountId, agent);
    return agent;
  }

  /** Remove agent instance */
  static removeAgent(accountId: string): void {
    const agent = TwitterAgent.instances.get(accountId);
    if (agent) {
      agent.stop().catch(() => {});
      TwitterAgent.instances.delete(accountId);
    }
  }

  /** List all active agents */
  static listAgents(): TwitterAgentStatus[] {
    return [...TwitterAgent.instances.values()].map(a => a.getStatus());
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state === 'running') throw new Error('Agent is already running');

    const twitterMgr = TwitterAccountManager.getInstance();
    const account = twitterMgr.getAccount(this.config.accountId);
    if (!account) throw new Error(`Account ${this.config.accountId} not found`);

    const validation = validateTwitterCookies(account.cookies);
    if (!validation.valid) {
      throw new Error(`Cannot start — missing cookies: ${validation.missing.join(', ')}`);
    }

    this.state = 'running';
    this.startedAt = new Date().toISOString();
    this.consecutiveErrors = 0;
    this.stats = this.freshStats();
    this.engagedTweetIds.clear();
    this.followedHandles.clear();
    this.ownHandle = account.handle || '';
    this.log('system', 'info', `Agent started for account "${account.name}" (${account.handle || 'no handle'})`);

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

    // Start warmup phase then begin the agent loop
    this.startWarmup();
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
    logger.info('Twitter agent stopped', { accountId: this.config.accountId });
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

  updateConfig(updates: Partial<TwitterAgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log('system', 'info', 'Configuration updated');
  }

  getStatus(): TwitterAgentStatus {
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

  getLogs(limit = 50): TwitterAgentLogEntry[] {
    return this.logs.slice(-limit);
  }

  getConfig(): TwitterAgentConfig {
    return { ...this.config };
  }

  // ── Warmup Phase ────────────────────────────────────────────────────
  // First 5 minutes: only scroll and browse to look like a real user

  private startWarmup(): void {
    this.log('system', 'info', 'Starting 5-minute warmup phase (scroll-only, no actions)');
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
      // Scroll the feed randomly
      const scrollAmount = 200 + Math.floor(Math.random() * 600);
      await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
      await this.randomDelay(3000, 8000); // Simulate reading

      // Occasionally navigate to a different section during warmup
      if (Math.random() < 0.3) {
        const section = NAV_SECTIONS[Math.floor(Math.random() * NAV_SECTIONS.length)];
        await page.goto(section, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(2000, 5000);
      }
    } catch (err: any) {
      this.log('system', 'error', `Warmup scroll error: ${err.message}`);
    }

    // Check if 5 minutes have elapsed since start
    const elapsedMs = Date.now() - new Date(this.startedAt!).getTime();
    if (elapsedMs >= 5 * 60_000) {
      this.log('system', 'info', 'Warmup complete — beginning action loop');
      this.scheduleNextAction();
    } else {
      // Schedule another warmup scroll in 15-30 seconds
      const nextDelay = 15_000 + Math.floor(Math.random() * 15_000);
      this.loopTimer = setTimeout(() => this.performWarmupScroll(), nextDelay);
    }
  }

  // ── Main Agent Loop ───────────────────────────────────────────────

  private scheduleNextAction(): void {
    if (this.state !== 'running') return;

    // Random delay between minDelaySeconds and minDelaySeconds * 3
    const baseDelay = this.config.safety.minDelaySeconds * 1000;
    const delay = baseDelay + Math.floor(Math.random() * baseDelay * 2);
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
      const account = TwitterAccountManager.getInstance().getAccount(this.config.accountId);
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

      // Random scroll before every action to simulate browsing
      await this.simulateBrowsing();

      // Execute the action
      this.currentAction = action;
      await this.executeAction(action);
      this.currentAction = null;
      this.consecutiveErrors = 0;

      // Occasionally navigate to a different section after action (human-like)
      if (Math.random() < 0.15) {
        const section = NAV_SECTIONS[Math.floor(Math.random() * NAV_SECTIONS.length)];
        const navPage = this.getPage();
        if (navPage) {
          await navPage.goto(section, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await this.randomDelay(3000, 6000);
        }
      }

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

  // ── Browsing Simulation ─────────────────────────────────────────────

  private async simulateBrowsing(): Promise<void> {
    const page = this.getPage();
    if (!page) return;

    try {
      // Random scroll to simulate browsing
      const scrollAmount = 200 + Math.floor(Math.random() * 600);
      await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
      // Read simulation: wait 2-8 seconds
      await this.randomDelay(2000, 8000);
    } catch {
      // Non-critical, continue
    }
  }

  // ── Action Execution ──────────────────────────────────────────────

  private async executeAction(action: TwitterActionType): Promise<void> {
    const page = this.getPage();
    if (!page) throw new Error('No active page');

    this.log(action, 'info', `Executing: ${action}`);

    switch (action) {
      case 'tweet':
        await this.executeTweet(page);
        break;
      case 'reply':
        await this.executeReply(page);
        break;
      case 'like':
        await this.executeLike(page);
        break;
      case 'retweet':
        await this.executeRetweet(page);
        break;
      case 'follow':
        await this.executeFollow(page);
        break;
      case 'thread':
        await this.executeThread(page);
        break;
    }

    // Update stats
    this.stats.totalActions++;
    this.stats.actionsThisHour++;
    this.stats.lastActionAt = new Date().toISOString();
    this.lastActionTimes.set(action, Date.now());
    this.dailyActionCounts.set(action, (this.dailyActionCounts.get(action) || 0) + 1);

    switch (action) {
      case 'tweet':   this.stats.tweets++;   break;
      case 'reply':   this.stats.replies++;  break;
      case 'like':    this.stats.likes++;    break;
      case 'retweet': this.stats.retweets++; break;
      case 'follow':  this.stats.follows++;  break;
      case 'thread':  this.stats.threads++;  break;
    }
  }

  // ── Like Action ─────────────────────────────────────────────────────

  private async executeLike(page: any): Promise<void> {
    // Navigate to home feed or a target account's profile
    const targetUrl = this.pickFeedUrl();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(2000, 4000);

    // Scroll randomly to simulate browsing
    const scrollAmount = 200 + Math.floor(Math.random() * 600);
    await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
    await this.randomDelay(2000, 5000); // Reading simulation

    // Find all like buttons (NOT unlike — those are already liked)
    const likeButtons = await page.$$(SELECTORS.likeButton);
    if (likeButtons.length === 0) {
      this.log('like', 'skipped', 'No like buttons found in feed');
      return;
    }

    if (this.config.testMode) {
      this.log('like', 'success', `[TEST] Would like a tweet (${likeButtons.length} available)`);
      return;
    }

    // Skip first 1-2 tweets (often ads/pinned) and pick a random one
    const startIdx = Math.min(2, likeButtons.length - 1);
    const idx = startIdx + Math.floor(Math.random() * Math.max(1, likeButtons.length - startIdx));
    const targetBtn = likeButtons[Math.min(idx, likeButtons.length - 1)];

    try {
      // Get the tweet ID for tracking
      const tweetId = await this.getTweetIdFromButton(targetBtn);
      if (tweetId && this.engagedTweetIds.has(`like:${tweetId}`)) {
        this.log('like', 'skipped', 'Already liked this tweet in current session');
        return;
      }

      await targetBtn.click();
      await this.randomDelay(1000, 2000);

      if (tweetId) this.engagedTweetIds.add(`like:${tweetId}`);
      this.log('like', 'success', 'Liked a tweet');
    } catch (err: any) {
      this.log('like', 'error', `Failed to like: ${err.message}`);
      throw err;
    }
  }

  // ── Reply Action ────────────────────────────────────────────────────

  private async executeReply(page: any): Promise<void> {
    // Navigate to feed or target account
    const targetUrl = this.pickFeedUrl();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(2000, 4000);

    // Scroll to find tweets
    const scrollAmount = 200 + Math.floor(Math.random() * 600);
    await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
    await this.randomDelay(2000, 4000);

    // Find tweet articles
    const tweets = await page.$$(SELECTORS.tweetArticle);
    if (tweets.length === 0) {
      this.log('reply', 'skipped', 'No tweets found in feed');
      return;
    }

    // Try to find a suitable tweet to reply to (not own, not already engaged)
    let targetTweet: any = null;
    let tweetText = '';
    let tweetId = '';

    // Shuffle and iterate to find a good candidate, skipping first 1-2
    const startIdx = Math.min(2, tweets.length - 1);
    const candidates = tweets.slice(startIdx);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (const tweet of candidates.slice(0, 8)) {
      try {
        // Read tweet text
        const textEl = await tweet.$(SELECTORS.tweetText);
        if (!textEl) continue;
        const text = await textEl.evaluate((el: any) => el.textContent || '');
        if (!text || text.length < 10) continue;

        // Check if it is own tweet
        const userName = await tweet.$(SELECTORS.userName);
        if (userName) {
          const nameText = await userName.evaluate((el: any) => el.textContent || '');
          if (this.ownHandle && nameText.includes(this.ownHandle)) continue;
        }

        // Check if already engaged
        const id = await this.getTweetIdFromArticle(tweet);
        if (id && this.engagedTweetIds.has(`reply:${id}`)) continue;

        targetTweet = tweet;
        tweetText = text;
        tweetId = id || '';
        break;
      } catch {
        continue;
      }
    }

    if (!targetTweet) {
      this.log('reply', 'skipped', 'No suitable tweets found to reply to');
      return;
    }

    // Generate contextual reply via AI
    const replyContent = await this.generateContent('reply', {
      context: `Replying to a tweet. The tweet says: "${tweetText.slice(0, 250)}"`,
    });

    if (this.config.testMode) {
      this.log('reply', 'success', `[TEST] Would reply: "${replyContent.slice(0, 100)}..." to tweet: "${tweetText.slice(0, 80)}..."`);
      return;
    }

    try {
      // Click reply button on the tweet
      const replyBtn = await targetTweet.$(SELECTORS.replyButton);
      if (!replyBtn) {
        this.log('reply', 'error', 'Reply button not found on tweet');
        throw new Error('Reply button not found');
      }

      await replyBtn.click();
      await this.randomDelay(1500, 3000); // Wait for reply modal

      // Type into the reply textarea
      const replyBox = await page.$(SELECTORS.replyTextarea);
      if (!replyBox) {
        this.log('reply', 'error', 'Reply textarea not found');
        // Try to dismiss the modal
        await page.keyboard.press('Escape').catch(() => {});
        throw new Error('Reply textarea not found');
      }

      await replyBox.click();
      await this.typeHumanLike(page, replyBox, replyContent);
      await this.randomDelay(1000, 2000);

      // Click the tweet/reply button to submit
      const submitBtn = await page.$(SELECTORS.tweetButton);
      if (!submitBtn) {
        this.log('reply', 'error', 'Submit button not found for reply');
        await page.keyboard.press('Escape').catch(() => {});
        throw new Error('Submit button not found');
      }

      await submitBtn.click();
      await this.randomDelay(2000, 4000);

      if (tweetId) this.engagedTweetIds.add(`reply:${tweetId}`);
      this.log('reply', 'success', `Replied: "${replyContent.slice(0, 80)}..." to: "${tweetText.slice(0, 60)}..."`);
    } catch (err: any) {
      this.log('reply', 'error', `Failed to reply: ${err.message}`);
      // Attempt to dismiss any open modal
      await page.keyboard.press('Escape').catch(() => {});
      throw err;
    }
  }

  // ── Follow Action ───────────────────────────────────────────────────

  private async executeFollow(page: any): Promise<void> {
    // Navigate to suggested users or a target account's profile
    const { targetAccounts } = this.config.content;
    let targetUrl: string;

    if (targetAccounts.length > 0 && Math.random() < 0.6) {
      // 60% chance to follow from a target account's followers page
      const handle = targetAccounts[Math.floor(Math.random() * targetAccounts.length)];
      const cleanHandle = handle.replace(/^@/, '');
      targetUrl = `https://x.com/${cleanHandle}/followers`;
    } else {
      // Otherwise use the "Connect" (suggested users) page
      targetUrl = 'https://x.com/i/connect_people';
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(3000, 5000);

    // Scroll a bit
    await page.evaluate('window.scrollBy(0, 300)');
    await this.randomDelay(1500, 3000);

    if (this.config.testMode) {
      this.log('follow', 'success', `[TEST] Would follow someone from ${targetUrl}`);
      return;
    }

    // Find follow buttons
    const followButtons = await page.$$(SELECTORS.followButton);
    // Filter out unfollow buttons that might match
    const validButtons: any[] = [];
    for (const btn of followButtons) {
      try {
        const testId = await btn.evaluate((el: any) => el.getAttribute('data-testid') || '');
        // Only include actual follow buttons, not unfollow
        if (testId.includes('follow') && !testId.includes('unfollow')) {
          validButtons.push(btn);
        }
      } catch {
        continue;
      }
    }

    if (validButtons.length === 0) {
      this.log('follow', 'skipped', 'No follow buttons found');
      return;
    }

    // Pick a random follow button
    const idx = Math.floor(Math.random() * Math.min(5, validButtons.length));
    const btn = validButtons[Math.min(idx, validButtons.length - 1)];

    try {
      // Try to get the handle before following for tracking
      let handle = '';
      try {
        const parent = await btn.evaluateHandle((el: any) => el.closest('div[data-testid="UserCell"]') || el.closest('article') || el.parentElement);
        if (parent) {
          const nameEl = await parent.$('a[role="link"][href^="/"]');
          if (nameEl) {
            const href = await nameEl.evaluate((el: any) => el.getAttribute('href') || '');
            handle = href.replace('/', '');
          }
        }
      } catch { /* non-critical */ }

      if (handle && this.followedHandles.has(handle)) {
        this.log('follow', 'skipped', `Already followed @${handle} this session`);
        return;
      }

      await btn.click();
      await this.randomDelay(1500, 3000);

      if (handle) this.followedHandles.add(handle);
      this.log('follow', 'success', `Followed${handle ? ` @${handle}` : ' a user'}`);
    } catch (err: any) {
      this.log('follow', 'error', `Failed to follow: ${err.message}`);
      throw err;
    }
  }

  // ── Tweet Action ────────────────────────────────────────────────────

  private async executeTweet(page: any): Promise<void> {
    // Generate content via AI (with topic/hashtag guidance)
    const content = await this.generateContent('tweet', {
      context: `Writing an original tweet about ${this.config.content.topics.join(', ')}. `
        + `Suggested hashtags: ${this.config.content.hashtags.join(', ')}.`,
    });

    if (this.config.testMode) {
      this.log('tweet', 'success', `[TEST] Would tweet: "${content.slice(0, 100)}..."`);
      return;
    }

    // Navigate to compose page
    await page.goto('https://x.com/compose/tweet', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(2000, 3000);

    // Find the tweet box
    let tweetBox = await page.$(SELECTORS.tweetBox);

    // Fallback: try clicking the compose button from the sidebar
    if (!tweetBox) {
      try {
        const composeBtn = await page.$(SELECTORS.composeButton);
        if (composeBtn) {
          await composeBtn.click();
          await this.randomDelay(1500, 2500);
          tweetBox = await page.$(SELECTORS.tweetBox);
        }
      } catch { /* */ }
    }

    if (!tweetBox) {
      this.log('tweet', 'error', 'Tweet compose box not found');
      throw new Error('Tweet compose box not found');
    }

    try {
      await tweetBox.click();
      await this.typeHumanLike(page, tweetBox, content);
      await this.randomDelay(1000, 2000);

      // Click tweet button
      const tweetBtn = await page.$(SELECTORS.tweetButton);
      if (!tweetBtn) {
        this.log('tweet', 'error', 'Tweet submit button not found');
        await page.keyboard.press('Escape').catch(() => {});
        throw new Error('Tweet submit button not found');
      }

      await tweetBtn.click();
      await this.randomDelay(2000, 4000);

      this.log('tweet', 'success', `Tweeted: "${content.slice(0, 80)}..."`);
    } catch (err: any) {
      this.log('tweet', 'error', `Failed to tweet: ${err.message}`);
      await page.keyboard.press('Escape').catch(() => {});
      throw err;
    }
  }

  // ── Retweet Action ──────────────────────────────────────────────────

  private async executeRetweet(page: any): Promise<void> {
    // Browse feed
    const targetUrl = this.pickFeedUrl();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(2000, 4000);

    // Scroll
    const scrollAmount = 200 + Math.floor(Math.random() * 600);
    await page.evaluate(`window.scrollBy(0, ${scrollAmount})`);
    await this.randomDelay(2000, 5000);

    // Find retweet buttons (NOT already retweeted)
    const retweetButtons = await page.$$(SELECTORS.retweetButton);
    if (retweetButtons.length === 0) {
      this.log('retweet', 'skipped', 'No retweet buttons found');
      return;
    }

    if (this.config.testMode) {
      this.log('retweet', 'success', `[TEST] Would retweet (${retweetButtons.length} available)`);
      return;
    }

    // Skip first 1-2 and pick randomly
    const startIdx = Math.min(2, retweetButtons.length - 1);
    const idx = startIdx + Math.floor(Math.random() * Math.max(1, retweetButtons.length - startIdx));
    const targetBtn = retweetButtons[Math.min(idx, retweetButtons.length - 1)];

    try {
      const tweetId = await this.getTweetIdFromButton(targetBtn);
      if (tweetId && this.engagedTweetIds.has(`retweet:${tweetId}`)) {
        this.log('retweet', 'skipped', 'Already retweeted this tweet in current session');
        return;
      }

      // Click the retweet button
      await targetBtn.click();
      await this.randomDelay(800, 1500);

      // Click the confirm button in the popup
      const confirmBtn = await page.$(SELECTORS.retweetConfirm);
      if (!confirmBtn) {
        this.log('retweet', 'error', 'Retweet confirm button not found');
        await page.keyboard.press('Escape').catch(() => {});
        throw new Error('Retweet confirm button not found');
      }

      await confirmBtn.click();
      await this.randomDelay(1500, 3000);

      if (tweetId) this.engagedTweetIds.add(`retweet:${tweetId}`);
      this.log('retweet', 'success', 'Retweeted a tweet');
    } catch (err: any) {
      this.log('retweet', 'error', `Failed to retweet: ${err.message}`);
      await page.keyboard.press('Escape').catch(() => {});
      throw err;
    }
  }

  // ── Thread Action ───────────────────────────────────────────────────

  private async executeThread(page: any): Promise<void> {
    // Generate 3-5 part thread content via AI
    const partCount = 3 + Math.floor(Math.random() * 3); // 3-5 parts
    const threadContent = await this.generateThreadContent(partCount);

    if (!threadContent || threadContent.length === 0) {
      this.log('thread', 'error', 'Failed to generate thread content');
      throw new Error('Thread content generation failed');
    }

    if (this.config.testMode) {
      this.log('thread', 'success', `[TEST] Would post thread (${threadContent.length} parts): "${threadContent[0].slice(0, 80)}..."`);
      return;
    }

    // Strategy: Post first tweet, then reply to self for each subsequent part.
    // This is more reliable than using the compose thread UI.

    // Step 1: Navigate to compose and post the first tweet
    await page.goto('https://x.com/compose/tweet', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.randomDelay(2000, 3000);

    let tweetBox = await page.$(SELECTORS.tweetBox);
    if (!tweetBox) {
      try {
        const composeBtn = await page.$(SELECTORS.composeButton);
        if (composeBtn) {
          await composeBtn.click();
          await this.randomDelay(1500, 2500);
          tweetBox = await page.$(SELECTORS.tweetBox);
        }
      } catch { /* */ }
    }

    if (!tweetBox) {
      this.log('thread', 'error', 'Tweet compose box not found for thread');
      throw new Error('Tweet compose box not found');
    }

    try {
      // Post first part
      await tweetBox.click();
      await this.typeHumanLike(page, tweetBox, threadContent[0]);
      await this.randomDelay(1000, 2000);

      const tweetBtn = await page.$(SELECTORS.tweetButton);
      if (!tweetBtn) throw new Error('Tweet submit button not found');
      await tweetBtn.click();
      await this.randomDelay(3000, 5000);

      this.log('thread', 'info', `Thread part 1/${threadContent.length} posted`);

      // Step 2: Navigate to own profile to find the tweet and reply to it
      if (this.ownHandle) {
        const cleanHandle = this.ownHandle.replace(/^@/, '');
        await page.goto(`https://x.com/${cleanHandle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await this.randomDelay(2000, 4000);

        // Find the most recent tweet (should be our thread starter)
        const ownTweets = await page.$$(SELECTORS.tweetArticle);
        if (ownTweets.length > 0) {
          // Click on the first tweet to open it
          const firstTweet = ownTweets[0];
          const tweetTextEl = await firstTweet.$(SELECTORS.tweetText);
          if (tweetTextEl) {
            await tweetTextEl.click();
            await this.randomDelay(2000, 3000);
          }

          // Now reply to self for each remaining part
          for (let i = 1; i < threadContent.length; i++) {
            // Find and click the reply button
            const replyBtn = await page.$(SELECTORS.replyButton);
            if (!replyBtn) {
              this.log('thread', 'error', `Reply button not found for thread part ${i + 1}`);
              break;
            }

            await replyBtn.click();
            await this.randomDelay(1500, 2500);

            const replyBox = await page.$(SELECTORS.replyTextarea);
            if (!replyBox) {
              this.log('thread', 'error', `Reply textarea not found for thread part ${i + 1}`);
              await page.keyboard.press('Escape').catch(() => {});
              break;
            }

            await replyBox.click();
            await this.typeHumanLike(page, replyBox, threadContent[i]);
            await this.randomDelay(1000, 2000);

            const submitBtn = await page.$(SELECTORS.tweetButton);
            if (!submitBtn) {
              this.log('thread', 'error', `Submit button not found for thread part ${i + 1}`);
              await page.keyboard.press('Escape').catch(() => {});
              break;
            }

            await submitBtn.click();
            await this.randomDelay(3000, 5000);

            this.log('thread', 'info', `Thread part ${i + 1}/${threadContent.length} posted`);
          }
        } else {
          this.log('thread', 'error', 'Could not find own tweet to build thread');
        }
      } else {
        this.log('thread', 'error', 'No own handle set — cannot navigate to profile for thread replies');
      }

      this.log('thread', 'success', `Thread posted (${threadContent.length} parts)`);
    } catch (err: any) {
      this.log('thread', 'error', `Failed to post thread: ${err.message}`);
      await page.keyboard.press('Escape').catch(() => {});
      throw err;
    }
  }

  // ── AI Content Generation ─────────────────────────────────────────

  private async generateContent(action: TwitterActionType, opts: { context: string }): Promise<string> {
    const { tone, language, topics, hashtags, promoLink, promoFrequency, maxLength } = this.config.content;

    const shouldIncludePromo = promoLink && Math.random() < promoFrequency;
    const shouldIncludeHashtags = action === 'tweet' || action === 'thread';

    const systemPrompt = `You are a real person posting on Twitter/X.
Write in ${language}. Tone: ${tone}.
Topics of interest: ${topics.join(', ')}.
${shouldIncludeHashtags ? `You may use 1-2 relevant hashtags from: ${hashtags.join(', ')}. Don't force them — only if natural.` : 'Do NOT include any hashtags in replies.'}
${shouldIncludePromo ? `Include this link naturally in your tweet: ${promoLink}` : ''}
Rules:
- Maximum ${maxLength} characters (this is a hard limit — Twitter truncates beyond 280)
- Sound like a real person with genuine thoughts, never robotic or formulaic
- For replies: be relevant and specific to the tweet content, add value or insight
- For tweets: share genuine thoughts, observations, or questions about the topic
- Be conversational and authentic — vary sentence structure, use casual phrasing
- NEVER mention being an AI, bot, or automated in any way
- NEVER start with "Great post!" or similar generic openers for replies
- Output ONLY the content text, nothing else — no quotes, no labels, no explanation`;

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

  private async generateThreadContent(partCount: number): Promise<string[]> {
    const { tone, language, topics, hashtags, maxLength } = this.config.content;

    const systemPrompt = `You are a real person posting a Twitter/X thread.
Write in ${language}. Tone: ${tone}.
Topics of interest: ${topics.join(', ')}.

Rules:
- Generate exactly ${partCount} tweet parts for a thread
- Each part must be under ${maxLength} characters
- The first part should hook the reader (e.g., a bold claim, question, or insight)
- Number each part like "1/" or "1/${partCount}" at the start
- Each part should flow naturally from the previous one
- Use 1-2 hashtags from ${hashtags.join(', ')} ONLY in the last part
- Sound like a real person with deep knowledge, not an AI
- Be insightful and share genuine expertise or perspective
- Output ONLY the tweet parts, separated by the delimiter "---NEXT---"
- No quotes, no labels, no explanations — just the raw tweet text for each part`;

    const userPrompt = `Write a ${partCount}-part Twitter thread about ${topics[Math.floor(Math.random() * topics.length)]}.

Generate the thread:`;

    try {
      const response = await this.aiClient.chat({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: Math.ceil(maxLength * partCount / 2),
        temperature: 0.85,
        isSubAgent: true,
      });

      const text = response.content.trim();
      const parts = text.split('---NEXT---')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0)
        .map((p: string) => {
          // Strip surrounding quotes
          let clean = p;
          if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
            clean = clean.slice(1, -1);
          }
          return clean.slice(0, maxLength);
        });

      if (parts.length === 0) {
        throw new Error('AI returned no thread parts');
      }

      return parts;
    } catch (err: any) {
      this.log('thread', 'error', `AI thread generation failed: ${err.message}`);
      throw new Error(`Thread content generation failed: ${err.message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async ensureSession(account: TwitterAccount): Promise<void> {
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

    await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const context = page.context();
    await context.addCookies(toPlaywrightCookies(account.cookies));
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);
  }

  private getPage(): any {
    if (!this.sessionId) return null;
    return BrowserSessionManager.getInstance().getPage(this.sessionId);
  }

  /** Pick a feed URL to browse — either home, explore, or a target account's page */
  private pickFeedUrl(): string {
    const { targetAccounts } = this.config.content;

    // 40% chance to visit a target account if configured
    if (targetAccounts.length > 0 && Math.random() < 0.4) {
      const handle = targetAccounts[Math.floor(Math.random() * targetAccounts.length)];
      return `https://x.com/${handle.replace(/^@/, '')}`;
    }

    // 20% chance to visit explore for variety
    if (Math.random() < 0.2) {
      return 'https://x.com/explore';
    }

    return 'https://x.com/home';
  }

  /** Try to extract a pseudo-ID from a tweet article element for deduplication */
  private async getTweetIdFromArticle(article: any): Promise<string | null> {
    try {
      // Try to get the tweet link which contains the tweet ID
      const link = await article.$('a[href*="/status/"]');
      if (link) {
        const href = await link.evaluate((el: any) => el.getAttribute('href') || '');
        const match = href.match(/\/status\/(\d+)/);
        if (match) return match[1];
      }
      // Fallback: use a hash of the text content
      const text = await article.evaluate((el: any) => (el.textContent || '').slice(0, 200));
      return text ? `text:${this.simpleHash(text)}` : null;
    } catch {
      return null;
    }
  }

  /** Try to extract a pseudo-ID from a button's parent tweet */
  private async getTweetIdFromButton(button: any): Promise<string | null> {
    try {
      const article = await button.evaluateHandle((el: any) => el.closest('article[data-testid="tweet"]'));
      if (article) {
        return this.getTweetIdFromArticle(article);
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Simple string hash for deduplication */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private async typeHumanLike(_page: any, element: any, text: string): Promise<void> {
    // Type character by character with random delays for human-like behavior
    for (const char of text) {
      await element.type(char, { delay: 30 + Math.random() * 90 });
      // 5% chance of a longer pause (like thinking)
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

  private pickNextAction(): TwitterActionType | null {
    const now = Date.now();
    const available: { action: TwitterActionType; priority: number }[] = [];

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

  private freshStats(): TwitterAgentStats {
    return {
      tweets: 0, replies: 0, likes: 0, retweets: 0, follows: 0, threads: 0,
      errors: 0, totalActions: 0, actionsThisHour: 0, lastActionAt: null,
    };
  }

  private log(action: TwitterActionType | 'system', status: TwitterAgentLogEntry['status'], message: string, details?: string): void {
    const entry: TwitterAgentLogEntry = {
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
    logger.info(`[X-Agent] ${action}: ${message}`, { accountId: this.config.accountId, status });
  }
}
