-- Migration 023: Calendar Schedule Management Module
-- Adds full calendar infrastructure: connections, events, attendees,
-- sync logs, reminders, event links, conflict tracking, availability settings.

-- 1. calendar_connections — stores OAuth tokens per user per provider
CREATE TABLE IF NOT EXISTS calendar_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_account_email  TEXT,
  provider_calendar_id    TEXT DEFAULT 'primary',
  access_token_encrypted  TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at        TIMESTAMPTZ,
  sync_enabled            BOOLEAN DEFAULT true,
  sync_direction          TEXT DEFAULT 'outbound'
    CHECK (sync_direction IN ('outbound', 'inbound', 'both')),
  import_mode             TEXT DEFAULT 'new_only'
    CHECK (import_mode IN ('all', 'work_only', 'from_today', 'new_only', 'none')),
  last_sync_at            TIMESTAMPTZ,
  webhook_channel_id      TEXT,
  webhook_resource_id     TEXT,
  webhook_expiry          TIMESTAMPTZ,
  is_active               BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, user_id, provider)
);

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_conn_own_user" ON calendar_connections
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. calendar_events — all calendar events (internal + imported)
CREATE TABLE IF NOT EXISTS calendar_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  all_day               BOOLEAN DEFAULT false,
  timezone              TEXT DEFAULT 'UTC',
  location              TEXT,
  meet_link             TEXT,
  color                 TEXT,
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id               UUID,
  client_id             UUID REFERENCES clients(id) ON DELETE SET NULL,
  event_type            TEXT DEFAULT 'meeting' CHECK (event_type IN (
    'meeting', 'discovery_call', 'kickoff', 'review', 'training',
    'deadline', 'reminder', 'consultation', 'payment_followup',
    'implementation_support', 'closure_meeting', 'other'
  )),
  status                TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'rescheduled', 'completed', 'cancelled'
  )),
  visibility            TEXT DEFAULT 'team' CHECK (visibility IN ('private', 'team', 'company')),
  recurrence_rule       TEXT,
  recurrence_parent_id  UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  provider              TEXT DEFAULT 'internal' CHECK (provider IN ('google', 'microsoft', 'internal')),
  provider_event_id     TEXT,
  provider_calendar_id  TEXT,
  provider_sync_status  TEXT DEFAULT 'pending'
    CHECK (provider_sync_status IN ('pending', 'synced', 'error', 'skipped')),
  provider_synced_at    TIMESTAMPTZ,
  source                TEXT DEFAULT 'internal' CHECK (source IN ('internal', 'google', 'microsoft')),
  created_by            UUID REFERENCES auth.users(id),
  updated_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Users see events within their active companies
CREATE POLICY "cal_events_company_member" ON calendar_events
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- 3. calendar_event_attendees — attendee tracking
CREATE TABLE IF NOT EXISTS calendar_event_attendees (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  name           TEXT,
  attendee_type  TEXT DEFAULT 'internal'
    CHECK (attendee_type IN ('internal', 'external', 'client', 'consultant')),
  rsvp_status    TEXT DEFAULT 'pending'
    CHECK (rsvp_status IN ('pending', 'accepted', 'declined', 'tentative')),
  is_organizer   BOOLEAN DEFAULT false,
  is_optional    BOOLEAN DEFAULT false,
  invited_at     TIMESTAMPTZ DEFAULT NOW(),
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calendar_event_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_attendees_company_member" ON calendar_event_attendees
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- 4. calendar_sync_logs — audit trail for all sync operations
CREATE TABLE IF NOT EXISTS calendar_sync_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id    UUID REFERENCES calendar_connections(id) ON DELETE SET NULL,
  event_id         UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  provider         TEXT NOT NULL,
  operation        TEXT NOT NULL
    CHECK (operation IN ('create', 'update', 'delete', 'import', 'webhook')),
  status           TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  provider_event_id TEXT,
  error_message    TEXT,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calendar_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_sync_logs_own_user" ON calendar_sync_logs
  USING (user_id = auth.uid());

-- 5. calendar_reminders — per-user reminder configuration per event
CREATE TABLE IF NOT EXISTS calendar_reminders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method         TEXT NOT NULL CHECK (method IN ('email', 'in_app', 'whatsapp')),
  minutes_before INT NOT NULL DEFAULT 15 CHECK (minutes_before >= 0),
  is_sent        BOOLEAN DEFAULT false,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_reminders_own_user" ON calendar_reminders
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 6. calendar_event_links — entity links (project, task, client, consultation)
CREATE TABLE IF NOT EXISTS calendar_event_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('project', 'task', 'client', 'consultation')),
  entity_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, entity_type, entity_id)
);

ALTER TABLE calendar_event_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_event_links_company_member" ON calendar_event_links
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- 7. calendar_conflicts — detected scheduling conflicts
CREATE TABLE IF NOT EXISTS calendar_conflicts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id              UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  conflicting_event_id  UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  conflict_type         TEXT DEFAULT 'overlap'
    CHECK (conflict_type IN ('overlap', 'back_to_back', 'double_booking')),
  detected_at           TIMESTAMPTZ DEFAULT NOW(),
  resolved              BOOLEAN DEFAULT false,
  resolved_at           TIMESTAMPTZ
);

ALTER TABLE calendar_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_conflicts_own_user" ON calendar_conflicts
  USING (user_id = auth.uid());

-- 8. user_availability_settings — working hours + buffer preferences
CREATE TABLE IF NOT EXISTS user_availability_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone               TEXT DEFAULT 'Africa/Kampala',
  working_hours          JSONB DEFAULT '{
    "monday":    {"start":"09:00","end":"17:00","enabled":true},
    "tuesday":   {"start":"09:00","end":"17:00","enabled":true},
    "wednesday": {"start":"09:00","end":"17:00","enabled":true},
    "thursday":  {"start":"09:00","end":"17:00","enabled":true},
    "friday":    {"start":"09:00","end":"17:00","enabled":true},
    "saturday":  {"enabled":false},
    "sunday":    {"enabled":false}
  }'::jsonb,
  buffer_before_minutes  INT DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes   INT DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  max_meetings_per_day   INT,
  allow_back_to_back     BOOLEAN DEFAULT true,
  show_as_busy_when_away BOOLEAN DEFAULT true,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE user_availability_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_availability_own_user" ON user_availability_settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_cal_events_company_start  ON calendar_events(company_id, start_at);
CREATE INDEX IF NOT EXISTS idx_cal_events_company_end    ON calendar_events(company_id, end_at);
CREATE INDEX IF NOT EXISTS idx_cal_events_user           ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_project        ON calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_client         ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_provider       ON calendar_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_status         ON calendar_events(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cal_attendees_event       ON calendar_event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_cal_attendees_email       ON calendar_event_attendees(email);
CREATE INDEX IF NOT EXISTS idx_cal_attendees_user        ON calendar_event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_cal_conn_user             ON calendar_connections(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_cal_reminders_event       ON calendar_reminders(event_id, is_sent);
CREATE INDEX IF NOT EXISTS idx_cal_sync_logs_conn        ON calendar_sync_logs(connection_id, synced_at);
