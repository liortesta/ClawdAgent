import config from '../../config.js';
import logger from '../../utils/logger.js';

type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * Convert text to speech using OpenAI TTS API.
 * Returns opus audio buffer (small size, good quality).
 */
export async function textToSpeech(
  text: string,
  voice: TTSVoice = 'nova',
): Promise<Buffer> {
  const apiKey = config.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for text-to-speech');

  const baseUrl = config.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text.slice(0, 4096),
      voice,
      response_format: 'opus',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TTS API error ${response.status}: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  logger.info('Text-to-speech generated', { textLength: text.length, audioBytes: arrayBuffer.byteLength });
  return Buffer.from(arrayBuffer);
}
