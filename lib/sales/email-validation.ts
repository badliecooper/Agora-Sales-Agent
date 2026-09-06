/**
 * Canonical email validation and placeholder prevention for Agora Sales System.
 * Ensures placeholder addresses (example.com, test.com, jordan@example.com, etc.)
 * are never dispatched to live Gmail APIs or registered as calendar attendees.
 */

export const PLACEHOLDER_EMAIL_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'sample.com',
  'domain.com',
  'fake.com',
  'placeholder.com',
  'temp.com',
  'nowhere.com',
];

export const PLACEHOLDER_EMAIL_ADDRESSES = [
  'jordan@example.com',
  'johndoe@example.com',
  'user@example.com',
  'test@example.com',
  'customer@example.com',
  'placeholder@example.com',
  'admin@example.com',
];

/**
 * Checks if an email is null/empty, malformed, or belongs to a known placeholder domain/list.
 */
export function isPlaceholderEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return true;
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) return true;

  if (PLACEHOLDER_EMAIL_ADDRESSES.includes(clean)) return true;

  const parts = clean.split('@');
  if (parts.length !== 2) return true;
  const domain = parts[1];

  return PLACEHOLDER_EMAIL_DOMAINS.some(
    (placeholder) => domain === placeholder || domain.endsWith('.' + placeholder),
  );
}

/**
 * Validates that an email address exists, has proper email syntax,
 * and is NOT a dummy/placeholder address.
 */
export function isValidCustomerEmail(email?: string | null): email is string {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  // Standard RFC-compliant practical email regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(clean)) return false;
  if (isPlaceholderEmail(clean)) return false;
  return true;
}
