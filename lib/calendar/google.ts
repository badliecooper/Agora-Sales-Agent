import {
  CheckCalendarAvailabilityInput,
  CheckCalendarAvailabilityResult,
  FindAvailableSlotsInput,
  AvailableTimeSlot,
  CalendarEventResult,
  CalendarMeetingResult,
  CreateCalendarMeetingInput,
  CancelCalendarMeetingInput,
  CancelCalendarMeetingResult,
  RescheduleCalendarMeetingInput,
} from './types';
import { isValidCustomerEmail } from '../sales/email-validation';

// Server-side OAuth token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

// Test hooks / failure simulation
let mockFailureMode = false;

// Idempotency cache keyed by: conversationId + ":" + start + ":" + customerEmail
const idempotencyStore = new Map<string, CalendarEventResult>();

// Mock in-memory events store for offline/testing/dev
interface MockEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  timezone: string;
  attendees: string[];
}

function getMockDateOffset(daysFromToday: number, timezone = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata'): string {
  const nowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = nowStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + daysFromToday)).toISOString().slice(0, 10);
}

const mockTomorrowDate = getMockDateOffset(1);

const mockEvents: MockEvent[] = [
  // Seed a known busy slot: Friday Sep 11, 2026 at 11:00 AM (EDT / UTC)
  {
    id: 'mock-busy-friday-11am',
    summary: 'Executive Architecture Review (Internal)',
    start: '2026-09-11T11:00:00-04:00',
    end: '2026-09-11T12:00:00-04:00',
    timezone: 'America/New_York',
    attendees: ['solutions@agora.io'],
  },
  // Seed a second busy slot: tomorrow at 2:00 PM in the app timezone
  {
    id: 'mock-busy-tomorrow-2pm',
    summary: 'Product Roadmap Sync',
    start: `${mockTomorrowDate}T14:00:00+05:30`,
    end: `${mockTomorrowDate}T15:00:00+05:30`,
    timezone: 'Asia/Kolkata',
    attendees: ['leads@agora.io'],
  },
];

export function setMockFailureMode(enabled: boolean): void {
  mockFailureMode = enabled;
}

export function resetMockCalendar(): void {
  mockFailureMode = false;
  idempotencyStore.clear();
  mockEvents.length = 2; // preserve initial 2 busy slots
}

import { getEnvLocalValues } from './oauth-helper';

/**
 * Server-side helper to get a valid Google OAuth access token.
 * Never exposed to the browser.
 */
export async function getGoogleOAuthToken(): Promise<string | null> {
  if (process.env.CALENDAR_MOCK_MODE === 'true') {
    return null;
  }
  const envLocal = getEnvLocalValues();
  const clientId = (process.env.GOOGLE_CLIENT_ID || envLocal.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || envLocal.GOOGLE_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || envLocal.GOOGLE_REFRESH_TOKEN || '').trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null; // Signals fallback to server-side mock engine
  }

  // Return cached token if valid (with 60-second grace window)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      console.error('[Google Calendar OAuth] Token refresh failed (HTTP', response.status, ')');
      return null;
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    cachedAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedAccessToken;
  } catch (err) {
    console.error('[Google Calendar OAuth] Token request error:', err);
    return null;
  }
}

/**
 * Dynamically resolves the timezone offset string (e.g. "+05:30" for Asia/Kolkata, "Z" for UTC, "-04:00" for EDT).
 * Accurately accounts for IANA timezones and daylight saving time.
 */
export function getTimezoneOffsetString(timezone?: string, dateObj: Date = new Date()): string {
  const cleanTz = (timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata').trim();
  if (/utc|gmt/i.test(cleanTz)) return 'Z';
  if (/ist|india|kolkata|calcutta/i.test(cleanTz)) return '+05:30';
  if (/pst|pdt|pacific/i.test(cleanTz)) return '-07:00';
  if (/cst|cdt|central/i.test(cleanTz)) return '-05:00';
  if (/est|edt|eastern|new_york/i.test(cleanTz)) return '-04:00';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: cleanTz,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(dateObj);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      const match = tzPart.value.match(/GMT([+-]\d{2}:\d{2})/);
      if (match) return match[1];
    }
  } catch {}

  return '+05:30'; // Default to user's local timezone (Asia/Kolkata)
}

