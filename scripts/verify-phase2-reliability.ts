import assert from 'node:assert';
import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import {
  checkAvailability,
  bookMeeting,
  rescheduleMeeting,
  cancelMeeting,
  setMockFailureMode,
  resetCalendarClient,
  normalizeDateTimes,
  getGoogleOAuthToken,
  getCalendarId,
} from '../lib/calendar';
import {
  sendEmail,
  sendMeetingConfirmation,
  setMockEmailFailureMode,
  resetEmailClient,
  getMockSentEmails,
} from '../lib/email';
import {
  detectEscalation,
  resolveEscalationRecipient,
  escalateToHuman,
  resetEscalationStore,
  getActiveSessionEscalation,
} from '../lib/escalation';
import { processSalesBrain } from '../lib/sales/brain';

const TEST_RECIPIENT = process.env.TEST_EMAIL || 'manishrevathi2008@gmail.com';
const ESCALATION_RECIPIENT = process.env.ESCALATION_EMAIL || 'yadhurajsp@gmail.com';

let totalChecks = 0;
let passedChecks = 0;

function report(testName: string, passed: boolean, details: string = '') {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`✅ [PASS] ${testName}`);
    if (details) console.log(`   ${details}`);
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   ${details}`);
    throw new Error(`Test failed: ${testName} - ${details}`);
  }
}

async function cleanupPreviousTestEvents() {
  const token = await getGoogleOAuthToken();
  const calId = getCalendarId();
  if (!token) return;
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?q=Agora%20Voice%20AI%20Demo%20—%20Test%20Prospect&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = (await res.json()) as { items?: Array<{ id: string; status?: string; summary?: string }> };
      for (const item of data.items || []) {
        if (item.id && item.status !== 'cancelled') {
          console.log(`[Test Setup] Deleting prior test event: ${item.id} (${item.summary})`);
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(item.id)}?sendUpdates=none`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
          );
        }
      }
    }
  } catch (err) {
    console.warn('[Test Setup] Could not clean up old test events:', err);
  }
}

