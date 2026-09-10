import assert from 'node:assert';
import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}

import {
  buildMeetingConfirmationTemplate,
  buildEscalationTemplate,
  sendEmail,
  sendMeetingConfirmation,
  setMockEmailFailureMode,
  resetEmailClient,
} from '../lib/email';
import {
  bookMeeting,
  setMockFailureMode,
  resetCalendarClient,
  normalizeDateTimes,
  checkAvailability,
  getGoogleOAuthToken,
  getCalendarId,
} from '../lib/calendar';
import {
  detectEscalation,
  resolveEscalationRecipient,
  escalateToHuman,
  resetEscalationStore,
} from '../lib/escalation';
import { processSalesBrain } from '../lib/sales/brain';
import { executeLiveVoiceBookingFlow } from '../lib/sales/calendar-helper';
import { createInitialSalesState } from '../lib/sales/tracker';

const TEST_RECIPIENT = process.env.TEST_EMAIL || 'manishrevathi2008@gmail.com';
const ESCALATION_RECIPIENT = process.env.ESCALATION_EMAIL || 'yadhurajsp@gmail.com';

let totalTests = 0;
let passedTests = 0;

function check(name: string, condition: boolean, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
    if (details) console.log(`   ${details}`);
  } else {
    console.error(`❌ [FAIL] ${name}`);
    if (details) console.error(`   ${details}`);
    throw new Error(`Assertion failed: ${name}`);
  }
}

