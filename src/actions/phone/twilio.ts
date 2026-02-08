import config from '../../config.js';
import logger from '../../utils/logger.js';

let twilioModule: any = null;

async function getTwilio() {
  if (twilioModule) return twilioModule;
  try {
    // Dynamic import with variable to avoid compile-time module resolution
    const mod = 'twilio';
    twilioModule = await import(/* @vite-ignore */ mod);
    return twilioModule;
  } catch {
    return null;
  }
}

export class PhoneService {
  private client: any = null;
  private _available = false;

  async init(): Promise<void> {
    const sid = (config as any).TWILIO_ACCOUNT_SID;
    const token = (config as any).TWILIO_AUTH_TOKEN;
    if (!sid || !token) return;

    const twilio = await getTwilio();
    if (!twilio) {
      logger.warn('Twilio package not installed. Run: pnpm add twilio');
      return;
    }

    this.client = twilio.default(sid, token);
    this._available = true;
    logger.info('Phone service initialized (Twilio)');
  }

  get available(): boolean { return this._available; }

  async sendSMS(to: string, message: string): Promise<string> {
    if (!this.client) throw new Error('Twilio not configured');
    const result = await this.client.messages.create({
      body: message,
      from: (config as any).TWILIO_PHONE_NUMBER,
      to,
    });
    logger.info('SMS sent', { to, sid: result.sid });
    return `SMS sent to ${to} (SID: ${result.sid})`;
  }

  async makeCall(to: string, message: string): Promise<string> {
    if (!this.client) throw new Error('Twilio not configured');
    const twiml = `<Response><Say language="he-IL" voice="Google.he-IL-Standard-A">${message}</Say></Response>`;
    const result = await this.client.calls.create({
      twiml,
      from: (config as any).TWILIO_PHONE_NUMBER,
      to,
    });
    logger.info('Call initiated', { to, sid: result.sid });
    return `Call initiated to ${to} (SID: ${result.sid})`;
  }
}

// Singleton
let phoneService: PhoneService | null = null;

export async function getPhoneService(): Promise<PhoneService> {
  if (!phoneService) {
    phoneService = new PhoneService();
    await phoneService.init();
  }
  return phoneService;
}
