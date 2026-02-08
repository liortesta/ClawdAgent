import { Bot } from 'grammy';
import { Engine, IncomingMessage } from '../../core/engine.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { getOpenClawMessageContext, getOpenClawExecutor } from '../web/routes/webhook.js';

export function setupHandlers(bot: Bot, engine: Engine) {
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? 'there';
    await ctx.reply(
      `👋 Hey ${name}! I'm **ClawdAgent** — your AI assistant.\n\n` +
      `🖥️ /servers — Manage servers\n💻 /code — Write & fix code\n🔍 /search — Web search\n📋 /tasks — Task manager\n⚙️ /settings — Settings\n❓ /help — Full command list\n\nOr just send me a message! 🚀`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📚 **ClawdAgent Commands**\n\n**General**: /start, /help, /status\n**Servers**: /servers, /deploy, /logs\n**Code**: /code, /pr, /review\n**Search**: /search, /ask\n**Tasks**: /tasks, /todo, /remind\n**Settings**: /settings\n\n💡 Just type naturally!`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', async (ctx) => {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60);
    await ctx.reply(
      `📊 **ClawdAgent Status**\n✅ Bot: Online\n⏱️ Uptime: ${h}h ${m}m\n💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('message:text', async (ctx) => {
    await ctx.replyWithChatAction('typing');

    // ── Check if this is a reply to an OpenClaw message ──
    const replyToId = ctx.message.reply_to_message?.message_id;
    const replyToText = ctx.message.reply_to_message?.text;
    const isOpenClawReply = replyToId && (
      getOpenClawMessageContext(replyToId) ||
      (replyToText && replyToText.includes('OpenClaw'))
    );

    if (isOpenClawReply) {
      const executor = getOpenClawExecutor();
      if (executor) {
        try {
          logger.info('Forwarding reply to OpenClaw', { text: ctx.message.text.slice(0, 100) });

          const openclawContext = replyToId ? getOpenClawMessageContext(replyToId) : undefined;

          // Send the user's reply as a message to OpenClaw
          const result = await executor('agent', {
            message: ctx.message.text,
            to: 'webchat',
            sessionKey: openclawContext?.sessionKey || 'clawdagent-relay',
          });

          if (result.success && result.output) {
            try {
              const parsed = JSON.parse(result.output);
              const reply = parsed?.result?.payloads?.[0]?.text
                || parsed?.payload?.result?.payloads?.[0]?.text
                || parsed?.summary
                || result.output;

              const formatted = `\u{1F990} OpenClaw:\n${typeof reply === 'string' ? reply : JSON.stringify(reply, null, 2)}`;
              await ctx.reply(formatted, { parse_mode: 'Markdown' }).catch(() => ctx.reply(formatted));
            } catch {
              await ctx.reply(`\u{1F990} OpenClaw:\n${result.output.slice(0, 3000)}`);
            }
          } else {
            await ctx.reply(`\u{1F990} OpenClaw error: ${result.error || 'No response'}`);
          }
          return;
        } catch (err: any) {
          logger.error('Failed to forward to OpenClaw', { error: err.message });
          await ctx.reply(`\u{274C} Failed to reach OpenClaw: ${err.message}`);
          return;
        }
      }
    }

    // ── Normal message processing ──
    const incoming: IncomingMessage = {
      platform: 'telegram',
      userId: String(ctx.from.id),
      userName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ''),
      chatId: String(ctx.chat.id),
      text: ctx.message.text,
      replyTo: ctx.message.reply_to_message?.text,
    };

    const response = await engine.process(incoming);

    // Guard against empty responses
    if (!response.text || response.text.trim().length === 0) {
      response.text = '🤔 I processed your request but had nothing to say. Try asking differently.';
    }

    const maxLen = 4000;
    if (response.text.length <= maxLen) {
      await ctx.reply(response.text, { parse_mode: 'Markdown' }).catch(() => ctx.reply(response.text));
    } else {
      const chunks = splitMessage(response.text, maxLen);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
      }
    }
  });

  // Voice messages → Whisper transcription → Engine
  bot.on('message:voice', async (ctx) => {
    await ctx.replyWithChatAction('typing');

    try {
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      const { transcribeAudio } = await import('../../actions/voice/stt.js');
      const text = await transcribeAudio(audioBuffer, 'ogg');

      if (!text) {
        await ctx.reply('Could not understand the voice message. Please try again.');
        return;
      }

      const incoming: IncomingMessage = {
        platform: 'telegram',
        userId: String(ctx.from.id),
        userName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ''),
        chatId: String(ctx.chat.id),
        text,
        metadata: { originalType: 'voice' },
      };

      const result = await engine.process(incoming);
      const replyText = `_"${text}"_\n\n${result.text}`;
      await ctx.reply(replyText, { parse_mode: 'Markdown' }).catch(() => ctx.reply(replyText));
    } catch (err: any) {
      logger.error('Voice processing failed', { error: err.message });
      await ctx.reply('Voice processing failed. Make sure OPENAI_API_KEY is set for Whisper.');
    }
  });

  // Photo/document messages → AI vision analysis
  bot.on(['message:photo', 'message:document'], async (ctx) => {
    await ctx.replyWithChatAction('typing');

    try {
      const photo = ctx.message?.photo;
      const document = ctx.message?.document;

      let file;
      if (photo) {
        file = await ctx.api.getFile(photo[photo.length - 1].file_id);
      } else if (document && document.mime_type?.startsWith('image/')) {
        file = await ctx.api.getFile(document.file_id);
      } else {
        await ctx.reply('I can only analyze image files right now.');
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      const caption = ctx.message?.caption ?? 'Describe this image in detail. If there is text, read it.';

      const { analyzeImage } = await import('../../actions/vision/analyze.js');
      const analysis = await analyzeImage(imageBuffer, caption);

      await ctx.reply(analysis, { parse_mode: 'Markdown' }).catch(() => ctx.reply(analysis));
    } catch (err: any) {
      logger.error('Image analysis failed', { error: err.message });
      await ctx.reply('Image analysis failed: ' + err.message);
    }
  });
}

function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let idx = remaining.lastIndexOf('\n', maxLen);
    if (idx < maxLen / 2) idx = remaining.lastIndexOf(' ', maxLen);
    if (idx === -1) idx = maxLen;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx).trimStart();
  }
  return chunks;
}
