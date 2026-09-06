

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  calendarId: string;
  redirectUri: string;
}

// Required Calendar scope for checking availability, creating/updating events, and managing Google Meet
export const GOOGLE_CALENDAR_MIN_SCOPE = 'https://www.googleapis.com/auth/calendar';

// Required Gmail scope for sending meeting confirmation emails
export const GOOGLE_GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

// Combined Google OAuth scopes
export const GOOGLE_AUTH_SCOPES = `${GOOGLE_CALENDAR_MIN_SCOPE} ${GOOGLE_GMAIL_SEND_SCOPE}`;

/**
 * Loads and parses .env.local on demand to ensure runtime updates are immediately available.
 */
export function getEnvLocalValues(): Record<string, string> {
  if (typeof window !== 'undefined') {
    return {};
  }
  const values: Record<string, string> = {};

  try {
    // Dynamic load to guarantee safety if evaluated in browser contexts
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(process.cwd(), '.env.local');

    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          values[key] = val;
        }
      }
    }
  } catch {
    // Fallback gracefully if filesystem is unavailable
  }

  return values;
}

/**
 * Retrieves current Google OAuth configuration, checking both process.env and .env.local.
 */
export function getGoogleOAuthConfig(customRedirectUri?: string): GoogleOAuthConfig {
  const envLocal = getEnvLocalValues();

  const clientId = (process.env.GOOGLE_CLIENT_ID || envLocal.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || envLocal.GOOGLE_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || envLocal.GOOGLE_REFRESH_TOKEN || '').trim();
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || envLocal.GOOGLE_CALENDAR_ID || 'primary').trim();

  // Default redirect URI for local Next.js development
  const redirectUri = customRedirectUri || 'http://localhost:3000/api/auth/google/callback';

  return {
    clientId,
    clientSecret,
    refreshToken: refreshToken || undefined,
    calendarId,
    redirectUri,
  };
}

/**
 * Generates the Google OAuth 2.0 authorization URL.
 * Requests offline access and prompt=consent to ensure a refresh token is returned.
 */
export function getGoogleAuthUrl(config?: GoogleOAuthConfig): string {
  const conf = config || getGoogleOAuthConfig();
  if (!conf.clientId) {
    throw new Error('GOOGLE_CLIENT_ID is missing. Please add it to your .env.local file.');
  }

  const params = new URLSearchParams({
    client_id: conf.clientId,
    redirect_uri: conf.redirectUri,
    response_type: 'code',
    scope: GOOGLE_AUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges the one-time authorization code for access and refresh tokens.
 * IMPORTANT: Tokens and secrets are NEVER logged.
 */
export async function exchangeAuthCodeForTokens(
  code: string,
  config?: GoogleOAuthConfig,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const conf = config || getGoogleOAuthConfig();

  if (!conf.clientId || !conf.clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. Check .env.local.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: conf.clientId,
      client_secret: conf.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: conf.redirectUri,
    }),
  });

  if (!response.ok) {
    await response.text().catch(() => '');
    console.error('[Google OAuth] Token exchange failed with HTTP status:', response.status);
    throw new Error(`Failed to exchange authorization code for tokens (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Saves the obtained refresh token directly into .env.local.
 * Updates in-memory process.env so subsequent requests immediately pick it up.
 * IMPORTANT: Does NOT print the token to stdout/logs.
 */
export function saveRefreshTokenToEnvLocal(refreshToken: string): void {
  if (typeof window !== 'undefined') return;
  if (!refreshToken || !refreshToken.trim()) {
    throw new Error('Cannot save empty refresh token');
  }

  const cleanToken = refreshToken.trim();
  const fs = require('fs');
  const path = require('path');
  const envPath = path.resolve(process.cwd(), '.env.local');
  let content = '';

  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  const tokenRegex = /^GOOGLE_REFRESH_TOKEN=.*$/m;

  if (tokenRegex.test(content)) {
    content = content.replace(tokenRegex, `GOOGLE_REFRESH_TOKEN=${cleanToken}`);
  } else {
    // Append to file
    const trailingNewline = content.endsWith('\n') ? '' : '\n';
    content = `${content}${trailingNewline}\n# Google Calendar OAuth Refresh Token (Auto-generated by OAuth flow)\nGOOGLE_REFRESH_TOKEN=${cleanToken}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');

  // Update in-memory process.env immediately
  process.env.GOOGLE_REFRESH_TOKEN = cleanToken;

  console.log('[Google OAuth] ✓ GOOGLE_REFRESH_TOKEN securely saved to .env.local');
}
