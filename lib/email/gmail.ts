import { getGoogleOAuthToken } from '../calendar/google';

export interface SendMeetingConfirmationEmailInput {
  customerName: string;
  customerEmail: string;
  company?: string;
  meetingTitle: string;
  start: string; // ISO 8601 string or readable date
  end: string;   // ISO 8601 string or readable date
  timezone: string;
  meetingUrl?: string | null;
  calendarEventId: string;
  conversationId?: string;
}

export interface SendMeetingConfirmationEmailResult {
  success: boolean;
  service?: 'gmail';
  messageId?: string;
  message_id?: string; // Structured API alias
  threadId?: string;
  recipient?: string;
  subject?: string;
  idempotent?: boolean;
  error?: string;
  errorCode?: string;
  sentAt?: string;
}

export interface MockSentEmailRecord {
  messageId: string;
  to: string;
  recipient?: string;
  subject: string;
  calendarEventId: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string;
}

// In-memory idempotency store keyed by calendarEventId or conversationId
const emailIdempotencyStore = new Map<string, SendMeetingConfirmationEmailResult>();

// In-memory record of sent emails for offline testing and verification
const mockSentEmails: MockSentEmailRecord[] = [];

// Test failure simulation hook
let mockEmailFailureMode = false;

export function setMockEmailFailureMode(enabled: boolean): void {
  mockEmailFailureMode = enabled;
}

export function resetMockEmail(): void {
  mockEmailFailureMode = false;
  emailIdempotencyStore.clear();
  mockSentEmails.length = 0;
}

export function getMockSentEmails(): MockSentEmailRecord[] {
  return [...mockSentEmails];
}

import {
  PLACEHOLDER_EMAIL_DOMAINS,
  PLACEHOLDER_EMAIL_ADDRESSES,
  isPlaceholderEmail,
  isValidCustomerEmail,
} from '../sales/email-validation';

export {
  PLACEHOLDER_EMAIL_DOMAINS,
  PLACEHOLDER_EMAIL_ADDRESSES,
  isPlaceholderEmail,
  isValidCustomerEmail,
};

/**
 * Normalizes and formats ISO start/end into human-readable date and time strings.
 */
function formatDateTimeSummary(start: string, end: string, timezone: string): { dateStr: string; timeStr: string } {
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
        timeStr: `${startTimeStr} – ${endTimeStr} (${timezone || 'America/New_York'})`,
      };
    }
  } catch {}

  return {
    dateStr: start.split('T')[0] || start,
    timeStr: `${start} – ${end} (${timezone || 'America/New_York'})`,
  };
}

/**
 * Formats a clean RFC 2822 MIME email message with plaintext and HTML alternatives.
 */
function buildRfc2822Email(options: {
  to: string;
  toName: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}): string {
  const boundary = `====_Part_${Date.now()}_${Math.random().toString(36).slice(2)}====`;
  const subjectEncoded = `=?utf-8?B?${Buffer.from(options.subject, 'utf8').toString('base64')}?=`;

  const headers = [
    `To: "${options.toName.replace(/"/g, '')}" <${options.to}>`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
  ];

  const textPart = [
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    options.bodyText,
    ``,
  ];

  const htmlPart = [
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    options.bodyHtml,
    ``,
    `--${boundary}--`,
  ];

  return [...headers, ...textPart, ...htmlPart].join('\r\n');
}

/**
 * Sends a meeting confirmation email using the Gmail API (users.messages.send with userId='me').
 * Strictly server-side; enforces idempotency per calendarEventId and recipient.
 */
