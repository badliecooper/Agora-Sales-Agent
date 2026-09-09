import {
  BookMeetingInput,
  BookMeetingResult,
  RescheduleCalendarMeetingInput,
  CancelCalendarMeetingInput,
  CancelCalendarMeetingResult,
} from '../calendar/types';
import {
  checkCalendarAvailability,
  createCalendarMeeting,
  updateCalendarMeeting,
  cancelCalendarMeeting,
} from '../calendar/tools';
import {
  parseRelativeDate,
  parseSpokenTime,
  calculateEndTime,
  normalizeDateTimes,
  formatDateReadable,
  formatTimeReadable,
  formatSlotReadable,
  buildAlternativeSlots,
  isValidCustomerEmail,
  isPlaceholderEmail,
} from './calendar-helper';
import { SalesState } from './types';
import { sessionStateStore, createInitialSalesState } from './tracker';
import { syncLeadToHubSpot } from '../hubspot';
import { sendMeetingConfirmationEmail } from '../email/gmail';

/**
 * Normalizes timezone from user speech or options.
 */
export function resolveTimezone(text?: string, explicitTz?: string): string {
  if (explicitTz && explicitTz.trim()) return explicitTz.trim();
  const lower = (text || '').toLowerCase();
  if (lower.includes('est') || lower.includes('eastern') || lower.includes('new york')) return 'America/New_York';
  if (lower.includes('pst') || lower.includes('pacific') || lower.includes('los angeles')) return 'America/Los_Angeles';
  if (lower.includes('cst') || lower.includes('central') || lower.includes('chicago')) return 'America/Chicago';
  if (lower.includes('mst') || lower.includes('mountain') || lower.includes('denver')) return 'America/Denver';
  if (lower.includes('gmt') || lower.includes('utc') || lower.includes('london')) return 'Europe/London';
  if (lower.includes('ist') || lower.includes('india') || lower.includes('kolkata') || lower.includes('hyderabad')) return 'Asia/Kolkata';
  if (lower.includes('cet') || lower.includes('paris') || lower.includes('berlin')) return 'Europe/Paris';
  if (lower.includes('jst') || lower.includes('tokyo')) return 'Asia/Tokyo';
  if (lower.includes('sgt') || lower.includes('singapore')) return 'Asia/Singapore';
  return process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
}

/**
 * Canonical bookMeeting service pipeline.
 *
 * User requests meeting
 *   ↓
 * Parse date/time
 *   ↓
 * Resolve timezone
 *   ↓
 * Check availability
 *   ↓
 * AVAILABLE?
 *   ├── NO  → suggest alternatives
 *   └── YES
 *         ↓
 *       Collect required information
 *         ↓
 *       Create calendar event
 *         ↓
 *       Verify success
 *         ↓
 *       Persist event ID
 *         ↓
 *       CRM sync
 *         ↓
 *       Confirmation
 */
