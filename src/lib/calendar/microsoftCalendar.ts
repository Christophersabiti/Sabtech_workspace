// Microsoft Graph Calendar API integration (Phase 2)
// Uses OAuth 2.0 with the Graph API — no SDK, pure fetch.

const MS_AUTH_BASE  = 'https://login.microsoftonline.com';
const MS_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TENANT        = process.env.MICROSOFT_TENANT_ID ?? 'common';

const SCOPES = [
  'Calendars.ReadWrite',
  'User.Read',
  'offline_access',
  'openid',
  'email',
  'profile',
].join(' ');

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildMicrosoftAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    response_mode: 'query',
    state,
    prompt:        'select_account',
  });
  return `${MS_AUTH_BASE}/${TENANT}/oauth2/v2.0/authorize?${params}`;
}

export type MicrosoftTokenResponse = {
  access_token:  string;
  refresh_token?: string;
  expires_in:    number;
  token_type:    string;
  scope:         string;
};

export async function exchangeMicrosoftCode(
  code: string,
  redirectUri: string,
): Promise<MicrosoftTokenResponse> {
  const res = await fetch(`${MS_AUTH_BASE}/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<MicrosoftTokenResponse>;
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(`${MS_AUTH_BASE}/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
      scope:         SCOPES,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token refresh failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function getMicrosoftUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(`${MS_GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
  return data.mail ?? data.userPrincipalName ?? null;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type MSEventBody = {
  subject: string;
  body?: { contentType: 'Text' | 'HTML'; content: string };
  start: { dateTime: string; timeZone: string };
  end:   { dateTime: string; timeZone: string };
  location?: { displayName: string };
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    type: 'required' | 'optional';
  }>;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: 'teamsForBusiness';
  recurrence?: {
    pattern: { type: string; interval: number; daysOfWeek?: string[] };
    range:   { type: string; startDate: string; endDate?: string; numberOfOccurrences?: number };
  };
  sensitivity?: 'normal' | 'personal' | 'private' | 'confidential';
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
};

export type MSEventResult = {
  id: string;
  webLink: string;
  onlineMeeting?: { joinUrl: string };
  subject?: string;
  start?: { dateTime: string; timeZone: string };
  end?:   { dateTime: string; timeZone: string };
  lastModifiedDateTime?: string;
};

export type MSEventListResult = {
  value: MSEventResult[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
};

// ---------------------------------------------------------------------------
// Calendar CRUD (Graph API)
// ---------------------------------------------------------------------------

export async function createMicrosoftEvent(
  accessToken: string,
  calendarId: string,
  event: MSEventBody,
  createTeamsLink = false,
): Promise<MSEventResult> {
  const body = { ...event };
  if (createTeamsLink) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = 'teamsForBusiness';
  }

  const url = calendarId === 'primary'
    ? `${MS_GRAPH_BASE}/me/events`
    : `${MS_GRAPH_BASE}/me/calendars/${calendarId}/events`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MS Graph createEvent failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<MSEventResult>;
}

export async function updateMicrosoftEvent(
  accessToken: string,
  eventId: string,
  event: Partial<MSEventBody>,
): Promise<MSEventResult> {
  const res = await fetch(`${MS_GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MS Graph updateEvent failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<MSEventResult>;
}

export async function deleteMicrosoftEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${MS_GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`MS Graph deleteEvent failed (${res.status}): ${text}`);
  }
}

export async function listMicrosoftEvents(
  accessToken: string,
  options: { startDateTime?: string; endDateTime?: string; deltaLink?: string } = {},
): Promise<MSEventListResult> {
  let url: string;

  if (options.deltaLink) {
    url = options.deltaLink;
  } else {
    const params = new URLSearchParams({
      $select: 'id,subject,start,end,location,attendees,isOnlineMeeting,onlineMeeting,sensitivity,lastModifiedDateTime,isCancelled',
      $orderby: 'start/dateTime',
      $top: '50',
    });
    if (options.startDateTime) params.set('startDateTime', options.startDateTime);
    if (options.endDateTime)   params.set('endDateTime',   options.endDateTime);
    url = `${MS_GRAPH_BASE}/me/calendarView/delta?${params}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'odata.maxpagesize=50' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MS Graph listEvents failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<MSEventListResult>;
}

// ---------------------------------------------------------------------------
// Subscription (webhook) for Microsoft Graph push notifications
// ---------------------------------------------------------------------------

export async function createMicrosoftSubscription(
  accessToken: string,
  notificationUrl: string,
): Promise<{ id: string; expirationDateTime: string }> {
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days max

  const res = await fetch(`${MS_GRAPH_BASE}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changeType:          'created,updated,deleted',
      notificationUrl,
      resource:            '/me/events',
      expirationDateTime:  expiresAt,
      clientState:         process.env.MICROSOFT_WEBHOOK_SECRET ?? 'sabtech-calendar',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MS Graph subscription failed (${res.status}): ${text}`);
  }
  return res.json();
}
