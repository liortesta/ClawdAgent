import { Bot } from 'grammy';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { Engine } from '../../core/engine.js';
import { BaseInterface } from '../base.js';
import { setupHandlers } from './handlers.js';

export class TelegramBot extends BaseInterface {
  name = 'Telegram';
  private bot: Bot;
  private wasDisconnected = false;

  constructor(engine: Engine) {
    super(engine);
    if (!config.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');
    this.bot = new Bot(config.TELEGRAM_BOT_TOKEN);
    this.setupMiddleware();
    setupHandlers(this.bot, this.engine);
    this.setupErrorHandler();
  }

  private setupMiddleware() {
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      logger.debug('Telegram request', { userId: ctx.from?.id, duration: Date.now() - start });
    });

    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId) return;
      if (config.TELEGRAM_ADMIN_IDS.length > 0 && !config.TELEGRAM_ADMIN_IDS.includes(userId)) {
        await ctx.reply('\u{26D4} You are not authorized. Contact the admin.');
        return;
      }
      await next();
    });

    // Reconnect notification — if we recovered from a network error, notify user
    this.bot.use(async (ctx, next) => {
      if (this.wasDisconnected) {
        this.wasDisconnected = false;
        await ctx.reply('\u{1F504} \u05D4\u05EA\u05D7\u05D1\u05E8\u05EA\u05D9 \u05DE\u05D7\u05D3\u05E9. \u05D4\u05DB\u05DC \u05EA\u05E7\u05D9\u05DF \u05E2\u05DB\u05E9\u05D9\u05D5.').catch(() => {});
      }
      await next();
    });
  }

  private setupErrorHandler() {
    this.bot.catch((err) => {
      const msg = err.message ?? '';
      // Detect network/connection errors → flag for reconnect notification
      if (/ETIMEOUT|ECONNREFUSED|ECONNRESET|ENETUNREACH|network|socket hang up/i.test(msg)) {
        this.wasDisconnected = true;
        logger.warn('Telegram connection error detected, will notify on recovery', { error: msg });
      }
      logger.error('Telegram error', { error: msg, userId: err.ctx.from?.id });
      err.ctx.reply('\u{274C} Something went wrong. Please try again.').catch(() => {});
    });
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  async sendMessagePlain(chatId: number | string, text: string): Promise<number> {
    const msg = await this.bot.api.sendMessage(chatId, text);
    return msg.message_id;
  }

  async sendPhoto(chatId: number | string, photo: Buffer | string, caption?: string): Promise<void> {
    if (typeof photo === 'string') {
      // URL or file_id
      await this.bot.api.sendPhoto(chatId, photo, { caption, parse_mode: 'Markdown' });
    } else {
      // Buffer
      const inputFile = new (await import('grammy')).InputFile(photo, 'image.jpg');
      await this.bot.api.sendPhoto(chatId, inputFile, { caption, parse_mode: 'Markdown' });
    }
  }

  async sendDocument(chatId: number | string, doc: Buffer | string, filename: string, caption?: string): Promise<void> {
    if (typeof doc === 'string') {
      await this.bot.api.sendDocument(chatId, doc, { caption, parse_mode: 'Markdown' });
    } else {
      const inputFile = new (await import('grammy')).InputFile(doc, filename);
      await this.bot.api.sendDocument(chatId, inputFile, { caption, parse_mode: 'Markdown' });
    }
  }

  async sendVideo(chatId: number | string, video: Buffer | string, caption?: string): Promise<void> {
    if (typeof video === 'string') {
      await this.bot.api.sendVideo(chatId, video, { caption, parse_mode: 'Markdown' });
    } else {
      const inputFile = new (await import('grammy')).InputFile(video, 'video.mp4');
      await this.bot.api.sendVideo(chatId, inputFile, { caption, parse_mode: 'Markdown' });
    }
  }

  getBot(): Bot { return this.bot; }

  async start() {
    logger.info('Starting Telegram bot...');
    this.bot.start({
      onStart: async (info) => {
        logger.info(`Telegram bot started: @${info.username}`);
        // Notify admins on (re)connect
        for (const adminId of config.TELEGRAM_ADMIN_IDS) {
          await this.bot.api.sendMessage(
            adminId,
            '\u{1F504} ClawdAgent \u05D4\u05EA\u05D7\u05D1\u05E8 \u05DE\u05D7\u05D3\u05E9 \u05D5\u05DE\u05D5\u05DB\u05DF \u05DC\u05E2\u05D1\u05D5\u05D3\u05D4!'
          ).catch(() => {});
        }
      },
    });
  }

  async stop() { await this.bot.stop(); }
}
