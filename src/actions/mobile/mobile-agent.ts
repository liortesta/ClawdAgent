/**
 * MobileAgent — autonomous engagement agent for Android apps (TikTok, Twitter/X, Facebook).
 * Connects to Appium server via SSH tunnel and automates native mobile apps.
 * Follows the same architecture as browser-based agents (FacebookAgent, TwitterAgent, etc).
 */
import { AppiumClient } from './appium-client.js';
import { AIClient } from '../../core/ai-client.js';
import logger from '../../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────

export type MobileApp = 'tiktok' | 'twitter' | 'facebook';
export type MobileActionType = 'like' | 'comment' | 'follow' | 'scroll' | 'share' | 'retweet' | 'reply';

export interface MobileAgentConfig {
  id: string;
  app: MobileApp;
  deviceId: string;
  appiumUrl: string;
  actions: MobileActionType[];
  schedule: Record<string, { intervalMinutes: number; dailyLimit: number }>;
  activeHours: { weekday: { start: number; end: number }; weekend: { start: number; end: number } };
  content: { tone: string; language: string; topics: string[]; maxLength: number };
  safety: { minDelaySeconds: number; maxActionsPerHour: number; pauseOnErrorCount: number; pauseDurationMinutes: number };
  testMode: boolean;
}

export interface MobileAgentStatus {
  id: string;
  app: MobileApp;
  deviceId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  currentAction: string | null;
  stats: MobileAgentStats;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: MobileAgentConfig;
}

export interface MobileAgentStats {
  likes: number;
  comments: number;
  follows: number;
  scrolls: number;
  shares: number;
  retweets: number;
  replies: number;
  errors: number;
  totalActions: number;
  actionsThisHour: number;
  lastActionAt: string | null;
}

export interface MobileAgentLogEntry {
  timestamp: string;
  action: MobileActionType | 'system';
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
  details?: string;
}

// ── App Definitions ──────────────────────────────────────────────────

const APP_DEFS: Record<MobileApp, { pkg: string; activity: string; actions: MobileActionType[] }> = {
  tiktok:   { pkg: 'com.zhiliaoapp.musically', activity: 'com.ss.android.ugc.aweme.splash.SplashActivity', actions: ['like', 'comment', 'follow', 'scroll'] },
  twitter:  { pkg: 'com.twitter.android',      activity: 'com.twitter.android.StartActivity',              actions: ['like', 'reply', 'retweet', 'follow', 'scroll'] },
  facebook: { pkg: 'com.facebook.katana',       activity: 'com.facebook.katana.LoginActivity',              actions: ['like', 'comment', 'share', 'scroll'] },
};

// ── Mobile Agent Class ──────────────────────────────────────────────

export class MobileAgent {
  private static instances: Map<string, MobileAgent> = new Map();

  private config: MobileAgentConfig;
  private state: 'stopped' | 'running' | 'paused' | 'error' = 'stopped';
  private currentAction: string | null = null;
  private stats: MobileAgentStats = this.freshStats();
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private logs: MobileAgentLogEntry[] = [];
  private consecutiveErrors = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActionTimes: Map<MobileActionType, number> = new Map();
  private dailyActionCounts: Map<MobileActionType, number> = new Map();
  private dailyResetDate = '';
  private appium: AppiumClient;
  private aiClient: AIClient;

  private constructor(config: MobileAgentConfig) {
    this.config = config;
    this.appium = new AppiumClient();
    this.aiClient = new AIClient();
  }

  // ── Static Registry ────────────────────────────────────────────────

  static getAgent(id: string): MobileAgent | undefined {
    return MobileAgent.instances.get(id);
  }

  static createAgent(config: MobileAgentConfig): MobileAgent {
    if (MobileAgent.instances.has(config.id)) {
      throw new Error(`Agent already exists: ${config.id}`);
    }
    const agent = new MobileAgent(config);
    MobileAgent.instances.set(config.id, agent);
    return agent;
  }

