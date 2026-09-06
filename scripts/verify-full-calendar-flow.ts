import {
  createInitialSalesState,
  analyzeAndUpdateSalesState,
  submitCustomerDetails,
} from '../lib/sales/tracker';
import { executeLiveVoiceBookingFlow } from '../lib/sales/calendar-helper';
import { isAgentOrDirectiveText } from '../lib/sales/brain';
import { getGoogleOAuthToken } from '../lib/calendar/google';
import { ChatMessage, SalesState } from '../lib/sales/types';

// Strict requirement: Only test with the two authorized real emails
const AUTHORIZED_EMAIL_1 = 'manishrevathi2008@gmail.com';
const AUTHORIZED_EMAIL_2 = 'p.manish.reddy1803@gmail.com';

async function fetchGoogleCalendarEvent(eventId: string) {
  const token = await getGoogleOAuthToken();
  if (!token) throw new Error('Failed to get Google OAuth token');

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar API returned status ${res.status}: ${errText}`);
  }
  return await res.json();
}

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 VERIFYING GOOGLE CALENDAR, MEET & GMAIL END-TO-END FLOW');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST 1: Anti-Echo & Directive Guard
  // -------------------------------------------------------------
  console.log('🔹 TEST 1: Anti-Echo & Directive Guard Check');
  const agentEmailPrompt = "What's the best email address to send your calendar invite and confirmation to?";
  const directivePrompt = "[DIRECTIVE]: What date and time would you like to schedule the meeting?";
  const isAgentEcho = isAgentOrDirectiveText(agentEmailPrompt);
  const isDirectiveEcho = isAgentOrDirectiveText(directivePrompt);
  const isRealUserText = isAgentOrDirectiveText(`My email is ${AUTHORIZED_EMAIL_1}`);

  console.log('  Agent email prompt guarded:', isAgentEcho);
  console.log('  Directive text guarded:', isDirectiveEcho);
  console.log('  Real user text NOT blocked:', !isRealUserText);

  if (!isAgentEcho || !isDirectiveEcho || isRealUserText) {
    throw new Error('TEST 1 FAILED: Anti-echo guard logic is incorrect.');
  }
  console.log('  ✅ TEST 1 PASSED: Acoustic echo loop prevention verified.\n');

  // -------------------------------------------------------------
  // TEST 2: Multi-Turn Live Voice Booking Flow
  // -------------------------------------------------------------
  console.log('🔹 TEST 2: Multi-Turn Voice Booking Flow');
  console.log('  Turn 1: Prospect requests meeting tomorrow at 10:00 AM without email');

  let state1: SalesState = createInitialSalesState('test-session-multi-turn');

  const messagesT1: ChatMessage[] = [
    {
      role: 'user',
      content: "I'd like to schedule a product demo for tomorrow at 10:00 AM.",
    },
  ];

  state1 = analyzeAndUpdateSalesState(state1, messagesT1);
  const turn1Result = await executeLiveVoiceBookingFlow(
    state1,
    "I'd like to schedule a product demo for tomorrow at 10:00 AM.",
    'test-session-multi-turn'
  );
  state1 = turn1Result.state;

  console.log('  Turn 1 Result:');
  console.log('    meetingRequested:', state1.appointment?.meetingRequested);
  console.log('    meetingDate:', state1.meetingDate || state1.appointment?.preferredDate);
  console.log('    meetingTime:', state1.meetingTime || state1.appointment?.preferredTime);
  console.log('    speechDirective:', turn1Result.speechDirective);
  console.log('    bookingAttempted:', turn1Result.bookingAttempted);

  if (!state1.meetingDate || !state1.meetingTime) {
    throw new Error('TEST 2 FAILED: Turn 1 did not set meetingDate or meetingTime.');
  }
  if (!turn1Result.speechDirective?.includes('best email address to send your calendar invite')) {
    throw new Error(`TEST 2 FAILED: Expected email prompt directive, got: ${turn1Result.speechDirective}`);
  }

  console.log('\n  Turn 2: Prospect provides email: manishrevathi2008@gmail.com');
  const messagesT2: ChatMessage[] = [
    ...messagesT1,
    {
      role: 'assistant',
      content: turn1Result.speechDirective,
    },
    {
      role: 'user',
      content: `My email is ${AUTHORIZED_EMAIL_1}`,
    },
  ];

  state1 = analyzeAndUpdateSalesState(state1, messagesT2);
  const turn2Result = await executeLiveVoiceBookingFlow(
    state1,
    `My email is ${AUTHORIZED_EMAIL_1}`,
    'test-session-multi-turn'
  );
  state1 = turn2Result.state;

  console.log('  Turn 2 Result:');
  console.log('    customerEmail:', state1.customerEmail || state1.customer?.email);
  console.log('    calendarSuccess:', turn2Result.calendarSuccess);
  console.log('    emailSuccess:', turn2Result.emailSuccess);
  console.log('    calendarEventId:', state1.calendarEventId);
  console.log('    meetingUrl:', state1.meetingUrl);
  console.log('    speechDirective:', turn2Result.speechDirective);

  if (!turn2Result.calendarSuccess || !state1.calendarEventId) {
    throw new Error(`TEST 2 FAILED: Calendar event creation failed. Error: ${turn2Result.error}`);
  }
  if (!turn2Result.emailSuccess || state1.confirmationEmailStatus !== 'sent') {
    throw new Error(`TEST 2 FAILED: Gmail confirmation failed. Error: ${turn2Result.error}`);
  }
  if (!state1.meetingUrl || !state1.meetingUrl.includes('meet.google.com')) {
    throw new Error(`TEST 2 FAILED: Google Meet URL is missing or invalid: ${state1.meetingUrl}`);
  }

  // Verify directly against Google Calendar API
  console.log('  Verifying event on Google Calendar API for ID:', state1.calendarEventId);
  const gcalEvent1 = await fetchGoogleCalendarEvent(state1.calendarEventId);
  console.log('    Google Calendar event status:', gcalEvent1.status);
  console.log('    Google Calendar summary:', gcalEvent1.summary);
  console.log('    Google Calendar hangoutLink:', gcalEvent1.hangoutLink);
  console.log('    Google Calendar attendees:', gcalEvent1.attendees?.map((a: any) => a.email));

  const hasAttendee1 = gcalEvent1.attendees?.some(
    (a: any) => a.email?.toLowerCase() === AUTHORIZED_EMAIL_1.toLowerCase()
  );
  if (!hasAttendee1) {
    throw new Error(`TEST 2 FAILED: Attendee ${AUTHORIZED_EMAIL_1} not present on Google Calendar event.`);
  }
  console.log('  ✅ TEST 2 PASSED: Multi-turn voice booking, Google Meet, and Gmail confirmation verified 100%!\n');

  // -------------------------------------------------------------
  // TEST 3: Single-Turn Booking with Authorized Email 2
  // -------------------------------------------------------------
  console.log('🔹 TEST 3: Single-Turn Booking Flow');
  console.log(`  Customer: "Can we book a demo for tomorrow at 2:00 PM? My name is Manish and email is ${AUTHORIZED_EMAIL_2}"`);

  let state3: SalesState = createInitialSalesState('test-session-single-turn');

  const messagesT3: ChatMessage[] = [
    {
      role: 'user',
      content: `Can we book a demo for tomorrow at 2:00 PM? My name is Manish and email is ${AUTHORIZED_EMAIL_2}`,
    },
  ];

  state3 = analyzeAndUpdateSalesState(state3, messagesT3);
  const turn3Result = await executeLiveVoiceBookingFlow(
    state3,
    `Can we book a demo for tomorrow at 2:00 PM? My name is Manish and email is ${AUTHORIZED_EMAIL_2}`,
    'test-session-single-turn'
  );
  state3 = turn3Result.state;

  console.log('  Result:');
  console.log('    customerEmail:', state3.customerEmail || state3.customer?.email);
  console.log('    calendarSuccess:', turn3Result.calendarSuccess);
  console.log('    emailSuccess:', turn3Result.emailSuccess);
  console.log('    calendarEventId:', state3.calendarEventId);
  console.log('    meetingUrl:', state3.meetingUrl);
  console.log('    speechDirective:', turn3Result.speechDirective);

  if (!turn3Result.calendarSuccess || !state3.calendarEventId) {
    throw new Error(`TEST 3 FAILED: Calendar event creation failed. Error: ${turn3Result.error}`);
  }
  if (!turn3Result.emailSuccess || state3.confirmationEmailStatus !== 'sent') {
    throw new Error(`TEST 3 FAILED: Gmail confirmation failed. Error: ${turn3Result.error}`);
  }

  const gcalEvent2 = await fetchGoogleCalendarEvent(state3.calendarEventId);
  console.log('    Google Calendar event status:', gcalEvent2.status);
  console.log('    Google Calendar hangoutLink:', gcalEvent2.hangoutLink);
  console.log('    Google Calendar attendees:', gcalEvent2.attendees?.map((a: any) => a.email));

  const hasAttendee2 = gcalEvent2.attendees?.some(
    (a: any) => a.email?.toLowerCase() === AUTHORIZED_EMAIL_2.toLowerCase()
  );
  if (!hasAttendee2) {
    throw new Error(`TEST 3 FAILED: Attendee ${AUTHORIZED_EMAIL_2} not present on Google Calendar event.`);
  }
  console.log('  ✅ TEST 3 PASSED: Single-turn booking, Meet link, and Gmail confirmation verified 100%!\n');

  // -------------------------------------------------------------
  // TEST 4: Popup Modal Resumption via submitCustomerDetails
  // -------------------------------------------------------------
  console.log('🔹 TEST 4: Popup Modal Resumption Flow');
  console.log('  Scenario: Prospect requested meeting tomorrow at 5:00 PM, opens modal and enters email');

  let state4: SalesState = createInitialSalesState('test-session-modal');

  const messagesT4: ChatMessage[] = [
    {
      role: 'user',
      content: "Let's set up a demo for tomorrow at 5:00 PM.",
    },
  ];

  state4 = analyzeAndUpdateSalesState(state4, messagesT4);
  const turn4Voice = await executeLiveVoiceBookingFlow(
    state4,
    "Let's set up a demo for tomorrow at 5:00 PM.",
    'test-session-modal'
  );
  state4 = turn4Voice.state;

  console.log('  Before modal submission:');
  console.log('    meetingRequested:', state4.appointment?.meetingRequested);
  console.log('    meetingStatus:', state4.appointment?.meetingStatus);
  console.log('    preferredTime:', state4.meetingTime || state4.appointment?.preferredTime);

  // User submits customer details via modal
  console.log(`  Prospect submits details form with email: ${AUTHORIZED_EMAIL_1}`);
  const modalResult = await submitCustomerDetails(
    state4,
    {
      fullName: 'Manish Reddy',
      email: AUTHORIZED_EMAIL_1,
      company: 'Agora AI Solutions',
    }
  );

  console.log('  After modal submission:');
  console.log('    state.calendarEventId:', modalResult.state.calendarEventId);
  console.log('    state.meetingUrl:', modalResult.state.meetingUrl);
  console.log('    state.confirmationEmailStatus:', modalResult.state.confirmationEmailStatus);
  console.log('    appointment.meetingStatus:', modalResult.state.appointment?.meetingStatus);

  if (modalResult.state.appointment?.meetingStatus !== 'confirmed') {
    throw new Error(`TEST 4 FAILED: Expected confirmed meeting status, got '${modalResult.state.appointment?.meetingStatus}', error: ${modalResult.state.appointment?.lastError}`);
  }
  if (!modalResult.state.calendarEventId) {
    throw new Error('TEST 4 FAILED: calendarEventId missing on root state.');
  }
  if (!modalResult.state.meetingUrl?.includes('meet.google.com')) {
    throw new Error(`TEST 4 FAILED: meetingUrl missing or invalid: ${modalResult.state.meetingUrl}`);
  }
  if (modalResult.state.confirmationEmailStatus !== 'sent') {
    throw new Error(`TEST 4 FAILED: confirmationEmailStatus is '${modalResult.state.confirmationEmailStatus}'`);
  }

  const gcalEvent3 = await fetchGoogleCalendarEvent(modalResult.state.calendarEventId);
  console.log('    Google Calendar event status:', gcalEvent3.status);
  console.log('    Google Calendar hangoutLink:', gcalEvent3.hangoutLink);
  console.log('  ✅ TEST 4 PASSED: Modal resumption created event, Meet link, and sent Gmail confirmation!\n');

  console.log('================================================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
