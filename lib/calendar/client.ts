import { getEnvLocalValues } from './oauth-helper';
import { CalendarMeetingResult } from './types';

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

// In-memory token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

// Test hooks / failure simulation
let mockFailureMode = false;

// Idempotency cache keyed by: conversationId + ":" + start + ":" + customerEmail
const idempotencyStore = new Map<string, CalendarMeetingResult>();

export function setMockFailureMode(enabled: boolean): void {
  mockFailureMode = enabled;
}

export function isMockFailureMode(): boolean {
  return mockFailureMode;
}

export function resetCalendarClient(): void {
  mockFailureMode = false;
  idempotencyStore.clear();
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

export function getCalendarIdempotencyStore(): Map<string, CalendarMeetingResult> {
  return idempotencyStore;
}

/**
 * Server-side helper to get a valid Google OAuth access token.
 * Never exposed to the browser.
 */
export async function getGoogleOAuthToken(): Promise<string | null> {
  if (process.env.CALENDAR_MOCK_MODE === 'true') {
    return null;
  }

  const envLocal = getEnvLocalValues();
  const clientId = (process.env.GOOGLE_CLIENT_ID || envLocal.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || envLocal.GOOGLE_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || envLocal.GOOGLE_REFRESH_TOKEN || '').trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  // Return cached token if valid (with 60-second grace window)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[Google Calendar OAuth] Token refresh failed (HTTP ${response.status}):`, errText);
      return null;
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    cachedAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedAccessToken;
  } catch (err) {
    console.error('[Google Calendar OAuth] Token request error:', err);
    return null;
  }
}

/**
 * Resolves the primary Google Calendar ID from environment.
 */
export function getCalendarId(explicitCalendarId?: string): string {
  if (explicitCalendarId && explicitCalendarId.trim()) {
    return explicitCalendarId.trim();
  }
  const envLocal = getEnvLocalValues();
  return (process.env.GOOGLE_CALENDAR_ID || envLocal.GOOGLE_CALENDAR_ID || 'primary').trim();
}
