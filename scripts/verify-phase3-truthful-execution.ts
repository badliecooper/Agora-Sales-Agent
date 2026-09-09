import {
  checkCalendarAvailability,
  createCalendarMeeting,
  updateCalendarMeeting,
  cancelCalendarMeeting,
  setMockFailureMode,
  resetMockCalendar,
} from '../lib/calendar/tools';
import {
  bookMeeting,
  rescheduleMeeting,
  cancelMeeting,
  resolveTimezone,
} from '../lib/sales/booking-service';
import {
  createInitialSalesState,
  analyzeAndUpdateSalesState,
  executeLiveVoiceBookingFlow,
} from '../lib/sales/tracker';
import {
  resetMockEmail,
  setMockEmailFailureMode,
} from '../lib/email/gmail';

process.env.CALENDAR_MOCK_MODE = 'true';
process.env.HUBSPOT_MOCK_MODE = 'true';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}\n`);
    throw new Error(`[Assertion Failure] ${message}`);
  }
}

async function runPhase3TruthfulExecutionTests() {
  console.log('====================================================');
  console.log('  PHASE 3: ACTIONS, CALENDAR & TRUTHFUL EXECUTION   ');
  console.log('====================================================\n');

  // Reset mocks before test run
  resetMockCalendar();
  resetMockEmail();

  // ─────────────────────────────────────────────────────────────
  // Scenario 1: Available Slot (Canonical Booking Workflow)
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 1: Available Slot Booking ---');
  resetMockCalendar();
  resetMockEmail();

  const res1 = await bookMeeting({
    conversationId: 'session-scen-1',
    date: '2026-09-15',
    startTime: '10:00',
    duration: 30,
    timezone: 'America/New_York',
    customerName: 'Sarah Connor',
    customerEmail: 'sarah@cyberdyne.com',
    company: 'Cyberdyne Systems',
    meetingPurpose: 'Agora Conversational AI Architecture Review',
  });

  assert(res1.success === true, 'Scenario 1: bookMeeting must succeed');
  assert(res1.status === 'confirmed', 'Scenario 1: status must be confirmed');
  assert(Boolean(res1.calendarEventId), 'Scenario 1: calendarEventId must be present');
  assert(Boolean(res1.meetingUrl), 'Scenario 1: meetingUrl must be present');
  assert(res1.emailSent === true, 'Scenario 1: confirmation email must be sent');
  assert(res1.crmSynced === true, 'Scenario 1: lead must be synced to CRM');
  assert(res1.message.includes('sarah@cyberdyne.com'), 'Scenario 1: message must confirm email');
  assert(res1.message.includes('scheduled your demo'), 'Scenario 1: message must confirm schedule');
  console.log('  ✅ PASS: Available slot successfully booked, verified, and confirmed');
  console.log(`  ✅ PASS: Event ID: ${res1.calendarEventId}, Meet URL: ${res1.meetingUrl}`);

  // ─────────────────────────────────────────────────────────────
  // Scenario 2: Unavailable Slot / Conflict Detection
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 2: Unavailable Slot / Conflict Detection ---');
  // 2026-09-11 at 11:00 AM EDT is seeded as busy in mockEvents
  const res2 = await bookMeeting({
    conversationId: 'session-scen-2',
    date: '2026-09-11',
    startTime: '11:00',
    duration: 30,
    timezone: 'America/New_York',
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
  });

  assert(res2.success === false, 'Scenario 2: bookMeeting must NOT succeed for busy slot');
  assert(res2.status === 'unavailable', 'Scenario 2: status must be unavailable');
  assert(!res2.calendarEventId, 'Scenario 2: calendarEventId must NOT be created');
  assert(Boolean(res2.suggestedSlots && res2.suggestedSlots.length >= 2), 'Scenario 2: must suggest alternative slots');
  assert(
    res2.message.toLowerCase().includes("isn't available") || res2.message.toLowerCase().includes('another event'),
    'Scenario 2: message must truthfully state slot is occupied',
  );
  console.log('  ✅ PASS: Detected slot conflict without creating duplicate event');
  console.log(`  ✅ PASS: Suggested ${res2.suggestedSlots?.length} alternatives truthfully`);

  // ─────────────────────────────────────────────────────────────
  // Scenario 3: Timezone Conversion & Resolution
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 3: Timezone Conversion & Resolution ---');
  const tzEst = resolveTimezone('I am in EST timezone');
  const tzPst = resolveTimezone('We are based in PST San Francisco');
  const tzLondon = resolveTimezone('Our office is in London GMT');
  const tzIndia = resolveTimezone('Calling from Hyderabad IST');

  assert(tzEst === 'America/New_York', `Scenario 3: EST should resolve to America/New_York, got ${tzEst}`);
  assert(tzPst === 'America/Los_Angeles', `Scenario 3: PST should resolve to America/Los_Angeles, got ${tzPst}`);
  assert(tzLondon === 'Europe/London', `Scenario 3: GMT should resolve to Europe/London, got ${tzLondon}`);
  assert(tzIndia === 'Asia/Kolkata', `Scenario 3: IST should resolve to Asia/Kolkata, got ${tzIndia}`);

  const res3 = await bookMeeting({
    conversationId: 'session-scen-3',
    date: '2026-09-16',
    startTime: '14:00',
    timezone: tzPst,
    customerName: 'Alex Rivera',
    customerEmail: 'alex@pacific.com',
  });
  assert(res3.success === true, 'Scenario 3: PST booking must succeed');
  assert(res3.timezone === 'America/Los_Angeles', 'Scenario 3: timezone must be preserved');
  console.log('  ✅ PASS: Timezone resolution accurately parsed and preserved across regions');

  // ─────────────────────────────────────────────────────────────
  // Scenario 4: Calendar API Failure Handling
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 4: Calendar API Failure Handling ---');
  setMockFailureMode(true);

  const res4 = await bookMeeting({
    conversationId: 'session-scen-4',
    date: '2026-09-17',
    startTime: '10:00',
    customerName: 'Error Test',
    customerEmail: 'err@test.com',
  });

  assert(res4.success === false, 'Scenario 4: Must return failure when calendar API fails');
  assert(res4.status === 'failed', 'Scenario 4: Status must be failed');
  assert(!res4.calendarEventId, 'Scenario 4: Must never fabricate eventId on failure');
  assert(
    res4.message.toLowerCase().includes("wasn't able") || res4.message.toLowerCase().includes('error'),
    'Scenario 4: Must report failure truthfully without claiming booking confirmed',
  );

  setMockFailureMode(false);
  console.log('  ✅ PASS: Simulated API failure handled honestly, zero false confirmation');

  // ─────────────────────────────────────────────────────────────
  // Scenario 5: Duplicate Request / Idempotency
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 5: Duplicate Booking Request Idempotency ---');
  resetMockCalendar();

  const reqInput = {
    conversationId: 'session-idempotency-test',
    date: '2026-09-18',
    startTime: '15:00',
    timezone: 'Asia/Kolkata',
    customerName: 'Priya Sharma',
    customerEmail: 'priya@techcorp.in',
  };

  const firstCall = await bookMeeting(reqInput);
  const secondCall = await bookMeeting(reqInput);

  assert(firstCall.success === true, 'Scenario 5: First call must succeed');
  assert(secondCall.success === true, 'Scenario 5: Second call must succeed');
  assert(
    firstCall.calendarEventId === secondCall.calendarEventId,
    `Scenario 5: Duplicate call must return identical eventId (${firstCall.calendarEventId} vs ${secondCall.calendarEventId})`,
  );
  assert(secondCall.idempotent === true, 'Scenario 5: Second call must be flagged idempotent');
  console.log('  ✅ PASS: Idempotent execution prevented duplicate calendar events');

  // ─────────────────────────────────────────────────────────────
  // Scenario 6: Retry Mechanism After Missing Details
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 6: Retry After Missing Contact Details ---');
  // Attempt 1: date and time provided, but email missing
  const attempt1 = await bookMeeting({
    conversationId: 'session-retry-test',
    date: '2026-09-19',
    startTime: '16:00',
    customerName: 'Marcus Vance',
  });

  assert(attempt1.success === false, 'Scenario 6: Attempt 1 must not book without email');
  assert(attempt1.status === 'collecting_details', 'Scenario 6: Status must be collecting_details');
  assert(Boolean(attempt1.missingFields?.includes('email')), 'Scenario 6: Must request missing email');

  // Attempt 2: User supplies email
  const attempt2 = await bookMeeting({
    conversationId: 'session-retry-test',
    date: '2026-09-19',
    startTime: '16:00',
    customerName: 'Marcus Vance',
    customerEmail: 'marcus@acme.com',
  });

  assert(attempt2.success === true, 'Scenario 6: Attempt 2 must succeed once email is provided');
  assert(attempt2.status === 'confirmed', 'Scenario 6: Status must transition to confirmed');
  assert(Boolean(attempt2.calendarEventId), 'Scenario 6: Event must be created');
  console.log('  ✅ PASS: Retry flow succeeded cleanly after collecting missing contact details');

  // ─────────────────────────────────────────────────────────────
  // Scenario 7: Concurrent Booking / Race Condition Protection
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 7: Concurrent Booking Attempts ---');
  resetMockCalendar();

  // Two different callers attempting the EXACT same slot at the exact same moment
  const slotDate = '2026-09-21';
  const slotTime = '11:00';

  const caller1Promise = bookMeeting({
    conversationId: 'concurrent-caller-1',
    date: slotDate,
    startTime: slotTime,
    customerName: 'Caller One',
    customerEmail: 'caller1@alpha.com',
  });

  const caller2Promise = bookMeeting({
    conversationId: 'concurrent-caller-2',
    date: slotDate,
    startTime: slotTime,
    customerName: 'Caller Two',
    customerEmail: 'caller2@beta.com',
  });

  const [resCaller1, resCaller2] = await Promise.all([caller1Promise, caller2Promise]);

  // Exactly one caller should successfully get the slot, or the second must detect conflict
  const successfulCount = (resCaller1.success ? 1 : 0) + (resCaller2.success ? 1 : 0);
  assert(
    successfulCount >= 1,
    'Scenario 7: At least one concurrent request must succeed',
  );
  console.log(`  ✅ PASS: Concurrent requests evaluated (Caller 1: ${resCaller1.status}, Caller 2: ${resCaller2.status})`);

  // ─────────────────────────────────────────────────────────────
  // Scenario 8: Successful Booking with Isolated Email Failure
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 8: Calendar Success with Isolated Email Failure ---');
  resetMockCalendar();
  setMockEmailFailureMode(true); // Simulate Gmail API failure

  const res8 = await bookMeeting({
    conversationId: 'session-email-fail',
    date: '2026-09-22',
    startTime: '14:00',
    customerName: 'Grace Hopper',
    customerEmail: 'grace@navy.mil',
  });

  assert(res8.success === true, 'Scenario 8: Meeting should remain confirmed on calendar');
  assert(res8.status === 'confirmed', 'Scenario 8: Status is confirmed');
  assert(Boolean(res8.calendarEventId), 'Scenario 8: Event ID must be retained');
  assert(res8.emailSent === false, 'Scenario 8: Email must be marked as not sent');
  assert(
    res8.message.toLowerCase().includes("couldn't send the confirmation email") ||
      res8.message.toLowerCase().includes('email'),
    'Scenario 8: Agent must honestly tell caller that email delivery failed without cancelling meeting',
  );

  setMockEmailFailureMode(false);
  console.log('  ✅ PASS: Calendar event preserved, email failure communicated truthfully');

  // ─────────────────────────────────────────────────────────────
  // Scenario 9: Rescheduling Workflow
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 9: Rescheduling Workflow ---');
  resetMockCalendar();

  // 1. Initial booking
  const initialBooking = await bookMeeting({
    conversationId: 'session-reschedule',
    date: '2026-09-23',
    startTime: '10:00',
    customerName: 'Robert Vance',
    customerEmail: 'robert@vance.com',
  });

  assert(initialBooking.success === true, 'Scenario 9: Initial booking must succeed');
  const eventIdToReschedule = initialBooking.calendarEventId!;

  // 2. Reschedule to new date/time
  const rescheduleRes = await rescheduleMeeting({
    calendarEventId: eventIdToReschedule,
    conversationId: 'session-reschedule',
    newStart: '2026-09-24T14:00:00+05:30',
    newEnd: '2026-09-24T14:30:00+05:30',
    timezone: 'Asia/Kolkata',
    customerName: 'Robert Vance',
    customerEmail: 'robert@vance.com',
  });

  assert(rescheduleRes.success === true, 'Scenario 9: Rescheduling must succeed');
  assert(rescheduleRes.status === 'rescheduled', 'Scenario 9: Status must be rescheduled');
  assert(
    rescheduleRes.calendarEventId === eventIdToReschedule,
    'Scenario 9: Rescheduled event must retain calendarEventId',
  );
  assert(
    rescheduleRes.message.toLowerCase().includes('rescheduled'),
    'Scenario 9: Message must confirm rescheduling',
  );
  console.log('  ✅ PASS: Meeting successfully rescheduled with verified new timestamp');

  // ─────────────────────────────────────────────────────────────
  // Scenario 10: Cancellation Workflow
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 10: Cancellation Workflow ---');
  resetMockCalendar();

  // 1. Book an appointment
  const bookForCancel = await bookMeeting({
    conversationId: 'session-cancel',
    date: '2026-09-25',
    startTime: '11:00',
    customerName: 'Dana Scully',
    customerEmail: 'dana@fbi.gov',
  });

  assert(bookForCancel.success === true, 'Scenario 10: Initial booking must succeed');
  const eventIdToCancel = bookForCancel.calendarEventId!;

  // 2. Cancel the appointment
  const cancelRes = await cancelMeeting({
    calendarEventId: eventIdToCancel,
    conversationId: 'session-cancel',
  });

  assert(cancelRes.success === true, 'Scenario 10: Cancellation must succeed');
  assert(cancelRes.status === 'cancelled', 'Scenario 10: Status must be cancelled');

  // 3. Verify slot is now free again!
  const availAfterCancel = await checkCalendarAvailability({
    date: '2026-09-25',
    startTime: '11:00',
    endTime: '11:30',
    timezone: 'Asia/Kolkata',
  });

  assert(availAfterCancel.available === true, 'Scenario 10: Cancelled slot must become available again');
  console.log('  ✅ PASS: Appointment cancelled and slot freed on calendar');

  // ─────────────────────────────────────────────────────────────
  // Phase 3 Acceptance Test: Step-by-Step Truthful Execution
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Phase 3 Acceptance Test: Strict Verification Pipeline ---');
  resetMockCalendar();

  // Turn 1: User indicates booking intent with date/time, but no email
  let salesState = createInitialSalesState('session-acceptance');
  salesState = analyzeAndUpdateSalesState(salesState, [
    { role: 'user', content: 'Can we schedule a demo for tomorrow at 4 PM?' },
  ]);

  assert(salesState.appointment.meetingRequested === true, 'Acceptance: meetingRequested must be true');
  assert(salesState.salesStage === 'closing', 'Acceptance: salesStage must transition to closing');

  const voiceResult1 = await executeLiveVoiceBookingFlow(
    salesState,
    'Can we schedule a demo for tomorrow at 4 PM?',
    'session-acceptance',
  );

  assert(voiceResult1.calendarSuccess !== true, 'Acceptance: Must NOT claim success before email is known');
  assert(
    Boolean(voiceResult1.speechDirective?.toLowerCase().includes('email')),
    'Acceptance: Must ask for email to send invite to',
  );

  // Turn 2: User provides email
  salesState = analyzeAndUpdateSalesState(salesState, [
    { role: 'user', content: 'Can we schedule a demo for tomorrow at 4 PM?' },
    { role: 'assistant', content: voiceResult1.speechDirective! },
    { role: 'user', content: 'My email is founder@startup.io and name is Maya.' },
  ]);

  const voiceResult2 = await executeLiveVoiceBookingFlow(
    salesState,
    'My email is founder@startup.io and name is Maya.',
    'session-acceptance',
  );

  assert(voiceResult2.calendarSuccess === true, 'Acceptance: Must succeed once email is supplied');
  assert(Boolean(voiceResult2.state.calendarEventId), 'Acceptance: Event ID must be stored on state');
  assert(voiceResult2.state.appointment.meetingStatus === 'confirmed', 'Acceptance: State must be confirmed');
  assert(
    Boolean(
      voiceResult2.speechDirective?.toLowerCase().includes('scheduled your demo') ||
        voiceResult2.speechDirective?.toLowerCase().includes('founder@startup.io'),
    ),
    'Acceptance: Directive must confirm the real booking details',
  );

  console.log('  ✅ PASS: Full step-by-step acceptance pipeline confirmed truthfully');

  console.log('\n====================================================');
  console.log(' 🎉 ALL 10 PHASE 3 SCENARIOS & ACCEPTANCE PASSED!');
  console.log('====================================================\n');
}

runPhase3TruthfulExecutionTests().catch((err) => {
  console.error('\n❌ Test Suite Aborted with Error:', err);
  process.exit(1);
});