  static removeAgent(id: string): void {
    const agent = MobileAgent.instances.get(id);
    if (agent) {
      agent.stop().catch(() => {});
      MobileAgent.instances.delete(id);
    }
  }

  static listAgents(): MobileAgentStatus[] {
    return [...MobileAgent.instances.values()].map(a => a.getStatus());
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state === 'running') throw new Error('Agent is already running');

    const appDef = APP_DEFS[this.config.app];
    if (!appDef) throw new Error(`Unknown app: ${this.config.app}`);

    this.state = 'running';
    this.startedAt = new Date().toISOString();
    this.consecutiveErrors = 0;
    this.stats = this.freshStats();
    this.log('system', 'info', `Starting mobile agent: ${this.config.app} on device ${this.config.deviceId}`);

    try {
      await this.appium.createSession(this.config.appiumUrl, {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': this.config.deviceId,
        'appium:udid': this.config.deviceId,
        'appium:appPackage': appDef.pkg,
        'appium:appActivity': appDef.activity,
        'appium:noReset': true,
        'appium:fullReset': false,
        'appium:autoGrantPermissions': true,
        'appium:newCommandTimeout': 600,
        'appium:ignoreHiddenApiPolicyError': true,
      });
      this.log('system', 'info', 'Appium session created — app launched');
    } catch (err: unknown) {
      this.state = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.log('system', 'error', `Failed to create Appium session: ${msg}`);
      throw err;
    }

    await this.sleep(3000);
    this.dismissPopups();
    this.startWarmup();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    try { await this.appium.deleteSession(); } catch { /* best effort */ }
    this.log('system', 'info', 'Agent stopped');
    logger.info('Mobile agent stopped', { id: this.config.id });
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    this.log('system', 'info', 'Agent paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.consecutiveErrors = 0;
    this.log('system', 'info', 'Agent resumed');
    this.scheduleNextAction();
  }

  updateConfig(updates: Partial<MobileAgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log('system', 'info', 'Configuration updated');
  }

  getStatus(): MobileAgentStatus {
    let lastAction: string | null = null;
    let latestTime = 0;
    for (const [action, time] of this.lastActionTimes) {
      if (time > latestTime) { latestTime = time; lastAction = action; }
    }
    let nextActionTime: string | null = null;
    if (this.state === 'running') {
      const nextDelay = this.config.safety.minDelaySeconds * 1000;
      nextActionTime = new Date((latestTime || Date.now()) + nextDelay).toISOString();
    }
    return {
      id: this.config.id, app: this.config.app, deviceId: this.config.deviceId,
      state: this.state, currentAction: this.currentAction,
      stats: { ...this.stats }, lastError: this.lastError,
      startedAt: this.startedAt, lastAction, lastActionTime: this.stats.lastActionAt,
      nextActionTime, config: this.config,
    };
  }

  getLogs(limit = 50): MobileAgentLogEntry[] { return this.logs.slice(-limit); }
  getConfig(): MobileAgentConfig { return { ...this.config }; }

  async takeScreenshot(): Promise<string> {
    try { return await this.appium.screenshot(); }
    catch { return ''; }
  }

  // ── Warmup ─────────────────────────────────────────────────────────

  private startWarmup(): void {
    this.log('system', 'info', 'Starting 5-minute warmup (scroll only)');
    this.performWarmup();
  }

