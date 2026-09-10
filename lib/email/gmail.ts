/**
 * Canonical facade for backward compatibility with existing tests and scripts.
 * All logic has been decomposed into authoritative modules under lib/email/.
 */
export {
  sendMeetingConfirmation as sendMeetingConfirmationEmail,
  sendEmail,
} from './send';

export {
  setMockEmailFailureMode,
  resetEmailClient as resetMockEmail,
  getMockSentEmails,
  buildRfc2822Email,
} from './client';

export * from './types';
export * from './templates';

export {
  PLACEHOLDER_EMAIL_DOMAINS,
  PLACEHOLDER_EMAIL_ADDRESSES,
  isPlaceholderEmail,
  isValidCustomerEmail,
} from '../sales/email-validation';
