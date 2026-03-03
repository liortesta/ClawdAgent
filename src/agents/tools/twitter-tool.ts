/**
 * TwitterTool — Exposes Twitter/X account management and autonomous engagement agent
 * control to the chat AI. Wraps TwitterAccountManager + TwitterAgent.
 */
import { BaseTool, ToolResult } from './base-tool.js';
import { TwitterAccountManager } from '../../actions/browser/twitter-manager.js';
import { TwitterAgent, type TwitterAgentConfig } from '../../actions/browser/twitter-agent.js';
import { BrowserSessionManager } from '../../actions/browser/session-manager.js';

export class TwitterTool extends BaseTool {
  name = 'twitter';
  description = `X (Twitter) account management and autonomous engagement agent. Actions:
- list_accounts: Show all Twitter/X accounts
- account_status(accountId): Get account status and details
- start_agent(accountId, actions?, language?, tone?, topics?, hashtags?, targetAccounts?, testMode?): Start autonomous engagement agent
- stop_agent(accountId): Stop agent
- pause_agent(accountId): Pause agent
- resume_agent(accountId): Resume agent
- agent_status(accountId): Get agent status and stats
- agent_logs(accountId, limit?): Get recent agent logs
- open_twitter(accountId, url?): Open X/Twitter in browser with cookies
- tweet(accountId, content): Post a tweet
- navigate(accountId, url): Navigate logged-in session to URL`;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    const accountId = input.accountId as string | undefined;

