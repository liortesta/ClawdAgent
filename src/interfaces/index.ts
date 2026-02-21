import config from '../config.js';
import logger from '../utils/logger.js';
import { Engine } from '../core/engine.js';
import { BaseInterface } from './base.js';
import { TelegramBot } from './telegram/bot.js';
import { DiscordBot } from './discord/bot.js';
import { WhatsAppClient } from './whatsapp/client.js';
import { WebServer } from './web/server.js';

export async function startInterfaces(engine: Engine): Promise<BaseInterface[]> {
  const interfaces: BaseInterface[] = [];

  if (config.TELEGRAM_BOT_TOKEN) {
    try {
      const telegram = new TelegramBot(engine);
      await telegram.start();
      interfaces.push(telegram);
    } catch (error: any) {
      logger.error('Failed to start Telegram', { error: error.message });
    }
  }

  if (config.DISCORD_BOT_TOKEN) {
    try {
      const discord = new DiscordBot(engine);
      await discord.start();
      interfaces.push(discord);
    } catch (error: any) {
      logger.error('Failed to start Discord', { error: error.message });
    }
  }

  // Web API is always started FIRST — must not be blocked by WhatsApp/other interfaces
  try {
    const web = new WebServer(engine);
    await web.start();
    interfaces.push(web);
  } catch (error: any) {
    logger.error('Failed to start Web server', { error: error.message });
  }

  // WhatsApp starts in background — QR code generation can take a while and must not block the server
  if (config.WHATSAPP_ENABLED) {
    const whatsapp = new WhatsAppClient(engine);
    whatsapp.start().then(() => {
      interfaces.push(whatsapp);
      logger.info('WhatsApp connected');
    }).catch((error: any) => {
      logger.error('Failed to start WhatsApp', { error: error.message });
    });
  }

  logger.info(`Started ${interfaces.length} interfaces`, { names: interfaces.map(i => i.name) });
  return interfaces;
}

export async function stopInterfaces(interfaces: BaseInterface[]) {
  for (const iface of interfaces) {
    try {
      await iface.stop();
      logger.info(`${iface.name} stopped`);
    } catch (error: any) {
      logger.error(`Error stopping ${iface.name}`, { error: error.message });
    }
  }
}
