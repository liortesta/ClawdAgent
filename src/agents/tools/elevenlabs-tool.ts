import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Map friendly voice names to ElevenLabs voice IDs
const VOICE_NAME_TO_ID: Record<string, string> = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  adam: 'pNInz6obpgDQGcFmaJgB',
  bella: 'EXAVITQu4vr4xnSDxMaL',
  antoni: 'ErXwobaYiN019PkySvjV',
  elli: 'MF3mGyEYCl7XYWbV9V6O',
  josh: 'TxGEqnHWrfWFTfGW9XjX',
  sam: 'yoZ06aMxZJJ28mfd3POQ',
};

function getApiKey(): string | undefined {
  return (config as any).ELEVENLABS_API_KEY;
}

function resolveVoiceId(voice: string): string {
  // If it looks like a raw voice ID (long alphanumeric), use as-is
  if (voice.length > 10 && !voice.includes(' ')) {
    return voice;
  }
  // Otherwise look up the friendly name
  const id = VOICE_NAME_TO_ID[voice.toLowerCase()];
  if (id) return id;
  // Default to Rachel if unknown name
  return VOICE_NAME_TO_ID['rachel'];
}

function authHeaders(): Record<string, string> {
  return {
    'xi-api-key': getApiKey() || '',
    'Content-Type': 'application/json',
  };
}