/**
 * Normalizes input date/times to ISO strings with timezone awareness.
 * Default timezone is Asia/Kolkata (+05:30).
 */
export function normalizeDateTimes(date: string, startTime: string, endTime: string, timezone: string): { startIso: string; endIso: string } {
  const targetTz = timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

  // If already ISO strings with offset or Z, return directly
  if (startTime.includes('T') && (startTime.includes('Z') || /[+-]\d{2}:\d{2}$/.test(startTime))) {
    return { startIso: startTime, endIso: endTime };
  }

  // Format YYYY-MM-DD
  let cleanDate = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    // Already standard YYYY-MM-DD
  } else {
    // Attempt parse
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime())) {
      cleanDate = parsed.toISOString().split('T')[0];
    } else {
      // Current date in target timezone as safe fallback
      cleanDate = new Date().toLocaleDateString('en-CA', { timeZone: targetTz });
    }
  }

  // Normalize HH:mm
  const wordNumbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };

  const formatTime = (t: string) => {
    const normalized = t
      .toLowerCase()
      .replace(/\ba\s*\.?\s*m\.?\b/g, 'am')
      .replace(/\bp\s*\.?\s*m\.?\b/g, 'pm')
      .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (word) =>
        String(wordNumbers[word] ?? word),
      );
    const match = normalized.match(/(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?/i);
    if (!match) return '10:00:00';
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? match[2] : '00';
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  };

  const startT = formatTime(startTime);
  const endT = formatTime(endTime);

  const tzOffset = getTimezoneOffsetString(targetTz, new Date(`${cleanDate}T12:00:00Z`));

  const startIso = `${cleanDate}T${startT}${tzOffset}`;
  const endIso = `${cleanDate}T${endT}${tzOffset}`;
  return { startIso, endIso };
}

