// Google Calendar REST API integration (no googleapis SDK — pure fetch)

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

export function buildGoogleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent select_account',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string; optional?: boolean }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'email' | 'popup'; minutes: number }>;
  };
  conferenceData?: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: { type: 'hangoutsMeet' };
    };
  };
  recurrence?: string[];
  status?: 'confirmed' | 'tentative' | 'cancelled';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
};

export type GoogleCalendarEventResult = {
  id: string;
  htmlLink: string;
  hangoutLink?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated?: string;
};

export type GoogleCalendarListResult = {
  items: GoogleCalendarEventResult[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

// ---------------------------------------------------------------------------
// Calendar CRUD
// ---------------------------------------------------------------------------

export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleCalendarEventInput,
  generateMeetLink = false,
): Promise<GoogleCalendarEventResult> {
  const qs = generateMeetLink ? '?conferenceDataVersion=1&sendUpdates=externalOnly' : '?sendUpdates=externalOnly';
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events${qs}`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar createEvent failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<GoogleCalendarEventResult>;
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEventInput>,
): Promise<GoogleCalendarEventResult> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=externalOnly`,
    {
      method: 'PATCH',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar updateEvent failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<GoogleCalendarEventResult>;
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  // 404 and 410 (Gone) are acceptable — event already deleted on provider
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`Google Calendar deleteEvent failed (${res.status}): ${text}`);
  }
}

export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  options: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    pageToken?: string;
    syncToken?: string;
  } = {},
): Promise<GoogleCalendarListResult> {
  const params = new URLSearchParams({ singleEvents: 'true' });
  if (!options.syncToken) params.set('orderBy', 'startTime');
  if (options.timeMin)    params.set('timeMin', options.timeMin);
  if (options.timeMax)    params.set('timeMax', options.timeMax);
  if (options.maxResults) params.set('maxResults', String(options.maxResults));
  if (options.pageToken)  params.set('pageToken', options.pageToken);
  if (options.syncToken)  params.set('syncToken', options.syncToken);

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar listEvents failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<GoogleCalendarListResult>;
}

// ---------------------------------------------------------------------------
// Webhook (watch channel) helpers
// ---------------------------------------------------------------------------

export async function watchGoogleCalendar(
  accessToken: string,
  calendarId: string,
  channelId: string,
  webhookUrl: string,
): Promise<{ id: string; resourceId: string; expiration: string }> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id:      channelId,
        type:    'web_hook',
        address: webhookUrl,
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar watch failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function stopGoogleCalendarWatch(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  await fetch(`${GOOGLE_CALENDAR_BASE}/channels/stop`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}
