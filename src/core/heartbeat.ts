import logger from '../utils/logger.js';
import { MetaAgent } from './meta-agent.js';
import { SelfRepair } from './self-repair.js';
import { GoalEngine } from './goals.js';
import { GoalPlanner } from './goal-planner.js';
import { AutoUpgrade } from './auto-upgrade.js';

export interface HeartbeatAlert {
  type: 'overdue_task' | 'server_down' | 'goal_update' | 'self_repair' | 'proactive_tip' | 'morning_briefing' | 'evening_summary' | 'openclaw_health' | 'openclaw_recovery' | 'daily_summary';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  userId: string;
  platform: string;
}

export type AlertSender = (alert: HeartbeatAlert) => Promise<void>;

interface HeartbeatCheck {
  name: string;
  intervalMs: number;
  lastRun: number;
  fn: () => Promise<HeartbeatAlert[]>;
}

export class Heartbeat {
  private checks: HeartbeatCheck[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private alertSender: AlertSender | null = null;
  private running = false;
  private ticking = false; // prevent overlapping ticks

  // Subsystems
  private meta: MetaAgent | null = null;
  private selfRepair: SelfRepair | null = null;
  private goals: GoalEngine | null = null;
  private planner: GoalPlanner | null = null;
  private autoUpgrade: AutoUpgrade | null = null;
  private upgradeSources: string[] = [];

  // Data functions injected from index.ts
  private getOverdueTasks?: () => Promise<Array<{ userId: string; platform: string; title: string; dueDate: Date | null }>>;
  private getServerStatuses?: () => Promise<Array<{ userId: string; platform: string; name: string; host: string; status: string | null }>>;

  // OpenClaw bridge functions
  private openclawExecutor?: (action: string, params?: Record<string, unknown>) => Promise<{ output: string; success: boolean; error?: string }>;
  private sshExecutor?: (command: string) => Promise<string>;
  private openclawLastDown = false;
  private dailySummaryLastDate = '';

  // OpenClaw chat polling state
  private openclawLastSeenTs = 0; // epoch ms of last seen message

  setSubsystems(subs: {
    meta?: MetaAgent;
    selfRepair?: SelfRepair;
    goals?: GoalEngine;
    planner?: GoalPlanner;
    autoUpgrade?: AutoUpgrade;
    upgradeSources?: string[];
  }) {
    this.meta = subs.meta ?? null;
    this.selfRepair = subs.selfRepair ?? null;
    this.goals = subs.goals ?? null;
    this.planner = subs.planner ?? null;
    this.autoUpgrade = subs.autoUpgrade ?? null;
    this.upgradeSources = subs.upgradeSources ?? [];
  }

  setDataFunctions(fns: {
    getOverdueTasks?: () => Promise<Array<{ userId: string; platform: string; title: string; dueDate: Date | null }>>;
    getServerStatuses?: () => Promise<Array<{ userId: string; platform: string; name: string; host: string; status: string | null }>>;
  }) {
    this.getOverdueTasks = fns.getOverdueTasks;
    this.getServerStatuses = fns.getServerStatuses;
  }

  setOpenClawFunctions(fns: {
    executor?: (action: string, params?: Record<string, unknown>) => Promise<{ output: string; success: boolean; error?: string }>;
    sshExecutor?: (command: string) => Promise<string>;
  }) {
    this.openclawExecutor = fns.executor;
    this.sshExecutor = fns.sshExecutor;
  }

  setAlertSender(sender: AlertSender) {
    this.alertSender = sender;
  }

  start(tickIntervalMs = 60_000) {
    if (this.running) return;
    this.running = true;

    // Register built-in checks
    this.registerCheck('self-diagnosis', 15 * 60_000, () => this.runSelfDiagnosis());
    this.registerCheck('overdue-tasks', 15 * 60_000, () => this.checkOverdueTasks());
    this.registerCheck('server-health', 10 * 60_000, () => this.checkServerHealth());
    this.registerCheck('goal-pursuit', 5 * 60_000, () => this.pursueGoals());
    this.registerCheck('auto-upgrade', 24 * 60 * 60_000, () => this.checkUpgrades());
    // Skip initial tick for OpenClaw checks — they're heavy (SSH calls) and conflict with early message processing
    this.registerCheck('openclaw-health', 30 * 60_000, () => this.checkOpenClawHealth(), true);
    this.registerCheck('openclaw-chat-poll', 60 * 60_000, () => this.pollOpenClawChat(), true);
    this.registerCheck('daily-summary', 5 * 60_000, () => this.checkDailySummary());

    this.timer = setInterval(() => this.tick(), tickIntervalMs);
    logger.info('💓 Heartbeat started', { tickInterval: tickIntervalMs, checks: this.checks.length });

    // Initial tick after 10 seconds
    setTimeout(() => this.tick(), 10_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('Heartbeat stopped');
  }

  registerCheck(name: string, intervalMs: number, fn: () => Promise<HeartbeatAlert[]>, skipInitialTick = false) {
    // If skipInitialTick, pretend the check just ran so it waits a full interval before first execution
    this.checks.push({ name, intervalMs, lastRun: skipInitialTick ? Date.now() : 0, fn });
  }

  private async tick() {
    if (this.ticking) return; // skip if previous tick is still running
    this.ticking = true;
    try {
      const now = Date.now();
      for (const check of this.checks) {
        if (now - check.lastRun >= check.intervalMs) {
          check.lastRun = now;
          try {
            const alerts = await check.fn();
            for (const alert of alerts) {
              await this.sendAlert(alert);
            }
          } catch (err: any) {
            logger.warn(`Heartbeat check "${check.name}" failed`, { error: err.message });
          }
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private async sendAlert(alert: HeartbeatAlert) {
    if (!this.alertSender) {
      logger.info('🔔 ALERT (no sender)', { type: alert.type, title: alert.title });
      return;
    }
    try {
      await this.alertSender(alert);
    } catch (err: any) {
      logger.error('Failed to send alert', { error: err.message, type: alert.type });
    }
  }

  private async runSelfDiagnosis(): Promise<HeartbeatAlert[]> {
    if (!this.selfRepair) return [];
    const alerts: HeartbeatAlert[] = [];

    try {
      const { repaired, failed } = await this.selfRepair.diagnoseAndRepair();
      if (repaired.length > 0) {
        logger.info('Self-repair completed', { repaired });
      }
      for (const issue of failed) {
        alerts.push({
          type: 'self_repair',
          severity: 'high',
          title: '⚠️ Unresolved Issue',
          message: `Could not auto-fix: ${issue}. Please check manually.`,
          userId: 'admin',
          platform: 'telegram',
        });
      }
    } catch (err: any) {
      logger.warn('Self-diagnosis failed', { error: err.message });
    }

    return alerts;
  }

  private async checkOverdueTasks(): Promise<HeartbeatAlert[]> {
    if (!this.getOverdueTasks) return [];
    const alerts: HeartbeatAlert[] = [];

    try {
      const overdue = await this.getOverdueTasks();
      for (const task of overdue) {
        alerts.push({
          type: 'overdue_task',
          severity: 'high',
          title: `⏰ Overdue: ${task.title}`,
          message: `Your task "${task.title}" was due ${task.dueDate ? task.dueDate.toLocaleDateString() : 'recently'}. Want me to reschedule or mark done?`,
          userId: task.userId,
          platform: task.platform,
        });
      }
    } catch (err: any) {
      logger.warn('Overdue tasks check failed', { error: err.message });
    }

    return alerts;
  }

  private async checkServerHealth(): Promise<HeartbeatAlert[]> {
    if (!this.getServerStatuses) return [];
    const alerts: HeartbeatAlert[] = [];

    try {
      const servers = await this.getServerStatuses();
      for (const server of servers) {
        if (server.status === 'down' || server.status === 'error') {
          alerts.push({
            type: 'server_down',
            severity: 'critical',
            title: `🔴 Server down: ${server.name}`,
            message: `Server "${server.name}" (${server.host}) is down. Want me to investigate?`,
            userId: server.userId,
            platform: server.platform,
          });
        }
      }
    } catch (err: any) {
      logger.warn('Server health check failed', { error: err.message });
    }

    return alerts;
  }

  private async pursueGoals(): Promise<HeartbeatAlert[]> {
    if (!this.goals || !this.planner) return [];
    const alerts: HeartbeatAlert[] = [];

    try {
      const activeGoals = this.goals.getAllActiveGoals();
      for (const goal of activeGoals) {
        // If goal has no steps yet — plan it
        if (goal.steps.length === 0 || goal.status === 'active') {
          const steps = await this.planner.planGoal(goal);
          this.goals.setSteps(goal.id, steps);
          logger.info('Goal planned by heartbeat', { goalId: goal.id, steps: steps.length });
          continue;
        }

        // If goal is blocked — replan with a different strategy
        if (goal.status === 'blocked') {
          const failedStep = goal.steps.find(s => s.status === 'failed');
          if (failedStep) {
            const newSteps = await this.planner.replan(goal, failedStep);
            if (newSteps.length > 0) {
              this.goals.setSteps(goal.id, newSteps);
              logger.info('Goal replanned by heartbeat', { goalId: goal.id, newSteps: newSteps.length });
            } else {
              alerts.push({
                type: 'goal_update',
                severity: 'high',
                title: `🎯 Goal stuck: ${goal.description}`,
                message: `I tried multiple strategies but couldn't advance this goal. Need your help.`,
                userId: goal.userId,
                platform: 'telegram',
              });
            }
          }
          continue;
        }

        // If pursuing — try to advance current step
        if (goal.status === 'pursuing') {
          const currentStep = this.goals.getCurrentStep(goal.id);
          if (!currentStep) continue;

          // Mark step as running
          currentStep.status = 'running';
          currentStep.startedAt = new Date();

          try {
            // For now, log the step — actual tool execution requires engine integration
            logger.info('Goal step executing', {
              goalId: goal.id,
              step: currentStep.description,
              tool: currentStep.tool,
              stepIndex: goal.currentStepIndex,
            });

            // Mark step completed (actual execution would check real results)
            this.goals.completeStep(goal.id, goal.currentStepIndex, `Step executed: ${currentStep.description}`);

            // If goal just completed, notify user
            const updatedGoal = this.goals.getGoal(goal.id);
            if (updatedGoal?.status === 'completed') {
              alerts.push({
                type: 'goal_update',
                severity: 'low',
                title: `🎯 Goal completed!`,
                message: `I finished: "${goal.description}"`,
                userId: goal.userId,
                platform: 'telegram',
              });
            }
          } catch (err: any) {
            const action = this.goals.failStep(goal.id, goal.currentStepIndex, err.message);
            if (action === 'replan') {
              const newSteps = await this.planner.replan(goal, currentStep);
              if (newSteps.length > 0) {
                this.goals.setSteps(goal.id, newSteps);
              }
            } else if (action === 'give_up') {
              alerts.push({
                type: 'goal_update',
                severity: 'high',
                title: `🎯 Goal failed: ${goal.description}`,
                message: `Reached max attempts (${goal.maxTotalAttempts}). I'll stop trying.`,
                userId: goal.userId,
                platform: 'telegram',
              });
            }
            // 'retry' — will try again on next heartbeat tick
          }
        }
      }
    } catch (err: any) {
      logger.warn('Goal pursuit failed', { error: err.message });
    }

    return alerts;
  }

  private async checkUpgrades(): Promise<HeartbeatAlert[]> {
    if (!this.autoUpgrade || this.upgradeSources.length === 0) return [];
    const alerts: HeartbeatAlert[] = [];

    try {
      const available = await this.autoUpgrade.checkForUpgrades(this.upgradeSources);
      for (const upgrade of available) {
        const applied = await this.autoUpgrade.applyUpgrade(upgrade);
        if (applied) {
          alerts.push({
            type: 'proactive_tip',
            severity: 'low',
            title: `🆕 New skill installed: ${upgrade.name}`,
            message: `I found and installed a new skill: "${upgrade.name}" — ${upgrade.description}`,
            userId: 'admin',
            platform: 'telegram',
          });
        }
      }
    } catch (err: any) {
      logger.warn('Auto-upgrade check failed', { error: err.message });
    }

    return alerts;
  }

  // ── OpenClaw Health Check (every 30 min) ──────────────────────────
  private async checkOpenClawHealth(): Promise<HeartbeatAlert[]> {
    if (!this.openclawExecutor) return [];
    const alerts: HeartbeatAlert[] = [];

    try {
      const healthResult = await this.openclawExecutor('health');

      if (!healthResult.success || healthResult.output.includes('error') || healthResult.output.includes('ECONNREFUSED')) {
        logger.warn('OpenClaw health check failed', { output: healthResult.output?.slice(0, 200) });

        // Try auto-recovery
        if (this.sshExecutor) {
          try {
            logger.info('Attempting OpenClaw auto-recovery...');
            await this.sshExecutor('su - openclaw -c "pm2 restart openclaw-gateway" 2>&1 || systemctl restart openclaw 2>&1 || echo "restart-failed"');

            // Wait 15 seconds then re-check
            await new Promise(r => setTimeout(r, 15_000));
            const recheck = await this.openclawExecutor('health');

            if (recheck.success && !recheck.output.includes('error')) {
              logger.info('OpenClaw auto-recovered successfully');
              this.openclawLastDown = false;
              alerts.push({
                type: 'openclaw_recovery',
                severity: 'medium',
                title: '🟢 OpenClaw שוחזר בהצלחה!',
                message: 'OpenClaw היה למטה אבל הצלחתי להפעיל אותו מחדש אוטומטית.',
                userId: 'admin',
                platform: 'telegram',
              });
              return alerts;
            }
          } catch (recoverErr: any) {
            logger.error('OpenClaw auto-recovery failed', { error: recoverErr.message });
          }
        }

        // Recovery failed or no SSH — alert the admin
        if (!this.openclawLastDown) {
          this.openclawLastDown = true;
          alerts.push({
            type: 'openclaw_health',
            severity: 'critical',
            title: '🔴 OpenClaw למטה!',
            message: `OpenClaw לא מגיב. ניסיתי הפעלה מחדש אוטומטית אבל לא הצלחתי.\nשגיאה: ${healthResult.error || healthResult.output?.slice(0, 200) || 'No response'}`,
            userId: 'admin',
            platform: 'telegram',
          });
        }
      } else {
        // OpenClaw is healthy
        if (this.openclawLastDown) {
          this.openclawLastDown = false;
          alerts.push({
            type: 'openclaw_recovery',
            severity: 'low',
            title: '🟢 OpenClaw חזר לפעולה!',
            message: 'OpenClaw חזר לעבוד כרגיל.',
            userId: 'admin',
            platform: 'telegram',
          });
        }

        // Check cron jobs for errors
        try {
          const cronResult = await this.openclawExecutor('cron_list');
          if (cronResult.success && cronResult.output) {
            const cronData = JSON.parse(cronResult.output);
            const payload = cronData?.payload || cronData;
            if (Array.isArray(payload)) {
              const errorCrons = payload.filter((c: any) => c.lastError || c.status === 'error');
              if (errorCrons.length > 0) {
                alerts.push({
                  type: 'openclaw_health',
                  severity: 'medium',
                  title: `⚠️ ${errorCrons.length} cron jobs נכשלים ב-OpenClaw`,
                  message: errorCrons.map((c: any) => `- ${c.name || c.label}: ${c.lastError || 'error'}`).join('\n'),
                  userId: 'admin',
                  platform: 'telegram',
                });
              }
            }
          }
        } catch {
          // Cron check failed silently
        }

        logger.info('OpenClaw health check passed');
      }
    } catch (err: any) {
      logger.warn('OpenClaw health check error', { error: err.message });
    }

    return alerts;
  }

  // ── OpenClaw Chat Polling (every 60 min) ────────────────────────
  // Only forwards MEANINGFUL updates: cron task results, published posts,
  // completed automations, real errors. Filters out ALL heartbeat noise,
  // system prompts, API key warnings, and status check-ins.
  private async pollOpenClawChat(): Promise<HeartbeatAlert[]> {
    if (!this.openclawExecutor) return [];
    const alerts: HeartbeatAlert[] = [];

    try {
      // Step 1: List sessions to find recently active ones
      const sessResult = await this.openclawExecutor('sessions_list');
      if (!sessResult.success || !sessResult.output) return [];

      const sessData = JSON.parse(sessResult.output);
      const sessions = sessData?.payload?.sessions || sessData?.sessions || [];
      if (!Array.isArray(sessions) || sessions.length === 0) return [];

      // Find sessions updated since last poll (skip very old ones)
      const activeSessions = sessions.filter((s: any) => {
        const updatedAt = s.updatedAt || 0;
        return updatedAt > this.openclawLastSeenTs;
      });

      if (activeSessions.length === 0) return [];

      // Step 2: Check chat history — only cron sessions (skip heartbeat entirely)
      const newMessages: Array<{ session: string; role: string; text: string; ts: number }> = [];

      for (const session of activeSessions.slice(0, 5)) {
        // ── Skip heartbeat sessions entirely — they're ALWAYS noise ──
        const sessionKey = (session.key || '').toLowerCase();
        const sessionName = (session.displayName || '').toLowerCase();
        if (sessionKey.includes('heartbeat') || sessionName.includes('heartbeat')) {
          continue;
        }

        try {
          const histResult = await this.openclawExecutor('chat_history', {
            sessionKey: session.key,
            limit: 5,
          });
          if (!histResult.success || !histResult.output) continue;

          const histData = JSON.parse(histResult.output);
          const messages = histData?.payload?.messages || histData?.messages || [];
          if (!Array.isArray(messages)) continue;

          for (const msg of messages) {
            const ts = msg.timestamp || 0;
            if (ts <= this.openclawLastSeenTs) continue;
            if (msg.role === 'user') continue;

            // Extract text from content
            let text = '';
            if (typeof msg.content === 'string') {
              text = msg.content;
            } else if (Array.isArray(msg.content)) {
              text = msg.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n');
            }

            if (!text || text.trim().length < 10) continue;

            // ── Aggressive noise filter ──
            // Skip if it contains ANY of these patterns (system prompts, heartbeat noise, API warnings)
            const lower = text.toLowerCase();
            const isNoise =
              // Heartbeat / status noise
              lower.includes('heartbeat') ||
              lower.includes('heartbeatok') ||
              lower.includes('nothing to report') ||
              lower.includes('nothing new to report') ||
              lower.includes('no new messages') ||
              lower.includes('health check') ||
              // System prompts / instructions (OpenClaw dumps its own prompt)
              lower.includes('critical rules') ||
              lower.includes('do not use the message tool') ||
              lower.includes('use write tool to save') ||
              lower.includes('use systemevent tool') ||
              lower.includes('for the read tool') ||
              lower.includes('read first') ||
              lower.includes('check memory/alerts') ||
              text.includes('# HEARTBEAT') ||
              // API key warnings
              lower.includes('api key') && lower.includes('missing') ||
              lower.includes('apikey') && lower.includes('missing') ||
              lower.includes('braveapikey') ||
              lower.includes('brave search api') ||
              // Generic "I can't" / "I don't know" responses
              lower.includes('i don\'t have enough information') ||
              lower.includes('can you please tell me') ||
              lower.includes('i need credentials') ||
              // Status-only messages
              /^(ok|done|running|alive|ping|pong|status.?ok|completed)$/i.test(text.trim());

            if (isNoise) continue;

            // ── Only keep MEANINGFUL messages ──
            // Must contain evidence of actual work done (posted, created, found, scraped, etc.)
            const isMeaningful =
              lower.includes('published') || lower.includes('posted') || lower.includes('sent') ||
              lower.includes('created') || lower.includes('generated') || lower.includes('found') ||
              lower.includes('scraped') || lower.includes('analyzed') || lower.includes('completed') ||
              lower.includes('error') || lower.includes('failed') || lower.includes('warning') ||
              lower.includes('lead') || lower.includes('trend') || lower.includes('alert') ||
              lower.includes('new post') || lower.includes('uploaded') || lower.includes('scheduled') ||
              lower.includes('results') || lower.includes('report') || lower.includes('data') ||
              sessionKey.includes('cron:'); // Cron results are always potentially interesting

            if (!isMeaningful) continue;

            const sessionLabel = session.key.includes('cron:')
              ? `\u{23F0} ${session.displayName || session.key.split(':').pop()?.slice(0, 12) || 'cron'}`
              : session.displayName || session.key.split(':').pop() || 'main';

            // Clean up the text — remove system noise if it leaked in
            let cleanText = text
              .replace(/# HEARTBEAT\.md[\s\S]*?(?=\n\n|\n[A-Z])/gi, '')
              .replace(/## CRITICAL RULES[\s\S]*?(?=\n\n)/gi, '')
              .replace(/Missing Brave Search API key[^\n]*/gi, '')
              .replace(/BRAVEAPIKEY is missing[^\n]*/gi, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim();

            if (cleanText.length < 10) continue;

            newMessages.push({ session: sessionLabel, role: msg.role, text: cleanText, ts });
          }
        } catch {
          // Skip individual session errors
        }
      }

      // Update timestamp regardless of whether we found messages
      const allTs = [
        ...newMessages.map(m => m.ts),
        ...activeSessions.map((s: any) => s.updatedAt || 0),
      ];
      const maxTs = Math.max(...allTs);
      if (maxTs > this.openclawLastSeenTs) this.openclawLastSeenTs = maxTs;

      if (newMessages.length === 0) return [];

      // Format as clean, human-readable Hebrew summary
      const summary = newMessages
        .map(m => {
          const truncated = m.text.length > 300 ? m.text.slice(0, 300) + '...' : m.text;
          return `${m.session}:\n${truncated}`;
        })
        .join('\n\n\u2500\u2500\u2500\n\n');

      alerts.push({
        type: 'openclaw_health' as any,
        severity: 'low',
        title: `\u{1F990} OpenClaw \u2014 ${newMessages.length} \u05E2\u05D3\u05DB\u05D5\u05E0\u05D9\u05DD`,
        message: summary,
        userId: 'admin',
        platform: 'telegram',
      });

      logger.info('OpenClaw chat poll — meaningful messages found', { count: newMessages.length });
    } catch (err: any) {
      logger.debug('OpenClaw chat poll skipped', { error: err.message });
    }

    return alerts;
  }

  // ── Daily Summary (once per day at ~9:00 AM local time) ──────────
  private async checkDailySummary(): Promise<HeartbeatAlert[]> {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localHour = now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    const hour = parseInt(localHour, 10);
    const today = now.toISOString().split('T')[0];

    // Only run at 9 AM, once per day
    if (hour !== 9 || this.dailySummaryLastDate === today) return [];
    this.dailySummaryLastDate = today;

    const alerts: HeartbeatAlert[] = [];
    const lines: string[] = ['📊 דו"ח יומי — ' + today, ''];

    // ClawdAgent status
    lines.push('🧠 ClawdAgent: ✅ פעיל');
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    lines.push(`  ⏱️ Uptime: ${hours}h ${mins}m`);
    lines.push(`  💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

    // OpenClaw status
    if (this.openclawExecutor) {
      try {
        const health = await this.openclawExecutor('health');
        if (health.success) {
          lines.push('');
          lines.push('💪 OpenClaw: ✅ פעיל');

          const sessions = await this.openclawExecutor('sessions_list');
          if (sessions.success) {
            try {
              const sData = JSON.parse(sessions.output);
              const sList = sData?.payload || sData;
              lines.push(`  📱 Sessions: ${Array.isArray(sList) ? sList.length : '?'}`);
            } catch { /* skip */ }
          }

          const crons = await this.openclawExecutor('cron_list');
          if (crons.success) {
            try {
              const cData = JSON.parse(crons.output);
              const cList = cData?.payload || cData;
              if (Array.isArray(cList)) {
                const active = cList.filter((c: any) => c.enabled !== false);
                const errors = cList.filter((c: any) => c.lastError);
                lines.push(`  ⏰ Cron jobs: ${active.length} active, ${errors.length} errors`);
              }
            } catch { /* skip */ }
          }
        } else {
          lines.push('');
          lines.push('💪 OpenClaw: ❌ לא מגיב');
        }
      } catch {
        lines.push('');
        lines.push('💪 OpenClaw: ❌ שגיאה בבדיקה');
      }
    }

    // Server status
    if (this.sshExecutor) {
      try {
        const uptimeResult = await this.sshExecutor('uptime -p 2>/dev/null && free -h | grep Mem | awk \'{print $3"/"$2}\' && df -h / | tail -1 | awk \'{print $5}\'');
        lines.push('');
        lines.push('🖥️ שרת:');
        const serverLines = uptimeResult.trim().split('\n');
        if (serverLines[0]) lines.push(`  ⏱️ ${serverLines[0]}`);
        if (serverLines[1]) lines.push(`  💾 RAM: ${serverLines[1]}`);
        if (serverLines[2]) lines.push(`  📀 דיסק: ${serverLines[2]} תפוס`);
      } catch { /* skip */ }
    }

    lines.push('');
    lines.push('💡 שלח "מה המצב?" לסטטוס מפורט');

    alerts.push({
      type: 'daily_summary',
      severity: 'low',
      title: '📊 דו"ח בוקר',
      message: lines.join('\n'),
      userId: 'admin',
      platform: 'telegram',
    });

    return alerts;
  }

  isRunning() { return this.running; }
  getChecks() { return this.checks.map(c => ({ name: c.name, intervalMs: c.intervalMs, lastRun: c.lastRun })); }
}