    try {
      switch (action) {
        case 'list_accounts':
          return this.listAccounts();

        case 'account_status':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.accountStatus(accountId);

        case 'start_agent':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.startAgent(accountId, input);

        case 'stop_agent':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.stopAgent(accountId);

        case 'pause_agent':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.pauseAgent(accountId);

        case 'resume_agent':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.resumeAgent(accountId);

        case 'agent_status':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.agentStatus(accountId);

        case 'agent_logs':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.agentLogs(accountId, (input.limit as number) ?? 20);

        case 'open_twitter':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.openTwitter(accountId, input.url as string | undefined);

        case 'tweet':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          if (!input.content) return { success: false, output: '', error: 'content required' };
          return this.postTweet(accountId, input.content as string);

        case 'navigate':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          if (!input.url) return { success: false, output: '', error: 'url required' };
          return this.navigateTwitter(accountId, input.url as string);

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Available: list_accounts, account_status, start_agent, stop_agent, pause_agent, resume_agent, agent_status, agent_logs, open_twitter, tweet, navigate` };
      }
    } catch (err: any) {
      this.error('Twitter tool error', { action, error: err.message });
      return { success: false, output: '', error: `Twitter error: ${err.message}` };
    }
  }

  private listAccounts(): ToolResult {
    const mgr = TwitterAccountManager.getInstance();
    const accounts = mgr.listAccounts();

    if (accounts.length === 0) {
      return { success: true, output: 'No Twitter/X accounts configured. Add accounts from the Twitter tab in the web UI.' };
    }

    const lines = accounts.map(a => {
      const agent = TwitterAgent.getAgent(a.id);
      const agentStatus = agent ? ` | Agent: ${agent.getStatus().state}` : '';
      return `- ${a.name} (${a.id}) — Status: ${a.status}${agentStatus}`;
    });

    return { success: true, output: `Twitter/X Accounts (${accounts.length}):\n${lines.join('\n')}` };
  }

  private accountStatus(accountId: string): ToolResult {
    const mgr = TwitterAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };

    const agent = TwitterAgent.getAgent(accountId);
    const agentInfo = agent ? `\nAgent: ${agent.getStatus().state} (${agent.getStatus().stats.totalActions} actions)` : '\nAgent: not running';

    return {
      success: true,
      output: `Account: ${account.name}\nID: ${account.id}\nStatus: ${account.status}\nCookies: ${account.cookies?.length ?? 0} cookies loaded\nLast verified: ${account.lastVerified ?? 'never'}${agentInfo}`,
    };
  }

  private async startAgent(accountId: string, input: Record<string, unknown>): Promise<ToolResult> {
    const mgr = TwitterAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };

    if (TwitterAgent.getAgent(accountId)) {
      return { success: false, output: '', error: 'Agent already running for this account. Use stop_agent first.' };
    }

    const actions = (input.actions as string[] | undefined) ?? ['like', 'reply'];
    const config: TwitterAgentConfig = {
      accountId,
      actions: actions as any[],
      schedule: {
        tweet: { intervalMinutes: 180, dailyLimit: 3 },
        reply: { intervalMinutes: 30, dailyLimit: 15 },
        like: { intervalMinutes: 10, dailyLimit: 50 },
        retweet: { intervalMinutes: 120, dailyLimit: 5 },
        follow: { intervalMinutes: 45, dailyLimit: 20 },
        thread: { intervalMinutes: 360, dailyLimit: 1 },
      },
      activeHours: {
        weekday: { start: 8, end: 22 },
        weekend: { start: 10, end: 23 },
      },
      content: {
        tone: (input.tone as string) ?? 'insightful and authentic',
        language: (input.language as string) ?? 'English',
        topics: (input.topics as string[]) ?? ['AI', 'technology'],
        hashtags: (input.hashtags as string[]) ?? ['#AI', '#Tech'],
        targetAccounts: (input.targetAccounts as string[]) ?? [],
        promoFrequency: 0,
        maxLength: 280,
      },
      safety: {
        minDelaySeconds: 60,
        maxActionsPerHour: 10,
        pauseOnErrorCount: 3,
        pauseDurationMinutes: 60,
      },
      testMode: (input.testMode as boolean) ?? false,
    };

    const agent = TwitterAgent.createAgent(config);
    await agent.start();

    const status = agent.getStatus();
    return {
      success: true,
      output: `Twitter/X agent started for ${account.name}!\nState: ${status.state}\nActions: ${actions.join(', ')}\nTest mode: ${config.testMode ? 'ON' : 'OFF'}\nLanguage: ${config.content.language}\nTopics: ${config.content.topics.join(', ')}\nHashtags: ${config.content.hashtags.join(', ')}\n\nThe agent will autonomously like, reply, tweet, and interact on X. Check status with agent_status or logs with agent_logs.`,
    };
  }

  private async stopAgent(accountId: string): Promise<ToolResult> {
    const agent = TwitterAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };

    const stats = agent.getStatus().stats;
    await agent.stop();
    TwitterAgent.removeAgent(accountId);

    return {
      success: true,
      output: `Agent stopped. Final stats: ${stats.totalActions} total actions, ${stats.tweets} tweets, ${stats.replies} replies, ${stats.likes} likes, ${stats.retweets} retweets, ${stats.errors} errors.`,
    };
  }

  private pauseAgent(accountId: string): ToolResult {
    const agent = TwitterAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };
    agent.pause();
    return { success: true, output: `Agent paused for account ${accountId}.` };
  }

  private resumeAgent(accountId: string): ToolResult {
    const agent = TwitterAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };
    agent.resume();
    return { success: true, output: `Agent resumed for account ${accountId}.` };
  }

  private agentStatus(accountId: string): ToolResult {
    const agent = TwitterAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };

    const s = agent.getStatus();
    return {
      success: true,
      output: `Agent Status: ${s.state}\nRunning since: ${s.startedAt ?? 'N/A'}\nLast action: ${s.lastAction ?? 'none'} at ${s.lastActionTime ?? 'N/A'}\nNext action: ${s.nextActionTime ?? 'N/A'}\nStats: ${s.stats.totalActions} total | ${s.stats.tweets} tweets | ${s.stats.replies} replies | ${s.stats.likes} likes | ${s.stats.retweets} retweets | ${s.stats.follows} follows | ${s.stats.errors} errors`,
    };
  }

  private agentLogs(accountId: string, limit: number): ToolResult {
    const agent = TwitterAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };

    const logs = agent.getLogs(limit);
    if (logs.length === 0) return { success: true, output: 'No logs yet.' };

    const lines = logs.map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString('en-US');
      const statusIcon = l.status === 'success' ? 'OK' : l.status === 'error' ? 'FAIL' : l.status.toUpperCase();
      return `[${time}] ${statusIcon} ${l.action}: ${l.message}${l.details ? ` (${l.details})` : ''}`;
    });

    return { success: true, output: `Recent logs (${logs.length}):\n${lines.join('\n')}` };
  }

  private async openTwitter(accountId: string, url?: string): Promise<ToolResult> {
    const mgr = TwitterAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };
    if (!account.cookies?.length) return { success: false, output: '', error: 'No cookies loaded for this account. Import cookies first.' };

    const browserMgr = BrowserSessionManager.getInstance();
    const session = await browserMgr.createSession(undefined, false);

    // Get page and inject cookies
    const page = browserMgr.getPage(session.id);
    if (!page) return { success: false, output: '', error: 'Failed to get browser page' };

    // Navigate to x.com first so cookies can be set for the domain
    await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const context = page.context();
    await context.addCookies(account.cookies);

    // Navigate to target URL
    const targetUrl = url ?? 'https://x.com/home';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();

    this.log('Opened Twitter session', { accountId, url: targetUrl, sessionId: session.id });
    return {
      success: true,
      output: `[session:${session.id}] X/Twitter opened as ${account.name}\nPage: ${title}\nURL: ${page.url()}\n\nYou can watch this session live in Browser View.`,
    };
  }

  private async postTweet(accountId: string, content: string): Promise<ToolResult> {
    const mgr = TwitterAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };
    if (!account.cookies?.length) return { success: false, output: '', error: 'No cookies loaded. Import cookies first.' };

    const browserMgr = BrowserSessionManager.getInstance();
    const session = await browserMgr.createSession(undefined, false);
    const page = browserMgr.getPage(session.id);
    if (!page) return { success: false, output: '', error: 'Failed to get browser page' };

    // Inject cookies — navigate to x.com first for domain context
    await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const context = page.context();
    await context.addCookies(account.cookies);

    // Navigate to compose tweet
    await page.goto('https://x.com/compose/tweet', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Find the tweet textarea
    const textareaSelector = '[data-testid="tweetTextarea_0"]';
    try {
      await page.waitForSelector(textareaSelector, { timeout: 10000 });
    } catch {
      await browserMgr.closeSession(session.id);
      return { success: false, output: '', error: 'Could not find tweet compose textarea. Twitter UI may have changed or cookies expired.' };
    }

    const textarea = await page.$(textareaSelector);
    if (!textarea) {
      await browserMgr.closeSession(session.id);
      return { success: false, output: '', error: 'Tweet textarea not found after wait.' };
    }

    // Click to focus and type content with human-like delays
    await textarea.click();
    await page.waitForTimeout(500);

    for (const char of content) {
      await textarea.type(char, { delay: 30 + Math.random() * 60 });
    }

    await page.waitForTimeout(1500);

    // Click the tweet/post button
    const tweetBtnSelector = '[data-testid="tweetButton"]';
    let posted = false;
    try {
      await page.click(tweetBtnSelector, { timeout: 5000 });
      posted = true;
    } catch {
      // Fallback selectors
      const fallbackSelectors = [
        '[data-testid="tweetButtonInline"]',
        'button[data-testid="tweetButton"]',
      ];
      for (const sel of fallbackSelectors) {
        try {
          await page.click(sel, { timeout: 3000 });
          posted = true;
          break;
        } catch { /* try next */ }
      }
    }

    await page.waitForTimeout(3000);
    await browserMgr.closeSession(session.id);

    if (posted) {
      this.log('Posted tweet', { accountId, contentLength: content.length });
      return { success: true, output: `[session:${session.id}] Tweet posted as ${account.name}!\nContent: ${content.slice(0, 140)}${content.length > 140 ? '...' : ''}` };
    } else {
      return { success: false, output: '', error: 'Typed content but could not find the Tweet button. Check manually.' };
    }
  }

  private async navigateTwitter(accountId: string, url: string): Promise<ToolResult> {
    // Reuse openTwitter with custom URL
    return this.openTwitter(accountId, url);
  }
}
