import {
  CreateCalendarMeetingInput,
  CalendarMeetingResult,
} from './types';
import {
  getGoogleOAuthToken,
  getCalendarId,
  isMockFailureMode,
  getCalendarIdempotencyStore,
} from './client';
import { isValidCustomerEmail } from '../sales/email-validation';

/**
 * Canonical meeting booking service.
 * Creates an event in Google Calendar with a real Google Meet video conference link.
 * Strict server-side idempotency protection.
 */
export async function bookMeeting(
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
    console.warn(`[Calendar Booking] Blocked: "${customerEmail}" is an invalid/placeholder email.`);
    return {
      success: false,
      service: 'google_calendar',
      error: `Cannot create calendar meeting: "${customerEmail}" is an invalid or placeholder email address. A valid customer email is required.`,
      errorCode: 'invalid_email',
    };
  }

  const cleanAttendee = (customerEmail || '').toLowerCase().trim();
  const idempotencyKey = `${conversationId}:${start}:${end}:${cleanAttendee}`;
  const idempotencyStore = getCalendarIdempotencyStore();

  // Idempotency check: return cached event if previously created
  if (idempotencyStore.has(idempotencyKey)) {
    const existing = idempotencyStore.get(idempotencyKey)!;
    console.log(`[Calendar Booking] Duplicate prevention: event already exists for key ${idempotencyKey} (ID: ${existing.calendarEventId || existing.eventId})`);
    return {
      ...existing,
      idempotent: true,
    };
  }

  if (isMockFailureMode()) {
    return {
      success: false,
      service: 'google_calendar',
      error: 'Google Calendar API error: 503 Service Unavailable. Appointment could not be created.',
      errorCode: 'api_unavailable',
    };
  }

  const token = await getGoogleOAuthToken();
  const calendarId = getCalendarId();

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
    try {
      console.log(`[Calendar Booking] Starting event creation for: ${customerEmail || 'none'}`);

      // Race condition check: query events in requested window
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
          // If created for this conversation, return idempotently
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
            return idempotentResult;
          }

          // Genuine conflict with another scheduled event
          const conflicting = activeEvents[0];
          console.warn(`[Calendar Booking] Conflict detected: "${conflicting.summary || 'Scheduled Event'}"`);
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

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Calendar Booking] API call failed (HTTP ${resp.status}):`, errText);

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

      const liveMeetUrl =
        created.hangoutLink ||
        created.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;

      console.log(`[Calendar Booking] Event created: ${created.id}, Meet URL: ${liveMeetUrl || 'none'}`);

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
      console.error('[Calendar Booking] Network/API error during event creation:', err);
      return {
        success: false,
        service: 'google_calendar',
        error: err instanceof Error ? err.message : String(err),
        errorCode: 'network_error',
      };
    }
  }

  // Offline mock mode check (only when CALENDAR_MOCK_MODE === 'true')
  if (process.env.CALENDAR_MOCK_MODE === 'true') {
    const mockId = `mock_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const mockResult: CalendarMeetingResult = {
      success: true,
      service: 'google_calendar',
      calendarEventId: mockId,
      eventId: mockId,
      event_id: mockId,
      calendarId,
      eventLink: `https://calendar.google.com/calendar/event?eid=${mockId}`,
      meetingUrl: `https://meet.google.com/mock-${mockId}`,
      summary: title,
      start,
      end,
      startTime: start,
      endTime: end,
      timezone: targetTimezone,
      attendeeEmail: customerEmail,
      attendeeName: customerName,
    };
    idempotencyStore.set(idempotencyKey, mockResult);
    return mockResult;
  }

  // Production live mode with missing credentials
  return {
    success: false,
    service: 'google_calendar',
    error: 'Google Calendar credentials missing. Please authorize at /api/auth/google/login.',
    errorCode: 'authentication_required',
  };
}

export const createCalendarMeeting = bookMeeting;
export const createCalendarEvent = bookMeeting;
