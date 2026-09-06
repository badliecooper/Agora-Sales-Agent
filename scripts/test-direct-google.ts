import { getGoogleOAuthToken } from '../lib/calendar/google';
import { getGoogleOAuthConfig } from '../lib/calendar/oauth-helper';

async function testRealCalls() {
  console.log('=== TESTING REAL CALENDAR EVENT INSERT & GMAIL SEND ===\n');

  const token = await getGoogleOAuthToken();
  if (!token) {
    console.error('No token available');
    return;
  }

  const config = getGoogleOAuthConfig();
  const calendarId = config.calendarId || 'primary';

  // 1. Test real Calendar Event Insert for tomorrow at 3:00 PM (Asia/Kolkata)
  console.log('1. Testing Google Calendar Event Insert:');
  const startDateTime = '2026-09-06T15:00:00+05:30';
  const endDateTime = '2026-09-06T15:30:00+05:30';

  const eventPayload = {
    summary: 'Test Agora Voice Appointment — Manish',
    description: 'Testing live Google Calendar and Google Meet integration\nConversation ID: test-diagnostic-1',
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Kolkata',
    },
    conferenceData: {
      createRequest: {
        requestId: `req-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    attendees: [
      { email: 'manishrevathi2008@gmail.com', displayName: 'Manish' },
    ],
  };

  try {
    const calResp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      }
    );

    console.log('  Calendar Insert HTTP Status:', calResp.status);
    const calJson = await calResp.json();
    if (calResp.ok) {
      console.log('  ✅ Real Calendar Event Created!');
      console.log('  Event ID:', calJson.id);
      console.log('  Event Link:', calJson.htmlLink);
      console.log('  Google Meet Link:', calJson.hangoutLink || calJson.conferenceData?.entryPoints?.[0]?.uri);
      console.log('  Status:', calJson.status);
    } else {
      console.error('  ❌ Calendar Insert Failed:', calJson);
    }

    // 2. Test real Gmail Send to manishrevathi2008@gmail.com
    console.log('\n2. Testing Real Gmail Send:');
    const boundary = `====_Part_${Date.now()}====`;
    const rfc2822 = [
      `To: "Manish" <manishrevathi2008@gmail.com>`,
      `Subject: =?utf-8?B?${Buffer.from('Your Agora Demo is Confirmed (Test)', 'utf8').toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      `Hi Manish,\n\nYour meeting has been scheduled for tomorrow at 3:00 PM IST.\nEvent ID: ${calJson?.id || 'test'}\n\nAgora Sales Team`,
      ``,
      `--${boundary}--`,
    ].join('\r\n');

    const base64Url = Buffer.from(rfc2822, 'utf8').toString('base64url');

    const gmailResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Url }),
    });

    console.log('  Gmail Send HTTP Status:', gmailResp.status);
    const gmailJson = await gmailResp.json();
    if (gmailResp.ok) {
      console.log('  ✅ Real Gmail Sent!');
      console.log('  Message ID:', gmailJson.id);
      console.log('  Thread ID:', gmailJson.threadId);
    } else {
      console.error('  ❌ Gmail Send Failed:', gmailJson);
    }

  } catch (err) {
    console.error('Error in testRealCalls:', err);
  }
}

testRealCalls();
