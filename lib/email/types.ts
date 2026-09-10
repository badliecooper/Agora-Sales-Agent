export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  service?: 'gmail';
  messageId?: string;
  message_id?: string;
  threadId?: string;
  recipient?: string;
  subject?: string;
  idempotent?: boolean;
  error?: string;
  errorCode?: string;
  sentAt?: string;
}

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
  context?: string;
}

export interface SendMeetingConfirmationEmailResult extends SendEmailResult {
  calendarEventId?: string;
}

export interface MockSentEmailRecord {
  messageId: string;
  to: string;
  recipient?: string;
  subject: string;
  calendarEventId?: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string;
}