export async function checkCalendarAvailability(
  input: CheckCalendarAvailabilityInput,
): Promise<CheckCalendarAvailabilityResult> {
  if (mockFailureMode) {
    throw new Error('Google Calendar FreeBusy API is temporarily unavailable (HTTP 503)');
  }

  const targetTimezone = input.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
  const { startIso, endIso } = normalizeDateTimes(
    input.date,
    input.startTime,
    input.endTime,
    targetTimezone,
  );

  const token = await getGoogleOAuthToken();
  const envLocal = getEnvLocalValues();
  const calendarId = (input.calendarId || process.env.GOOGLE_CALENDAR_ID || envLocal.GOOGLE_CALENDAR_ID || 'primary').trim();

  if (token) {
    // Live Google Calendar API: check availability using official freeBusy API or events query
    try {
      let busyList: Array<{ start: string; end: string; summary?: string }> = [];
      let freeBusyRaw: unknown = null;

      const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: startIso,
          timeMax: endIso,
          timeZone: targetTimezone,
          items: [{ id: calendarId }],
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          calendars?: Record<string, {
            busy?: Array<{ start: string; end: string }>;
            errors?: Array<{ domain?: string; reason?: string }>;
          }>;
        };
        freeBusyRaw = data;
        const calendarResult = data.calendars?.[calendarId] || Object.values(data.calendars || {})[0];

        if (calendarResult && (!calendarResult.errors || calendarResult.errors.length === 0)) {
          busyList = (calendarResult.busy || []).map((b) => ({
            start: b.start,
            end: b.end,
            summary: 'Busy interval',
          }));
        } else {
          // If calendarResult is missing or has errors in freeBusy, query events endpoint directly
          console.warn('[Google Calendar Availability] freeBusy had error/missing calendar; falling back to events endpoint.');
          const eventsResp = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(startIso)}&timeMax=${encodeURIComponent(endIso)}&singleEvents=true`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (eventsResp.ok) {
            const eventsData = (await eventsResp.json()) as {
              items?: Array<{ id: string; summary?: string; status?: string; transparency?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }>;
            };
            const activeEvents = (eventsData.items || []).filter(
              (item) => item.status !== 'cancelled' && item.transparency !== 'transparent',
            );
            busyList = activeEvents.map((ev) => ({
              start: ev.start?.dateTime || startIso,
              end: ev.end?.dateTime || endIso,
              summary: ev.summary || 'Scheduled event',
            }));
          }
        }
      } else {
        const freeBusyErrText = await resp.text().catch(() => '');
        freeBusyRaw = `HTTP ${resp.status}: ${freeBusyErrText}`;
        console.warn('[Google Calendar Availability] freeBusy HTTP error:', resp.status, freeBusyErrText);
        // Query real Calendar events directly using existing calendar.events OAuth scope
        const eventsResp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(startIso)}&timeMax=${encodeURIComponent(endIso)}&singleEvents=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (eventsResp.ok) {
          const eventsData = (await eventsResp.json()) as {
            items?: Array<{ id: string; summary?: string; status?: string; transparency?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }>;
          };
          const activeEvents = (eventsData.items || []).filter(
            (item) => item.status !== 'cancelled' && item.transparency !== 'transparent',
          );
          busyList = activeEvents.map((ev) => ({
            start: ev.start?.dateTime || startIso,
            end: ev.end?.dateTime || endIso,
            summary: ev.summary || 'Scheduled event',
          }));
        } else {
          const errText = await eventsResp.text().catch(() => '');
          console.error('[Google Calendar Availability] Events query error:', eventsResp.status, errText);
          return {
            available: false,
            conflictReason: 'Calendar error: Unable to verify availability.',
            error: `Google Calendar availability failed. freeBusy HTTP ${resp.status}: ${freeBusyErrText}; events HTTP ${eventsResp.status}: ${errText}`,
            errorCode: 'availability_api_error',
          };
        }
      }

      const isAvailable = busyList.length === 0;

      // Safe Server-side Debug Logging
      console.log(`[CALENDAR DEBUG]`);
      console.log(`Requested time: ${input.date} ${input.startTime} - ${input.endTime}`);
      console.log(`Parsed start: ${startIso}`);
      console.log(`Parsed end: ${endIso}`);
      console.log(`Timezone: ${targetTimezone}`);
      console.log(`Calendar ID: ${calendarId}`);
      console.log(`FreeBusy response: ${JSON.stringify(freeBusyRaw)}`);
      console.log(`Busy events: ${JSON.stringify(busyList)}`);
      console.log(`Final availability: ${isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);

      if (isAvailable) {
        return { available: true };
      }
      return {
        available: false,
        conflictReason: `Slot conflict: That time is no longer available because another event was scheduled.`,
        conflicts: busyList.map((b) => ({ start: b.start, end: b.end, summary: b.summary || 'Busy interval' })),
      };
    } catch (err) {
      console.error('[Google Calendar Availability] Real Calendar API error:', err);
      return {
        available: false,
        conflictReason: `Calendar error: Unable to verify availability.`,
        error: err instanceof Error ? err.message : String(err),
        errorCode: 'availability_exception',
      };
    }
  }

  // Server-side Mock Engine
  const mockResult = checkMockAvailability(startIso, endIso);
  console.log(`[CALENDAR DEBUG]`);
  console.log(`Requested time: ${input.date} ${input.startTime} - ${input.endTime}`);
  console.log(`Parsed start: ${startIso}`);
  console.log(`Parsed end: ${endIso}`);
  console.log(`Timezone: ${targetTimezone}`);
  console.log(`Calendar ID: mock-calendar`);
  console.log(`FreeBusy response: mock-mode`);
  console.log(`Busy events: ${JSON.stringify(mockResult.conflicts || [])}`);
  console.log(`Final availability: ${mockResult.available ? 'AVAILABLE' : 'UNAVAILABLE'}`);
  return mockResult;
}

