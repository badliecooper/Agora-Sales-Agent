import {
  SendEmailInput,
  SendEmailResult,
  SendMeetingConfirmationEmailInput,
  SendMeetingConfirmationEmailResult,
} from './types';
import {
  sendRawEmail,
  getEmailIdempotencyStore,
  isMockEmailFailureMode,
} from './client';
import { buildMeetingConfirmationTemplate } from './templates/meeting-confirmation';
import { isValidCustomerEmail } from '../sales/email-validation';

/**
 * Resolves the effective destination email address.
 * If TEST_EMAIL is set and this is a designated test scenario, it can route to test recipient.
 * In production, it strictly routes to the real runtime customer address.
 */
export function resolveEffectiveRecipient(requestedEmail: string): string {
  const clean = requestedEmail.trim();
  // Do not rewrite in production logic unless explicitly configured in tests
  return clean;
}

/**
 * Canonical general email sending function.
 * Validates recipient, verifies idempotency, and dispatches via Gmail API.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, toName, subject, bodyText, bodyHtml, idempotencyKey } = input;
  const cleanRecipient = (to || '').trim().toLowerCase();

  if (!cleanRecipient || !isValidCustomerEmail(cleanRecipient)) {
    return {
      success: false,
      service: 'gmail',
      recipient: to,
      error: `Invalid recipient email address: "${to}". A valid email is required.`,
      errorCode: 'invalid_email',
    };
  }

  const idempotencyStore = getEmailIdempotencyStore();
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    const cached = idempotencyStore.get(idempotencyKey)!;
    console.log(`[Email Service] Duplicate prevention: message already sent for key ${idempotencyKey}`);
    return {
      ...cached,
      idempotent: true,
    };
  }

  return sendRawEmail({
    to: cleanRecipient,
    toName,
    subject,
    bodyText,
    bodyHtml,
    idempotencyKey,
  });
}

/**
 * Normalizes and formats ISO start/end into human-readable date and time strings.
 */
export function formatDateTimeSummary(
  start: string,
  end: string,
  timezone: string,
): { dateStr: string; timeStr: string } {
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      const dateStr = startDate.toLocaleDateString('en-US', {
        timeZone: timezone || 'Asia/Kolkata',
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const startTimeStr = startDate.toLocaleTimeString('en-US', {
        timeZone: timezone || 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
      });
      const endTimeStr = endDate.toLocaleTimeString('en-US', {
        timeZone: timezone || 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
      });
      return {
        dateStr,
        timeStr: `${startTimeStr} – ${endTimeStr}`,
      };
    }
  } catch {
    // Fallback if parsing fails
  }

  return {
    dateStr: start.split('T')[0] || start,
    timeStr: `${start} – ${end}`,
  };
}

/**
 * Canonical meeting confirmation email sender.
 * Enforces calendarEventId requirement and idempotency per event + recipient.
 */
export async function sendMeetingConfirmation(
  input: SendMeetingConfirmationEmailInput,
): Promise<SendMeetingConfirmationEmailResult> {
  const {
    customerName,
    customerEmail,
    company,
    meetingTitle,
    start,
    end,
    timezone,
    meetingUrl,
    calendarEventId,
    context,
  } = input;

  if (!calendarEventId) {
    return {
      success: false,
      service: 'gmail',
      error: 'Cannot send confirmation email: calendarEventId is required. Calendar event must be created first.',
      errorCode: 'missing_calendar_event_id',
    };
  }

  const cleanRecipient = (customerEmail || '').trim().toLowerCase();
  if (!cleanRecipient || !isValidCustomerEmail(cleanRecipient)) {
    return {
      success: false,
      service: 'gmail',
      recipient: customerEmail,
      error: `Cannot send confirmation email: "${customerEmail || 'empty'}" is an invalid or placeholder email.`,
      errorCode: 'invalid_email',
    };
  }

  const idempotencyKey = `evt:${calendarEventId}:${cleanRecipient}`;
  const idempotencyStore = getEmailIdempotencyStore();

  if (idempotencyStore.has(idempotencyKey)) {
    const cached = idempotencyStore.get(idempotencyKey)!;
    console.log(`[Email Service] Duplicate confirmation prevented for key ${idempotencyKey} (ID: ${cached.messageId || cached.message_id})`);
    return {
      ...cached,
      calendarEventId,
      idempotent: true,
    };
  }

  if (isMockEmailFailureMode()) {
    return {
      success: false,
      service: 'gmail',
      recipient: customerEmail,
      error: 'Gmail API error: 503 Service Unavailable. Confirmation email could not be sent.',
      errorCode: 'api_unavailable',
    };
  }

  const targetTimezone = timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
  const { dateStr, timeStr } = formatDateTimeSummary(start, end, targetTimezone);

  const { subject, html, text } = buildMeetingConfirmationTemplate({
    customerName,
    customerEmail: cleanRecipient,
    company,
    meetingTitle,
    dateStr,
    timeStr,
    timezone: targetTimezone,
    meetingUrl,
    calendarEventId,
    context,
  });

  const sendRes = await sendRawEmail({
    to: cleanRecipient,
    toName: customerName,
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey,
    calendarEventId,
  });

  return {
    ...sendRes,
    calendarEventId,
  };
}

export const sendMeetingConfirmationEmail = sendMeetingConfirmation;
