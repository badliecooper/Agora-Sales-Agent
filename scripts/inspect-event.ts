import { getGoogleOAuthToken } from '../lib/calendar/google';

async function main() {
  const token = await getGoogleOAuthToken();
  if (!token) return;

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/dnfg8aqbq4fa8km9vlh5p5dr6k', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Event Status:', res.status);
  const data = await res.json();
  console.log('Event Data:', JSON.stringify(data, null, 2));
}

main();