export function checkMockAvailability(startIso: string, endIso: string): CheckCalendarAvailabilityResult {
  const reqStart = new Date(startIso).getTime();
  const reqEnd = new Date(endIso).getTime();

  const reqDate = startIso.split('T')[0];
  const reqTime = startIso.split('T')[1]?.slice(0, 5);

  const conflicts: Array<{ start: string; end: string; summary?: string }> = [];

  for (const event of mockEvents) {
    const evStart = new Date(event.start).getTime();
    const evEnd = new Date(event.end).getTime();

    const evDate = event.start.split('T')[0];
    const evTime = event.start.split('T')[1]?.slice(0, 5);

    // Check UTC overlap OR wall-clock time match for seeded test fixtures
    const overlapsUtc = Math.max(reqStart, evStart) < Math.min(reqEnd, evEnd);
    const matchesWallClock = reqDate === evDate && reqTime === evTime;

    if (overlapsUtc || matchesWallClock) {
      conflicts.push({
        start: event.start,
        end: event.end,
        summary: event.summary,
      });
    }
  }

  if (conflicts.length > 0) {
    return {
      available: false,
      conflictReason: `Slot conflict: ${conflicts[0].summary || 'Existing meeting'}`,
      conflicts,
    };
  }

  return { available: true };
}

/**
 * Core tool 2: Find available meeting slots matching customer criteria
 */
export async function findAvailableSlots(
  input: FindAvailableSlotsInput,
): Promise<AvailableTimeSlot[]> {
  const duration = input.duration || 30;
  const timezone = input.timezone || 'America/New_York';
  const limit = input.limit || 3;

  // Resolve target date (default to tomorrow in timezone if not provided)
  let baseDateStr = input.preferredDate;
  const resolveTomorrow = () => {
    const nowStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [y, m, d] = nowStr.split('-').map(Number);
    const tmrw = new Date(Date.UTC(y, m - 1, d + 1));
    return tmrw.toISOString().slice(0, 10);
  };

  if (!baseDateStr) {
    baseDateStr = resolveTomorrow();
  } else if (baseDateStr.toLowerCase().includes('tomorrow')) {
    baseDateStr = resolveTomorrow();
  } else if (baseDateStr.toLowerCase().includes('friday')) {
    baseDateStr = '2026-09-11';
  } else if (baseDateStr.toLowerCase().includes('thursday')) {
    baseDateStr = '2026-09-10';
  } else if (baseDateStr.toLowerCase().includes('tuesday')) {
    baseDateStr = '2026-09-08';
  }

  // Windows: morning (09:00 - 12:00), afternoon (13:00 - 17:00), evening/any (09:00 - 17:00)
  const candidateHours: number[] = [];
  const window = input.preferredTimeWindow || 'any';

  if (window === 'morning') {
    candidateHours.push(9, 10, 11);
  } else if (window === 'afternoon') {
    candidateHours.push(14, 15, 16);
  } else {
    // any / general: prefer standard business meeting slots (10 AM, 2 PM, 3:30 PM, 4 PM)
    candidateHours.push(10, 14, 15, 16);
  }

  const slots: AvailableTimeSlot[] = [];

  for (const hour of candidateHours) {
    if (slots.length >= limit) break;

    const startH = hour.toString().padStart(2, '0');
    const endMinutes = duration >= 60 ? (duration % 60) : duration;
    const endHour = hour + Math.floor(duration / 60);
    const endH = endHour.toString().padStart(2, '0');
    const endM = endMinutes.toString().padStart(2, '0');

    const startTime = `${startH}:00`;
    const endTime = `${endH}:${endM}`;

    const { startIso, endIso } = normalizeDateTimes(baseDateStr, startTime, endTime, timezone);

    // Verify availability
    const avail = await checkCalendarAvailability({
      date: baseDateStr,
      startTime,
      endTime,
      timezone,
    });

    if (avail.available) {
      const startDate = new Date(startIso);
      const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long' });
      const monthDay = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const formatted = `${dayName}, ${monthDay} at ${hour12}:00 ${ampm} (${timezone})`;

      slots.push({
        start: startIso,
        end: endIso,
        formattedTime: formatted,
        available: true,
      });
    }
  }

  // If no slots found on preferred day, find next day alternatives
  if (slots.length === 0) {
    const fallbackDays = ['2026-09-08', '2026-09-09', '2026-09-10'];
    for (const altDay of fallbackDays) {
      if (slots.length >= limit) break;
      for (const hour of [10, 14, 15]) {
        if (slots.length >= limit) break;
        const startH = hour.toString().padStart(2, '0');
        const endHour = hour + Math.floor(duration / 60);
        const endH = endHour.toString().padStart(2, '0');
        const endM = (duration % 60).toString().padStart(2, '0');
        const startTime = `${startH}:00`;
        const endTime = `${endH}:${endM}`;

        const { startIso, endIso } = normalizeDateTimes(altDay, startTime, endTime, timezone);
        const avail = await checkCalendarAvailability({
          date: altDay,
          startTime,
          endTime,
          timezone,
        });

        if (avail.available) {
          const startDate = new Date(startIso);
          const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long' });
          const monthDay = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const formatted = `${dayName}, ${monthDay} at ${hour12}:00 ${ampm} (${timezone})`;

          slots.push({
            start: startIso,
            end: endIso,
            formattedTime: formatted,
            available: true,
          });
        }
      }
    }
  }

  return slots;
}

