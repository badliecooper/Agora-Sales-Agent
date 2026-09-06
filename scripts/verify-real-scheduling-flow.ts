import { createInitialSalesState, analyzeAndUpdateSalesState } from '../lib/sales/tracker';
import { executeLiveVoiceBookingFlow, parseRelativeDate } from '../lib/sales/calendar-helper';
import { checkCalendarAvailability, createCalendarMeeting } from '../lib/calendar/tools';
import { sendMeetingConfirmationEmail } from '../lib/email/gmail';
import { getGoogleOAuthToken } from '../lib/calendar/google';
import { getGoogleOAuthConfig } from '../lib/calendar/oauth-helper';

interface VerificationCheck {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const checks: VerificationCheck[] = [];

function recordCheck(id: string, name: string, passed: boolean, details: string) {
  checks.push({ id, name, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${status}] ${id}: ${name}\n    ${details}\n`);
}

async function runVerification() {
  console.log('================================================================');
  console.log('   END-TO-END GOOGLE CALENDAR & GMAIL REAL FLOW VERIFICATION   ');
  console.log('================================================================\n');

  const REAL_EMAIL = 'manishrevathi2008@gmail.com';
  const TARGET_TIMEZONE = 'Asia/Kolkata';
  const createdEventIds: string[] = [];

  try {
    // 1. Check relative date parsing dynamically
    const parsedTomorrow = parseRelativeDate('tomorrow', TARGET_TIMEZONE);
    const now = new Date();
    // Using Asia/Kolkata
    const kolkataDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: TARGET_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const [y, m, d] = kolkataDateStr.split('-').map(Number);
    const expectedTomorrow = new Date(Date.UTC(y, m - 1, d + 1));
    const expectedTomorrowStr = expectedTomorrow.toISOString().slice(0, 10);

    const dateMatches = parsedTomorrow === expectedTomorrowStr;
    recordCheck(
      'CHECK-1',
      'Dynamic Date Parsing ("tomorrow" in Asia/Kolkata)',
      dateMatches,
      `Calculated: "${parsedTomorrow}", Expected: "${expectedTomorrowStr}" (today is ${kolkataDateStr})`,
    );

    // 2. Check Calendar Availability for Tomorrow at 3 PM
    const testDate = parsedTomorrow || expectedTomorrowStr;
    const testTime = '15:00';
    const testEndTime = '15:30';

    const avail = await checkCalendarAvailability({
      date: testDate,
      startTime: testTime,
      endTime: testEndTime,
      timezone: TARGET_TIMEZONE,
    });

    recordCheck(
      'CHECK-2',
      'Live Google Calendar FreeBusy/Availability Query',
      avail.available === true,
      `Availability for ${testDate} at ${testTime} returned: available=${avail.available}, conflicts=${avail.conflicts?.length || 0}`,
    );

    // 3. Test Full Voice Turn Execution via analyzeAndUpdateSalesState + executeLiveVoiceBookingFlow
    let salesState = createInitialSalesState('verify-full-flow-sess');
    const userUtterance = `Schedule a meeting tomorrow at 3 PM with ${REAL_EMAIL}`;

    // Update SalesState from turn
    salesState = analyzeAndUpdateSalesState(salesState, [{ role: 'user', content: userUtterance }]);

    const voiceBookingResult = await executeLiveVoiceBookingFlow(
      salesState,
      userUtterance,
      'verify-full-flow-sess',
    );

    salesState = voiceBookingResult.state;
    if (salesState.calendarEventId) {
      createdEventIds.push(salesState.calendarEventId);
    }

    const isRealGoogleEventId =
      Boolean(salesState.calendarEventId) &&
      !salesState.calendarEventId?.startsWith('gcal_evt_') &&
      salesState.calendarEventId!.length >= 10;

    recordCheck(
      'CHECK-3',
      'Real Google Calendar Event Creation (Non-Mock)',
      Boolean(isRealGoogleEventId && voiceBookingResult.calendarSuccess),
      `Event ID: ${salesState.calendarEventId}, Meet URL: ${salesState.meetingUrl}`,
    );

    const hasMeetUrl = Boolean(salesState.meetingUrl && salesState.meetingUrl.startsWith('https://meet.google.com/'));
    recordCheck(
      'CHECK-4',
      'Google Meet Video Conference URL Generation',
      hasMeetUrl,
      `Meet link: ${salesState.meetingUrl}`,
    );

    const isRealEmailSent =
      Boolean(voiceBookingResult.emailSuccess) &&
      salesState.confirmationEmailStatus === 'sent';

    recordCheck(
      'CHECK-5',
      'Real Gmail Confirmation Sent to Designated Recipient',
      Boolean(isRealEmailSent),
      `Status: ${salesState.confirmationEmailStatus}, SentAt: ${salesState.appointment?.emailSentAt}, Recipient: ${REAL_EMAIL}`,
    );

    const directiveValid =
      Boolean(voiceBookingResult.speechDirective) &&
      voiceBookingResult.speechDirective!.includes(REAL_EMAIL) &&
      voiceBookingResult.speechDirective!.includes('3:00 PM') &&
      voiceBookingResult.speechDirective!.includes('calendar invite and confirmation email have been sent');

    recordCheck(
      'CHECK-6',
      'Truthful Conversational Speech Directive',
      directiveValid,
      `Directive: "${voiceBookingResult.speechDirective}"`,
    );

    // 4. Test Idempotency / Duplicate Email Prevention
    const duplicateEmailResult = await sendMeetingConfirmationEmail({
      customerEmail: REAL_EMAIL,
      customerName: 'Manish',
      company: 'Agora Sales',
      meetingTitle: 'Agora Voice AI Demo & Consultation',
      start: salesState.start || `${testDate}T15:00:00+05:30`,
      end: salesState.end || `${testDate}T15:30:00+05:30`,
      meetingUrl: salesState.meetingUrl || 'https://meet.google.com/test',
      timezone: TARGET_TIMEZONE,
      calendarEventId: salesState.calendarEventId!,
    });

    const isDuplicatePrevented =
      duplicateEmailResult.success &&
      duplicateEmailResult.idempotent === true;

    recordCheck(
      'CHECK-7',
      'Gmail Duplicate Prevention / Idempotency',
      isDuplicatePrevented,
      `Idempotent flag: ${duplicateEmailResult.idempotent}, Message ID: ${duplicateEmailResult.message_id || duplicateEmailResult.messageId}`,
    );

    // 5. Test Live Booking with Second Authorized Real Email (p.manish.reddy1803@gmail.com)
    const SECOND_REAL_EMAIL = 'p.manish.reddy1803@gmail.com';
    let secondSalesState = createInitialSalesState('verify-second-email-sess');
    const secondUtterance = `Please schedule a demo tomorrow at 4 PM with ${SECOND_REAL_EMAIL}`;

    secondSalesState = analyzeAndUpdateSalesState(secondSalesState, [{ role: 'user', content: secondUtterance }]);
    const secondBookingResult = await executeLiveVoiceBookingFlow(
      secondSalesState,
      secondUtterance,
      'verify-second-email-sess',
    );

    secondSalesState = secondBookingResult.state;
    if (secondSalesState.calendarEventId) {
      createdEventIds.push(secondSalesState.calendarEventId);
    }

    const secondPassed =
      Boolean(secondSalesState.calendarEventId) &&
      !secondSalesState.calendarEventId?.startsWith('gcal_evt_') &&
      secondSalesState.confirmationEmailStatus === 'sent' &&
      secondBookingResult.speechDirective?.includes(SECOND_REAL_EMAIL);

    recordCheck(
      'CHECK-8',
      'End-to-End Live Booking with Second Real Email (p.manish.reddy1803@gmail.com)',
      Boolean(secondPassed),
      `Event ID: ${secondSalesState.calendarEventId}, EmailStatus: ${secondSalesState.confirmationEmailStatus}, Directive: "${secondBookingResult.speechDirective}"`,
    );

  } catch (err: any) {
    console.error('Test run failed with uncaught exception:', err);
    recordCheck('CHECK-ERROR', 'Uncaught Exception', false, err.message || String(err));
  } finally {
    // 5. Cleanup Created Test Calendar Events
    console.log('\n--- CLEANING UP CREATED TEST CALENDAR EVENTS ---');
    const token = await getGoogleOAuthToken();
    const config = getGoogleOAuthConfig();
    const calendarId = config.calendarId || 'primary';

    for (const evtId of createdEventIds) {
      try {
        const delResp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(evtId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        console.log(`Deleted event ${evtId}, status: ${delResp.status}`);
      } catch (cleanupErr) {
        console.warn(`Failed to cleanup event ${evtId}:`, cleanupErr);
      }
    }
  }

  // Summary
  console.log('================================================================');
  console.log('                     VERIFICATION SUMMARY                       ');
  console.log('================================================================');
  const allPassed = checks.every((c) => c.passed);
  console.log(`Total Checks: ${checks.length}`);
  console.log(`Passed: ${checks.filter((c) => c.passed).length}`);
  console.log(`Failed: ${checks.filter((c) => !c.passed).length}`);
  console.log(`Overall Result: ${allPassed ? 'ALL CHECKS PASSED ✅' : 'FAILURES DETECTED ❌'}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

runVerification();
