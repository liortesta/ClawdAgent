/**
 * Twilio Voice Agent — real-time voice conversations via Twilio + OpenAI Realtime API.
 * Handles inbound/outbound calls, bridges Twilio media streams to OpenAI,
 * and stores call history in PostgreSQL.
 */
import WebSocket from 'ws';
import pg from 'pg';
import config from '../../config.js';
import logger from '../../utils/logger.js';

const { Pool } = pg;

// ── Types ─────────────────────────────────────────────────────────────

export interface VoiceCallRecord {
  id: number;
  call_sid: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration: number;
  recording_url: string | null;
  transcript: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallStats {
  totalCalls: number;
  completedCalls: number;
  avgDuration: number;
  activeCalls: number;
  todayCalls: number;
}

export interface ActiveCall {
  callSid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  startedAt: string;
  streamSid: string | null;
}

export interface VoiceAgentConfig {
  instructions: string;
  voice: string;
  language: string;
  model: string;
}

// ── Default Instructions ──────────────────────────────────────────────

const DEFAULT_INSTRUCTIONS = `You are a professional AI phone agent for ClawdAgent.

RULES:
- Greet the caller warmly in Hebrew
- Ask for their name first
- Be helpful, concise, and professional
- If you don't know something, say so honestly
- Collect contact details (name, phone, email) when appropriate
- Summarize action items at the end of the call

LANGUAGE: Hebrew (unless the caller speaks English)`;

// ── Singleton Voice Agent ─────────────────────────────────────────────

let instance: TwilioVoiceAgent | null = null;

export class TwilioVoiceAgent {
  private pool: pg.Pool;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private config: VoiceAgentConfig;

  constructor() {
    this.pool = new Pool({ connectionString: config.DATABASE_URL });
    this.config = {
      instructions: (config as any).VOICE_AGENT_INSTRUCTIONS || DEFAULT_INSTRUCTIONS,
      voice: (config as any).VOICE_AGENT_VOICE || 'ballad',
      language: 'he-IL',
      model: (config as any).OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03',
    };
  }

  static getInstance(): TwilioVoiceAgent {
    if (!instance) instance = new TwilioVoiceAgent();
    return instance;
  }

  getConfig(): VoiceAgentConfig { return { ...this.config }; }

  updateConfig(updates: Partial<VoiceAgentConfig>): VoiceAgentConfig {
    if (updates.instructions) this.config.instructions = updates.instructions;
    if (updates.voice) this.config.voice = updates.voice;
    if (updates.language) this.config.language = updates.language;
    if (updates.model) this.config.model = updates.model;
    return { ...this.config };
  }

  // ── Twilio Webhook — returns TwiML ────────────────────────────────

  async handleIncomingCall(body: Record<string, string>): Promise<string> {
    const callSid = body.CallSid || 'UNKNOWN';
    const from = body.From || 'UNKNOWN';
    const to = body.To || 'UNKNOWN';
    const status = body.CallStatus || 'initiated';

    logger.info('Incoming voice call', { callSid, from, to, status });

    await this.saveCall(callSid, from, to, 'inbound', status);

    // Determine the WebSocket stream URL
    const host = (config as any).PUBLIC_URL || `https://clawdagent.clickdrop.online`;
    const streamUrl = host.replace(/^http/, 'ws') + '/voice-stream';

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
  }

  // ── Call Status Webhook ───────────────────────────────────────────

  async handleCallStatus(body: Record<string, string>): Promise<void> {
    const callSid = body.CallSid;
    const status = body.CallStatus;
    const duration = parseInt(body.CallDuration || '0', 10);

    if (!callSid) return;

    logger.info('Call status update', { callSid, status, duration });

    await this.pool.query(
      'UPDATE voice_calls SET status = $1, duration = $2, updated_at = NOW() WHERE call_sid = $3',
      [status, duration, callSid]
    );

    if (status === 'completed' || status === 'failed' || status === 'no-answer' || status === 'busy') {
      this.activeCalls.delete(callSid);
    }
  }

  // ── WebSocket Media Stream Bridge ─────────────────────────────────

  async handleMediaStream(twilioWs: WebSocket): Promise<void> {
    const openaiKey = (config as any).OPENAI_API_KEY;
    if (!openaiKey) {
      logger.error('OPENAI_API_KEY not configured — cannot handle voice stream');
      twilioWs.close();
      return;
    }

    let openaiWs: WebSocket | null = null;
    let streamSid: string | null = null;
    let callSid: string | null = null;

    try {
      // Create OpenAI Realtime session
      const sessionRes = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: JSON.stringify({
          model: this.config.model,
          voice: this.config.voice,
          instructions: this.config.instructions,
          modalities: ['audio', 'text'],
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
            interrupt_response: true,
          },
        }),
      });

      if (!sessionRes.ok) {
        throw new Error(`OpenAI session creation failed: ${sessionRes.statusText}`);
      }

      const session = await sessionRes.json() as any;
      logger.info('OpenAI Realtime session created', { sessionId: session.id });

