import {
  CheckCalendarAvailabilityInput,
  CheckCalendarAvailabilityResult,
  FindAvailableSlotsInput,
  AvailableTimeSlot,
} from './types';
import { getGoogleOAuthToken, getCalendarId, isMockFailureMode } from './client';

/**
 * Dynamically resolves the timezone offset string (e.g. "+05:30", "Z", "-04:00") for any IANA timezone.
 * Uses Intl.DateTimeFormat with 'longOffset' for accurate Daylight Saving Time handling.
 */
export function getTimezoneOffsetString(timezone?: string, dateObj: Date = new Date()): string {
  const cleanTz = (timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata').trim();
  if (/utc|gmt/i.test(cleanTz)) return 'Z';

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
  } catch {
    // Fallback if timezone string is unparseable
  }

  return '+05:30';
}

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

/**
 * Normalizes input date/times to ISO strings with timezone awareness.
 */
export function normalizeDateTimes(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
): { startIso: string; endIso: string } {
  const targetTz = timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

  if (startTime.includes('T') && (startTime.includes('Z') || /[+-]\d{2}:\d{2}$/.test(startTime))) {
    return { startIso: startTime, endIso: endTime };
  }

  let cleanDate = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime())) {
      cleanDate = parsed.toISOString().split('T')[0];
    } else {
      cleanDate = new Intl.DateTimeFormat('en-CA', { timeZone: targetTz }).format(new Date());
    }
  }

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

// In-memory mock busy store for offline dev/test only
const mockBusyIntervals: Array<{ start: string; end: string; summary: string }> = [];

export function addMockBusyInterval(start: string, end: string, summary: string) {
  mockBusyIntervals.push({ start, end, summary });
}

export function clearMockBusyIntervals() {
  mockBusyIntervals.length = 0;
}

/**
 * Core canonical availability checking function.
 * Queries the real Google Calendar FreeBusy API, falling back to events endpoint if needed.
 */
export async function checkAvailability(
  input: CheckCalendarAvailabilityInput,
): Promise<CheckCalendarAvailabilityResult> {
  if (isMockFailureMode()) {
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
  const calendarId = getCalendarId(input.calendarId);

  if (token) {
    try {
      let busyList: Array<{ start: string; end: string; summary?: string }> = [];
      let _freeBusyRaw: unknown = null;

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
        _freeBusyRaw = data;
        const calendarResult = data.calendars?.[calendarId] || Object.values(data.calendars || {})[0];

        if (calendarResult && (!calendarResult.errors || calendarResult.errors.length === 0)) {
          busyList = (calendarResult.busy || []).map((b) => ({
            start: b.start,
            end: b.end,
            summary: 'Busy interval',
          }));
        } else {
          // Fallback to events query if freeBusy returns an error for this calendar
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
        _freeBusyRaw = `HTTP ${resp.status}: ${freeBusyErrText}`;

        // Fallback: Query real Calendar events directly
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
          return {
            available: false,
            conflictReason: 'Calendar error: Unable to verify availability.',
            error: `Google Calendar availability failed. freeBusy HTTP ${resp.status}: ${freeBusyErrText}; events HTTP ${eventsResp.status}: ${errText}`,
            errorCode: 'availability_api_error',
          };
        }
      }

      const isAvailable = busyList.length === 0;
      console.log(`[Calendar Availability] Checked ${input.date} ${input.startTime}-${input.endTime} (${targetTimezone}): ${isAvailable ? 'AVAILABLE' : 'BUSY'}`);

      if (isAvailable) {
        return { available: true };
      }
      return {
        available: false,
        conflictReason: 'Slot conflict: That time is no longer available because another event was scheduled.',
        conflicts: busyList.map((b) => ({ start: b.start, end: b.end, summary: b.summary || 'Busy interval' })),
      };
    } catch (err) {
      console.error('[Google Calendar Availability] Real Calendar API error:', err);
      return {
        available: false,
        conflictReason: 'Calendar error: Unable to verify availability.',
        error: err instanceof Error ? err.message : String(err),
        errorCode: 'availability_exception',
      };
    }
  }

  // Offline mock mode check (only when CALENDAR_MOCK_MODE is explicitly enabled)
  if (process.env.CALENDAR_MOCK_MODE === 'true') {
    const reqStart = new Date(startIso).getTime();
    const reqEnd = new Date(endIso).getTime();
    const conflicts = mockBusyIntervals.filter((m) => {
      const evStart = new Date(m.start).getTime();
      const evEnd = new Date(m.end).getTime();
      return Math.max(reqStart, evStart) < Math.min(reqEnd, evEnd);
    });

    if (conflicts.length > 0) {
      return {
        available: false,
        conflictReason: `Slot conflict: ${conflicts[0].summary}`,
        conflicts,
      };
    }
    return { available: true };
  }

  // Production live mode without credentials
  return {
    available: false,
    conflictReason: 'Calendar authentication required.',
    error: 'Google Calendar credentials missing. Authorize at /api/auth/google/login.',
    errorCode: 'authentication_required',
  };
}

