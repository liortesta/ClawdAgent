import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

let gmailInstance: any = null;

function isSmtpConfigured(): boolean {
  return !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
}

async function getGmail() {
  if (gmailInstance) return gmailInstance;

  if (!config.GMAIL_CLIENT_ID || !config.GMAIL_CLIENT_SECRET || !config.GMAIL_REFRESH_TOKEN) {
    return null;
  }

  const { google } = await import('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    config.GMAIL_CLIENT_ID,
    config.GMAIL_CLIENT_SECRET,
    config.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  );
  oauth2Client.setCredentials({ refresh_token: config.GMAIL_REFRESH_TOKEN });
  gmailInstance = google.gmail({ version: 'v1', auth: oauth2Client });
  return gmailInstance;
}

export class EmailTool extends BaseTool {
  name = 'email';
  description = 'Email — read, send, reply, search emails via Gmail or send via SMTP.';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = String(input.action ?? '');
    const gmail = await getGmail();

    // For send action, allow SMTP fallback when Gmail is not configured
    if (action === 'send' && !gmail && isSmtpConfigured()) {
      try {
        return await this.sendViaSmtp(input);
      } catch (err: any) {
        return { success: false, output: '', error: `SMTP email error: ${err.message}` };
      }
    }

    if (!gmail) {
      return { success: false, output: '', error: 'Email not configured. Set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN for full access, or SMTP_HOST/SMTP_USER/SMTP_PASS for send-only.' };
    }

    try {
      switch (action) {
        case 'inbox': return await this.readInbox(gmail, input);
        case 'read': return await this.readEmail(gmail, String(input.messageId ?? ''));
        case 'send': return await this.sendEmail(gmail, input);
        case 'reply': return await this.replyToEmail(gmail, input);
        case 'search': return await this.readInbox(gmail, { ...input, search: input.query });
        case 'mark': return await this.markEmail(gmail, String(input.messageId ?? ''), input.read !== false);
        case 'unread_count': return await this.unreadCount(gmail);
        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Use: inbox, read, send, reply, search, mark, unread_count` };
      }
    } catch (err: any) {
      return { success: false, output: '', error: `Email error: ${err.message}` };
    }
  }

  private async readInbox(gmail: any, input: Record<string, unknown>): Promise<ToolResult> {
    const maxResults = Number(input.maxResults ?? 10);
    const unreadOnly = input.unreadOnly === true;
    const search = String(input.search ?? '');

    let query = search;
    if (unreadOnly) query = `is:unread ${query}`.trim();

    const res = await gmail.users.messages.list({
      userId: 'me', maxResults, q: query || undefined,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return { success: true, output: 'No emails found.' };

    const results: string[] = [];
    for (const msg of messages) {
      const detail = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = detail.data.payload?.headers || [];
      const h = (name: string) => headers.find((hdr: any) => hdr.name === name)?.value || '';

      results.push(`ID: ${msg.id} | From: ${h('From')} | Subject: ${h('Subject')} | Date: ${h('Date')} | Snippet: ${(detail.data.snippet || '').slice(0, 80)}`);
    }

    return { success: true, output: `${messages.length} emails:\n${results.join('\n')}` };
  }

  private async readEmail(gmail: any, messageId: string): Promise<ToolResult> {
    if (!messageId) return { success: false, output: '', error: 'messageId is required' };

    const detail = await gmail.users.messages.get({
      userId: 'me', id: messageId, format: 'full',
    });

    const headers = detail.data.payload?.headers || [];
    const h = (name: string) => headers.find((hdr: any) => hdr.name === name)?.value || '';

    let body = '';
    const payload = detail.data.payload;
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    } else if (payload?.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
          break;
        }
      }
      if (!body) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/html' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64url').toString('utf-8').replace(/<[^>]*>/g, '');
            break;
          }
        }
      }
    }

    return {
      success: true,
      output: `From: ${h('From')}\nTo: ${h('To')}\nSubject: ${h('Subject')}\nDate: ${h('Date')}\n\n${body.slice(0, 3000)}`,
    };
  }

  private async sendEmail(gmail: any, input: Record<string, unknown>): Promise<ToolResult> {
    const to = String(input.to ?? '');
    const subject = String(input.subject ?? '');
    const body = String(input.body ?? '');

    if (!to || !subject) return { success: false, output: '', error: 'to and subject are required' };

    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      '',
      body,
    ].join('\r\n');

    const encoded = Buffer.from(raw).toString('base64url');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
    return { success: true, output: `Email sent to ${to}: "${subject}"` };
  }

  private async replyToEmail(gmail: any, input: Record<string, unknown>): Promise<ToolResult> {
    const messageId = String(input.messageId ?? '');
    const body = String(input.body ?? '');

    if (!messageId || !body) return { success: false, output: '', error: 'messageId and body are required' };

    const original = await gmail.users.messages.get({
      userId: 'me', id: messageId, format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Message-ID'],
    });

    const headers = original.data.payload?.headers || [];
    const h = (name: string) => headers.find((hdr: any) => hdr.name === name)?.value || '';

    const to = h('From');
    const subject = h('Subject').startsWith('Re:') ? h('Subject') : `Re: ${h('Subject')}`;
    const origMsgId = h('Message-ID');

    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${origMsgId}`,
      `References: ${origMsgId}`,
      `Content-Type: text/plain; charset=utf-8`,
      '',
      body,
    ].join('\r\n');

    const encoded = Buffer.from(raw).toString('base64url');
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded, threadId: original.data.threadId },
    });

    return { success: true, output: `Reply sent to ${to}` };
  }

  private async markEmail(gmail: any, messageId: string, read: boolean): Promise<ToolResult> {
    if (!messageId) return { success: false, output: '', error: 'messageId is required' };

    await gmail.users.messages.modify({
      userId: 'me', id: messageId,
      requestBody: {
        addLabelIds: read ? [] : ['UNREAD'],
        removeLabelIds: read ? ['UNREAD'] : [],
      },
    });
    return { success: true, output: `Email marked as ${read ? 'read' : 'unread'}` };
  }

  private async unreadCount(gmail: any): Promise<ToolResult> {
    const res = await gmail.users.messages.list({
      userId: 'me', q: 'is:unread', maxResults: 1,
    });
    const total = res.data.resultSizeEstimate || 0;
    return { success: true, output: `${total} unread emails` };
  }

  private async sendViaSmtp(input: Record<string, unknown>): Promise<ToolResult> {
    const to = String(input.to ?? '');
    const subject = String(input.subject ?? '');
    const body = String(input.body ?? '');

    if (!to || !subject) return { success: false, output: '', error: 'to and subject are required' };

    const { sendEmailSmtp } = await import('../../actions/email/smtp.js');
    await sendEmailSmtp(to, subject, body);
    return { success: true, output: `Email sent via SMTP to ${to}: "${subject}"` };
  }
}