export class ElevenLabsTool extends BaseTool {
  name = 'elevenlabs';
  description = 'ElevenLabs AI audio — text-to-speech, voice cloning, podcasts, dubbing, sound effects, speech-to-text, and audio isolation.';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, output: '', error: 'ElevenLabs not configured. Set ELEVENLABS_API_KEY in .env' };
    }

    const action = String(input.action ?? '');

    try {
      switch (action) {
        case 'tts':        return await this.textToSpeech(input);
        case 'voices':     return await this.listVoices();
        case 'clone_voice': return await this.cloneVoice(input);
        case 'podcast':    return await this.generatePodcast(input);
        case 'dub':        return await this.dubAudio(input);
        case 'sfx':        return await this.generateSfx(input);
        case 'stt':        return await this.speechToText(input);
        case 'isolate':    return await this.audioIsolation(input);
        default:
          return {
            success: false,
            output: '',
            error: `Unknown action: ${action}. Available actions: tts, voices, clone_voice, podcast, dub, sfx, stt, isolate`,
          };
      }
    } catch (err: any) {
      this.error('ElevenLabs error', { error: err.message });
      return { success: false, output: '', error: `ElevenLabs error: ${err.message}` };
    }
  }

  // ── TTS — Text to Speech ─────────────────────────────────────────────
  private async textToSpeech(input: Record<string, unknown>): Promise<ToolResult> {
    const text = String(input.text ?? '');
    if (!text) return { success: false, output: '', error: 'text is required for TTS' };

    const voiceInput = String(input.voice ?? 'Rachel');
    const voiceId = resolveVoiceId(voiceInput);
    const model = String(input.model ?? 'eleven_multilingual_v2');
    const language = input.language ? String(input.language) : undefined;

    this.log('TTS request', { voice: voiceInput, voiceId, model, chars: text.length });

    const body: Record<string, unknown> = {
      text,
      model_id: model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    if (language) {
      body.language_code = language;
    }

    const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, output: '', error: `TTS API error (${response.status}): ${errorBody}` };
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = audioBuffer.toString('base64');
    const audioDurationEstimate = Math.round(audioBuffer.length / 16000); // rough estimate in seconds

    return {
      success: true,
      output: JSON.stringify({
        message: 'Audio generated successfully',
        voice: voiceInput,
        voice_id: voiceId,
        model,
        language: language || 'auto',
        characters: text.length,
        content_type: contentType,
        audio_size_bytes: audioBuffer.length,
        audio_duration_estimate_seconds: audioDurationEstimate,
        audio_base64: audioBase64,
      }),
    };
  }

  // ── List Voices ──────────────────────────────────────────────────────
  private async listVoices(): Promise<ToolResult> {
    this.log('Listing voices');

    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      method: 'GET',
      headers: { 'xi-api-key': getApiKey() || '' },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, output: '', error: `Voices API error (${response.status}): ${errorBody}` };
    }

    const data = await response.json() as { voices?: Array<{ voice_id: string; name: string; category?: string; labels?: Record<string, string> }> };
    const voices = data.voices || [];

    const formatted = voices.map((v) => {
      const labels = v.labels ? Object.values(v.labels).join(', ') : '';
      return `${v.name} (${v.voice_id}) [${v.category || 'unknown'}]${labels ? ' — ' + labels : ''}`;
    });

    return {
      success: true,
      output: `${voices.length} voices available:\n${formatted.join('\n')}`,
    };
  }

  // ── Clone Voice ──────────────────────────────────────────────────────
  private async cloneVoice(input: Record<string, unknown>): Promise<ToolResult> {
    const name = String(input.name ?? '');
    if (!name) return { success: false, output: '', error: 'name is required for voice cloning' };

    const files = input.files as string[] | undefined;
    const description = String(input.description ?? '');

    if (!files || files.length === 0) {
      return {
        success: false,
        output: '',
        error: 'files (array of audio URLs) is required for voice cloning. Provide at least one audio sample URL.',
      };
    }

    this.log('Cloning voice', { name, fileCount: files.length });

    // Download audio files and build multipart form
    const { FormData, Blob } = await import('node:buffer').then(() => ({
      FormData: globalThis.FormData,
      Blob: globalThis.Blob,
    }));

    const formData = new FormData();
    formData.append('name', name);
    if (description) formData.append('description', description);

    for (let i = 0; i < files.length; i++) {
      const fileUrl = files[i];
      try {
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
          return { success: false, output: '', error: `Failed to download audio file ${i + 1}: ${fileUrl} (${fileResponse.status})` };
        }
        const arrayBuffer = await fileResponse.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        formData.append('files', blob, `sample_${i}.mp3`);
      } catch (downloadErr: any) {
        return { success: false, output: '', error: `Failed to download audio file ${i + 1}: ${downloadErr.message}` };
      }
    }

    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': getApiKey() || '' },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, output: '', error: `Voice cloning API error (${response.status}): ${errorBody}` };
    }

    const result = await response.json() as { voice_id?: string };
    return {
      success: true,
      output: `Voice "${name}" cloned successfully. Voice ID: ${result.voice_id || 'unknown'}`,
    };
  }

  // ── Podcast — multi-speaker audio ────────────────────────────────────
  private async generatePodcast(input: Record<string, unknown>): Promise<ToolResult> {
    const script = input.script as Array<{ speaker?: string; voice?: string; text?: string }> | undefined;
    const title = String(input.title ?? 'Untitled Podcast');

    if (!script || script.length === 0) {
      return {
        success: false,
        output: '',
        error: 'script is required — provide an array of {speaker, voice, text} segments',
      };
    }

    this.log('Generating podcast', { title, segments: script.length });

    const results: Array<{ speaker: string; voice: string; characters: number; audio_size_bytes: number }> = [];

    for (let i = 0; i < script.length; i++) {
      const segment = script[i];
      const text = String(segment.text ?? '');
      const voice = String(segment.voice ?? 'Rachel');
      const speaker = String(segment.speaker ?? `Speaker ${i + 1}`);

      if (!text) continue;

      const voiceId = resolveVoiceId(voice);

      const body = {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      };

      const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          output: '',
          error: `Podcast segment ${i + 1} (${speaker}) failed (${response.status}): ${errorBody}`,
        };
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());

      results.push({
        speaker,
        voice,
        characters: text.length,
        audio_size_bytes: audioBuffer.length,
      });
    }

    return {
      success: true,
      output: JSON.stringify({
        message: `Podcast "${title}" generated successfully`,
        total_segments: results.length,
        segments: results,
      }),
    };
  }

  // ── Dubbing — translate audio/video ──────────────────────────────────
  private async dubAudio(input: Record<string, unknown>): Promise<ToolResult> {
    const sourceUrl = String(input.source_url ?? '');
    const targetLang = String(input.target_lang ?? '');

    if (!sourceUrl) return { success: false, output: '', error: 'source_url is required for dubbing' };
    if (!targetLang) return { success: false, output: '', error: 'target_lang is required for dubbing (e.g. "he", "en", "es")' };

    this.log('Dubbing request', { sourceUrl, targetLang });

    const body = {
      source_url: sourceUrl,
      target_lang: targetLang,
    };

    const response = await fetch(`${ELEVENLABS_BASE_URL}/dubbing`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, output: '', error: `Dubbing API error (${response.status}): ${errorBody}` };
    }

    const result = await response.json() as { dubbing_id?: string; expected_duration_sec?: number };
    return {
      success: true,
      output: JSON.stringify({
        message: 'Dubbing job started',
        dubbing_id: result.dubbing_id || 'unknown',
        target_lang: targetLang,
        expected_duration_sec: result.expected_duration_sec,
        note: 'Dubbing is asynchronous. Use the dubbing_id to check status via the ElevenLabs dashboard or API.',
      }),
    };
  }

  // ── Sound Effects ────────────────────────────────────────────────────
  private async generateSfx(input: Record<string, unknown>): Promise<ToolResult> {
    const text = String(input.text ?? '');
    if (!text) return { success: false, output: '', error: 'text (sound description) is required for SFX generation' };

    const duration = input.duration ? Number(input.duration) : undefined;

    this.log('SFX generation', { text, duration });

    const body: Record<string, unknown> = {
      text,
    };

    if (duration) {
      body.duration_seconds = duration;
    }

    const response = await fetch(`${ELEVENLABS_BASE_URL}/sound-generation`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, output: '', error: `SFX API error (${response.status}): ${errorBody}` };
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = audioBuffer.toString('base64');

    return {
      success: true,
      output: JSON.stringify({
        message: 'Sound effect generated successfully',
        description: text,
        duration_requested: duration || 'auto',
        content_type: contentType,
        audio_size_bytes: audioBuffer.length,
        audio_base64: audioBase64,
      }),
    };
  }

  // ── Speech to Text ───────────────────────────────────────────────────
  private async speechToText(input: Record<string, unknown>): Promise<ToolResult> {
    const audioUrl = String(input.audio_url ?? '');
    if (!audioUrl) return { success: false, output: '', error: 'audio_url is required for speech-to-text' };

    const language = input.language ? String(input.language) : undefined;

    this.log('STT request', { audioUrl, language });

    // Download the audio file first
    let audioBuffer: Buffer;
    try {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        return { success: false, output: '', error: `Failed to download audio: ${audioUrl} (${audioResponse.status})` };
      }
      audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    } catch (downloadErr: any) {
      return { success: false, output: '', error: `Failed to download audio: ${downloadErr.message}` };
    }

    // Build multipart form for STT
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');
    if (language) {
      formData.append('language_code', language);
    }

    const response = await fetch(`${ELEVENLABS_BASE_URL}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': getApiKey() || '' },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, output: '', error: `STT API error (${response.status}): ${errorBody}` };
    }

    const result = await response.json() as { text?: string; language_code?: string; language_probability?: number };
    return {
      success: true,
      output: JSON.stringify({
        text: result.text || '',
        language_code: result.language_code,
        language_probability: result.language_probability,
      }),
    };
  }

  // ── Audio Isolation ──────────────────────────────────────────────────
  private async audioIsolation(input: Record<string, unknown>): Promise<ToolResult> {
    const audioUrl = String(input.audio_url ?? '');
    if (!audioUrl) return { success: false, output: '', error: 'audio_url is required for audio isolation' };

    this.log('Audio isolation request', { audioUrl });

    // Download the audio file first
    let audioBuffer: Buffer;
    try {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        return { success: false, output: '', error: `Failed to download audio: ${audioUrl} (${audioResponse.status})` };
      }
      audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    } catch (downloadErr: any) {
      return { success: false, output: '', error: `Failed to download audio: ${downloadErr.message}` };
    }

    // Build multipart form for audio isolation
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('file', blob, 'audio.mp3');

    const response = await fetch(`${ELEVENLABS_BASE_URL}/audio-isolation`, {
      method: 'POST',
      headers: { 'xi-api-key': getApiKey() || '' },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, output: '', error: `Audio isolation API error (${response.status}): ${errorBody}` };
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const isolatedBuffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = isolatedBuffer.toString('base64');

    return {
      success: true,
      output: JSON.stringify({
        message: 'Audio isolation completed — background noise removed',
        content_type: contentType,
        original_size_bytes: audioBuffer.length,
        isolated_size_bytes: isolatedBuffer.length,
        audio_base64: audioBase64,
      }),
    };
  }
}
