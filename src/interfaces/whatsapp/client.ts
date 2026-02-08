import pkg from 'whatsapp-web.js';
const { Client: WAClient, LocalAuth } = pkg;
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { Engine } from '../../core/engine.js';
import { BaseInterface } from '../base.js';
import { setupHandlers } from './handlers.js';

export class WhatsAppClient extends BaseInterface {
  name = 'WhatsApp';
  private client: InstanceType<typeof WAClient>;

  constructor(engine: Engine) {
    super(engine);
    this.client = new WAClient({
      authStrategy: new LocalAuth({ dataPath: config.WHATSAPP_SESSION_PATH }),
      puppeteer: { headless: true, args: ['--no-sandbox'] },
    });
    setupHandlers(this.client, this.engine);
  }

  async start() {
    this.client.on('qr', (qr) => {
      logger.info('WhatsApp QR code received — scan to authenticate');
      // In production, send QR to admin via Telegram
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client ready');
    });

    await this.client.initialize();
  }

  async stop() { await this.client.destroy(); }
}