      // Connect to OpenAI Realtime WebSocket
      openaiWs = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${this.config.model}`,
        { headers: { 'Authorization': `Bearer ${openaiKey}`, 'OpenAI-Beta': 'realtime=v1' } }
      );

      openaiWs.on('open', () => {
        logger.info('OpenAI Realtime WebSocket connected');
        // Send session config
        openaiWs!.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: this.config.instructions,
            voice: this.config.voice,
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
          },
        }));
      });

      // OpenAI → Twilio: forward audio
      openaiWs.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'response.audio.delta' && streamSid) {
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid,
              media: { payload: msg.delta },
            }));
          } else if (msg.type === 'response.audio_transcript.done') {
            logger.info('AI transcript', { text: msg.transcript?.slice(0, 100) });
          } else if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            logger.info('User transcript', { text: msg.transcript?.slice(0, 100) });
          } else if (msg.type === 'error') {
            logger.error('OpenAI Realtime error', { error: msg.error });
          }
        } catch (err) {
          logger.error('Error parsing OpenAI message', { error: (err as Error).message });
        }
      });

      openaiWs.on('error', (err) => logger.error('OpenAI WS error', { error: err.message }));
      openaiWs.on('close', () => logger.info('OpenAI WS closed'));

      // Twilio → OpenAI: forward audio
      twilioWs.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.event === 'media' && openaiWs?.readyState === WebSocket.OPEN) {
            streamSid = msg.streamSid;
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          } else if (msg.event === 'start') {
            streamSid = msg.start?.streamSid || msg.streamSid;
            callSid = msg.start?.callSid;
            logger.info('Twilio stream started', { streamSid, callSid });
            if (callSid) {
              this.activeCalls.set(callSid, {
                callSid,
                from: '',
                to: '',
                direction: 'inbound',
                startedAt: new Date().toISOString(),
                streamSid,
              });
            }
          } else if (msg.event === 'stop') {
            logger.info('Twilio stream stopped');
            if (callSid) this.activeCalls.delete(callSid);
            openaiWs?.close();
          }
        } catch (err) {
          logger.error('Error processing Twilio message', { error: (err as Error).message });
        }
      });

      twilioWs.on('close', () => {
        logger.info('Twilio WS closed');
        if (callSid) this.activeCalls.delete(callSid);
        openaiWs?.close();
      });

    } catch (err) {
      logger.error('Voice stream setup failed', { error: (err as Error).message });
      openaiWs?.close();
      twilioWs.close();
    }
  }

  // ── Outbound Call ─────────────────────────────────────────────────

  async initiateOutboundCall(to: string, _customInstructions?: string): Promise<string> {
    const sid = (config as any).TWILIO_ACCOUNT_SID;
    const token = (config as any).TWILIO_AUTH_TOKEN;
    const from = (config as any).TWILIO_PHONE_NUMBER;

    if (!sid || !token || !from) {
      throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env');
    }

    const host = (config as any).PUBLIC_URL || 'https://clawdagent.clickdrop.online';

    // Use Twilio REST API to create the call
    const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({
      To: to,
      From: from,
      Url: `${host}/api/voice-agent/twilio-webhook`,
      StatusCallback: `${host}/api/voice-agent/call-status`,
      StatusCallbackEvent: 'initiated ringing answered completed',
    });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Twilio API error ${res.status}: ${errText}`);
    }

    const data = await res.json() as any;
    const callSid = data.sid;

    await this.saveCall(callSid, from, to, 'outbound', 'initiated');

    logger.info('Outbound call initiated', { callSid, to });
    return callSid;
  }

  // ── Hangup ────────────────────────────────────────────────────────

  async hangupCall(callSid: string): Promise<void> {
    const sid = (config as any).TWILIO_ACCOUNT_SID;
    const token = (config as any).TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio not configured');

    const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'Status=completed',
    });

    this.activeCalls.delete(callSid);
    logger.info('Call ended', { callSid });
  }

  // ── Query Methods ─────────────────────────────────────────────────

  async getCallHistory(limit = 50): Promise<VoiceCallRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM voice_calls ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  async getCallStats(): Promise<CallStats> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COALESCE(AVG(duration) FILTER (WHERE duration > 0), 0)::int AS avg_duration,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS today
      FROM voice_calls
    `);
    const row = result.rows[0] || {};
    return {
      totalCalls: row.total || 0,
      completedCalls: row.completed || 0,
      avgDuration: row.avg_duration || 0,
      activeCalls: this.activeCalls.size,
      todayCalls: row.today || 0,
    };
  }

  getActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  // ── Helper ────────────────────────────────────────────────────────

  private async saveCall(callSid: string, from: string, to: string, direction: string, status: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO voice_calls (call_sid, from_number, to_number, direction, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (call_sid) DO UPDATE SET status = $5, updated_at = NOW()`,
        [callSid, from, to, direction, status]
      );
    } catch (err) {
      logger.error('Failed to save call', { callSid, error: (err as Error).message });
    }
  }
}
