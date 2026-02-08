import config from '../../config.js';
import logger from '../../utils/logger.js';

let gmail: any = null;
let oauth2Client: any = null;

async function getGmailClient() {
  if (gmail) return gmail;

  const { google } = await import('googleapis');
  oauth2Client = new google.auth.OAuth2(
    (config as any).GMAIL_CLIENT_ID,
    (config as any).GMAIL_CLIENT_SECRET,
    (config as any).GMAIL_REDIRECT_URI ?? 'http://localhost:3000/api/auth/gmail/callback',
  );
  if ((config as any).GMAIL_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: (config as any).GMAIL_REFRESH_TOKEN });
  }
  gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return gmail;
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export async function listEmails(maxResults = 10, query = 'is:inbox'): Promise<EmailMessage[]> {
  const client = await getGmailClient();
  const res = await client.users.messages.list({ userId: 'me', maxResults, q: query });
  const messages: EmailMessage[] = [];

  for (const msg of res.data.messages ?? []) {
    const detail = await client.users.messages.get({
      userId: 'me', id: msg.id!, format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    });
    const headers = detail.data.payload?.headers ?? [];
    const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value ?? '';

    messages.push({
      id: msg.id!,
      from: getHeader('From'), to: getHeader('To'),
      subject: getHeader('Subject'), body: detail.data.snippet ?? '',
      date: getHeader('Date'), snippet: detail.data.snippet ?? '',
      isUnread: detail.data.labelIds?.includes('UNREAD') ?? false,
    });
  }
  return messages;
}

export async function getEmailBody(messageId: string): Promise<string> {
  const client = await getGmailClient();
  const detail = await client.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const parts = detail.data.payload?.parts ?? [];
  const textPart = parts.find((p: any) => p.mimeType === 'text/plain');
  if (textPart?.body?.data) {
    return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
  }
  return detail.data.snippet ?? '';
}

export async function sendEmail(to: string, subject: string, body: string): Promise<string> {
  const client = await getGmailClient();
  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${body}`
  ).toString('base64url');

  const res = await client.users.messages.send({ userId: 'me', requestBody: { raw } });
  logger.info('Email sent', { to, subject, id: res.data.id });
  return res.data.id ?? '';
}

export async function searchEmails(query: string, maxResults = 5): Promise<EmailMessage[]> {
  return listEmails(maxResults, query);
}

export function getAuthUrl(): string {
  if (!oauth2Client) throw new Error('Gmail not initialized');
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
  });
}

export async function handleAuthCallback(code: string): Promise<string> {
  if (!oauth2Client) throw new Error('Gmail not initialized');
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens.refresh_token ?? '';
}
