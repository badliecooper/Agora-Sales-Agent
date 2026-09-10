import {
  RescheduleCalendarMeetingInput,
  CalendarMeetingResult,
} from './types';
import { getGoogleOAuthToken, getCalendarId, isMockFailureMode } from './client';
import { checkAvailability } from './availability';

/**
 * Reschedules an existing Google Calendar event.
 * Validates availability of the new slot before modifying the event.
 */
export async function rescheduleMeeting(
  input: RescheduleCalendarMeetingInput,
): Promise<CalendarMeetingResult> {
  const { calendarEventId, newStart, newEnd, timezone, customerName, customerEmail } = input;
  if (!calendarEventId) {
    return { success: false, error: 'Missing calendarEventId for rescheduling' };
  }

  if (isMockFailureMode()) {
    return {
      success: false,
      service: 'google_calendar',
      error: 'Simulated Calendar Service Failure: Unable to update event.',
    };
  }

  const [newDate, newTimeFull] = newStart.split('T');
  const [, newEndTimeFull] = newEnd.split('T');
  const avail = await checkAvailability({
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

  const token = await getGoogleOAuthToken();
  if (!token) {
    if (process.env.CALENDAR_MOCK_MODE === 'true' || calendarEventId.startsWith('mock_')) {
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
        meetingUrl: `https://meet.google.com/mock-${calendarEventId}`,
        attendeeName: customerName,
        attendeeEmail: customerEmail,
      };
    }
    return { success: false, service: 'google_calendar', error: 'Google Calendar authentication required' };
  }

  const calendarId = getCalendarId(input.calendarId);

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

    console.log('[Calendar Reschedule] PATCH status:', res.status);
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Calendar Reschedule] Google API error:', errText);
      return { success: false, service: 'google_calendar', error: `Google API error (${res.status}): ${errText}` };
    }

    const data = (await res.json()) as {
      id: string;
      start?: { dateTime?: string; timeZone?: string };
      end?: { dateTime?: string; timeZone?: string };
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ uri: string }> };
    };

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

export const updateCalendarMeeting = rescheduleMeeting;
export const rescheduleCalendarMeeting = rescheduleMeeting;
export const updateCalendarEvent = rescheduleMeeting;
