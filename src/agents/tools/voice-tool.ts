/**
 * VoiceTool — Exposes voice call capabilities to the chat AI.
 * Wraps TwilioVoiceAgent for making/receiving calls via Twilio + OpenAI Realtime.
 */
import { BaseTool, ToolResult } from './base-tool.js';
import { TwilioVoiceAgent } from '../../actions/voice/twilio-voice-agent.js';

export class VoiceTool extends BaseTool {
  name = 'voice';
  description = `Voice call management via Twilio + OpenAI Realtime. Actions:
- make_call(to): Make an outbound phone call to a number (international format, e.g. +972501234567)
- hangup(callSid): End an active call
- call_history(limit?): Get recent call history
- call_stats: Get call statistics (total, completed, avg duration, active)
- active_calls: List currently active calls
- get_config: Get current voice agent configuration
- update_config(instructions?, voice?, language?, model?): Update voice agent settings`;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;

    try {
      const agent = TwilioVoiceAgent.getInstance();

      switch (action) {
        case 'make_call':
          return this.makeCall(agent, input);

        case 'hangup':
          return this.hangup(agent, input);

        case 'call_history':
          return this.callHistory(agent, input);

        case 'call_stats':
          return this.callStats(agent);

        case 'active_calls':
          return this.activeCalls(agent);

        case 'get_config':
          return this.getConfig(agent);

        case 'update_config':
          return this.updateConfig(agent, input);

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Available: make_call, hangup, call_history, call_stats, active_calls, get_config, update_config` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error('Voice tool error', { action, error: msg });
      return { success: false, output: '', error: `Voice error: ${msg}` };
    }
  }

  private async makeCall(agent: TwilioVoiceAgent, input: Record<string, unknown>): Promise<ToolResult> {
    const to = input.to as string;
    if (!to) return { success: false, output: '', error: 'Phone number (to) is required. Use international format: +972501234567' };

    const callSid = await agent.initiateOutboundCall(to, input.instructions as string | undefined);
    return {
      success: true,
      output: `Call initiated to ${to}\nCall SID: ${callSid}\nThe AI voice agent will handle the conversation. Use active_calls to monitor or hangup to end the call.`,
    };
  }

  private async hangup(agent: TwilioVoiceAgent, input: Record<string, unknown>): Promise<ToolResult> {
    const callSid = input.callSid as string;
    if (!callSid) return { success: false, output: '', error: 'callSid is required' };

    await agent.hangupCall(callSid);
    return { success: true, output: `Call ${callSid} ended.` };
  }

  private async callHistory(agent: TwilioVoiceAgent, input: Record<string, unknown>): Promise<ToolResult> {
    const limit = (input.limit as number) ?? 20;
    const calls = await agent.getCallHistory(limit);

    if (calls.length === 0) {
      return { success: true, output: 'No call history yet.' };
    }

    const lines = calls.map(c => {
      const dir = c.direction === 'inbound' ? 'IN' : 'OUT';
      const dur = c.duration > 0 ? `${c.duration}s` : '-';
      const time = new Date(c.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      return `[${time}] ${dir} ${c.from_number} → ${c.to_number} | ${c.status} | ${dur}`;
    });

    return { success: true, output: `Call History (${calls.length}):\n${lines.join('\n')}` };
  }

  private async callStats(agent: TwilioVoiceAgent): Promise<ToolResult> {
    const stats = await agent.getCallStats();
    return {
      success: true,
      output: `Call Statistics:\n- Total calls: ${stats.totalCalls}\n- Completed: ${stats.completedCalls}\n- Avg duration: ${stats.avgDuration}s\n- Active now: ${stats.activeCalls}\n- Today: ${stats.todayCalls}`,
    };
  }

  private activeCalls(agent: TwilioVoiceAgent): ToolResult {
    const calls = agent.getActiveCalls();
    if (calls.length === 0) {
      return { success: true, output: 'No active calls.' };
    }

    const lines = calls.map(c => {
      const dir = c.direction === 'inbound' ? 'IN' : 'OUT';
      return `- ${dir} ${c.from || '?'} → ${c.to || '?'} (SID: ${c.callSid}) started ${c.startedAt}`;
    });

    return { success: true, output: `Active Calls (${calls.length}):\n${lines.join('\n')}` };
  }

  private getConfig(agent: TwilioVoiceAgent): ToolResult {
    const cfg = agent.getConfig();
    return {
      success: true,
      output: `Voice Agent Config:\n- Voice: ${cfg.voice}\n- Language: ${cfg.language}\n- Model: ${cfg.model}\n- Instructions: ${cfg.instructions.slice(0, 200)}${cfg.instructions.length > 200 ? '...' : ''}`,
    };
  }

  private updateConfig(agent: TwilioVoiceAgent, input: Record<string, unknown>): ToolResult {
    const updates: Record<string, unknown> = {};
    if (input.instructions) updates.instructions = input.instructions;
    if (input.voice) updates.voice = input.voice;
    if (input.language) updates.language = input.language;
    if (input.model) updates.model = input.model;

    if (Object.keys(updates).length === 0) {
      return { success: false, output: '', error: 'Provide at least one field to update: instructions, voice, language, model' };
    }

    const cfg = agent.updateConfig(updates as any);
    return {
      success: true,
      output: `Voice agent config updated.\n- Voice: ${cfg.voice}\n- Language: ${cfg.language}\n- Model: ${cfg.model}`,
    };
  }
}
