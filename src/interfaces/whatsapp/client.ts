import pkg from 'whatsapp-web.js';
const { Client: WAClient, LocalAuth } = pkg;
import puppeteer from 'puppeteer';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { Engine } from '../../core/engine.js';
import { BaseInterface } from '../base.js';
import { setupHandlers } from './handlers.js';
import { setWhatsAppStatus, setLatestQR } from './auth.js';

// Reconnect settings
const RECONNECT_DELAY_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 5;

export class WhatsAppClient extends BaseInterface {
  name = 'WhatsApp';
  private client: InstanceType<typeof WAClient>;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(engine: Engine) {
    super(engine);
    this.client = this.createClient();
  }

  /** Build a fresh WAClient instance with auth strategy */
  private createClient(): InstanceType<typeof WAClient> {
    // Use Puppeteer's bundled Chromium — completely isolated from user's Chrome.
    // Own executable, own user data dir, own profile. No interference with system browser.
    const chromiumPath = puppeteer.executablePath();
    logger.info('WhatsApp using isolated Chromium', { path: chromiumPath });

    const client = new WAClient({
      authStrategy: new LocalAuth({ dataPath: config.WHATSAPP_SESSION_PATH }),
      puppeteer: {
        headless: true,
        executablePath: chromiumPath,
        args: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-default-apps',
          '--no-first-run',
        ],
      },
    });
    setupHandlers(client, this.engine);
    return client;
  }

  async start() {
    this.attachLifecycleEvents(this.client);
    await this.client.initialize();
  }

  async stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.client.destroy();
    setWhatsAppStatus('disconnected');
  }

  /** Wire up qr / authenticated / auth_failure / ready / disconnected events */
  private attachLifecycleEvents(client: InstanceType<typeof WAClient>) {
    // --- QR code received — display in terminal and store for web/Telegram ---
    client.on('qr', (qr: string) => {
      logger.info('WhatsApp QR code received — scan to authenticate');
      setWhatsAppStatus('waiting');
      setLatestQR(qr);

      // Render QR in the terminal so it can be scanned directly
      qrcodeTerminal.generate(qr, { small: true }, (output: string) => {
        console.log('\n========== WhatsApp QR Code ==========');
        console.log(output);
        console.log('=======================================\n');
      });
    });

    // --- Successfully authenticated (session restored or QR scanned) ---
    client.on('authenticated', () => {
      logger.info('WhatsApp client authenticated successfully');
      setWhatsAppStatus('authenticated');
      setLatestQR(null);
      this.reconnectAttempts = 0;
    });

    // --- Authentication failure ---
    client.on('auth_failure', (message: string) => {
      logger.error('WhatsApp authentication failed', { message });
      setWhatsAppStatus('auth_failure');
      setLatestQR(null);
    });

    // --- Client is ready to send/receive messages ---
    client.on('ready', () => {
      logger.info('WhatsApp client ready');
      setWhatsAppStatus('authenticated');
      setLatestQR(null);
      this.reconnectAttempts = 0;
    });

    // --- Disconnected — attempt auto-reconnect ---
    client.on('disconnected', (reason: string) => {
      logger.warn('WhatsApp client disconnected', { reason });
      setWhatsAppStatus('disconnected');
      setLatestQR(null);
      this.scheduleReconnect();
    });
  }

  /** Attempt to reconnect after a disconnect */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        `WhatsApp reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts — giving up. Restart the process to try again.`,
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;
    logger.info(`WhatsApp will reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        logger.info('WhatsApp reconnecting...');
        this.client = this.createClient();
        this.attachLifecycleEvents(this.client);
        await this.client.initialize();
      } catch (err: any) {
        logger.error('WhatsApp reconnect error', { error: err.message });
        this.scheduleReconnect();
      }
    }, delay);
  }
}