  private async performWarmup(): Promise<void> {
    if (this.state !== 'running') return;
    try {
      await this.appium.swipe(540, 1600, 540, 400, 600);
      await this.sleep(4000 + Math.random() * 8000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('system', 'error', `Warmup scroll error: ${msg}`);
    }

    const elapsedMs = Date.now() - new Date(this.startedAt!).getTime();
    if (elapsedMs >= 5 * 60_000) {
      this.log('system', 'info', 'Warmup complete — beginning action loop');
      this.scheduleNextAction();
    } else {
      const nextDelay = 8000 + Math.floor(Math.random() * 12000);
      this.loopTimer = setTimeout(() => this.performWarmup(), nextDelay);
    }
  }

  // ── Main Loop ──────────────────────────────────────────────────────

  private scheduleNextAction(): void {
    if (this.state !== 'running') return;
    const baseDelay = this.config.safety.minDelaySeconds * 1000;
    const delay = baseDelay + Math.floor(Math.random() * baseDelay * 1.5);
    this.log('system', 'info', `Next action in ${Math.round(delay / 1000)}s`);
    this.loopTimer = setTimeout(() => this.actionLoop(), delay);
  }

  private async actionLoop(): Promise<void> {
    if (this.state !== 'running') return;

    try {
      if (!this.isWithinActiveHours()) {
        this.log('system', 'skipped', 'Outside active hours');
        this.loopTimer = setTimeout(() => this.actionLoop(), 5 * 60_000);
        return;
      }
      this.updateHourlyCount();
      if (this.stats.actionsThisHour >= this.config.safety.maxActionsPerHour) {
        this.log('system', 'skipped', `Hourly limit (${this.stats.actionsThisHour}/${this.config.safety.maxActionsPerHour})`);
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }
      this.resetDailyCountsIfNeeded();

      const action = this.pickNextAction();
      if (!action) {
        this.log('system', 'skipped', 'No actions available');
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }

      // Random scroll before action (human-like)
      if (Math.random() < 0.4) {
        const scrolls = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < scrolls; i++) {
          await this.appium.swipe(540, 1500, 540, 500, 400 + Math.floor(Math.random() * 400));
          await this.sleep(2000 + Math.random() * 4000);
        }
      }

      this.currentAction = action;
      await this.executeAction(action);
      this.currentAction = null;
      this.consecutiveErrors = 0;

    } catch (err: unknown) {
      this.consecutiveErrors++;
      this.stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.currentAction = null;
      this.log('system', 'error', `Action error: ${msg}`);

      if (this.consecutiveErrors >= this.config.safety.pauseOnErrorCount) {
        this.state = 'paused';
        this.log('system', 'error', `Paused after ${this.consecutiveErrors} errors. Auto-resume in ${this.config.safety.pauseDurationMinutes} min.`);
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

  // ── Action Execution ──────────────────────────────────────────────

  private async executeAction(action: MobileActionType): Promise<void> {
    this.log(action, 'info', `Executing: ${action} on ${this.config.app}`);

    switch (this.config.app) {
      case 'tiktok':  await this.executeTikTokAction(action); break;
      case 'twitter':  await this.executeTwitterAction(action); break;
      case 'facebook': await this.executeFacebookAction(action); break;
    }

    this.stats.totalActions++;
    this.stats.actionsThisHour++;
    this.stats.lastActionAt = new Date().toISOString();
    this.lastActionTimes.set(action, Date.now());
    this.dailyActionCounts.set(action, (this.dailyActionCounts.get(action) || 0) + 1);
    this.incrementStat(action);
  }

  // ── TikTok Actions ────────────────────────────────────────────────

  private async executeTikTokAction(action: MobileActionType): Promise<void> {
    switch (action) {
      case 'like': {
        if (this.config.testMode) { this.log('like', 'success', '[TEST] Would like a video'); return; }
        // Double-tap center of screen to like (TikTok gesture)
        await this.appium.tap(540, 960);
        await this.sleep(150);
        await this.appium.tap(540, 960);
        await this.sleep(1500);
        this.log('like', 'success', 'Double-tapped to like video');
        break;
      }
      case 'comment': {
        const commentText = await this.generateComment('tiktok');
        if (this.config.testMode) { this.log('comment', 'success', `[TEST] Would comment: "${commentText}"`); return; }
        // Tap comment icon (right side, below like heart)
        await this.appium.tap(680, 680);
        await this.sleep(2000);
        // Find comment input and type
        try {
          const input = await this.appium.findElement('uiautomator', 'new UiSelector().textContains("Add comment")');
          await this.appium.clickElement(input.elementId);
          await this.sleep(500);
          await this.appium.sendKeys(input.elementId, commentText);
          await this.sleep(800);
          // Tap send/post button
          const sendBtn = await this.appium.findElement('uiautomator', 'new UiSelector().textContains("Post")');
          await this.appium.clickElement(sendBtn.elementId);
          await this.sleep(2000);
          // Close comment panel
          await this.appium.pressKey(4); // BACK
          this.log('comment', 'success', `Commented: "${commentText.slice(0, 60)}..."`);
        } catch (err: unknown) {
          await this.appium.pressKey(4);
          throw err;
        }
        break;
      }
      case 'follow': {
        if (this.config.testMode) { this.log('follow', 'success', '[TEST] Would follow creator'); return; }
        try {
          const followBtn = await this.appium.findElement('uiautomator', 'new UiSelector().text("Follow")');
          const isDisplayed = await this.appium.isElementDisplayed(followBtn.elementId);
          if (isDisplayed) {
            await this.appium.clickElement(followBtn.elementId);
            await this.sleep(1500);
            this.log('follow', 'success', 'Followed creator');
          } else {
            this.log('follow', 'skipped', 'Follow button not visible');
          }
        } catch {
          this.log('follow', 'skipped', 'No follow button found');
        }
        break;
      }
      case 'scroll': {
        const count = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          await this.appium.swipe(540, 1500, 540, 400, 400 + Math.floor(Math.random() * 400));
          await this.sleep(3000 + Math.random() * 5000);
        }
        this.log('scroll', 'success', `Scrolled through ${count} videos`);
        break;
      }
    }
  }

  // ── Twitter/X Actions ─────────────────────────────────────────────

  private async executeTwitterAction(action: MobileActionType): Promise<void> {
    switch (action) {
      case 'like': {
        if (this.config.testMode) { this.log('like', 'success', '[TEST] Would like a tweet'); return; }
        try {
          const likeBtn = await this.appium.findElement('accessibility id', 'Like');
          await this.appium.clickElement(likeBtn.elementId);
          await this.sleep(1500);
          this.log('like', 'success', 'Liked a tweet');
        } catch {
          // Fallback: try by content-desc
          try {
            const btns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Like")');
            if (btns.length > 0) {
              const idx = Math.floor(Math.random() * Math.min(3, btns.length));
              await this.appium.clickElement(btns[idx].elementId);
              await this.sleep(1500);
              this.log('like', 'success', 'Liked a tweet (fallback)');
            } else {
              this.log('like', 'skipped', 'No like buttons found');
            }
          } catch {
            this.log('like', 'skipped', 'Like button not found');
          }
        }
        break;
      }
      case 'reply': {
        const replyText = await this.generateComment('twitter');
        if (this.config.testMode) { this.log('reply', 'success', `[TEST] Would reply: "${replyText}"`); return; }
        try {
          const replyBtn = await this.appium.findElement('accessibility id', 'Reply');
          await this.appium.clickElement(replyBtn.elementId);
          await this.sleep(2000);
          const input = await this.appium.findElement('uiautomator', 'new UiSelector().className("android.widget.EditText")');
          await this.appium.sendKeys(input.elementId, replyText);
          await this.sleep(1000);
          const postBtn = await this.appium.findElement('uiautomator', 'new UiSelector().text("Reply")');
          await this.appium.clickElement(postBtn.elementId);
          await this.sleep(2000);
          this.log('reply', 'success', `Replied: "${replyText.slice(0, 60)}..."`);
        } catch (err: unknown) {
          await this.appium.pressKey(4);
          throw err;
        }
        break;
      }
      case 'retweet': {
        if (this.config.testMode) { this.log('retweet', 'success', '[TEST] Would repost a tweet'); return; }
        try {
          const rtBtn = await this.appium.findElement('accessibility id', 'Repost');
          await this.appium.clickElement(rtBtn.elementId);
          await this.sleep(1000);
          const repostOption = await this.appium.findElement('uiautomator', 'new UiSelector().text("Repost")');
          await this.appium.clickElement(repostOption.elementId);
          await this.sleep(1500);
          this.log('retweet', 'success', 'Reposted a tweet');
        } catch {
          this.log('retweet', 'skipped', 'Repost button not found');
        }
        break;
      }
      case 'follow': {
        if (this.config.testMode) { this.log('follow', 'success', '[TEST] Would follow user'); return; }
        try {
          const followBtn = await this.appium.findElement('uiautomator', 'new UiSelector().text("Follow")');
          await this.appium.clickElement(followBtn.elementId);
          await this.sleep(1500);
          this.log('follow', 'success', 'Followed a user');
        } catch {
          this.log('follow', 'skipped', 'No follow button found');
        }
        break;
      }
      case 'scroll': {
        const count = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
          await this.appium.swipe(540, 1500, 540, 500, 500 + Math.floor(Math.random() * 500));
          await this.sleep(2000 + Math.random() * 4000);
        }
        this.log('scroll', 'success', `Scrolled feed (${count} swipes)`);
        break;
      }
    }
  }

  // ── Facebook Actions ──────────────────────────────────────────────

  private async executeFacebookAction(action: MobileActionType): Promise<void> {
    switch (action) {
      case 'like': {
        if (this.config.testMode) { this.log('like', 'success', '[TEST] Would like a post'); return; }
        try {
          const likeBtns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Like")');
          if (likeBtns.length > 0) {
            const idx = Math.floor(Math.random() * Math.min(3, likeBtns.length));
            await this.appium.clickElement(likeBtns[idx].elementId);
            await this.sleep(1500);
            this.log('like', 'success', 'Liked a post');
          } else {
            this.log('like', 'skipped', 'No like buttons found');
          }
        } catch {
          this.log('like', 'skipped', 'Like button not accessible');
        }
        break;
      }
      case 'comment': {
        const commentText = await this.generateComment('facebook');
        if (this.config.testMode) { this.log('comment', 'success', `[TEST] Would comment: "${commentText}"`); return; }
        try {
          const commentBtns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Comment")');
          if (commentBtns.length > 0) {
            await this.appium.clickElement(commentBtns[0].elementId);
            await this.sleep(2000);
            const input = await this.appium.findElement('uiautomator', 'new UiSelector().className("android.widget.EditText")');
            await this.appium.sendKeys(input.elementId, commentText);
            await this.sleep(1000);
            // Tap send
            const sendBtn = await this.appium.findElement('uiautomator', 'new UiSelector().descriptionContains("Send")');
            await this.appium.clickElement(sendBtn.elementId);
            await this.sleep(2000);
            await this.appium.pressKey(4); // Back
            this.log('comment', 'success', `Commented: "${commentText.slice(0, 60)}..."`);
          } else {
            this.log('comment', 'skipped', 'No comment buttons found');
          }
        } catch (err: unknown) {
          await this.appium.pressKey(4);
          throw err;
        }
        break;
      }
      case 'share': {
        if (this.config.testMode) { this.log('share', 'success', '[TEST] Would share a post'); return; }
        try {
          const shareBtns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Share")');
          if (shareBtns.length > 0) {
            await this.appium.clickElement(shareBtns[0].elementId);
            await this.sleep(1500);
            // Look for "Share now" or "Share to Feed"
            try {
              const shareNow = await this.appium.findElement('uiautomator', 'new UiSelector().textContains("Share now")');
              await this.appium.clickElement(shareNow.elementId);
              this.log('share', 'success', 'Shared a post');
            } catch {
              await this.appium.pressKey(4);
              this.log('share', 'skipped', 'Share dialog not available');
            }
            await this.sleep(2000);
          } else {
            this.log('share', 'skipped', 'No share buttons found');
          }
        } catch {
          await this.appium.pressKey(4);
          this.log('share', 'skipped', 'Share failed');
        }
        break;
      }
      case 'scroll': {
        const count = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          await this.appium.swipe(540, 1500, 540, 500, 500 + Math.floor(Math.random() * 500));
          await this.sleep(2000 + Math.random() * 4000);
        }
        this.log('scroll', 'success', `Scrolled feed (${count} swipes)`);
        break;
      }
    }
  }