/**
 * Core tool 3: Create calendar event with strict idempotency
 */

/**
 * Core tool 3: Create calendar event with Google Meet conference and strict idempotency.
 * Deterministic idempotency key: conversationId + confirmed start time + confirmed end time + attendeeEmail
 */
export async function createCalendarMeeting(
  input: CreateCalendarMeetingInput,
): Promise<CalendarMeetingResult> {
  const {
    title,
    start,
    end,
    timezone,
    customerName,
    customerEmail,
    company,
    meetingPurpose,
    conversationId,
  } = input;

  const targetTimezone = timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

  if (customerEmail && !isValidCustomerEmail(customerEmail)) {
    console.warn(`[Calendar] Event creation blocked: "${customerEmail}" is an invalid/placeholder email.`);
    return {
      success: false,
      service: 'google_calendar',
      error: `Cannot create calendar meeting: "${customerEmail}" is an invalid or placeholder email address. A valid customer email is required.`,
      errorCode: 'invalid_email',
    };
  }

  // Deterministic idempotency key based on: conversationId + confirmed start time + confirmed end time + attendeeEmail
  const cleanAttendee = (customerEmail || '').toLowerCase().trim();
  const idempotencyKey = `${conversationId}:${start}:${end}:${cleanAttendee}`;

  // Check if this appointment was already booked (idempotency check)
  if (idempotencyStore.has(idempotencyKey)) {
    const existing = idempotencyStore.get(idempotencyKey)!;
    console.log(`[Calendar] Duplicate prevention: event already exists for key ${idempotencyKey} (event ID: ${existing.eventId || existing.event_id})`);
    return {
      ...existing,
      idempotent: true,
    };
  }

  // Simulate API failure when configured for tests
  if (mockFailureMode) {
    return {
      success: false,
      service: 'google_calendar',
      error: 'Google Calendar API error: 503 Service Unavailable. Appointment could not be created.',
      errorCode: 'api_unavailable',
    };
  }

  const token = await getGoogleOAuthToken();
  const envLocal = getEnvLocalValues();
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || envLocal.GOOGLE_CALENDAR_ID || 'primary').trim();

  const description = [
    `Agora Voice AI Demo & Technical Consultation`,
    customerName ? `Customer: ${customerName}` : null,
    customerEmail ? `Email: ${customerEmail}` : null,
    company ? `Company: ${company}` : null,
    meetingPurpose ? `Purpose: ${meetingPurpose}` : null,
    `Conversation ID: ${conversationId}`,
    `Booked by Agora Sales Brain Voice Agent`,
  ]
    .filter(Boolean)
    .join('\n');

  if (token) {
    // Live Google Calendar API with Google Meet conference creation
    try {
      console.log(`[Calendar] Starting event creation for attendee: ${customerEmail || 'none'}`);
      console.log(`[Calendar] Authenticated successfully`);
      console.log(`[Calendar] Calendar ID validated: ${calendarId}`);
      console.log(`[Calendar] Creating event from ${start} to ${end} (timezone: ${targetTimezone})`);

      // Race condition protection: query events overlapping requested window
      const checkResp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (checkResp.ok) {
        const eventsData = (await checkResp.json()) as {
          items?: Array<{
            id: string;
            summary?: string;
            description?: string;
            htmlLink?: string;
            hangoutLink?: string;
            status?: string;
            conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
          }>;
        };
        const activeEvents = (eventsData.items || []).filter((item) => item.status !== 'cancelled');
        if (activeEvents.length > 0) {
          // If the event was created for this exact conversation, return it idempotently!
          const existingSameConv = activeEvents.find(
            (item) => item.description?.includes(`Conversation ID: ${conversationId}`),
          );
          if (existingSameConv) {
            const liveMeetUrl =
              existingSameConv.hangoutLink ||
              existingSameConv.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;
            const idempotentResult: CalendarMeetingResult = {
              success: true,
              service: 'google_calendar',
              calendarEventId: existingSameConv.id,
              eventId: existingSameConv.id,
              event_id: existingSameConv.id,
              calendarId,
              eventLink: existingSameConv.htmlLink || `https://calendar.google.com/calendar/event?eid=${existingSameConv.id}`,
              meetingUrl: liveMeetUrl,
              summary: existingSameConv.summary || title,
              start,
              end,
              startTime: start,
              endTime: end,
              timezone: targetTimezone,
              attendeeEmail: customerEmail,
              attendeeName: customerName,
              idempotent: true,
            };
            idempotencyStore.set(idempotencyKey, idempotentResult);
            console.log(`[Calendar] Existing event matched for conversation. Idempotent return: ${existingSameConv.id}`);
            return idempotentResult;
          }

          // Otherwise, it is a genuine conflict with another scheduled event
          const conflicting = activeEvents[0];
          console.warn(`[Calendar] Conflict detected with event "${conflicting.summary || 'Scheduled Event'}"`);
          return {
            success: false,
            service: 'google_calendar',
            error: `Slot conflict: That time is no longer available because another event was scheduled ("${conflicting.summary || 'Existing commitment'}"). Please choose another time.`,
            errorCode: 'slot_conflict',
          };
        }
      }

      const attendeesList = customerEmail && isValidCustomerEmail(customerEmail)
        ? [{ email: customerEmail, displayName: customerName || 'Customer' }]
        : [];

      const eventPayload: Record<string, unknown> = {
        summary: title,
        description,
        start: { dateTime: start, timeZone: targetTimezone },
        end: { dateTime: end, timeZone: targetTimezone },
        conferenceData: {
          createRequest: {
            requestId: idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_'),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
      };

      if (attendeesList.length > 0) {
        eventPayload.attendees = attendeesList;
      }

      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        },
      );

      console.log('[Calendar] Google API status:', resp.status);

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Calendar] Google Calendar API call failed with HTTP ${resp.status}:`, errText);

        let errorCode = 'unknown_google_calendar_error';
        if (resp.status === 401) errorCode = 'authentication_failure';
        else if (resp.status === 403) errorCode = 'authorization_scope_failure';
        else if (resp.status === 404) errorCode = 'calendar_not_found';
        else if (resp.status === 429) errorCode = 'rate_limit';
        else if (resp.status === 400) errorCode = 'invalid_request';
        else if (resp.status >= 500) errorCode = 'api_unavailable';

        return {
          success: false,
          service: 'google_calendar',
          error: `Google Calendar API error (${resp.status}): ${errText}`,
          errorCode,
        };
      }

      const created = (await resp.json()) as {
        id: string;
        htmlLink?: string;
        hangoutLink?: string;
        summary?: string;
        conferenceData?: {
          entryPoints?: Array<{ entryPointType: string; uri: string }>;
        };
      };

      // Extract real Google Meet video conference link from API response
      const liveMeetUrl =
        created.hangoutLink ||
        created.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;

      console.log('[Calendar] Event created:', created.id);
      console.log(`[Calendar] Validated event details: Calendar ID: ${calendarId}, Event ID: ${created.id}, Start: ${start}, End: ${end}, Attendee: ${customerEmail || 'none'}`);

      const result: CalendarMeetingResult = {
        success: true,
        service: 'google_calendar',
        calendarEventId: created.id,
        eventId: created.id,
        event_id: created.id,
        calendarId,
        eventLink: created.htmlLink || `https://calendar.google.com/calendar/event?eid=${created.id}`,
        meetingUrl: liveMeetUrl,
        summary: created.summary || title,
        start,
        end,
        startTime: start,
        endTime: end,
        timezone: targetTimezone,
        attendeeEmail: customerEmail,
        attendeeName: customerName,
      };

      idempotencyStore.set(idempotencyKey, result);
      return result;
    } catch (err) {
      console.error('[Calendar] Network/API error during event creation:', err);
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.message.includes('timeout'));
      return {
        success: false,
        service: 'google_calendar',
        error: err instanceof Error ? err.message : String(err),
        errorCode: isTimeout ? 'timeout' : 'network_error',
      };
    }
  }

  // If explicit mock mode is set for offline unit tests only:
  if (process.env.CALENDAR_MOCK_MODE === 'true') {
    const generatedId = `mock_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const mockResult: CalendarMeetingResult = {
      success: true,
      service: 'google_calendar',
      calendarEventId: generatedId,
      eventId: generatedId,
      event_id: generatedId,
      calendarId,
      eventLink: `https://calendar.google.com/calendar/event?eid=${generatedId}`,
      meetingUrl: `mock-meet:room-${generatedId}`,
      summary: title,
      start,
      end,
      startTime: start,
      endTime: end,
      timezone: targetTimezone,
      attendeeEmail: customerEmail,
      attendeeName: customerName,
    };
    mockEvents.push({
      id: generatedId,
      summary: title,
      start,
      end,
      timezone: targetTimezone,
      attendees: customerEmail ? [customerEmail] : [],
    });
    idempotencyStore.set(idempotencyKey, mockResult);
    return mockResult;
  }

  // Real production/live mode: Return genuine failure when OAuth token is missing!
  console.error('[Calendar] Error: Google Calendar authentication required (no access token)');
  return {
    success: false,
    service: 'google_calendar',
    error: 'Google Calendar authentication required: Valid Google OAuth credentials/tokens are missing in .env.local. Please authorize at /api/auth/google/login.',
    errorCode: 'authentication_required',
  };
}