export async function sendMeetingConfirmationEmail(
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
    conversationId: _conversationId,
  } = input;

  const targetTimezone = timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
  const cleanRecipient = (customerEmail || '').toLowerCase().trim();

  if (!calendarEventId) {
    console.warn('[Gmail] Send blocked: calendarEventId is required.');
    return {
      success: false,
      service: 'gmail',
      error: 'Cannot send confirmation email: calendarEventId is required. Calendar event must be confirmed first.',
      errorCode: 'missing_calendar_event_id',
    };
  }

  if (!customerEmail || !isValidCustomerEmail(customerEmail)) {
    console.warn(`[Gmail] Send blocked: "${customerEmail || 'empty'}" is an invalid/placeholder email.`);
    return {
      success: false,
      service: 'gmail',
      recipient: customerEmail || undefined,
      error: `Cannot send confirmation email: "${customerEmail || 'empty'}" is an invalid or placeholder email address. A valid customer email is required.`,
      errorCode: 'invalid_email',
    };
  }

  // Idempotency check keyed by calendarEventId and recipient
  const idempotencyKey = `evt:${calendarEventId}:${cleanRecipient}`;
  if (emailIdempotencyStore.has(idempotencyKey)) {
    const cached = emailIdempotencyStore.get(idempotencyKey)!;
    console.log(`[Gmail] Duplicate prevention: confirmation email already sent for key ${idempotencyKey} (message ID: ${cached.messageId || cached.message_id})`);
    return {
      ...cached,
      idempotent: true,
    };
  }

  // Failure simulation for test harnesses
  if (mockEmailFailureMode) {
    return {
      success: false,
      service: 'gmail',
      recipient: customerEmail,
      error: 'Gmail API error: 503 Service Unavailable. Confirmation email could not be sent.',
      errorCode: 'api_unavailable',
    };
  }

  const subject = 'Your AI Sales Agent Demo is Confirmed';
  const { dateStr, timeStr } = formatDateTimeSummary(start, end, targetTimezone);
  const meetDisplay = meetingUrl || 'Link attached in Google Calendar invitation';

  // Plaintext Body
  const bodyText = [
    `Hi ${customerName},`,
    ``,
    `Your meeting has been confirmed!`,
    ``,
    `Meeting: ${meetingTitle}`,
    `Date: ${dateStr}`,
    `Time: ${timeStr}`,
    company ? `Company: ${company}` : null,
    `Google Meet: ${meetDisplay}`,
    `Calendar Event ID: ${calendarEventId}`,
    ``,
    `A calendar invitation has also been added to your schedule. We look forward to speaking with you!`,
    ``,
    `Best regards,`,
    `Agora Sales Team`,
  ]
    .filter(Boolean)
    .join('\n');

  // HTML Body
  const bodyHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background: #f8fafc; padding: 24px; margin: 0; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 560px; margin: 0 auto; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    h1 { color: #0f172a; font-size: 22px; margin-top: 0; }
    .badge { display: inline-block; background: #ecfdf5; color: #059669; font-weight: 600; padding: 4px 10px; border-radius: 9999px; font-size: 12px; margin-bottom: 16px; }
    .details { background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; line-height: 1.6; }
    .details dt { font-weight: 600; color: #475569; }
    .details dd { margin: 0 0 8px 0; color: #0f172a; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 16px 0; }
    .footer { font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">✓ Confirmed</span>
    <h1>Your Demo is Confirmed</h1>
    <p>Hi ${customerName},</p>
    <p>We're excited to connect with you. Here are your confirmed meeting details:</p>
    
    <div class="details">
      <dt>Meeting Topic</dt>
      <dd>${meetingTitle}</dd>
      <dt>Date & Time</dt>
      <dd>${dateStr} at ${timeStr}</dd>
      ${company ? `<dt>Company</dt><dd>${company}</dd>` : ''}
      <dt>Calendar Event ID</dt>
      <dd style="font-family: monospace; font-size: 12px;">${calendarEventId}</dd>
    </div>

    ${
      meetingUrl && meetingUrl.startsWith('http')
        ? `<p><a href="${meetingUrl}" class="btn" target="_blank">Join Google Meet</a></p>`
        : `<p><strong>Google Meet:</strong> <code>${meetDisplay}</code></p>`
    }

    <p style="font-size: 14px; color: #475569;">A calendar invite has been sent to your email with direct video access.</p>

    <div class="footer">
      Sent by Agora Conversational AI Sales Assistant
    </div>
  </div>
</body>
</html>`;

  // Check if live Google access token is available
  const token = await getGoogleOAuthToken();

  if (token) {
    try {
      console.log(`[Gmail] Starting email send to: ${customerEmail}`);
      console.log(`[Gmail] Authenticated successfully`);

      const rfc2822Raw = buildRfc2822Email({
        to: customerEmail,
        toName: customerName,
        subject,
        bodyText,
        bodyHtml,
      });

      const base64UrlRaw = Buffer.from(rfc2822Raw, 'utf8').toString('base64url');

      const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: base64UrlRaw }),
      });

      console.log('[Gmail] Gmail API status:', resp.status);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error(`[Gmail] Gmail API call failed with HTTP ${resp.status}:`, errText);

        let errorCode = 'unknown_gmail_error';
        if (resp.status === 401) errorCode = 'authentication_failure';
        else if (resp.status === 403) errorCode = 'authorization_scope_failure';
        else if (resp.status === 404) errorCode = 'mailbox_not_found';
        else if (resp.status === 429) errorCode = 'rate_limit';
        else if (resp.status === 400) errorCode = 'invalid_request';
        else if (resp.status >= 500) errorCode = 'api_unavailable';

        return {
          success: false,
          service: 'gmail',
          recipient: customerEmail,
          error: `Gmail API error (${resp.status}): ${errText}`,
          errorCode,
        };
      }

      const data = (await resp.json()) as { id: string; threadId?: string };
      console.log('[Gmail] Email sent:', data.id);
      const sentAt = new Date().toISOString();
      console.log(`[Gmail] Validated details: Recipient: ${customerEmail}, Subject: "${subject}", Status: 200, Message ID: ${data.id}, Timestamp: ${sentAt}`);

      const result: SendMeetingConfirmationEmailResult = {
        success: true,
        service: 'gmail',
        messageId: data.id,
        message_id: data.id,
        threadId: data.threadId,
        recipient: customerEmail,
        subject,
        sentAt,
      };

      mockSentEmails.push({
        messageId: data.id,
        to: customerEmail,
        recipient: `${customerName} <${customerEmail}>`,
        subject,
        calendarEventId,
        bodyText,
        bodyHtml,
        sentAt,
      });

      emailIdempotencyStore.set(idempotencyKey, result);
      return result;
    } catch (err) {
      console.error('[Gmail] Network/API error during email send:', err);
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.message.includes('timeout'));
      return {
        success: false,
        service: 'gmail',
        recipient: customerEmail,
        error: err instanceof Error ? err.message : String(err),
        errorCode: isTimeout ? 'timeout' : 'network_error',
      };
    }
  }

  // If explicit mock mode is enabled for offline unit tests only:
  if (process.env.CALENDAR_MOCK_MODE === 'true' || process.env.EMAIL_MOCK_MODE === 'true') {
    const mockMsgId = `mock_gmail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const mockResult: SendMeetingConfirmationEmailResult = {
      success: true,
      service: 'gmail',
      messageId: mockMsgId,
      message_id: mockMsgId,
      recipient: customerEmail,
      subject,
      sentAt: new Date().toISOString(),
    };

    mockSentEmails.push({
      messageId: mockMsgId,
      to: customerEmail,
      recipient: `${customerName} <${customerEmail}>`,
      subject,
      calendarEventId,
      bodyText,
      bodyHtml,
      sentAt: mockResult.sentAt!,
    });

    emailIdempotencyStore.set(idempotencyKey, mockResult);
    return mockResult;
  }

  // Real production/live mode: Return genuine failure when OAuth token is missing!
  console.error('[Gmail] Error: Gmail authentication required (no access token)');
  return {
    success: false,
    service: 'gmail',
    recipient: customerEmail,
    error: 'Gmail authentication required: Missing or invalid Google OAuth credentials in .env.local. Please authorize at /api/auth/google/login.',
    errorCode: 'authentication_required',
  };
}
