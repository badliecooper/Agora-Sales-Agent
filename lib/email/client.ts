import { getGoogleOAuthToken } from '../calendar/client';
import { SendEmailResult, MockSentEmailRecord } from './types';

if (typeof window === 'undefined') {
  try {
    // Safely configure IPv4 precedence in Node.js runtime without breaking client bundles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeDns = typeof process !== 'undefined' && (process as any).versions?.node ? eval('require')('node:dns') : null;
    nodeDns?.setDefaultResultOrder?.('ipv4first');
  } catch {
    // Ignored in non-Node runtimes
  }
}

// In-memory records for testing/verification
const mockSentEmails: MockSentEmailRecord[] = [];
const emailIdempotencyStore = new Map<string, SendEmailResult>();
let mockEmailFailureMode = false;

export function setMockEmailFailureMode(enabled: boolean): void {
  mockEmailFailureMode = enabled;
}

export function isMockEmailFailureMode(): boolean {
  return mockEmailFailureMode;
}

export function resetEmailClient(): void {
  mockEmailFailureMode = false;
  emailIdempotencyStore.clear();
  mockSentEmails.length = 0;
}

export function getMockSentEmails(): MockSentEmailRecord[] {
  return [...mockSentEmails];
}

export function getEmailIdempotencyStore(): Map<string, SendEmailResult> {
  return emailIdempotencyStore;
}

/**
 * Formats a clean RFC 2822 MIME email message with plaintext and HTML alternatives.
 */
export function buildRfc2822Email(options: {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): string {
  const boundary = `====_Part_${Date.now()}_${Math.random().toString(36).slice(2)}====`;
  const subjectEncoded = `=?utf-8?B?${Buffer.from(options.subject, 'utf8').toString('base64')}?=`;
  const recipientHeader = options.toName
    ? `To: "${options.toName.replace(/"/g, '')}" <${options.to}>`
    : `To: <${options.to}>`;

  const headers = [
    recipientHeader,
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

  const htmlPart = options.bodyHtml
    ? [
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        options.bodyHtml,
        ``,
        `--${boundary}--`,
      ]
    : [`--${boundary}--`];

  return [...headers, ...textPart, ...htmlPart].join('\r\n');
}

/**
 * Dispatches an email message directly via the Gmail REST API (users.messages.send).
 * Strictly server-side.
 */
export async function sendRawEmail(options: {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  idempotencyKey?: string;
  calendarEventId?: string;
}): Promise<SendEmailResult> {
  const { to, toName, subject, bodyText, bodyHtml, idempotencyKey, calendarEventId } = options;

  if (mockEmailFailureMode) {
    return {
      success: false,
      service: 'gmail',
      recipient: to,
      error: 'Gmail API error: 503 Service Unavailable. Email could not be sent.',
      errorCode: 'api_unavailable',
    };
  }

  const token = await getGoogleOAuthToken();

  if (token) {
    try {
      console.log(`[Gmail Client] Sending email to: ${to} (Subject: "${subject}")`);

      const rfc2822Raw = buildRfc2822Email({
        to,
        toName,
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

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error(`[Gmail Client] API call failed (HTTP ${resp.status}):`, errText);

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
          recipient: to,
          error: `Gmail API error (${resp.status}): ${errText}`,
          errorCode,
        };
      }

      const data = (await resp.json()) as { id: string; threadId?: string };
      const sentAt = new Date().toISOString();
      console.log(`[Gmail Client] Email delivered successfully. Message ID: ${data.id}`);

      const result: SendEmailResult = {
        success: true,
        service: 'gmail',
        messageId: data.id,
        message_id: data.id,
        threadId: data.threadId,
        recipient: to,
        subject,
        sentAt,
      };

      mockSentEmails.push({
        messageId: data.id,
        to,
        recipient: toName ? `${toName} <${to}>` : to,
        subject,
        calendarEventId,
        bodyText,
        bodyHtml,
        sentAt,
      });

      if (idempotencyKey) {
        emailIdempotencyStore.set(idempotencyKey, result);
      }

      return result;
    } catch (err) {
      console.error('[Gmail Client] Network/API exception during email send:', err);
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.message.includes('timeout'));
      return {
        success: false,
        service: 'gmail',
        recipient: to,
        error: err instanceof Error ? err.message : String(err),
        errorCode: isTimeout ? 'timeout' : 'network_error',
      };
    }
  }

  // Offline mock mode check (only when CALENDAR_MOCK_MODE or EMAIL_MOCK_MODE is true)
  if (process.env.CALENDAR_MOCK_MODE === 'true' || process.env.EMAIL_MOCK_MODE === 'true') {
    const mockMsgId = `mock_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sentAt = new Date().toISOString();
    const mockResult: SendEmailResult = {
      success: true,
      service: 'gmail',
      messageId: mockMsgId,
      message_id: mockMsgId,
      recipient: to,
      subject,
      sentAt,
    };

    mockSentEmails.push({
      messageId: mockMsgId,
      to,
      recipient: toName ? `${toName} <${to}>` : to,
      subject,
      calendarEventId,
      bodyText,
      bodyHtml,
      sentAt,
    });

    if (idempotencyKey) {
      emailIdempotencyStore.set(idempotencyKey, mockResult);
    }

    return mockResult;
  }

  return {
    success: false,
    service: 'gmail',
    recipient: to,
    error: 'Gmail authentication required: Missing or invalid Google OAuth credentials in .env.local. Authorize at /api/auth/google/login.',
    errorCode: 'authentication_required',
  };
}
