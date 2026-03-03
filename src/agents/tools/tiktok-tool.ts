/**
 * TikTokTool — Exposes TikTok account management and autonomous engagement agent
 * control to the chat AI. Wraps TikTokAccountManager + TikTokAgent.
 */
import { BaseTool, ToolResult } from './base-tool.js';
import { TikTokAccountManager } from '../../actions/browser/tiktok-manager.js';
import { TikTokAgent, type TikTokAgentConfig } from '../../actions/browser/tiktok-agent.js';

export class TikTokTool extends BaseTool {
  name = 'tiktok';
  description = `TikTok account management and autonomous engagement agent. Actions:
- list_accounts: Show all TikTok accounts
- account_status(accountId): Get account status and details
- start_agent(accountId, actions?, language?, tone?, topics?, hashtags?, targetAccounts?, testMode?): Start autonomous engagement agent
- stop_agent(accountId): Stop agent
- pause_agent(accountId): Pause agent
- resume_agent(accountId): Resume agent
- agent_status(accountId): Get agent status and stats
- agent_logs(accountId, limit?): Get recent agent logs
- open_tiktok(accountId, url?): Open TikTok in browser with cookies`;

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

        case 'open_tiktok':
          if (!accountId) return { success: false, output: '', error: 'accountId required' };
          return this.openTikTok(accountId, input.url as string | undefined);

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Available: list_accounts, account_status, start_agent, stop_agent, pause_agent, resume_agent, agent_status, agent_logs, open_tiktok` };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error('TikTok tool error', { action, error: message });
      return { success: false, output: '', error: `TikTok error: ${message}` };
    }
  }

  private listAccounts(): ToolResult {
    const mgr = TikTokAccountManager.getInstance();
    const accounts = mgr.listAccounts();

    if (accounts.length === 0) {
      return { success: true, output: 'No TikTok accounts configured. Add accounts from the TikTok tab in the web UI.' };
    }

    const lines = accounts.map(a => {
      const agent = TikTokAgent.getAgent(a.id);
      const agentStatus = agent ? ` | Agent: ${agent.getStatus().state}` : '';
      return `- ${a.name} (${a.id}) — Status: ${a.status}${agentStatus}`;
    });

    return { success: true, output: `TikTok Accounts (${accounts.length}):\n${lines.join('\n')}` };
  }

  private accountStatus(accountId: string): ToolResult {
    const mgr = TikTokAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };

    const agent = TikTokAgent.getAgent(accountId);
    const agentInfo = agent ? `\nAgent: ${agent.getStatus().state} (${agent.getStatus().stats.totalActions} actions)` : '\nAgent: not running';

    return {
      success: true,
      output: `Account: ${account.name}\nID: ${account.id}\nStatus: ${account.status}\nCookies: ${account.cookies?.length ?? 0} cookies loaded\nLast verified: ${account.lastVerified ?? 'never'}${agentInfo}`,
    };
  }

  private async startAgent(accountId: string, input: Record<string, unknown>): Promise<ToolResult> {
    const mgr = TikTokAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };

    if (TikTokAgent.getAgent(accountId)) {
      return { success: false, output: '', error: 'Agent already running for this account. Use stop_agent first.' };
    }

    const actions = (input.actions as string[] | undefined) ?? ['like', 'follow'];
    const config: TikTokAgentConfig = {
      accountId,
      actions: actions as TikTokAgentConfig['actions'],
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
        tone: (input.tone as string) ?? 'AI enthusiast, authentic and friendly',
        language: (input.language as string) ?? 'English',
        topics: (input.topics as string[]) ?? ['AI', 'technology'],
        hashtags: (input.hashtags as string[]) ?? ['#AI', '#Tech'],
        targetAccounts: (input.targetAccounts as string[]) ?? [],
        maxLength: 150,
      },
      safety: {
        minDelaySeconds: 180,
        maxActionsPerHour: 5,
        pauseOnErrorCount: 2,
        pauseDurationMinutes: 120,
      },
      testMode: (input.testMode as boolean) ?? false,
    };

    const agent = TikTokAgent.createAgent(config);
    await agent.start();

    const status = agent.getStatus();
    return {
      success: true,
      output: `TikTok agent started for ${account.name}!\nState: ${status.state}\nActions: ${actions.join(', ')}\nTest mode: ${config.testMode ? 'ON' : 'OFF'}\nLanguage: ${config.content.language}\nTopics: ${config.content.topics.join(', ')}\n\nThe agent will autonomously like, comment, follow, and save on TikTok. Check status with agent_status or logs with agent_logs.`,
    };
  }

  private async stopAgent(accountId: string): Promise<ToolResult> {
    const agent = TikTokAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };

    const stats = agent.getStatus().stats;
    await agent.stop();
    TikTokAgent.removeAgent(accountId);

    return {
      success: true,
      output: `Agent stopped. Final stats: ${stats.totalActions} total actions, ${stats.likes} likes, ${stats.comments} comments, ${stats.follows} follows, ${stats.saves} saves, ${stats.errors} errors.`,
    };
  }

  private pauseAgent(accountId: string): ToolResult {
    const agent = TikTokAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };
    agent.pause();
    return { success: true, output: `Agent paused for account ${accountId}.` };
  }

  private resumeAgent(accountId: string): ToolResult {
    const agent = TikTokAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };
    agent.resume();
    return { success: true, output: `Agent resumed for account ${accountId}.` };
  }

  private agentStatus(accountId: string): ToolResult {
    const agent = TikTokAgent.getAgent(accountId);
    if (!agent) return { success: false, output: '', error: 'No agent running for this account' };

    const s = agent.getStatus();
    return {
      success: true,
      output: `Agent Status: ${s.state}\nRunning since: ${s.startedAt ?? 'N/A'}\nLast action: ${s.lastAction ?? 'none'} at ${s.lastActionTime ?? 'N/A'}\nNext action: ${s.nextActionTime ?? 'N/A'}\nStats: ${s.stats.totalActions} total | ${s.stats.likes} likes | ${s.stats.comments} comments | ${s.stats.follows} follows | ${s.stats.saves} saves | ${s.stats.errors} errors`,
    };
  }

  private agentLogs(accountId: string, limit: number): ToolResult {
    const agent = TikTokAgent.getAgent(accountId);
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

  private async openTikTok(accountId: string, url?: string): Promise<ToolResult> {
    const mgr = TikTokAccountManager.getInstance();
    const account = mgr.getAccount(accountId);
    if (!account) return { success: false, output: '', error: `Account not found: ${accountId}` };
    if (!account.cookies?.length) return { success: false, output: '', error: 'No cookies loaded for this account. Import cookies first.' };

    const { sessionId, url: pageUrl } = await mgr.launchSession(accountId, false);

    this.log('Opened TikTok session', { accountId, url: url ?? pageUrl, sessionId });
    return {
      success: true,
      output: `[session:${sessionId}] TikTok opened as ${account.name}\nURL: ${url ?? pageUrl}\n\nYou can watch this session live in Browser View.`,
    };
  }
}
