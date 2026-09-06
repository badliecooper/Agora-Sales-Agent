import { getEnvLocalValues, getGoogleOAuthConfig } from '../lib/calendar/oauth-helper';

async function diagnose() {
  console.log('=== DIAGNOSING GOOGLE OAUTH & APIS ===\n');

  const env = getEnvLocalValues();
  const config = getGoogleOAuthConfig();

  console.log('1. Environment Variables Presence:');
  console.log('  GOOGLE_CLIENT_ID present?:', Boolean(config.clientId));
  console.log('  GOOGLE_CLIENT_SECRET present?:', Boolean(config.clientSecret));
  console.log('  GOOGLE_REFRESH_TOKEN present?:', Boolean(config.refreshToken));
  console.log('  GOOGLE_CALENDAR_ID:', config.calendarId || 'primary');
  console.log('  DEFAULT_TIMEZONE:', process.env.DEFAULT_TIMEZONE || env.DEFAULT_TIMEZONE || '(not set)');

  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    console.error('\n❌ Missing required OAuth credentials in .env.local');
    return;
  }

  console.log('\n2. Testing Token Refresh with Google OAuth endpoint...');
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    console.log('  Token endpoint HTTP status:', resp.status);
    const data = await resp.json();

    if (!resp.ok) {
      console.error('  ❌ Token refresh FAILED:', data);
      return;
    }

    console.log('  ✅ Access token obtained successfully!');
    console.log('  Token expires in (s):', data.expires_in);
    console.log('  Scope granted by Google in token endpoint:', data.scope || '(not returned in refresh response)');

    const accessToken = data.access_token;

    // Check token info endpoint to see exact scopes & user email
    console.log('\n3. Inspecting Token Scopes & User info via tokeninfo API...');
    const tokenInfoResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
    const tokenInfo = await tokenInfoResp.json();
    console.log('  Token info status:', tokenInfoResp.status);
    console.log('  Token email / account:', tokenInfo.email);
    console.log('  Token scopes:', tokenInfo.scope);
    console.log('  Token audience matches clientId?:', tokenInfo.aud === config.clientId);

    // Test Google Calendar API
    console.log('\n4. Testing Google Calendar API (GET primary calendar)...');
    const calResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId || 'primary')}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log('  Calendar API HTTP status:', calResp.status);
    if (calResp.ok) {
      const calData = await calResp.json();
      console.log('  ✅ Calendar accessed! Summary:', calData.summary, '| TimeZone:', calData.timeZone);
    } else {
      const calErr = await calResp.text();
      console.error('  ❌ Calendar API error:', calResp.status, calErr);
    }

    // Test Google Calendar Events API (list upcoming events)
    console.log('\n5. Testing Google Calendar Events List...');
    const nowIso = new Date().toISOString();
    const eventsResp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId || 'primary')}/events?maxResults=3&timeMin=${encodeURIComponent(nowIso)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    console.log('  Events List HTTP status:', eventsResp.status);
    if (eventsResp.ok) {
      const eventsData = await eventsResp.json();
      console.log('  ✅ Upcoming events count:', eventsData.items?.length ?? 0);
      if (eventsData.items && eventsData.items.length > 0) {
        console.log('  First event:', eventsData.items[0].summary, 'at', eventsData.items[0].start?.dateTime);
      }
    } else {
      const evErr = await eventsResp.text();
      console.error('  ❌ Events List error:', eventsResp.status, evErr);
    }

    // Test Gmail API
    console.log('\n6. Testing Gmail API (GET profile)...');
    const gmailResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log('  Gmail API HTTP status:', gmailResp.status);
    if (gmailResp.ok) {
      const gmailProfile = await gmailResp.json();
      console.log('  ✅ Gmail profile accessed! Email address:', gmailProfile.emailAddress);
    } else {
      const gmailErr = await gmailResp.text();
      console.error('  ❌ Gmail API error:', gmailResp.status, gmailErr);
    }

  } catch (err) {
    console.error('Diagnostic error:', err);
  }
}

diagnose();
