/**
 * LinkedInTool — Exposes LinkedIn account management and autonomous agent control
 * to the chat AI. Wraps LinkedInAccountManager + LinkedInAgent.
 */
import { BaseTool, ToolResult } from './base-tool.js';
import { LinkedInAccountManager } from '../../actions/browser/linkedin-manager.js';
import { LinkedInAgent, type LinkedInAgentConfig } from '../../actions/browser/linkedin-agent.js';
import { BrowserSessionManager } from '../../actions/browser/session-manager.js';

export class LinkedInTool extends BaseTool {
  name = 'linkedin';
  description = `LinkedIn account management and autonomous engagement agent. Actions:
- list_accounts: Show all LinkedIn accounts
- account_status(accountId): Get account details
- start_agent(accountId, actions?, language?, tone?, topics?, industry?, targetAccounts?, testMode?): Start agent
- stop_agent(accountId): Stop agent
- pause_agent(accountId): Pause agent
- resume_agent(accountId): Resume agent
- agent_status(accountId): Get agent status and stats
- agent_logs(accountId, limit?): Get recent agent logs
- open_linkedin(accountId, url?): Open LinkedIn in browser with cookies
- post(accountId, content): Create a LinkedIn post
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

        case 'open_linkedin':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.openLinkedIn(accountId, input.url as string | undefined);

        case 'post':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          if (!input.content) return { success: false, output: '', error: 'content required' };
          return this.postToLinkedIn(accountId, input.content as string);

        case 'navigate':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          if (!input.url) return { success: false, output: '', error: 'url required' };
          return this.navigateLinkedIn(accountId, input.url as string);

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Available: list_accounts, account_status, start_agent, stop_agent, pause_agent, resume_agent, agent_status, agent_logs, open_linkedin, post, navigate` };
      }
    } catch (err: any) {
      this.error('LinkedIn tool error', { action, error: err.message });
      return { success: false, output: '', error: `LinkedIn error: ${err.message}` };
    }
  }

  private listAccounts(): ToolResult {
    const mgr = LinkedInAccountManager.getInstance();
    const accounts = mgr.listAccounts();

    if (accounts.length === 0) {
      return { success: true, output: 'No LinkedIn accounts configured. Add accounts from the LinkedIn tab in the web UI.' };
    }

    const lines = accounts.map(a => {
      const agent = LinkedInAgent.getAgent(a.id);
      const agentStatus = agent ? ` | Agent: ${agent.getStatus().state}` : '';
      return `- ${a.name} (${a.id}) — Status: ${a.status}${agentStatus}`;
    });

    return { success: true, output: `LinkedIn Accounts (${accounts.length}):\n${lines.join('\n')}` };
  }

  private accountStatus(accountId: string): ToolResult {
    const mgr = LinkedInAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };

    const agent = LinkedInAgent.getAgent(accountId);
    const agentInfo = agent ? `\nAgent: ${agent.getStatus().state} (${agent.getStatus().stats.totalActions} actions)` : '\nAgent: not running';

    return {
      success: true,
      output: `Account: ${account.name}\nID: ${account.id}\nStatus: ${account.status}\nCookies: ${account.cookies?.length ?? 0} cookies loaded\nLast verified: ${account.lastVerified ?? 'never'}${agentInfo}`,
    };
  }

  private async startAgent(accountId: string, input: Record<string, unknown>): Promise<ToolResult> {
    const mgr = LinkedInAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };

    if (LinkedInAgent.getAgent(accountId)) {
      return { success: false, output: '', error: 'Agent already running for this account. Use stop_agent first.' };
    }

    const actions = (input.actions as string[] | undefined) ?? ['like', 'comment'];
    const config: LinkedInAgentConfig = {
      accountId,
      actions: actions as any[],
      schedule: {
        post: { intervalMinutes: 360, dailyLimit: 2 },
        comment: { intervalMinutes: 30, dailyLimit: 10 },
        like: { intervalMinutes: 15, dailyLimit: 30 },
        connect: { intervalMinutes: 60, dailyLimit: 10 },
        article: { intervalMinutes: 720, dailyLimit: 1 },
      },
      activeHours: {
        weekday: { start: 8, end: 22 },
        weekend: { start: 10, end: 23 },
      },
      content: {
        tone: (input.tone as string) ?? 'professional and insightful',
        language: (input.language as string) ?? 'English',
        topics: (input.topics as string[]) ?? ['AI', 'technology', 'startups'],
        industry: (input.industry as string) ?? 'Technology',
        targetAccounts: (input.targetAccounts as string[]) ?? [],
        maxLength: 700,
        promoFrequency: 0,
      },
      safety: {
        minDelaySeconds: 90,
        maxActionsPerHour: 8,
        pauseOnErrorCount: 2,
        pauseDurationMinutes: 60,
      },
      testMode: (input.testMode as boolean) ?? false,
    };

    const agent = LinkedInAgent.createAgent(config);
    await agent.start();

    const status = agent.getStatus();
    return {
      success: true,
      output: `LinkedIn agent started for ${account.name}!\nState: ${status.state}\nActions: ${actions.join(', ')}\nTest mode: ${config.testMode ? 'ON' : 'OFF'}\nLanguage: ${config.content.language}\nIndustry: ${config.content.industry}\n\nThe agent will autonomously like, comment, and engage on LinkedIn. Check status with agent_status or logs with agent_logs.`,
    };
  }

  private async stopAgent(accountId: string): Promise<ToolResult> {
    const agent = LinkedInAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };

    const stats = agent.getStatus().stats;
    await agent.stop();
    LinkedInAgent.removeAgent(accountId);

    return {
      success: true,
      output: `Agent stopped. Final stats: ${stats.totalActions} total actions, ${stats.posts} posts, ${stats.comments} comments, ${stats.likes} likes, ${stats.connections} connections, ${stats.errors} errors.`,
    };
  }

  private pauseAgent(accountId: string): ToolResult {
    const agent = LinkedInAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };
    agent.pause();
    return { success: true, output: `Agent paused for account ${accountId}.` };
  }

  private resumeAgent(accountId: string): ToolResult {
    const agent = LinkedInAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };
    agent.resume();
    return { success: true, output: `Agent resumed for account ${accountId}.` };
  }

  private agentStatus(accountId: string): ToolResult {
    const agent = LinkedInAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };

    const s = agent.getStatus();
    return {
      success: true,
      output: `Agent Status: ${s.state}\nRunning since: ${s.startedAt ?? 'N/A'}\nLast action: ${s.lastAction ?? 'none'} at ${s.lastActionTime ?? 'N/A'}\nNext action: ${s.nextActionTime ?? 'N/A'}\nStats: ${s.stats.totalActions} total | ${s.stats.posts} posts | ${s.stats.comments} comments | ${s.stats.likes} likes | ${s.stats.connections} connections | ${s.stats.articles} articles | ${s.stats.errors} errors`,
    };
  }

  private agentLogs(accountId: string, limit: number): ToolResult {
    const agent = LinkedInAgent.getAgent(accountId);
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

  private async openLinkedIn(accountId: string, url?: string): Promise<ToolResult> {
    const mgr = LinkedInAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };
    if (!account.cookies?.length) return { success: false, output: '', error: 'No cookies loaded for this account. Import cookies first.' };

    const browserMgr = BrowserSessionManager.getInstance();
    const session = await browserMgr.createSession(undefined, false);

    // Get page from session
    const page = browserMgr.getPage(session.id);
    if (!page) return { success: false, output: '', error: 'Failed to get browser page' };

    // Navigate to LinkedIn first (cookies need the domain context)
    await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Inject cookies via Playwright context
    const context = page.context();
    await context.addCookies(account.cookies);

    // Navigate to target URL with cookies applied
    const targetUrl = url ?? 'https://www.linkedin.com/feed/';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();

    this.log('Opened LinkedIn session', { accountId, url: targetUrl, sessionId: session.id });
    return {
      success: true,
      output: `[session:${session.id}] LinkedIn opened as ${account.name}\nPage: ${title}\nURL: ${page.url()}\n\nYou can watch this session live in Browser View.`,
    };
  }

  private async postToLinkedIn(accountId: string, content: string): Promise<ToolResult> {
    const mgr = LinkedInAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };
    if (!account.cookies?.length) return { success: false, output: '', error: 'No cookies loaded. Import cookies first.' };

    const browserMgr = BrowserSessionManager.getInstance();
    const session = await browserMgr.createSession(undefined, false);
    const page = browserMgr.getPage(session.id);
    if (!page) return { success: false, output: '', error: 'Failed to get browser page' };

    // Navigate to LinkedIn first, inject cookies, then go to feed
    const context = page.context();
    await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await context.addCookies(account.cookies);
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click the "Start a post" button
    const startPostSelectors = [
      'button.share-box-feed-entry__trigger',
      'button[aria-label*="Start a post"]',
      'button[aria-label*="start a post"]',
      '.share-box-feed-entry__trigger',
    ];

    let clicked = false;
    for (const sel of startPostSelectors) {
      try {
        await page.click(sel, { timeout: 3000 });
        clicked = true;
        break;
      } catch { /* try next */ }
    }

    if (!clicked) {
      await browserMgr.closeSession(session.id);
      return { success: false, output: '', error: 'Could not find the "Start a post" button. LinkedIn UI may have changed.' };
    }

    await page.waitForTimeout(1500);

    // Type content in the post editor
    const editorSelectors = [
      'div.ql-editor[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      'div[data-placeholder="What do you want to talk about?"]',
    ];

    let textbox = null;
    for (const sel of editorSelectors) {
      try {
        textbox = await page.$(sel);
        if (textbox) break;
      } catch { /* try next */ }
    }

    if (textbox) {
      for (const char of content) {
        await textbox.type(char, { delay: 50 + Math.random() * 80 });
      }
    } else {
      await browserMgr.closeSession(session.id);
      return { success: false, output: '', error: 'Could not find the post editor. LinkedIn UI may have changed.' };
    }

    await page.waitForTimeout(1500);

    // Click Post button
    const postBtnSelectors = [
      'button.share-actions__primary-action',
      'button[aria-label="Post"]',
      'button[aria-label="post"]',
      'button:has-text("Post")',
    ];

    let posted = false;
    for (const sel of postBtnSelectors) {
      try {
        await page.click(sel, { timeout: 3000 });
        posted = true;
        break;
      } catch { /* try next */ }
    }

    await page.waitForTimeout(3000);
    await browserMgr.closeSession(session.id);

    if (posted) {
      this.log('Posted to LinkedIn', { accountId, contentLength: content.length });
      return { success: true, output: `[session:${session.id}] Posted to LinkedIn as ${account.name}!\nContent: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}` };
    } else {
      return { success: false, output: '', error: 'Typed content but could not find the Post button. Check manually.' };
    }
  }

  private async navigateLinkedIn(accountId: string, url: string): Promise<ToolResult> {
    // Reuse openLinkedIn with custom URL
    return this.openLinkedIn(accountId, url);
  }
}
