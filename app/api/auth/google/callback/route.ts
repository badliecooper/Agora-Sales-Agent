import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeAuthCodeForTokens,
  saveRefreshTokenToEnvLocal,
  getGoogleOAuthConfig,
} from '@/lib/calendar/oauth-helper';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    console.error('[Google OAuth] Access denied or error returned from Google consent screen:', error);
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Authorization Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
    .card { background: #1e293b; border: 1px solid #ef4444; border-radius: 12px; padding: 32px; max-width: 520px; width: 100%; text-align: center; }
    h1 { color: #ef4444; font-size: 22px; }
    p { line-height: 1.6; color: #cbd5e1; }
    .btn { display: inline-block; margin-top: 16px; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <h1>❌ Google Authorization Denied</h1>
    <p>Google returned an error: <code>${error}</code></p>
    <p>Please try again and ensure you grant Calendar permissions.</p>
    <a href="/api/auth/google/login" class="btn">Try Again</a>
  </div>
</body>
</html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  if (!code) {
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Missing Code</title></head>
<body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: white;">
  <h2>Missing authorization code from Google redirect.</h2>
</body>
</html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  try {
    const config = getGoogleOAuthConfig();
    const tokens = await exchangeAuthCodeForTokens(code, config);

    if (tokens.refreshToken) {
      saveRefreshTokenToEnvLocal(tokens.refreshToken);
    } else {
      console.warn(
        '[Google OAuth] Note: Google did not return a new refresh token (already authorized). Existing token preserved.',
      );
    }

    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Google Calendar Connected</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
    .card { background: #1e293b; border: 1px solid #10b981; border-radius: 12px; padding: 36px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .icon { font-size: 48px; margin-bottom: 12px; }
    h1 { color: #10b981; font-size: 24px; margin-top: 0; }
    p { line-height: 1.6; color: #cbd5e1; font-size: 15px; }
    code { background: #0f172a; color: #38bdf8; padding: 3px 8px; border-radius: 4px; font-size: 13px; }
    .btn { display: inline-block; margin-top: 24px; background: #10b981; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
    .btn:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📅</div>
    <h1>Google Calendar Connected!</h1>
    <p>Your Google Calendar and Google Meet permissions have been authorized successfully.</p>
    <p>The refresh token has been stored in <code>.env.local</code>.</p>
    <p>You can now return to the voice agent to schedule meetings.</p>
    <a href="/" class="btn">Return to Voice Agent</a>
  </div>
</body>
</html>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  } catch (err) {
    console.error('[Google OAuth] Callback handling error:', err instanceof Error ? err.message : String(err));
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Exchange Error</title></head>
<body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: #f87171;">
  <h2>Failed to exchange authorization code. Please try again.</h2>
  <a href="/api/auth/google/login" style="color: #60a5fa;">Retry Authorization</a>
</body>
</html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}
