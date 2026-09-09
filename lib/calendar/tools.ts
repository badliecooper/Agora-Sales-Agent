import {
  checkCalendarAvailability as checkAvailabilityInternal,
  findAvailableSlots as findSlotsInternal,
  createCalendarEvent as createEventInternal,
  setMockFailureMode,
  resetMockCalendar,
} from './google';
import {
  CheckCalendarAvailabilityInput,
  CheckCalendarAvailabilityResult,
  FindAvailableSlotsInput,
  AvailableTimeSlot,
  CreateCalendarMeetingInput,
  CalendarMeetingResult,
} from './types';

/**
 * Tool 1: Check calendar availability for a specified date and time window.
 *
 * Input:
 * - date (YYYY-MM-DD or readable string)
 * - startTime (e.g. "11:00" or ISO)
 * - endTime (e.g. "11:30" or ISO)
 * - timezone (e.g. "America/New_York", "UTC")
 */
export async function checkCalendarAvailability(
  input: CheckCalendarAvailabilityInput,
): Promise<CheckCalendarAvailabilityResult> {
  return checkAvailabilityInternal(input);
}

/**
 * Tool 2: Find available meeting slots based on customer preferences.
 *
 * Input:
 * - preferred date/range
 * - preferred time window ("morning", "afternoon", "any")
 * - duration (in minutes, e.g. 30)
 * - timezone
 */
export async function findAvailableSlots(
  input: FindAvailableSlotsInput,
): Promise<AvailableTimeSlot[]> {
  return findSlotsInternal(input);
}

/**
 * Tool 3: Create Google Calendar event with server-side OAuth2 and idempotency protection.
 *
 * Input:
 * - title
 * - start
 * - end
 * - timezone
 * - customer name
 * - customer email
 * - company
 * - meeting purpose
 * - conversationId
 */
export async function createCalendarMeeting(
  input: CreateCalendarMeetingInput,
): Promise<CalendarMeetingResult> {
  return createEventInternal(input);
}

export const createCalendarEvent = createCalendarMeeting;

/**
 * Tool 4: Send meeting confirmation email via Gmail.
 *
 * Input:
 * - customerName
 * - customerEmail
 * - company
 * - meetingTitle
 * - start
 * - end
 * - timezone
 * - meetingUrl
 * - calendarEventId
 * - conversationId
 */
export { sendMeetingConfirmationEmail } from '../email/gmail';
export type {
  SendMeetingConfirmationEmailInput,
  SendMeetingConfirmationEmailResult,
} from '../email/gmail';

export {
  cancelCalendarMeeting as deleteCalendarMeeting,
  cancelCalendarMeeting,
  deleteCalendarEvent,
  cancelCalendarEvent,
  updateCalendarMeeting as rescheduleCalendarMeeting,
  updateCalendarMeeting,
  updateCalendarEvent,
} from './google';
export { setMockFailureMode, resetMockCalendar };
