import config from '../../config.js';

let calendar: any = null;

async function getCalendarClient() {
  if (calendar) return calendar;

  const { google } = await import('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    (config as any).GMAIL_CLIENT_ID,
    (config as any).GMAIL_CLIENT_SECRET,
  );
  const refreshToken = (config as any).GOOGLE_REFRESH_TOKEN ?? (config as any).GMAIL_REFRESH_TOKEN;
  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }
  calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  return calendar;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

export async function listEvents(timeMin?: string, timeMax?: string, maxResults = 10): Promise<CalendarEvent[]> {
  const client = await getCalendarClient();
  const now = new Date();
  const res = await client.events.list({
    calendarId: 'primary',
    timeMin: timeMin ?? now.toISOString(),
    timeMax: timeMax ?? new Date(now.getTime() + 7 * 86400000).toISOString(),
    maxResults, singleEvents: true, orderBy: 'startTime',
  });

  return (res.data.items ?? []).map((e: any) => ({
    id: e.id!, title: e.summary ?? 'Untitled',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    location: e.location, description: e.description,
  }));
}

export async function createEvent(title: string, start: string, end: string, description?: string): Promise<CalendarEvent> {
  const client = await getCalendarClient();
  const timezone = (config as any).CRON_TIMEZONE ?? 'Asia/Jerusalem';
  const res = await client.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title, description,
      start: { dateTime: start, timeZone: timezone },
      end: { dateTime: end, timeZone: timezone },
    },
  });
  return { id: res.data.id!, title, start, end, description };
}

export async function deleteEvent(eventId: string): Promise<void> {
  const client = await getCalendarClient();
  await client.events.delete({ calendarId: 'primary', eventId });
}