async function cleanupPriorTestEvents() {
  const token = await getGoogleOAuthToken();
  const calId = getCalendarId();
  if (!token) return;
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?q=Agora%20Phase3%20Scenario&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const data = (await res.json()) as { items?: Array<{ id: string; status?: string; summary?: string }> };
      for (const item of data.items || []) {
        if (item.id && item.status !== 'cancelled') {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(item.id)}?sendUpdates=none`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
          );
        }
      }
    }
  } catch (err) {
    console.warn('[Cleanup] Old events cleanup note:', err);
  }
}

async function runPhase3ScenarioVerification() {
  console.log('====================================================');
  console.log('   PHASE 3: PREMIUM EMAIL & 5 USER SCENARIOS VERIFICATION   ');
  console.log('====================================================\n');

  resetCalendarClient();
  resetEmailClient();
  resetEscalationStore();
  await cleanupPriorTestEvents();

  // ----------------------------------------------------------------
  // 1. TEMPLATE QUALITY & RENDERING TESTS
  // ----------------------------------------------------------------
  console.log('--- 1. EMAIL TEMPLATE RENDERING TESTS ---');

  const confTemplate = buildMeetingConfirmationTemplate({
    customerName: 'Manish Revathi',
    customerEmail: TEST_RECIPIENT,
    company: 'NextGen Voice AI',
    meetingTitle: 'Agora Conversational AI Architecture Review & Demo',
    dateStr: 'Saturday, September 12, 2026',
    timeStr: '11:00 AM – 11:30 AM',
    timezone: 'Asia/Kolkata',
    meetingUrl: 'https://meet.google.com/xyz-uvwx-rst',
    calendarEventId: 'evt-test-render-12345',
    topicsDiscussed: ['Sub-500ms voice pipeline', 'WebRTC & SIP integration'],
  });

  check('1.1 Confirmation template has clean subject', confTemplate.subject.includes('Your Agora demo is confirmed'));
  check('1.2 Confirmation template has no undefined or null strings',
    !confTemplate.html.includes('undefined') &&
    !confTemplate.html.includes('null') &&
    !confTemplate.html.includes('NaN') &&
    !confTemplate.html.includes('[object Object]'),
  );
  check('1.3 Confirmation template includes Google Meet link and button',
    confTemplate.html.includes('https://meet.google.com/xyz-uvwx-rst') &&
    confTemplate.html.includes('Join Google Meet'),
  );
  check('1.4 Confirmation template includes agenda items & how-to-prepare',
    confTemplate.html.includes('What We\'ll Cover') &&
    confTemplate.html.includes('How to Prepare'),
  );
  check('1.5 Confirmation template includes complete plaintext version',
    confTemplate.text.includes('MEETING DETAILS') &&
    confTemplate.text.includes('https://meet.google.com/xyz-uvwx-rst'),
  );

  const escTemplate = buildEscalationTemplate({
    category: 'PAYMENT_BILLING',
    priority: 'CRITICAL',
    prospectName: 'Manish Revathi',
    prospectEmail: TEST_RECIPIENT,
    prospectPhone: '+1-555-0199',
    company: 'Enterprise Corp',
    issueDescription: 'Customer charged twice for monthly subscription',
    conversationSummary: 'Prospect: I was charged two times for the pro tier.',
    recommendedAction: 'Verify transaction history in billing portal and issue refund for duplicate.',
    sessionId: 'sess-phase3-esc-123',
  });

  check('1.6 Escalation template has scannable subject with priority',
    escTemplate.subject.includes('[Agora Escalation]') &&
    escTemplate.subject.includes('CRITICAL') &&
    escTemplate.subject.includes('Manish Revathi'),
  );
  check('1.7 Escalation template has no unescaped errors or undefined values',
    !escTemplate.html.includes('undefined') &&
    !escTemplate.html.includes('null') &&
    !escTemplate.html.includes('[object Object]'),
  );
  check('1.8 Escalation template contains reply button and session ID',
    escTemplate.html.includes(`mailto:${TEST_RECIPIENT}`) &&
    escTemplate.html.includes('sess-phase3-esc-123'),
  );

  // ----------------------------------------------------------------
  // 2. SCENARIO A: DEMO BOOKING (Success Flow)
  // ----------------------------------------------------------------
  console.log('\n--- 2. SCENARIO A: DEMO BOOKING (END-TO-END SUCCESS) ---');
  
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 3);
  const testDateIso = testDate.toISOString().split('T')[0];

  // Dynamically find a free slot
  let testHour = '14:00';
  let testEndHour = '14:30';
  for (const h of [10, 11, 14, 15, 16]) {
    const s = `${String(h).padStart(2, '0')}:00`;
    const e = `${String(h).padStart(2, '0')}:30`;
    const avail = await checkAvailability({
      date: testDateIso,
      startTime: s,
      endTime: e,
      timezone: 'Asia/Kolkata',
    });
    if (avail.available) {
      testHour = s;
      testEndHour = e;
      break;
    }
  }

  const normSlot = normalizeDateTimes(testDateIso, testHour, testEndHour, 'Asia/Kolkata');
  const scenarioASessionId = `scenario-a-${Date.now()}`;

  const stateA = createInitialSalesState(scenarioASessionId);
  stateA.customerName = 'Manish Revathi';
  stateA.customerEmail = TEST_RECIPIENT;
  stateA.company = 'Agora Enterprise Partner';
  stateA.meetingDate = testDateIso;
  stateA.meetingTime = testHour;
  stateA.appointmentRequested = true;

  const bookingFlowResult = await executeLiveVoiceBookingFlow(
    stateA,
    `Let's book the demo for ${testDateIso} at ${testHour}`,
    scenarioASessionId,
  );

  check('Scenario A: Calendar event created with real ID',
    bookingFlowResult.calendarSuccess === true &&
    Boolean(bookingFlowResult.state.calendarEventId),
    `Calendar Event ID: ${bookingFlowResult.state.calendarEventId}`,
  );
  check('Scenario A: Google Meet link generated and attached',
    Boolean(bookingFlowResult.state.meetingUrl?.includes('meet.google.com')),
    `Meet Link: ${bookingFlowResult.state.meetingUrl}`,
  );
  check('Scenario A: Confirmation email sent to prospect',
    bookingFlowResult.emailSuccess === true &&
    bookingFlowResult.state.confirmationEmailStatus === 'sent',
  );
  check('Scenario A: Speech directive accurately confirms booking and email dispatch',
    Boolean(bookingFlowResult.speechDirective?.includes('scheduled your demo')) &&
    Boolean(bookingFlowResult.speechDirective?.includes(TEST_RECIPIENT)),
    `Directive: "${bookingFlowResult.speechDirective}"`,
  );

  // ----------------------------------------------------------------
  // 3. SCENARIO B: PAYMENT ISSUE ESCALATION
  // ----------------------------------------------------------------
  console.log('\n--- 3. SCENARIO B: PAYMENT ISSUE ESCALATION ---');

  const scenarioBSessionId = `scenario-b-${Date.now()}`;
  const brainResultB = await processSalesBrain({
    sessionId: scenarioBSessionId,
    messages: [
      { role: 'user', content: 'I was charged twice for my subscription this morning, please fix this!' },
    ],
  });

  check('Scenario B: Escalation detected as PAYMENT_BILLING with CRITICAL priority',
    brainResultB.salesState.escalation?.category === 'PAYMENT_BILLING' &&
    brainResultB.salesState.escalation?.priority === 'CRITICAL',
  );
  check('Scenario B: Escalation email routed to configured escalation recipient',
    brainResultB.salesState.escalation?.recipient === ESCALATION_RECIPIENT &&
    brainResultB.salesState.escalation?.status === 'SENT',
    `Routed to: ${brainResultB.salesState.escalation?.recipient}`,
  );
  check('Scenario B: Sales qualification halted and sales stage set to follow_up',
    brainResultB.salesState.salesStage === 'follow_up' &&
    brainResultB.salesState.nextBestActionCategory === 'ESCALATE',
  );
  check('Scenario B: Speech directive provides reassuring billing acknowledgment without false promises',
    brainResultB.escalationDirective?.includes("I can't access or resolve billing issues directly") === true &&
    brainResultB.escalationDirective?.includes("escalated this to our team") === true,
    `Directive: "${brainResultB.escalationDirective}"`,
  );
  check('Scenario B: System prompt includes strict escalation constraint prohibiting sales pitch',
    brainResultB.systemPrompt.includes('MANDATORY CONVERSATIONAL DIRECTIVE (HUMAN / BILLING ESCALATION ACTIVE)') &&
    brainResultB.systemPrompt.includes('DO NOT try to sell, pitch, or qualify'),
  );

  // ----------------------------------------------------------------
  // 4. SCENARIO C: HUMAN ASSISTANCE REQUEST
  // ----------------------------------------------------------------
  console.log('\n--- 4. SCENARIO C: HUMAN ASSISTANCE REQUEST ---');

  const scenarioCSessionId = `scenario-c-${Date.now()}`;
  const brainResultC = await processSalesBrain({
    sessionId: scenarioCSessionId,
    messages: [
      { role: 'user', content: 'Can I speak to a human sales rep?' },
    ],
  });

  check('Scenario C: Escalation detected as HUMAN_REQUEST',
    brainResultC.salesState.escalation?.category === 'HUMAN_REQUEST',
  );
  check('Scenario C: Dispatched to escalation recipient',
    brainResultC.salesState.escalation?.recipient === ESCALATION_RECIPIENT &&
    brainResultC.salesState.escalation?.status === 'SENT',
  );
  check('Scenario C: Speech directive confirms human handoff gracefully',
    brainResultC.escalationDirective?.includes("passed this to our team") === true ||
    brainResultC.escalationDirective?.includes("follow up with you directly") === true,
    `Directive: "${brainResultC.escalationDirective}"`,
  );

  // ----------------------------------------------------------------
  // 5. SCENARIO D: CALENDAR FAILURE (Never Falsely Confirm)
  // ----------------------------------------------------------------
  console.log('\n--- 5. SCENARIO D: CALENDAR FAILURE ---');

  setMockFailureMode(true);
  try {
    const scenarioDSessionId = `scenario-d-${Date.now()}`;
    const stateD = createInitialSalesState(scenarioDSessionId);
    stateD.customerName = 'Test User';
    stateD.customerEmail = TEST_RECIPIENT;
    stateD.meetingDate = testDateIso;
    stateD.meetingTime = '10:00';
    stateD.appointmentRequested = true;

    const resultD = await executeLiveVoiceBookingFlow(
      stateD,
      `Schedule meeting on ${testDateIso} at 10:00`,
      scenarioDSessionId,
    );

    check('Scenario D: Calendar failure correctly marked as failed',
      resultD.calendarSuccess === false &&
      resultD.state.appointmentStatus === 'failed',
    );
    check('Scenario D: No calendarEventId or meeting link created',
      !resultD.state.calendarEventId &&
      !resultD.state.meetingUrl,
    );
    check('Scenario D: No confirmation email sent on calendar failure',
      resultD.state.confirmationEmailStatus === 'none' ||
      resultD.state.confirmationEmailStatus === 'failed',
    );
    check('Scenario D: Speech directive honestly informs user of error without false confirmation',
      !resultD.speechDirective?.toLowerCase().includes('i have scheduled your demo') &&
      Boolean(resultD.speechDirective && (
        resultD.speechDirective.includes('calendar error') ||
        resultD.speechDirective.includes('not available') ||
        resultD.speechDirective.includes("wasn't able to")
      )),
      `Directive: "${resultD.speechDirective}"`,
    );
  } finally {
    setMockFailureMode(false);
  }

  // ----------------------------------------------------------------
  // 6. SCENARIO E: EMAIL FAILURE ISOLATION (Meeting Preserved)
  // ----------------------------------------------------------------
  console.log('\n--- 6. SCENARIO E: EMAIL FAILURE ISOLATION ---');

  setMockEmailFailureMode(true);
  try {
    const scenarioESessionId = `scenario-e-${Date.now()}`;
    const stateE = createInitialSalesState(scenarioESessionId);
    stateE.customerName = 'Manish Revathi';
    stateE.customerEmail = TEST_RECIPIENT;
    stateE.company = 'Agora Partner';
    stateE.meetingDate = testDateIso;
    // Find another slot
    stateE.meetingTime = testEndHour;
    stateE.appointmentRequested = true;

    const resultE = await executeLiveVoiceBookingFlow(
      stateE,
      `Book demo for ${testDateIso} at ${testEndHour}`,
      scenarioESessionId,
    );

    check('Scenario E: Calendar booking succeeds and event is preserved',
      resultE.calendarSuccess === true &&
      Boolean(resultE.state.calendarEventId),
      `Preserved Calendar Event ID: ${resultE.state.calendarEventId}`,
    );
    check('Scenario E: Email failure recorded without rolling back calendar appointment',
      resultE.emailSuccess === false &&
      resultE.state.confirmationEmailStatus === 'failed' &&
      resultE.state.appointmentStatus === 'confirmed',
    );
    check('Scenario E: Speech directive honestly reports meeting is scheduled but email failed',
      Boolean(resultE.speechDirective?.includes('meeting is scheduled')) &&
      Boolean(resultE.speechDirective?.includes("couldn't send the confirmation email")),
      `Directive: "${resultE.speechDirective}"`,
    );
  } finally {
    setMockEmailFailureMode(false);
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${totalTests} PHASE 3 SCENARIO VERIFICATIONS PASSED (${passedTests}/${totalTests})`);
  console.log('====================================================\n');
}

runPhase3ScenarioVerification().catch((err) => {
  console.error('\n❌ Phase 3 Scenario Verification Failed:', err);
  process.exit(1);
});