export const checkCalendarAvailability = checkAvailability;

/**
 * Dynamically finds available slots based on criteria.
 * ZERO hardcoded dates. All dates calculated dynamically based on target timezone.
 */
export async function findAvailableSlots(
  input: FindAvailableSlotsInput,
): Promise<AvailableTimeSlot[]> {
  const duration = input.duration || 30;
  const timezone = input.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
  const limit = input.limit || 3;

  const getLocalDateOffset = (daysOffset: number): string => {
    const nowStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [y, m, d] = nowStr.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1, d + daysOffset));
    return target.toISOString().slice(0, 10);
  };

  let baseDateStr = input.preferredDate;
  if (!baseDateStr || baseDateStr.toLowerCase().includes('tomorrow')) {
    baseDateStr = getLocalDateOffset(1);
  } else if (baseDateStr.toLowerCase().includes('today')) {
    baseDateStr = getLocalDateOffset(0);
  } else {
    // Dynamic weekday matching (e.g. "friday", "next monday")
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const lower = baseDateStr.toLowerCase();
    const matchedDayIndex = weekdays.findIndex((w) => lower.includes(w));
    if (matchedDayIndex !== -1) {
      const currentDayOfWeek = new Date().getDay();
      let diff = matchedDayIndex - currentDayOfWeek;
      if (diff <= 0) diff += 7;
      baseDateStr = getLocalDateOffset(diff);
    }
  }

  const candidateHours: number[] = [];
  const window = input.preferredTimeWindow || 'any';
  if (window === 'morning') {
    candidateHours.push(9, 10, 11);
  } else if (window === 'afternoon') {
    candidateHours.push(14, 15, 16);
  } else {
    candidateHours.push(10, 14, 15, 16);
  }

  const slots: AvailableTimeSlot[] = [];

  for (const hour of candidateHours) {
    if (slots.length >= limit) break;

    const startH = hour.toString().padStart(2, '0');
    const endMinutes = duration >= 60 ? duration % 60 : duration;
    const endHour = hour + Math.floor(duration / 60);
    const endH = endHour.toString().padStart(2, '0');
    const endM = endMinutes.toString().padStart(2, '0');

    const startTime = `${startH}:00`;
    const endTime = `${endH}:${endM}`;

    const { startIso, endIso } = normalizeDateTimes(baseDateStr, startTime, endTime, timezone);
    const avail = await checkAvailability({
      date: baseDateStr,
      startTime,
      endTime,
      timezone,
    });

    if (avail.available) {
      const startDate = new Date(startIso);
      const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
      const monthDay = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
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

  // Dynamic fallback to subsequent 2 days if no slots available on primary day
  if (slots.length === 0) {
    for (let dayOffset = 2; dayOffset <= 4 && slots.length < limit; dayOffset++) {
      const altDay = getLocalDateOffset(dayOffset);
      for (const hour of [10, 14, 15]) {
        if (slots.length >= limit) break;
        const startH = hour.toString().padStart(2, '0');
        const endHour = hour + Math.floor(duration / 60);
        const endH = endHour.toString().padStart(2, '0');
        const endM = (duration % 60).toString().padStart(2, '0');
        const startTime = `${startH}:00`;
        const endTime = `${endH}:${endM}`;

        const { startIso, endIso } = normalizeDateTimes(altDay, startTime, endTime, timezone);
        const avail = await checkAvailability({
          date: altDay,
          startTime,
          endTime,
          timezone,
        });

        if (avail.available) {
          const startDate = new Date(startIso);
          const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
          const monthDay = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
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
