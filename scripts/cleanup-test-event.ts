import { getGoogleOAuthToken } from '../lib/calendar/google';
import { getGoogleOAuthConfig } from '../lib/calendar/oauth-helper';

async function cleanupTestEvent() {
  const token = await getGoogleOAuthToken();
  const config = getGoogleOAuthConfig();
  const calendarId = config.calendarId || 'primary';
  const eventId = 'cvtogm0gd75ek73h571ds9noak';

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  console.log('Delete status:', resp.status);
}

cleanupTestEvent();
