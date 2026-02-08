import { Client, Events } from 'discord.js';
import { Engine, IncomingMessage } from '../../core/engine.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';

export function setupHandlers(client: Client, engine: Engine) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content) return;

    // Only respond in DMs or when mentioned
    const isDM = !message.guild;
    const isMentioned = message.mentions.has(client.user!);
    if (!isDM && !isMentioned) return;

    const text = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!text) return;

    // Auth check
    if (config.DISCORD_ADMIN_IDS.length > 0 && !config.DISCORD_ADMIN_IDS.includes(message.author.id)) {
      await message.reply('⛔ Not authorized.');
      return;
    }

    await message.channel.sendTyping();

    const incoming: IncomingMessage = {
      platform: 'discord',
      userId: message.author.id,
      userName: message.author.displayName ?? message.author.username,
      chatId: message.channel.id,
      text,
    };

    const response = await engine.process(incoming);

    if (response.text.length <= 2000) {
      await message.reply(response.text);
    } else {
      const chunks = response.text.match(/[\s\S]{1,2000}/g) ?? [];
      for (const chunk of chunks) await message.reply(chunk);
    }
  });

  // Voice messages
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const attachment = message.attachments.find(a => a.contentType?.startsWith('audio/'));
    if (!attachment) return;

    try {
      const response = await fetch(attachment.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const { transcribeAudio } = await import('../../actions/voice/stt.js');
      const text = await transcribeAudio(buffer, 'ogg');
      if (!text) { await message.reply('Could not transcribe audio.'); return; }

      const incoming: IncomingMessage = {
        platform: 'discord', userId: message.author.id,
        userName: message.author.displayName ?? message.author.username,
        chatId: message.channel.id, text,
        metadata: { originalType: 'voice' },
      };
      const result = await engine.process(incoming);
      await message.reply(`_"${text}"_\n\n${result.text}`);
    } catch (err: any) {
      logger.error('Discord voice failed', { error: err.message });
      await message.reply('Failed to process audio.');
    }
  });

  // Image analysis
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (!image) return;

    try {
      const response = await fetch(image.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const { analyzeImage } = await import('../../actions/vision/analyze.js');
      const analysis = await analyzeImage(buffer, message.content || 'Describe this image.');
      await message.reply(analysis.length <= 2000 ? analysis : analysis.slice(0, 1997) + '...');
    } catch (err: any) {
      logger.error('Discord image failed', { error: err.message });
      await message.reply('Failed to analyze image.');
    }
  });
}