export async function bookMeeting(
  input: BookMeetingInput,
  options?: {
    state?: SalesState;
    syncCrm?: boolean;
    duration?: number;
  },
): Promise<BookMeetingResult> {
  const conversationId = input.conversationId || 'conv-' + Date.now();
  console.log(`[bookMeeting] Initiating canonical booking for session: ${conversationId}`);

  // Retrieve or initialize conversation state
  const state = options?.state || sessionStateStore.get(conversationId) || createInitialSalesState(conversationId);
  sessionStateStore.set(conversationId, state);
  const tz = resolveTimezone(input.text, input.timezone || state?.timezone || state?.appointment?.timezone);
  const duration = input.duration || options?.duration || state?.appointment?.duration || 30;

  // 1. Parse date and time from explicit inputs or natural language text
  let date = input.date;
  let startTime = input.startTime;

  if (input.text) {
    if (!date) {
      date = parseRelativeDate(input.text, tz) || undefined;
    }
    if (!startTime) {
      const parsedTime = parseSpokenTime(input.text);
      if (parsedTime) startTime = parsedTime.time;
    }
  }

  // Fallback to state if already known
  if (!date && state?.meetingDate) date = state.meetingDate;
  if (!date && state?.appointment?.preferredDate) date = state.appointment.preferredDate;
  if (!startTime && state?.meetingTime) startTime = state.meetingTime;
  if (!startTime && state?.appointment?.preferredTime) startTime = state.appointment.preferredTime;

  // Sync back to state
  if (state) {
    if (date) {
      state.meetingDate = date;
      if (state.appointment) state.appointment.preferredDate = date;
    }
    if (startTime) {
      state.meetingTime = startTime;
      if (state.appointment) state.appointment.preferredTime = startTime;
    }
    state.timezone = tz;
    if (state.appointment) state.appointment.timezone = tz;
  }

  // Check if date or time is missing
  if (!date || !startTime) {
    const missingFields: string[] = [];
    if (!date) missingFields.push('date');
    if (!startTime) missingFields.push('time');

    let message = 'What date and time works best for your live demo?';
    if (date && !startTime) {
      message = `What time would you like for the meeting on ${formatDateReadable(date)}?`;
    } else if (!date && startTime) {
      message = `What date would you like for the meeting at ${formatTimeReadable(startTime)}?`;
    }

    if (state?.appointment) {
      state.appointment.meetingStatus = 'collecting_datetime';
    }

    return {
      success: false,
      status: 'collecting_details',
      missingFields,
      message,
      speechDirective: message,
    };
  }

  // 2. Resolve timezone and calculate ISO windows
  const endTime = input.endTime || calculateEndTime(startTime, duration);
  const { startIso, endIso } = normalizeDateTimes(date, startTime, endTime, tz);

  console.log(`[bookMeeting] Normalized slot: ${startIso} -> ${endIso} (${tz})`);

  // Idempotency check: If this exact session already booked this exact slot, return it idempotently!
  if (
    state?.appointment?.meetingStatus === 'confirmed' &&
    state.calendarEventId &&
    (state.meetingDate === date || state.appointment.preferredDate === date) &&
    (state.meetingTime === startTime || state.appointment.preferredTime === startTime)
  ) {
    console.log(`[bookMeeting] Idempotent request detected for session ${conversationId}, returning existing event.`);
    const readableSlot = formatSlotReadable(date, startTime, duration, tz);
    const resolvedEmail = input.customerEmail || state.customerEmail || state.customer?.email || '';
    const confirmationMessage = `I have scheduled your demo for ${readableSlot}. A calendar invite and confirmation email have been sent to ${resolvedEmail}.`;
    return {
      success: true,
      status: 'confirmed',
      calendarEventId: state.calendarEventId,
      eventId: state.calendarEventId,
      startTime: state.appointment.startTime || startIso,
      endTime: state.appointment.endTime || endIso,
      timezone: tz,
      meetingUrl: state.meetingUrl || undefined,
      attendeeEmail: resolvedEmail,
      attendeeName: input.customerName || state.customerName,
      message: confirmationMessage,
      speechDirective: confirmationMessage,
      crmSynced: true,
      emailSent: true,
      idempotent: true,
    };
  }

  // 3. Check Calendar Availability first!
  console.log(`[bookMeeting] Checking calendar availability for ${date} ${startTime} - ${endTime}...`);
  let availResult: { available: boolean; conflicts?: unknown[]; conflictReason?: string; error?: string };
  try {
    availResult = await checkCalendarAvailability({
      date,
      startTime,
      endTime,
      timezone: tz,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[bookMeeting] Calendar availability exception: ${errorMsg}`);
    if (state) {
      state.appointmentStatus = 'failed';
      if (state.appointment) {
        state.appointment.meetingStatus = 'failed';
        state.appointment.lastError = errorMsg;
      }
    }
    return {
      success: false,
      status: 'failed',
      error: errorMsg,
      message: "I wasn't able to verify calendar availability right now, so I can't safely book that meeting yet.",
      speechDirective: "I wasn't able to verify calendar availability right now, so I can't safely book that meeting yet.",
    };
  }

  if (!availResult.available) {
    const isSlotConflict =
      (availResult.conflicts?.length ?? 0) > 0 ||
      Boolean(availResult.conflictReason?.toLowerCase().includes('conflict')) ||
      Boolean(availResult.conflictReason?.toLowerCase().includes('busy'));

    if (isSlotConflict) {
      // Slot is occupied: DO NOT call createCalendarMeeting. Suggest concrete alternatives.
      const suggestedSlots = buildAlternativeSlots(date, tz, duration);
      const conflictMsg = "That time isn't available because you already have another event scheduled then. Please choose another time.";

      if (state) {
        state.appointmentStatus = 'slot_proposed';
        if (state.appointment) {
          state.appointment.meetingStatus = 'slot_proposed';
          state.appointment.confirmationStatus = 'none';
          state.appointment.calendarEventId = null;
          state.appointment.lastError = conflictMsg;
          state.appointment.proposedSlots = suggestedSlots;
        }
      }

      return {
        success: false,
        status: 'unavailable',
        suggestedSlots: suggestedSlots.map((s) => ({
          start: s.start,
          end: s.end,
          formattedTime: s.formattedTime || `${s.start} - ${s.end}`,
          available: s.available ?? true,
        })),
        message: conflictMsg,
        speechDirective: conflictMsg,
      };
    }

    // Availability check failed due to network / service error
    const errorMsg = availResult.error || availResult.conflictReason || 'Unable to verify calendar availability.';
    if (state) {
      state.appointmentStatus = 'failed';
      if (state.appointment) {
        state.appointment.meetingStatus = 'failed';
        state.appointment.lastError = errorMsg;
      }
    }

    return {
      success: false,
      status: 'failed',
      error: errorMsg,
      message: "I wasn't able to verify calendar availability right now, so I can't safely book that meeting yet.",
      speechDirective: "I wasn't able to verify calendar availability right now, so I can't safely book that meeting yet.",
    };
  }

  // 4. Collect required contact information (Valid customer email and name)
  const customerEmail = (
    input.customerEmail ||
    state?.customerEmail ||
    state?.customer?.email ||
    state?.email ||
    state?.profile?.customer?.email ||
    ''
  ).trim();

  const customerName = (
    input.customerName ||
    state?.customerName ||
    state?.customer?.fullName ||
    state?.profile?.customer?.fullName ||
    'Customer'
  ).trim();

  const company = (
    input.company ||
    state?.company ||
    state?.customer?.company ||
    state?.profile?.customer?.company ||
    ''
  ).trim() || undefined;

  // Validate email: must exist and not be a fake placeholder
  const isEmailValid = Boolean(customerEmail && isValidCustomerEmail(customerEmail) && !isPlaceholderEmail(customerEmail));

  if (!isEmailValid) {
    const askEmailMsg = "What's the best email address to send your calendar invite and confirmation to?";
    if (state) {
      state.appointmentStatus = 'collecting_details';
      if (state.appointment) {
        state.appointment.meetingStatus = 'collecting_details';
        state.appointment.lastError = null;
      }
    }
    return {
      success: false,
      status: 'collecting_details',
      missingFields: ['email'],
      message: askEmailMsg,
      speechDirective: askEmailMsg,
    };
  }

  // Synchronize validated customer email across state
  if (state) {
    state.customerEmail = customerEmail;
    state.email = customerEmail;
    if (state.customer) state.customer.email = customerEmail;
    if (state.profile?.customer) state.profile.customer.email = customerEmail;
    if (state.appointment) state.appointment.attendeeEmail = customerEmail;
  }

  // 5. Create Calendar Event
  console.log(`[bookMeeting] Creating calendar event for ${customerName} (${customerEmail})...`);
  const meetingTitle = input.meetingPurpose || `Agora Voice AI Demo — ${customerName} (${company || 'Prospect'})`;
  const createResult = await createCalendarMeeting({
    title: meetingTitle,
    start: startIso,
    end: endIso,
    timezone: tz,
    customerName,
    customerEmail,
    company,
    meetingPurpose: input.meetingPurpose || 'Agora Voice AI Technical Demo and Architecture Review',
    conversationId,
  });

  // 6. Verify Event Creation Success
  const eventId = createResult.calendarEventId || createResult.eventId;
  if (!createResult.success || !eventId) {
    const calendarErr = createResult.error || 'Failed to schedule calendar event';
    console.error(`[bookMeeting] Calendar creation failed: ${calendarErr}`);

    if (state) {
      state.appointmentStatus = 'failed';
      if (state.appointment) {
        state.appointment.meetingStatus = 'failed';
        state.appointment.calendarEventId = null;
        state.appointment.lastError = calendarErr;
      }
    }

    return {
      success: false,
      status: 'failed',
      error: calendarErr,
      message: "I wasn't able to schedule the meeting due to a calendar error. Please try another time.",
      speechDirective: "I wasn't able to schedule the meeting due to a calendar error. Please try another time.",
    };
  }

  // 7. Persist Event ID and confirmed state
  console.log(`[bookMeeting] Calendar event confirmed with ID: ${eventId}`);
  const readableSlot = formatSlotReadable(date, startTime, duration, tz);

  if (state) {
    state.calendarEventId = eventId;
    state.meetingUrl = createResult.meetingUrl || null;
    state.appointmentStatus = 'confirmed';
    state.meetingStatus = 'confirmed';
    state.salesStage = 'closing';

    if (state.appointment) {
      state.appointment.calendarEventId = eventId;
      state.appointment.calendarEventLink = createResult.eventLink || null;
      state.appointment.meetingUrl = createResult.meetingUrl || null;
      state.appointment.meetingStatus = 'confirmed';
      state.appointment.confirmationStatus = 'confirmed';
      state.appointment.startTime = startIso;
      state.appointment.endTime = endIso;
      state.appointment.attendeeEmail = customerEmail;
      state.appointment.attendeeName = customerName;
      state.appointment.lastError = null;
      state.appointment.selectedSlot = {
        start: startIso,
        end: endIso,
        formattedTime: readableSlot,
        available: true,
      };
    }

    if (state.sales) {
      state.sales.salesStage = 'closing';
      state.sales.appointment = state.appointment;
      state.sales.nextBestAction = `confirm_appointment: Demo confirmed for ${readableSlot}, invite sent to ${customerEmail}.`;
    }

    sessionStateStore.set(conversationId, state);
  }

  // 8. CRM Sync (HubSpot / Local store integration)
  let crmSynced = false;
  if (options?.syncCrm !== false && state) {
    try {
      console.log(`[bookMeeting] Syncing confirmed meeting to CRM for session: ${conversationId}`);
      const crmRes = await syncLeadToHubSpot({
        sessionId: conversationId,
        salesState: state,
        customerData: {
          name: customerName,
          email: customerEmail,
          company,
        },
      });
      crmSynced = crmRes.success;
    } catch (crmErr) {
      console.warn('[bookMeeting] CRM sync error (isolated):', crmErr);
    }
  }

  // 9. Dispatch Confirmation Email via Gmail (isolated failure tolerance)
  let emailSent = false;
  let emailError: string | undefined;

  try {
    console.log(`[bookMeeting] Sending confirmation email to ${customerEmail}...`);
    if (state?.appointment) state.appointment.emailStatus = 'sending';

    const emailRes = await sendMeetingConfirmationEmail({
      customerName,
      customerEmail,
      company,
      meetingTitle,
      start: startIso,
      end: endIso,
      timezone: tz,
      meetingUrl: createResult.meetingUrl || undefined,
      calendarEventId: eventId,
      conversationId,
    });

    if (emailRes.success) {
      emailSent = true;
      if (state?.appointment) {
        state.appointment.emailStatus = 'sent';
        state.appointment.emailSentAt = emailRes.sentAt || new Date().toISOString();
        state.appointment.emailError = null;
      }
    } else {
      emailError = emailRes.error || 'Failed to dispatch confirmation email';
      if (state?.appointment) {
        state.appointment.emailStatus = 'failed';
        state.appointment.emailError = emailError;
      }
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    if (state?.appointment) {
      state.appointment.emailStatus = 'failed';
      state.appointment.emailError = emailError;
    }
  }

  // 10. Construct Truthful Confirmation Directive
  let confirmationMessage: string;
  if (emailSent) {
    confirmationMessage = `I have scheduled your demo for ${readableSlot}. A calendar invite and confirmation email have been sent to ${customerEmail}.`;
  } else {
    // Truthful report: Meeting is confirmed on calendar, but email delivery had an issue
    confirmationMessage = `The meeting is scheduled for ${readableSlot}, but I couldn't send the confirmation email.`;
  }

  return {
    success: true,
    status: 'confirmed',
    calendarEventId: eventId,
    eventId,
    startTime: startIso,
    endTime: endIso,
    timezone: tz,
    meetingUrl: createResult.meetingUrl,
    attendeeEmail: customerEmail,
    attendeeName: customerName,
    message: confirmationMessage,
    speechDirective: confirmationMessage,
    crmSynced,
    emailSent,
    idempotent: createResult.idempotent || false,
  };
}

/**
 * Canonical rescheduleMeeting workflow.
 */
export async function rescheduleMeeting(
  input: RescheduleCalendarMeetingInput,
  options?: { state?: SalesState; syncCrm?: boolean },
): Promise<BookMeetingResult> {
  const conversationId = input.conversationId || 'conv-' + Date.now();
  console.log(`[rescheduleMeeting] Rescheduling meeting ${input.calendarEventId} for session: ${conversationId}`);

  const state = options?.state || sessionStateStore.get(conversationId);
  const tz = input.timezone || state?.timezone || 'Asia/Kolkata';

  const updateResult = await updateCalendarMeeting({
    ...input,
    timezone: tz,
  });

  if (!updateResult.success || (!updateResult.calendarEventId && !updateResult.eventId)) {
    const err = updateResult.error || 'Failed to reschedule meeting';
    if (state?.appointment) {
      state.appointment.lastError = err;
    }
    return {
      success: false,
      status: err.includes('not available') ? 'unavailable' : 'failed',
      error: err,
      message: err.includes('not available')
        ? "That time isn't available because you already have another event scheduled then. Please choose another time."
        : "I wasn't able to reschedule the meeting due to a calendar error.",
      speechDirective: err.includes('not available')
        ? "That time isn't available because you already have another event scheduled then. Please choose another time."
        : "I wasn't able to reschedule the meeting due to a calendar error.",
    };
  }

  const newEventId = updateResult.calendarEventId || updateResult.eventId!;
  const [newDate, newTimeFull] = input.newStart.split('T');
  const startTime = newTimeFull.slice(0, 5);
  const readableSlot = formatSlotReadable(newDate, startTime, 30, tz);

  if (state) {
    state.calendarEventId = newEventId;
    state.meetingDate = newDate;
    state.meetingTime = startTime;
    state.appointmentStatus = 'confirmed';
    if (state.appointment) {
      state.appointment.meetingStatus = 'confirmed';
      state.appointment.confirmationStatus = 'confirmed';
      state.appointment.preferredDate = newDate;
      state.appointment.preferredTime = startTime;
      state.appointment.startTime = input.newStart;
      state.appointment.endTime = input.newEnd;
      state.appointment.selectedSlot = {
        start: input.newStart,
        end: input.newEnd,
        formattedTime: readableSlot,
        available: true,
      };
    }
  }

  const message = `I have successfully rescheduled your demo to ${readableSlot}.`;
  return {
    success: true,
    status: 'rescheduled',
    calendarEventId: newEventId,
    eventId: newEventId,
    startTime: input.newStart,
    endTime: input.newEnd,
    timezone: tz,
    meetingUrl: updateResult.meetingUrl,
    message,
    speechDirective: message,
    crmSynced: true,
  };
}

/**
 * Canonical cancelMeeting workflow.
 */
export async function cancelMeeting(
  input: CancelCalendarMeetingInput & { eventId?: string },
  options?: { state?: SalesState; syncCrm?: boolean },
): Promise<CancelCalendarMeetingResult> {
  const eventId = input.calendarEventId || input.eventId || '';
  const normalizedInput: CancelCalendarMeetingInput = {
    ...input,
    calendarEventId: eventId,
  };
  const conversationId = input.conversationId || 'conv-' + Date.now();
  console.log(`[cancelMeeting] Cancelling meeting ${eventId} for session: ${conversationId}`);

  const state = options?.state || sessionStateStore.get(conversationId);
  const cancelResult = await cancelCalendarMeeting(normalizedInput);

  if (!cancelResult.success) {
    return cancelResult;
  }

  if (state) {
    state.appointmentStatus = 'cancelled';
    state.calendarEventId = null;
    state.meetingUrl = null;
    if (state.appointment) {
      state.appointment.meetingStatus = 'cancelled';
      state.appointment.confirmationStatus = 'cancelled';
      state.appointment.calendarEventId = null;
      state.appointment.meetingUrl = null;
      state.appointment.selectedSlot = null;
    }
  }

  return cancelResult;
}
