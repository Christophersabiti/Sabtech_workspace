// Calendar module types

export type CalendarProvider = 'google' | 'microsoft';
export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export type EventType =
  | 'meeting'
  | 'discovery_call'
  | 'kickoff'
  | 'review'
  | 'training'
  | 'deadline'
  | 'reminder'
  | 'consultation'
  | 'payment_followup'
  | 'implementation_support'
  | 'closure_meeting'
  | 'other';

export type EventStatus = 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
export type EventVisibility = 'private' | 'team' | 'company';
export type EventSource = 'internal' | 'google' | 'microsoft';
export type ProviderSyncStatus = 'pending' | 'synced' | 'error' | 'skipped';
export type RsvpStatus = 'pending' | 'accepted' | 'declined' | 'tentative';
export type AttendeeType = 'internal' | 'external' | 'client' | 'consultant';
export type SyncDirection = 'outbound' | 'inbound' | 'both';
export type ImportMode = 'all' | 'work_only' | 'from_today' | 'new_only' | 'none';
export type SyncOperation = 'create' | 'update' | 'delete' | 'import' | 'webhook';
export type SyncStatus = 'success' | 'error' | 'skipped';
export type ReminderMethod = 'email' | 'in_app' | 'whatsapp';
export type ConflictType = 'overlap' | 'back_to_back' | 'double_booking';

export type CalendarConnection = {
  id: string;
  company_id: string;
  user_id: string;
  provider: CalendarProvider;
  provider_account_email: string | null;
  provider_calendar_id: string | null;
  token_expires_at: string | null;
  sync_enabled: boolean;
  sync_direction: SyncDirection;
  import_mode: ImportMode;
  last_sync_at: string | null;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_expiry: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  location: string | null;
  meet_link: string | null;
  color: string | null;
  project_id: string | null;
  task_id: string | null;
  client_id: string | null;
  event_type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  recurrence_rule: string | null;
  recurrence_parent_id: string | null;
  provider: EventSource;
  provider_event_id: string | null;
  provider_calendar_id: string | null;
  provider_sync_status: ProviderSyncStatus;
  provider_synced_at: string | null;
  source: EventSource;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  attendees?: CalendarEventAttendee[];
  reminders?: CalendarReminder[];
  project?: { id: string; project_name: string; project_code: string } | null;
  client?: { id: string; name: string; company_name: string | null } | null;
};

export type CalendarEventAttendee = {
  id: string;
  event_id: string;
  company_id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  attendee_type: AttendeeType;
  rsvp_status: RsvpStatus;
  is_organizer: boolean;
  is_optional: boolean;
  invited_at: string;
  responded_at: string | null;
  created_at: string;
};

export type CalendarSyncLog = {
  id: string;
  company_id: string;
  user_id: string;
  connection_id: string | null;
  event_id: string | null;
  provider: string;
  operation: SyncOperation;
  status: SyncStatus;
  provider_event_id: string | null;
  error_message: string | null;
  synced_at: string;
};

export type CalendarReminder = {
  id: string;
  event_id: string;
  company_id: string;
  user_id: string;
  method: ReminderMethod;
  minutes_before: number;
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
};

export type CalendarEventLink = {
  id: string;
  event_id: string;
  company_id: string;
  entity_type: 'project' | 'task' | 'client' | 'consultation';
  entity_id: string;
  created_at: string;
};

export type CalendarConflict = {
  id: string;
  company_id: string;
  user_id: string;
  event_id: string | null;
  conflicting_event_id: string | null;
  conflict_type: ConflictType;
  detected_at: string;
  resolved: boolean;
  resolved_at: string | null;
};

export type UserAvailabilitySettings = {
  id: string;
  company_id: string;
  user_id: string;
  timezone: string;
  working_hours: WorkingHours;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  max_meetings_per_day: number | null;
  allow_back_to_back: boolean;
  show_as_busy_when_away: boolean;
  created_at: string;
  updated_at: string;
};

export type DayAvailability = {
  start: string;
  end: string;
  enabled: boolean;
};

export type WorkingHours = {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: Omit<DayAvailability, 'start' | 'end'> & { start?: string; end?: string };
  sunday: Omit<DayAvailability, 'start' | 'end'> & { start?: string; end?: string };
};

// Form payloads
export type CreateCalendarEventPayload = {
  company_id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  timezone?: string;
  location?: string;
  meet_link?: string;
  color?: string;
  project_id?: string;
  task_id?: string;
  client_id?: string;
  event_type?: EventType;
  status?: EventStatus;
  visibility?: EventVisibility;
  recurrence_rule?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    attendee_type?: AttendeeType;
    is_optional?: boolean;
    user_id?: string;
  }>;
  reminders?: Array<{
    method: ReminderMethod;
    minutes_before: number;
  }>;
  sync_to_provider?: boolean;
  generate_meet_link?: boolean;
};

export type UpdateCalendarEventPayload = Partial<Omit<CreateCalendarEventPayload, 'company_id'>> & {
  company_id: string;
};

// UI state
export type CalendarFilters = {
  project_id: string | null;
  client_id: string | null;
  user_id: string | null;
  status: EventStatus | null;
  event_type: EventType | null;
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  meeting:                'Meeting',
  discovery_call:         'Discovery Call',
  kickoff:                'Project Kickoff',
  review:                 'Review Session',
  training:               'Training',
  deadline:               'Deadline',
  reminder:               'Reminder',
  consultation:           'Consultation',
  payment_followup:       'Payment Follow-up',
  implementation_support: 'Implementation Support',
  closure_meeting:        'Closure Meeting',
  other:                  'Other',
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  meeting:                '#3b82f6',
  discovery_call:         '#8b5cf6',
  kickoff:                '#22c55e',
  review:                 '#f59e0b',
  training:               '#f97316',
  deadline:               '#ef4444',
  reminder:               '#64748b',
  consultation:           '#14b8a6',
  payment_followup:       '#ec4899',
  implementation_support: '#06b6d4',
  closure_meeting:        '#6366f1',
  other:                  '#94a3b8',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  scheduled:   'Scheduled',
  rescheduled: 'Rescheduled',
  completed:   'Completed',
  cancelled:   'Cancelled',
};
