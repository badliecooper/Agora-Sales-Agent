import { getGoogleOAuthToken } from '../lib/calendar/google';

async function main() {
  const token = await getGoogleOAuthToken();
  if (!token) return;

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=2026-09-07T00:00:00%2B05:30&timeMax=2026-09-07T23:59:59%2B05:30&singleEvents=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  console.log('Events on Sep 7:', (data.items || []).map((i: any) => ({
    id: i.id,
    summary: i.summary,
    start: i.start?.dateTime,
    end: i.end?.dateTime,
    status: i.status,
  })));
}

main();
