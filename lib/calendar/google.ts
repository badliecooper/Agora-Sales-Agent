/**
 * Canonical facade for backward compatibility with existing tests and callers.
 * All logic has been decomposed into authoritative canonical modules under lib/calendar/.
 */
export {
  getGoogleOAuthToken,
  setMockFailureMode,
  resetCalendarClient as resetMockCalendar,
} from './client';

export {
  checkAvailability as checkCalendarAvailability,
  findAvailableSlots,
  getTimezoneOffsetString,
  normalizeDateTimes,
} from './availability';

// Mock availability checker for unit test compatibility
export function checkMockAvailability(_startIso: string, _endIso: string) {
  return { available: true };
}

export {
  bookMeeting as createCalendarMeeting,
  createCalendarMeeting as createCalendarEvent,
} from './booking';

export {
  rescheduleMeeting as updateCalendarMeeting,
  rescheduleMeeting as rescheduleCalendarMeeting,
  updateCalendarMeeting as updateCalendarEvent,
} from './reschedule';

export {
  cancelMeeting as cancelCalendarMeeting,
  cancelMeeting as deleteCalendarMeeting,
  cancelCalendarMeeting as deleteCalendarEvent,
  cancelCalendarMeeting as cancelCalendarEvent,
} from './cancellation';

export * from './types';
