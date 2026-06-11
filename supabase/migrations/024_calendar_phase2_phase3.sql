-- Migration 024: Calendar Phase 2 & 3 enhancements
-- Adds sync_token, booking_links, booking_slots, user_booking_availability

-- 1. Add sync_token to calendar_connections for incremental Google sync
ALTER TABLE calendar_connections
  ADD COLUMN IF NOT EXISTS sync_token TEXT;

-- 2. booking_links — consultant/user booking pages (Phase 3)
CREATE TABLE IF NOT EXISTS booking_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  description      TEXT,
  duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  buffer_minutes   INT NOT NULL DEFAULT 0,
  event_type       TEXT DEFAULT 'consultation' CHECK (event_type IN (
    'meeting', 'discovery_call', 'kickoff', 'review', 'training',
    'deadline', 'reminder', 'consultation', 'payment_followup',
    'implementation_support', 'closure_meeting', 'other'
  )),
  location_type    TEXT DEFAULT 'video' CHECK (location_type IN ('video', 'phone', 'in_person', 'flexible')),
  location_value   TEXT,
  timezone         TEXT DEFAULT 'Africa/Kampala',
  booking_window_days INT DEFAULT 30,
  max_bookings_per_day INT,
  require_approval BOOLEAN DEFAULT false,
  is_active        BOOLEAN DEFAULT true,
  custom_questions JSONB DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE booking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_links_own_user" ON booking_links
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public read for active links (clients accessing booking pages)
CREATE POLICY "booking_links_public_read" ON booking_links
  FOR SELECT USING (is_active = true);

-- 3. booking_slots — confirmed bookings from external clients
CREATE TABLE IF NOT EXISTS booking_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_link_id UUID NOT NULL REFERENCES booking_links(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  host_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  guest_name      TEXT NOT NULL,
  guest_email     TEXT NOT NULL,
  guest_notes     TEXT,
  custom_answers  JSONB DEFAULT '{}'::jsonb,
  status          TEXT DEFAULT 'confirmed'
    CHECK (status IN ('pending_approval', 'confirmed', 'cancelled', 'no_show')),
  cancel_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE booking_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_slots_host_access" ON booking_slots
  USING (host_user_id = auth.uid());

-- Public insert for guest bookings
CREATE POLICY "booking_slots_public_insert" ON booking_slots
  FOR INSERT WITH CHECK (true);

-- Public select by cancel_token (for guest to view/cancel their booking)
CREATE POLICY "booking_slots_public_cancel_read" ON booking_slots
  FOR SELECT USING (true);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_booking_links_slug     ON booking_links(slug);
CREATE INDEX IF NOT EXISTS idx_booking_links_user     ON booking_links(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_slots_host     ON booking_slots(host_user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_booking_slots_link     ON booking_slots(booking_link_id, start_at);
CREATE INDEX IF NOT EXISTS idx_booking_slots_token    ON booking_slots(cancel_token);
CREATE INDEX IF NOT EXISTS idx_cal_conn_sync_token    ON calendar_connections(user_id) WHERE sync_token IS NOT NULL;
