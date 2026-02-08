import type pkg from 'whatsapp-web.js';
type WAClient = InstanceType<typeof pkg.Client>;
import { Engine, IncomingMessage } from '../../core/engine.js';
import logger from '../../utils/logger.js';

export function setupHandlers(client: WAClient, engine: Engine) {
  client.on('message', async (msg) => {
    if (msg.fromMe) return;

    // Voice messages
    if (msg.hasMedia && msg.type === 'ptt') {
      try {
        const media = await msg.downloadMedia();
        if (!media) return;
        const buffer = Buffer.from(media.data, 'base64');
        const { transcribeAudio } = await import('../../actions/voice/stt.js');
        const text = await transcribeAudio(buffer, 'ogg');
        if (!text) { await msg.reply('Could not understand voice.'); return; }

        const contact = await msg.getContact();
        const incoming: IncomingMessage = {
          platform: 'whatsapp', userId: msg.from,
          userName: contact.pushname ?? contact.name ?? msg.from,
          chatId: msg.from, text, metadata: { originalType: 'voice' },
        };
        const response = await engine.process(incoming);
        await msg.reply(`_"${text}"_\n\n${response.text}`);
      } catch (err: any) {
        logger.error('WhatsApp voice failed', { error: err.message });
        await msg.reply('Voice processing failed.');
      }
      return;
    }

    // Image analysis
    if (msg.hasMedia && msg.type === 'image') {
      try {
        const media = await msg.downloadMedia();
        if (!media) return;
        const buffer = Buffer.from(media.data, 'base64');
        const { analyzeImage } = await import('../../actions/vision/analyze.js');
        const caption = msg.body || 'Describe this image.';
        const analysis = await analyzeImage(buffer, caption);
        await msg.reply(analysis);
      } catch (err: any) {
        logger.error('WhatsApp image failed', { error: err.message });
        await msg.reply('Image analysis failed.');
      }
      return;
    }

    // Text messages
    const contact = await msg.getContact();
    const incoming: IncomingMessage = {
      platform: 'whatsapp',
      userId: msg.from,
      userName: contact.pushname ?? contact.name ?? msg.from,
      chatId: msg.from,
      text: msg.body,
    };

    logger.debug('WhatsApp message', { from: msg.from, text: msg.body.slice(0, 50) });

    const response = await engine.process(incoming);
    await msg.reply(response.text);
  });
}
