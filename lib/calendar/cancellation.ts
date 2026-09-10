import {
  CancelCalendarMeetingInput,
  CancelCalendarMeetingResult,
} from './types';
import { getGoogleOAuthToken, getCalendarId, isMockFailureMode, getCalendarIdempotencyStore } from './client';

/**
 * Cancels and deletes an existing Google Calendar event.
 */
export async function cancelMeeting(
  input: CancelCalendarMeetingInput,
): Promise<CancelCalendarMeetingResult> {
  const { calendarEventId } = input;
  if (!calendarEventId) {
    return { success: false, calendarEventId: '', status: 'failed', error: 'Missing calendarEventId' };
  }

  if (isMockFailureMode()) {
    return {
      success: false,
      calendarEventId,
      status: 'failed',
      error: 'Simulated Calendar Service Failure: Internal 500 error deleting event.',
    };
  }

  // Clear from idempotency store if present
  const idempotencyStore = getCalendarIdempotencyStore();
  for (const [k, v] of idempotencyStore.entries()) {
    if (v.calendarEventId === calendarEventId || v.eventId === calendarEventId) {
      idempotencyStore.delete(k);
    }
  }

  const token = await getGoogleOAuthToken();
  if (!token) {
    if (process.env.CALENDAR_MOCK_MODE === 'true' || calendarEventId.startsWith('mock_')) {
      return { success: true, calendarEventId, status: 'cancelled' };
    }
    return {
      success: false,
      calendarEventId,
      status: 'failed',
      error: 'Google Calendar authentication required',
    };
  }

  const calendarId = getCalendarId(input.calendarId);

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

export const cancelCalendarMeeting = cancelMeeting;
export const deleteCalendarMeeting = cancelMeeting;
export const deleteCalendarEvent = cancelMeeting;
export const cancelCalendarEvent = cancelMeeting;