  // ── AI Comment Generation ─────────────────────────────────────────

  private async generateComment(platform: MobileApp): Promise<string> {
    const { tone, language, topics, maxLength } = this.config.content;
    const platformNames: Record<MobileApp, string> = { tiktok: 'TikTok', twitter: 'X (Twitter)', facebook: 'Facebook' };

    const systemPrompt = `You are a real person on ${platformNames[platform]}.
Write in ${language}. Tone: ${tone}. Topics: ${topics.join(', ')}.
Rules:
- Maximum ${maxLength} characters
- Sound authentic and human — casual, real
- React to content naturally, add value
- 1-2 emojis max, used naturally
- NEVER mention being AI or automated
- NEVER generic ("Nice!", "Great post!")
- Output ONLY the text, nothing else`;

    try {
      const response = await this.aiClient.chat({
        systemPrompt,
        messages: [{ role: 'user', content: `Write a short, engaging ${platform === 'twitter' ? 'reply' : 'comment'} about ${topics[Math.floor(Math.random() * topics.length)]}:` }],
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
      this.log('system', 'error', `AI generation failed: ${msg}`);
      throw new Error(`Content generation failed: ${msg}`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async dismissPopups(): Promise<void> {
    for (const text of ['Allow', 'OK', 'Continue', 'Got it', 'Not now', 'Skip', 'Maybe later']) {
      try {
        const el = await this.appium.findElement('uiautomator', `new UiSelector().text("${text}")`);
        const displayed = await this.appium.isElementDisplayed(el.elementId);
        if (displayed) {
          await this.appium.clickElement(el.elementId);
          await this.sleep(500);
        }
      } catch { /* expected for most texts */ }
    }
  }

  private incrementStat(action: MobileActionType): void {
    switch (action) {
      case 'like': this.stats.likes++; break;
      case 'comment': this.stats.comments++; break;
      case 'follow': this.stats.follows++; break;
      case 'scroll': this.stats.scrolls++; break;
      case 'share': this.stats.shares++; break;
      case 'retweet': this.stats.retweets++; break;
      case 'reply': this.stats.replies++; break;
    }
  }

  private pickNextAction(): MobileActionType | null {
    const now = Date.now();
    const available: { action: MobileActionType; priority: number }[] = [];
    for (const action of this.config.actions) {
      const schedule = this.config.schedule[action];
      if (!schedule) continue;
      const lastTime = this.lastActionTimes.get(action) || 0;
      const dailyCount = this.dailyActionCounts.get(action) || 0;
      if (dailyCount >= schedule.dailyLimit) continue;
      const elapsed = now - lastTime;
      const intervalMs = schedule.intervalMinutes * 60_000;
      if (elapsed < intervalMs) continue;
      available.push({ action, priority: elapsed / intervalMs });
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

  private isWithinActiveHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const hours = isWeekend ? this.config.activeHours.weekend : this.config.activeHours.weekday;
    return hour >= hours.start && hour < hours.end;
  }

  private updateHourlyCount(): void {
    const now = Date.now();
    const lastAction = this.stats.lastActionAt ? new Date(this.stats.lastActionAt).getTime() : 0;
    if (now - lastAction > 3600_000) this.stats.actionsThisHour = 0;
  }

  private resetDailyCountsIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyResetDate !== today) { this.dailyResetDate = today; this.dailyActionCounts.clear(); }
  }

  private freshStats(): MobileAgentStats {
    return { likes: 0, comments: 0, follows: 0, scrolls: 0, shares: 0, retweets: 0, replies: 0, errors: 0, totalActions: 0, actionsThisHour: 0, lastActionAt: null };
  }

  private log(action: MobileActionType | 'system', status: MobileAgentLogEntry['status'], message: string, details?: string): void {
    const entry: MobileAgentLogEntry = { timestamp: new Date().toISOString(), action, status, message, details };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs = this.logs.slice(-500);
    logger.info(`[MobileAgent] ${this.config.app}:${action}: ${message}`, { id: this.config.id, status });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