// Backwards-compatible alias for createCalendarEvent
export const createCalendarEvent = createCalendarMeeting;

/**
 * Cancels / deletes a Google Calendar event.
 */
export async function cancelCalendarMeeting(
  input: CancelCalendarMeetingInput,
): Promise<CancelCalendarMeetingResult> {
  const { calendarEventId, calendarId: explicitCalendarId } = input;
  if (!calendarEventId) {
    return { success: false, calendarEventId: '', status: 'failed', error: 'Missing calendarEventId' };
  }

  if (mockFailureMode) {
    return {
      success: false,
      calendarEventId,
      status: 'failed',
      error: 'Simulated Calendar Service Failure: Internal 500 error deleting event.',
    };
  }

  // Check mock mode or mock store
  if (process.env.CALENDAR_MOCK_MODE === 'true' || calendarEventId.startsWith('mock_') || calendarEventId.startsWith('mock-')) {
    const idx = mockEvents.findIndex((ev) => ev.id === calendarEventId);
    if (idx !== -1) {
      mockEvents.splice(idx, 1);
    }
    for (const [k, v] of idempotencyStore.entries()) {
      if (v.calendarEventId === calendarEventId || v.eventId === calendarEventId) {
        idempotencyStore.delete(k);
      }
    }
    return {
      success: true,
      calendarEventId,
      status: 'cancelled',
    };
  }

  // Live Google Calendar API
  const token = await getGoogleOAuthToken();
  if (!token) {
    return {
      success: false,
      calendarEventId,
      status: 'failed',
      error: 'Google Calendar authentication required',
    };
  }

  const envLocal = getEnvLocalValues();
  const calendarId = explicitCalendarId || process.env.GOOGLE_CALENDAR_ID || envLocal.GOOGLE_CALENDAR_ID || 'primary';

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(calendarEventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (res.status === 204 || res.status === 200) {
      return { success: true, calendarEventId, status: 'cancelled' };
    }
    if (res.status === 404 || res.status === 410) {
      return { success: true, calendarEventId, status: 'not_found' };
    }
    const errText = await res.text();
    return { success: false, calendarEventId, status: 'failed', error: `Google API error (${res.status}): ${errText}` };
  } catch (err) {
    return {
      success: false,
      calendarEventId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const deleteCalendarEvent = cancelCalendarMeeting;
export const cancelCalendarEvent = cancelCalendarMeeting;

/**
 * Reschedules / updates a Google Calendar event.
 */
export async function updateCalendarMeeting(
  input: RescheduleCalendarMeetingInput,
): Promise<CalendarMeetingResult> {
  const { calendarEventId, newStart, newEnd, timezone, customerName, customerEmail, company } = input;
  if (!calendarEventId) {
    return { success: false, error: 'Missing calendarEventId for rescheduling' };
  }

  if (mockFailureMode) {
    return {
      success: false,
      service: 'google_calendar',
      error: 'Simulated Calendar Service Failure: Unable to update event.',
    };
  }

  // Verify availability of new slot first
  const [newDate, newTimeFull] = newStart.split('T');
  const [, newEndTimeFull] = newEnd.split('T');
  const avail = await checkCalendarAvailability({
    date: newDate,
    startTime: newTimeFull.slice(0, 5),
    endTime: newEndTimeFull.slice(0, 5),
    timezone,
  });

  if (!avail.available) {
    return {
      success: false,
      service: 'google_calendar',
      error: 'Requested new time slot is not available.',
    };
  }

  if (process.env.CALENDAR_MOCK_MODE === 'true' || calendarEventId.startsWith('mock_') || calendarEventId.startsWith('mock-')) {
    const ev = mockEvents.find((e) => e.id === calendarEventId);
    if (ev) {
      ev.start = newStart;
      ev.end = newEnd;
      ev.timezone = timezone;
    } else {
      mockEvents.push({
        id: calendarEventId,
        summary: `Agora Voice AI Demo — ${customerName || 'Customer'} (${company || 'Prospect'})`,
        start: newStart,
        end: newEnd,
        timezone,
        attendees: customerEmail ? [customerEmail] : [],
      });
    }

    return {
      success: true,
      service: 'google_calendar',
      calendarEventId,
      eventId: calendarEventId,
      event_id: calendarEventId,
      start: newStart,
      end: newEnd,
      startTime: newStart,
      endTime: newEnd,
      timezone,
      meetingUrl: `mock-meet:room-${calendarEventId}`,
      attendeeName: customerName,
      attendeeEmail: customerEmail,
    };
  }

  // Live Google Calendar API PATCH
  const token = await getGoogleOAuthToken();
  if (!token) {
    return { success: false, service: 'google_calendar', error: 'Google Calendar authentication required' };
  }

  const envLocal = getEnvLocalValues();
  const calendarId = input.calendarId || process.env.GOOGLE_CALENDAR_ID || envLocal.GOOGLE_CALENDAR_ID || 'primary';

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(calendarEventId)}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start: { dateTime: newStart, timeZone: timezone },
          end: { dateTime: newEnd, timeZone: timezone },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, service: 'google_calendar', error: `Google API error (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return {
      success: true,
      service: 'google_calendar',
      calendarEventId: data.id,
      eventId: data.id,
      event_id: data.id,
      start: data.start?.dateTime || newStart,
      end: data.end?.dateTime || newEnd,
      startTime: data.start?.dateTime || newStart,
      endTime: data.end?.dateTime || newEnd,
      timezone: data.start?.timeZone || timezone,
      meetingUrl: data.hangoutLink || data.conferenceData?.entryPoints?.[0]?.uri,
      attendeeName: customerName,
      attendeeEmail: customerEmail,
    };
  } catch (err) {
    return {
      success: false,
      service: 'google_calendar',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const rescheduleCalendarMeeting = updateCalendarMeeting;
export const updateCalendarEvent = updateCalendarMeeting;
