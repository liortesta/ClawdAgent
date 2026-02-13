import QRCode from 'qrcode';
import { BaseTool, ToolResult } from './base-tool.js';
import { getLatestQR, getWhatsAppStatus } from '../../interfaces/whatsapp/auth.js';

export class WhatsAppTool extends BaseTool {
  name = 'whatsapp';
  description = 'WhatsApp connection management — get QR code, check status';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    if (!action) return { success: false, output: '', error: 'No action provided' };

    switch (action) {
      case 'get_qr':
        return this.getQR();
      case 'get_status':
        return this.getStatus();
      default:
        return { success: false, output: '', error: `Unknown action: ${action}` };
    }
  }

  private async getQR(): Promise<ToolResult> {
    const status = getWhatsAppStatus();

    if (status === 'authenticated') {
      return { success: true, output: JSON.stringify({ status: 'authenticated', message: 'WhatsApp is already connected and ready.' }) };
    }

    const qr = getLatestQR();
    if (!qr) {
      return {
        success: true,
        output: JSON.stringify({
          status,
          message: status === 'disconnected'
            ? 'WhatsApp is not running. Make sure WHATSAPP_ENABLED=true in .env and restart the server.'
            : 'No QR code available yet. Wait a moment and try again.',
        }),
      };
    }

    // Generate a proper PNG data URL from the QR string
    try {
      const dataUrl = await QRCode.toDataURL(qr, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });

      return {
        success: true,
        output: JSON.stringify({
          status: 'waiting',
          qrImage: dataUrl,
          message: 'Scan this QR code with WhatsApp on your phone to connect.',
        }),
      };
    } catch (err: any) {
      this.error('Failed to generate QR image', { error: err.message });
      return { success: false, output: '', error: 'Failed to generate QR image' };
    }
  }

  private async getStatus(): Promise<ToolResult> {
    const status = getWhatsAppStatus();
    const messages: Record<string, string> = {
      authenticated: 'WhatsApp is connected and ready.',
      waiting: 'Waiting for QR code scan...',
      disconnected: 'WhatsApp is disconnected.',
      auth_failure: 'WhatsApp authentication failed. Try restarting.',
    };
    return {
      success: true,
      output: JSON.stringify({ status, message: messages[status] ?? status }),
    };
  }
}
