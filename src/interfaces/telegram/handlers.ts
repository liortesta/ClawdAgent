import { Bot } from 'grammy';
import { Engine, IncomingMessage } from '../../core/engine.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { getOpenClawMessageContext, getOpenClawExecutor } from '../web/routes/webhook.js';

export function setupHandlers(bot: Bot, engine: Engine) {
  // Admin-only guard — if TELEGRAM_ADMIN_IDS is set, only those users can interact
  const adminIds = config.TELEGRAM_ADMIN_IDS;
  if (adminIds.length > 0) {
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !adminIds.includes(userId)) {
        if (ctx.message) {
          await ctx.reply('This bot is private.').catch(() => {});
          logger.warn('Unauthorized Telegram access', { userId, username: ctx.from?.username });
        }
        return;
      }
      await next();
    });
  }

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

    // Detect content-creation requests for extended timeout + progress updates
    // NOTE: \b word boundary does NOT work with Hebrew/Unicode — removed it
    const textLower = ctx.message.text.toLowerCase();
    const isContentCreation = /(צור|תיצור|יצר|עשה|תעשה|create|generate|make|הפק|סרטון|וידאו|תמונה|שיר|video|image|photo|music|ugc|kie|publish|פרסם|תפרסם|פרסום|אוטומציה|automation|reels|רילס|content)/i.test(textLower);
    const TIMEOUT = isContentCreation ? 300000 : 120000; // 5 min for content, 2 min for normal

    // Keep sending 'typing' indicator every 4s while processing
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 4000);

    // Send progress message if processing takes > 15s
    let progressSent = false;
    const progressTimer = isContentCreation ? setTimeout(async () => {
      progressSent = true;
      await ctx.reply('🎨 Working on it — creating content can take 1-3 minutes. I\'ll send the result when it\'s ready...').catch(() => {});
    }, 15000) : null;

    let response: Awaited<ReturnType<typeof engine.process>>;
    try {
      response = await Promise.race([
        engine.process(incoming),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('RESPONSE_TIMEOUT')), TIMEOUT)
        ),
      ]);
    } catch (err: any) {
      clearInterval(typingInterval);
      if (progressTimer) clearTimeout(progressTimer);
      if (err.message === 'RESPONSE_TIMEOUT') {
        logger.warn('Engine response timed out', { userId: incoming.userId, text: incoming.text.slice(0, 50), timeout: TIMEOUT });
        await ctx.reply(`\u{23F1}\u{FE0F} The request timed out after ${TIMEOUT / 1000}s. Try again or simplify the request.`).catch(() => {});
        return;
      }
      throw err;
    } finally {
      clearInterval(typingInterval);
      if (progressTimer) clearTimeout(progressTimer);
    }

    // Guard against empty responses
    if (!response.text || response.text.trim().length === 0) {
      response.text = '\u{1F914} I processed your request but had nothing to say. Try asking differently.';
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

  // Photo messages → AI vision analysis
  bot.on('message:photo', async (ctx) => {
    await ctx.replyWithChatAction('typing');

    try {
      const photo = ctx.message.photo;
      const file = await ctx.api.getFile(photo[photo.length - 1].file_id);
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

  // Document messages → image vision OR text/PDF extraction
  bot.on('message:document', async (ctx) => {
    await ctx.replyWithChatAction('typing');

    try {
      const document = ctx.message.document;
      if (!document) return;

      const mime = document.mime_type ?? '';
      const fileName = document.file_name ?? 'file';
      const file = await ctx.api.getFile(document.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      const caption = ctx.message?.caption ?? '';

      // Image documents → vision analysis
      if (mime.startsWith('image/')) {
        const { analyzeImage } = await import('../../actions/vision/analyze.js');
        const analysis = await analyzeImage(buffer, caption || 'Describe this image in detail. If there is text, read it.');
        await ctx.reply(analysis, { parse_mode: 'Markdown' }).catch(() => ctx.reply(analysis));
        return;
      }

      // PDF documents → extract text and process through engine
      if (mime === 'application/pdf' || fileName.endsWith('.pdf')) {
        try {
          const pdfModule = await import('pdf-parse');
          const pdfParse = (pdfModule as any).default ?? pdfModule;
          const pdfData = await pdfParse(buffer);
          const text = pdfData.text.trim();

          if (!text) {
            await ctx.reply('Could not extract text from this PDF. It may be image-based.');
            return;
          }

          const incoming: IncomingMessage = {
            platform: 'telegram',
            userId: String(ctx.from.id),
            userName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ''),
            chatId: String(ctx.chat.id),
            text: caption
              ? `${caption}\n\n--- Document: ${fileName} ---\n${text.slice(0, 8000)}`
              : `I received a PDF document "${fileName}". Here is its content:\n\n${text.slice(0, 8000)}${text.length > 8000 ? '\n\n[...truncated]' : ''}`,
            metadata: { originalType: 'document', fileName, mimeType: mime },
          };

          const result = await engine.process(incoming);
          await ctx.reply(result.text, { parse_mode: 'Markdown' }).catch(() => ctx.reply(result.text));
        } catch (pdfErr: any) {
          logger.error('PDF parsing failed', { error: pdfErr.message });
          await ctx.reply('Failed to parse PDF: ' + pdfErr.message);
        }
        return;
      }

      // Text-based documents → read as text and process through engine
      if (mime.startsWith('text/') || /\.(txt|md|json|csv|xml|html|yaml|yml|log|ts|js|py|sh|sql)$/i.test(fileName)) {
        const text = buffer.toString('utf-8');
        const incoming: IncomingMessage = {
          platform: 'telegram',
          userId: String(ctx.from.id),
          userName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ''),
          chatId: String(ctx.chat.id),
          text: caption
            ? `${caption}\n\n--- File: ${fileName} ---\n${text.slice(0, 8000)}`
            : `I received a text file "${fileName}". Here is its content:\n\n${text.slice(0, 8000)}${text.length > 8000 ? '\n\n[...truncated]' : ''}`,
          metadata: { originalType: 'document', fileName, mimeType: mime },
        };

        const result = await engine.process(incoming);
        await ctx.reply(result.text, { parse_mode: 'Markdown' }).catch(() => ctx.reply(result.text));
        return;
      }

      // Unsupported document type
      await ctx.reply(`I received "${fileName}" (${mime}). I can process images, PDFs, and text files. This file type is not supported yet.`);
    } catch (err: any) {
      logger.error('Document processing failed', { error: err.message });
      await ctx.reply('Document processing failed: ' + err.message);
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
