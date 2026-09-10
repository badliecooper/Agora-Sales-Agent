export {
  checkAvailability as checkCalendarAvailability,
  findAvailableSlots,
} from './availability';

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

export {
  setMockFailureMode,
  resetCalendarClient as resetMockCalendar,
  getGoogleOAuthToken,
} from './client';

export { sendMeetingConfirmationEmail } from '../email';
export type {
  SendMeetingConfirmationEmailInput,
  SendMeetingConfirmationEmailResult,
} from '../email/types';

export * from './types';
