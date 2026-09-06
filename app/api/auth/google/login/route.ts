import { NextResponse } from 'next/server';
import { getGoogleOAuthConfig, getGoogleAuthUrl } from '@/lib/calendar/oauth-helper';

export async function GET() {
  const config = getGoogleOAuthConfig();

  if (!config.clientId || !config.clientSecret) {
    return new NextResponse(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Google Calendar Setup Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 580px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #f59e0b; margin-top: 0; font-size: 22px; }
    p { line-height: 1.6; color: #cbd5e1; }
    code { background: #0f172a; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
    pre { background: #0f172a; padding: 14px; border-radius: 8px; overflow-x: auto; color: #94a3b8; font-size: 13px; }
    .btn { display: inline-block; margin-top: 16px; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚠️ Google Client Credentials Missing</h1>
    <p>To authorize Google Calendar & Google Meet, please ensure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are added to your <code>.env.local</code> file:</p>
    <pre>
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
    </pre>
    <p>Also ensure your Google Cloud OAuth 2.0 Web Client has the following Authorized Redirect URI:</p>
    <pre>http://localhost:3000/api/auth/google/callback</pre>
    <p>Once you have added the credentials to <code>.env.local</code>, refresh this page to begin the authorization.</p>
    <a href="/api/auth/google/login" class="btn">Retry Authorization</a>
  </div>
</body>
</html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  try {
    const authUrl = getGoogleAuthUrl(config);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new NextResponse(`Error generating authorization URL: ${msg}`, { status: 500 });
  }
}
