import config from '../../config.js';
import logger from '../../utils/logger.js';

/**
 * Transcribe audio using OpenAI Whisper API.
 * Supports ogg (Telegram voice), mp3, wav, webm, etc.
 */
export async function transcribeAudio(audioBuffer: Buffer, format = 'ogg'): Promise<string> {
  const apiKey = config.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for voice transcription (Whisper)');

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: `audio/${format}` }),
    `audio.${format}`,
  );
  formData.append('model', 'whisper-1');

  const baseUrl = config.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${error}`);
  }

  const data = (await response.json()) as { text: string };
  logger.info('Audio transcribed', { bytes: audioBuffer.length, textLength: data.text?.length });
  return data.text;
}
