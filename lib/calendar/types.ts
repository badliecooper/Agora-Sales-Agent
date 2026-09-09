export interface CheckCalendarAvailabilityInput {
  date: string; // YYYY-MM-DD or readable date string
  startTime: string; // HH:mm or ISO
  endTime: string; // HH:mm or ISO
  timezone: string;
  calendarId?: string;
}

export interface CheckCalendarAvailabilityResult {
  available: boolean;
  conflictReason?: string;
  conflicts?: Array<{ start: string; end: string; summary?: string }>;
  error?: string;
  errorCode?: string;
}

export interface FindAvailableSlotsInput {
  preferredDate?: string;
  preferredRange?: { start: string; end: string };
  preferredTimeWindow?: 'morning' | 'afternoon' | 'evening' | 'any';
  duration: number; // in minutes, defaults to 30
  timezone: string;
  limit?: number;
}

export interface AvailableTimeSlot {
  start: string; // ISO 8601 string
  end: string; // ISO 8601 string
  formattedTime: string; // e.g. "Tuesday, Sep 8, 2026 at 2:00 PM EDT"
  available: boolean;
}

export interface CreateCalendarMeetingInput {
  title: string;
  start: string; // ISO 8601 string
  end: string; // ISO 8601 string
  timezone: string;
  customerName: string;
  customerEmail?: string;
  company?: string;
  meetingPurpose?: string;
  conversationId: string;
  notes?: string;
}

export type CreateCalendarEventInput = CreateCalendarMeetingInput;

export interface CalendarMeetingResult {
  success: boolean;
  service?: 'google_calendar';
  calendarEventId?: string;
  eventId?: string; // Backwards compatible alias
  event_id?: string; // Structured API alias
  calendarId?: string;
  eventLink?: string;
  meetingUrl?: string; // Live Google Meet conference URL
  summary?: string;
  start?: string;
  end?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  attendeeEmail?: string;
  attendeeName?: string;
  error?: string;
  errorCode?: string;
  idempotent?: boolean;
}

export type CalendarEventResult = CalendarMeetingResult;

export interface CancelCalendarMeetingInput {
  calendarEventId: string;
  calendarId?: string;
  conversationId?: string;
}

export interface CancelCalendarMeetingResult {
  success: boolean;
  calendarEventId: string;
  status: 'cancelled' | 'not_found' | 'failed';
  error?: string;
}

export interface RescheduleCalendarMeetingInput {
  calendarEventId: string;
  newStart: string; // ISO 8601
  newEnd: string; // ISO 8601
  timezone: string;
  calendarId?: string;
  conversationId?: string;
  customerName?: string;
  customerEmail?: string;
  company?: string;
}

export interface BookMeetingInput {
  text?: string;
  date?: string; // YYYY-MM-DD or spoken date string
  startTime?: string; // HH:mm or spoken time
  endTime?: string; // HH:mm
  duration?: number; // default 30 min
  timezone?: string;
  customerName?: string;
  customerEmail?: string;
  company?: string;
  meetingPurpose?: string;
  conversationId: string;
  idempotencyKey?: string;
}

export interface BookMeetingResult {
  success: boolean;
  status: 'confirmed' | 'unavailable' | 'collecting_details' | 'failed' | 'cancelled' | 'rescheduled';
  calendarEventId?: string;
  eventId?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  meetingUrl?: string;
  attendeeEmail?: string;
  attendeeName?: string;
  suggestedSlots?: AvailableTimeSlot[];
  missingFields?: string[];
  message: string;
  speechDirective?: string;
  crmSynced?: boolean;
  emailSent?: boolean;
  idempotent?: boolean;
  error?: string;
}
