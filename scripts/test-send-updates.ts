import { getGoogleOAuthToken } from '../lib/calendar/google';

async function testSendUpdates() {
  const token = await getGoogleOAuthToken();
  if (!token) {
    console.error('No token');
    return;
  }

  const start = '2026-09-07T11:00:00+05:30';
  const end = '2026-09-07T11:30:00+05:30';

  const payload = {
    summary: 'Agora Voice AI Demo & Consultation — Live Invite Test',
    description: 'Agora Voice AI Technical Demo and Architecture Review\nAttendee: manishrevathi2008@gmail.com',
    start: { dateTime: start, timeZone: 'Asia/Kolkata' },
    end: { dateTime: end, timeZone: 'Asia/Kolkata' },
    conferenceData: {
      createRequest: {
        requestId: `req-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    attendees: [
      { email: 'manishrevathi2008@gmail.com', displayName: 'Manish' },
    ],
    reminders: {
      useDefault: true,
    },
  };

  const resp = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  console.log('Status with sendUpdates=all:', resp.status);
  const data = await resp.json();
  console.log('Created Event:', {
    id: data.id,
    summary: data.summary,
    htmlLink: data.htmlLink,
    meet: data.hangoutLink,
    attendees: data.attendees,
  });
}

testSendUpdates();
