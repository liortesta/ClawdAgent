import config from '../../config.js';
import logger from '../../utils/logger.js';

/**
 * Analyze an image using AI vision.
 * Tries Anthropic Claude first (best vision), then falls back to OpenRouter (free multimodal).
 */
export async function analyzeImage(
  imageBuffer: Buffer,
  prompt = 'Describe this image in detail.',
  mimeType = 'image/jpeg',
): Promise<string> {
  const base64 = imageBuffer.toString('base64');

  // Try Anthropic Claude (best vision quality)
  if (config.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

      const response = await client.messages.create({
        model: config.AI_MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as any, data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      });

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('\n');

      logger.info('Image analyzed via Anthropic', { textLength: text.length });
      return text;
    } catch (err: any) {
      logger.warn('Anthropic vision failed, trying fallback', { error: err.message });
    }
  }

  // Fallback: OpenRouter with free multimodal model
  if (config.OPENROUTER_API_KEY) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://clawdagent.dev',
        'X-Title': 'ClawdAgent',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-nano-12b-v2-vl:free',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: 'text', text: prompt },
          ],
        }],
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter vision error: ${response.status}: ${error}`);
    }

    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content ?? 'Could not analyze image';
    logger.info('Image analyzed via OpenRouter', { textLength: text.length });
    return text;
  }

  throw new Error('No vision-capable provider available (need ANTHROPIC_API_KEY or OPENROUTER_API_KEY)');
}