async function runPhase2Verification() {
  console.log('====================================================');
  console.log('   PHASE 2: RELIABILITY SUITE (CALENDAR, EMAIL, ESCALATION)   ');
  console.log('====================================================\n');

  resetCalendarClient();
  resetEmailClient();
  resetEscalationStore();

  await cleanupPreviousTestEvents();

  // ----------------------------------------------------------------
  // PART 1: CALENDAR RELIABILITY
  // ----------------------------------------------------------------
  console.log('--- 1. CALENDAR TESTS ---');

  // Test 1.1: Live Availability Query with dynamic date (2 days ahead)
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 2);
  const testDateIso = testDate.toISOString().split('T')[0];

  const avail = await checkAvailability({
    date: testDateIso,
    startTime: '10:00',
    endTime: '10:30',
    timezone: 'Asia/Kolkata',
  });
  report('1.1 checkAvailability returns valid availability object', typeof avail.available === 'boolean');

  // Find two available slots for reliable testing
  let slot1Start = '11:00';
  let slot1End = '11:30';
  let slot2Start = '12:00';
  let slot2End = '12:30';

  const candidateHours = [10, 11, 12, 14, 15, 16, 17];
  const freeSlots: string[] = [];
  for (const h of candidateHours) {
    const sTime = `${String(h).padStart(2, '0')}:00`;
    const eTime = `${String(h).padStart(2, '0')}:30`;
    const check = await checkAvailability({
      date: testDateIso,
      startTime: sTime,
      endTime: eTime,
      timezone: 'Asia/Kolkata',
    });
    if (check.available) {
      freeSlots.push(sTime);
    }
    if (freeSlots.length >= 2) break;
  }

  if (freeSlots.length >= 2) {
    slot1Start = freeSlots[0];
    const h1 = parseInt(slot1Start.split(':')[0], 10);
    slot1End = `${String(h1).padStart(2, '0')}:30`;

    slot2Start = freeSlots[1];
    const h2 = parseInt(slot2Start.split(':')[0], 10);
    slot2End = `${String(h2).padStart(2, '0')}:30`;
  }

  // Test 1.2: Dynamic Timezone Normalization (no hardcoded dates)
  const norm = normalizeDateTimes(testDateIso, slot1Start, slot1End, 'Asia/Kolkata');
  report(
    '1.2 Timezone offset handling for Asia/Kolkata',
    norm.startIso.includes('+05:30') && norm.startIso.startsWith(testDateIso),
    `Normalized start: ${norm.startIso}`,
  );

  // Test 1.3: Booking with real/mock Google Calendar
  const bookSessionId = `test-sess-${Date.now()}`;
  const bookRes = await bookMeeting({
    title: 'Agora Voice AI Demo — Test Prospect',
    start: norm.startIso,
    end: norm.endIso,
    timezone: 'Asia/Kolkata',
    customerName: 'Test Prospect',
    customerEmail: TEST_RECIPIENT,
    conversationId: bookSessionId,
  });
  report(
    '1.3 bookMeeting creates appointment with eventId and Meet URL',
    bookRes.success === true && Boolean(bookRes.eventId || bookRes.calendarEventId),
    `Event ID: ${bookRes.eventId || bookRes.calendarEventId}, Meet URL: ${bookRes.meetingUrl}`,
  );

  // Test 1.4: Idempotent duplicate booking protection
  const dupRes = await bookMeeting({
    title: 'Agora Voice AI Demo — Test Prospect',
    start: norm.startIso,
    end: norm.endIso,
    timezone: 'Asia/Kolkata',
    customerName: 'Test Prospect',
    customerEmail: TEST_RECIPIENT,
    conversationId: bookSessionId,
  });
  report(
    '1.4 Duplicate booking call returns idempotent cached result',
    dupRes.success === true && dupRes.idempotent === true && dupRes.eventId === bookRes.eventId,
  );

  // Test 1.5: Reschedule meeting
  if (bookRes.calendarEventId || bookRes.eventId) {
    const eventId = bookRes.calendarEventId || bookRes.eventId!;
    const newNorm = normalizeDateTimes(testDateIso, slot2Start, slot2End, 'Asia/Kolkata');
    const reschedRes = await rescheduleMeeting({
      calendarEventId: eventId,
      newStart: newNorm.startIso,
      newEnd: newNorm.endIso,
      timezone: 'Asia/Kolkata',
      customerName: 'Test Prospect',
      customerEmail: TEST_RECIPIENT,
    });
    report(
      '1.5 rescheduleMeeting updates appointment slot',
      reschedRes.success === true && reschedRes.calendarEventId === eventId,
      JSON.stringify(reschedRes),
    );

    // Test 1.6: Cancellation
    const cancelRes = await cancelMeeting({ calendarEventId: eventId });
    report(
      '1.6 cancelMeeting cancels appointment',
      cancelRes.success === true && cancelRes.status === 'cancelled',
    );
  }

  // Test 1.7: Never Falsely Confirm (API failure simulation)
  setMockFailureMode(true);
  try {
    const failedBook = await bookMeeting({
      title: 'Failing Meeting Test',
      start: norm.startIso,
      end: norm.endIso,
      timezone: 'Asia/Kolkata',
      customerName: 'Fail Test',
      customerEmail: TEST_RECIPIENT,
      conversationId: `fail-sess-${Date.now()}`,
    });
    report(
      '1.7 Never falsely confirm on API failure',
      failedBook.success === false && !failedBook.calendarEventId,
      `Returned: success=${failedBook.success}, error="${failedBook.error}"`,
    );
  } finally {
    setMockFailureMode(false);
  }

  // ----------------------------------------------------------------
  // PART 2: EMAIL RELIABILITY
  // ----------------------------------------------------------------
  console.log('\n--- 2. EMAIL TESTS ---');

  // Test 2.1: Invalid recipient rejected
  const invalidEmailRes = await sendEmail({
    to: 'invalid-address',
    subject: 'Test Subject',
    bodyText: 'Hello',
  });
  report(
    '2.1 Invalid recipient rejected without API call',
    invalidEmailRes.success === false && invalidEmailRes.errorCode === 'invalid_email',
  );

  // Test 2.2: Send meeting confirmation with professional formatting
  const confRes = await sendMeetingConfirmation({
    customerName: 'Manish',
    customerEmail: TEST_RECIPIENT,
    company: 'Enterprise Corp',
    meetingTitle: 'Agora Voice AI Demo & Consultation',
    start: norm.startIso,
    end: norm.endIso,
    timezone: 'Asia/Kolkata',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    calendarEventId: 'mock-evt-12345',
  });
  report(
    '2.2 sendMeetingConfirmation delivers email successfully',
    confRes.success === true && Boolean(confRes.messageId || confRes.message_id),
    `Delivered to: ${confRes.recipient}, Message ID: ${confRes.messageId || confRes.message_id}`,
  );

  // Test 2.3: Email Idempotency (prevent duplicate confirmation dispatch)
  const dupEmailRes = await sendMeetingConfirmation({
    customerName: 'Manish',
    customerEmail: TEST_RECIPIENT,
    company: 'Enterprise Corp',
    meetingTitle: 'Agora Voice AI Demo & Consultation',
    start: norm.startIso,
    end: norm.endIso,
    timezone: 'Asia/Kolkata',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    calendarEventId: 'mock-evt-12345',
  });
  report(
    '2.3 Duplicate meeting confirmation prevented via idempotency',
    dupEmailRes.success === true && dupEmailRes.idempotent === true,
  );

  // Test 2.4: Calendar/Email Failure Independence
  // If calendar succeeds and email fails, booking must be preserved!
  setMockEmailFailureMode(true);
  try {
    const emailFailRes = await sendMeetingConfirmation({
      customerName: 'Manish',
      customerEmail: TEST_RECIPIENT,
      meetingTitle: 'Agora Demo',
      start: norm.startIso,
      end: norm.endIso,
      timezone: 'Asia/Kolkata',
      calendarEventId: 'mock-evt-failure-test',
    });
    report(
      '2.4 Email failure is isolated without crashing',
      emailFailRes.success === false && emailFailRes.errorCode === 'api_unavailable',
    );
  } finally {
    setMockEmailFailureMode(false);
  }

  // ----------------------------------------------------------------
  // PART 3: ESCALATION RELIABILITY
  // ----------------------------------------------------------------
  console.log('\n--- 3. ESCALATION TESTS ---');

  // Test 3.1: Detection of Payment and Billing issues
  const det1 = detectEscalation('My payment failed when trying to upgrade');
  report(
    '3.1 detectEscalation identifies PAYMENT_BILLING',
    det1.shouldEscalate === true && det1.category === 'PAYMENT_BILLING' && det1.priority === 'HIGH',
  );

  // Test 3.2: Detection of Double Charge
  const det2 = detectEscalation('I was charged twice on my credit card!');
  report(
    '3.2 detectEscalation identifies CRITICAL priority on double charge',
    det2.shouldEscalate === true && det2.category === 'PAYMENT_BILLING' && det2.priority === 'CRITICAL',
  );

  // Test 3.3: Detection of Refund Request
  const det3 = detectEscalation('I need a refund for my latest subscription payment');
  report(
    '3.3 detectEscalation identifies REFUND_REQUEST',
    det3.shouldEscalate === true && det3.category === 'REFUND_REQUEST',
  );

  // Test 3.4: Detection of Human Request
  const det4 = detectEscalation('Can I talk to a human sales rep?');
  report(
    '3.4 detectEscalation identifies HUMAN_REQUEST',
    det4.shouldEscalate === true && det4.category === 'HUMAN_REQUEST',
  );

  // Test 3.5: Detection of Unresolved Support
  const det5 = detectEscalation('My account is locked and this isn’t working at all');
  report(
    '3.5 detectEscalation identifies UNRESOLVED_SUPPORT',
    det5.shouldEscalate === true && det5.category === 'UNRESOLVED_SUPPORT',
  );

  // Test 3.6: Deterministic Routing for Payment / Billing
  const routeBilling = resolveEscalationRecipient('PAYMENT_BILLING');
  report(
    '3.6 Payment issues deterministically route to configured escalation recipient',
    routeBilling.recipient === ESCALATION_RECIPIENT,
    `Destination: ${routeBilling.recipient}`,
  );

  // Test 3.7: escalateToHuman canonical service execution
  const escSessionId = `test-esc-session-${Date.now()}`;
  const escRes = await escalateToHuman({
    category: 'PAYMENT_BILLING',
    priority: 'HIGH',
    prospect: {
      name: 'Manish',
      email: TEST_RECIPIENT,
      company: 'Test Corp',
      phone: '+1 555-0199',
    },
    issueSummary: 'Prospect payment was charged but account was not activated',
    conversationSummary: 'Prospect: My payment went through but account is not active.',
    requestedAction: 'Check Stripe/payment status and activate account.',
    sessionId: escSessionId,
  });

  report(
    '3.7 escalateToHuman sends email and returns reassuring directive',
    escRes.success === true &&
      escRes.status === 'SENT' &&
      escRes.recipient === ESCALATION_RECIPIENT &&
      escRes.speechDirective.includes('billing issues directly'),
    `Escalation ID: ${escRes.escalationId}, Directive: "${escRes.speechDirective}"`,
  );

  // Test 3.8: Anti-Duplicate Escalation Protection
  const dupEscRes = await escalateToHuman({
    category: 'PAYMENT_BILLING',
    priority: 'HIGH',
    prospect: {
      name: 'Manish',
      email: TEST_RECIPIENT,
    },
    issueSummary: 'Prospect repeating payment failure',
    sessionId: escSessionId,
  });

  report(
    '3.8 Repeated escalation in same session prevented (idempotent)',
    dupEscRes.success === true && dupEscRes.idempotent === true && dupEscRes.escalationId === escRes.escalationId,
  );

  // Test 3.9: Escalation in Brain halts normal sales qualification
  const brainTurnResult = await processSalesBrain({
    sessionId: `test-brain-esc-${Date.now()}`,
    messages: [
      { role: 'user', content: 'My payment failed when I tried to pay today.' },
    ],
  });

  report(
    '3.9 Escalation halts normal sales qualification and sets stage to follow_up',
    brainTurnResult.salesState.nextBestActionCategory === 'ESCALATE' &&
      brainTurnResult.salesState.salesStage === 'follow_up' &&
      Boolean(brainTurnResult.escalationDirective) &&
      brainTurnResult.systemPrompt.includes('ESCALATION ACTIVE'),
    `Directive generated: "${brainTurnResult.escalationDirective}"`,
  );

  console.log('\n====================================================');
  console.log(`🎉 ALL ${totalChecks} PHASE 2 RELIABILITY CHECKS PASSED (${passedChecks}/${totalChecks})`);
  console.log('====================================================\n');
}

runPhase2Verification().catch((err) => {
  console.error('\n❌ Phase 2 Verification Failed:', err);
  process.exit(1);
});
