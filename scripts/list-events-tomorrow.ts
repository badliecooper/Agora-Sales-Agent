import { getGoogleOAuthToken } from '../lib/calendar/google';
import { getGoogleOAuthConfig } from '../lib/calendar/oauth-helper';

async function listEvents() {
  const token = await getGoogleOAuthToken();
  const config = getGoogleOAuthConfig();
  const calendarId = config.calendarId || 'primary';

  const start = '2026-09-06T00:00:00+05:30';
  const end = '2026-09-06T23:59:59+05:30';

  const checkResp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await checkResp.json();
  console.log('Events on 2026-09-06:');
  for (const item of data.items || []) {
    console.log(`- ID: ${item.id} | Summary: "${item.summary}" | Status: ${item.status}`);
    console.log(`  Start:`, item.start);
    console.log(`  End:`, item.end);
    console.log(`  Description:`, item.description);
  }
}

listEvents();
