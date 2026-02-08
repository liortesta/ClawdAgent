import { Client, GatewayIntentBits, Events } from 'discord.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { Engine } from '../../core/engine.js';
import { BaseInterface } from '../base.js';
import { setupHandlers } from './handlers.js';

export class DiscordBot extends BaseInterface {
  name = 'Discord';
  private client: Client;

  constructor(engine: Engine) {
    super(engine);
    if (!config.DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is required');
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
    });
    setupHandlers(this.client, this.engine);
  }

  async start() {
    this.client.once(Events.ClientReady, (c) => {
      logger.info(`Discord bot started: ${c.user.tag}`);
    });
    await this.client.login(config.DISCORD_BOT_TOKEN);
  }

  async stop() { await this.client.destroy(); }
}
