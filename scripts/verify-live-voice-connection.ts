import fs from 'fs';
import path from 'path';
import {
  updateSessionSalesState,
  createInitialSalesState,
} from '../lib/sales/tracker';
import { processSalesBrain } from '../lib/sales/brain';
import {
  createCalendarMeeting,
  resetMockCalendar,
} from '../lib/calendar/tools';
import { normalizeDateTimes } from '../lib/calendar/google';
import { resetMockEmail } from '../lib/email/gmail';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

async function runLiveVoiceConnectionTests() {
  console.log('====================================================');
  console.log('  Live Voice Agent SalesState & Tools Verification  ');
  console.log('====================================================\n');

  resetMockCalendar();
  resetMockEmail();

  // ─────────────────────────────────────────────────────────────
  // TEST A: End-to-End Voice Booking & Confirmation Flow
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST A: Voice Booking Flow (User provides info -> Books meeting) ---');
  const sessionA = 'test-voice-session-a-' + Date.now();

  // Turn 1: User provides name, company, email
  console.log('\n[Test A - Turn 1] User: "I am John from ABC. My email is john@gmail.com."');
  const turn1Result = await processSalesBrain({
    companyId: 'default-company',
    sessionId: sessionA,
    messages: [
      { role: 'user', content: 'I am John from ABC. My email is john@gmail.com.' },
    ],
  });

  const stateA1 = turn1Result.salesState;
  console.log('  -> customerName  :', stateA1.customerName);
  console.log('  -> company       :', stateA1.company);
  console.log('  -> customerEmail :', stateA1.customerEmail);

  if (stateA1.customerName !== 'John') {
    throw new Error(`Test A Failed: expected customerName "John", got "${stateA1.customerName}"`);
  }
  if (stateA1.company !== 'ABC') {
    throw new Error(`Test A Failed: expected company "ABC", got "${stateA1.company}"`);
  }
  if (stateA1.customerEmail !== 'john@gmail.com') {
    throw new Error(`Test A Failed: expected customerEmail "john@gmail.com", got "${stateA1.customerEmail}"`);
  }
  console.log('✓ Turn 1: Customer details saved to SalesState');

  // Turn 2: User schedules meeting
  console.log('\n[Test A - Turn 2] User: "Schedule a meeting on September 10 at 3 PM."');
  const turn2Result = await processSalesBrain({
    companyId: 'default-company',
    sessionId: sessionA,
    messages: [
      { role: 'user', content: 'I am John from ABC. My email is john@gmail.com.' },
      { role: 'assistant', content: 'Nice to meet you, John! How can Agora help ABC today?' },
      { role: 'user', content: 'Schedule a meeting on September 10 at 3 PM.' },
    ],
  });

  const stateA2 = turn2Result.salesState;
  console.log('  -> meetingDate             :', stateA2.meetingDate);
  console.log('  -> meetingTime             :', stateA2.meetingTime);
  console.log('  -> appointmentStatus       :', stateA2.appointmentStatus);
  console.log('  -> calendarEventId         :', stateA2.calendarEventId);
  console.log('  -> meetingUrl              :', stateA2.meetingUrl);
  console.log('  -> confirmationEmailStatus :', stateA2.confirmationEmailStatus);

  if (stateA2.meetingDate !== '2026-09-10') {
    throw new Error(`Test A Failed: expected meetingDate "2026-09-10", got "${stateA2.meetingDate}"`);
  }
  if (stateA2.meetingTime !== '15:00') {
    throw new Error(`Test A Failed: expected meetingTime "15:00", got "${stateA2.meetingTime}"`);
  }
  if (stateA2.appointmentStatus !== 'confirmed') {
    throw new Error(`Test A Failed: expected appointmentStatus "confirmed", got "${stateA2.appointmentStatus}"`);
  }
  if (!stateA2.calendarEventId) {
    throw new Error('Test A Failed: expected calendarEventId to be returned');
  }
  if (stateA2.confirmationEmailStatus !== 'sent') {
    throw new Error(`Test A Failed: expected confirmationEmailStatus "sent", got "${stateA2.confirmationEmailStatus}"`);
  }
  if (!turn2Result.systemPrompt.includes('scheduled your demo') && !turn2Result.systemPrompt.includes('confirmed')) {
    throw new Error('Test A Failed: system prompt directive did not confirm booking');
  }
  console.log('✓ Test A Passed: Customer saved -> Meeting booked -> Confirmation email sent -> Agent confirms booking\n');

  // ─────────────────────────────────────────────────────────────
  // TEST B: User Chooses Manual Details
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST B: User Chooses Manual Details ---');
  const sessionB = 'test-voice-session-b-' + Date.now();

  console.log('[Test B] User: "I\'ll enter my details manually."');
  const resultB = await processSalesBrain({
    companyId: 'default-company',
    sessionId: sessionB,
    messages: [
      { role: 'user', content: "I'll enter my details manually." },
    ],
  });

  const stateB = resultB.salesState;
  console.log('  -> detailsInputMode      :', stateB.detailsInputMode);
  console.log('  -> pendingDetailsRequest :', stateB.pendingDetailsRequest?.actionType, `(status: ${stateB.pendingDetailsRequest?.status})`);

  if (stateB.detailsInputMode !== 'manual') {
    throw new Error(`Test B Failed: expected detailsInputMode "manual", got "${stateB.detailsInputMode}"`);
  }
  if (!stateB.pendingDetailsRequest || stateB.pendingDetailsRequest.status !== 'pending') {
    throw new Error('Test B Failed: customer details popup should be open/pending');
  }
  if (!resultB.systemPrompt.includes('Sure, you can enter your details in the form.')) {
    throw new Error('Test B Failed: system prompt directive did not instruct agent to confirm manual entry');
  }
  if (resultB.systemPrompt.includes('TARGET FIELD TO COLLECT: CUSTOMERNAME')) {
    throw new Error('Test B Failed: agent should NOT verbally ask for customer details in manual mode');
  }
  console.log('✓ Test B Passed: detailsInputMode is manual -> Popup opened -> Zero verbal interrogation -> Confirms form\n');

  // ─────────────────────────────────────────────────────────────
  // TEST C: Date Given Without Time (Details Already in SalesState)
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST C: Date Given Without Time (Details Known) ---');
  const sessionC = 'test-voice-session-c-' + Date.now();
  let stateC = createInitialSalesState(sessionC);
  stateC.customerName = 'Sarah';
  stateC.customerEmail = 'sarah@techcorp.com';
  stateC.company = 'TechCorp';
  stateC.phone = '555-234-5678';
  updateSessionSalesState(sessionC, stateC);

  console.log('[Test C] User: "Schedule a meeting on September 10."');
  const resultC = await processSalesBrain({
    companyId: 'default-company',
    sessionId: sessionC,
    messages: [
      { role: 'user', content: 'Schedule a meeting on September 10.' },
    ],
  });

  const stateCResult = resultC.salesState;
  console.log('  -> meetingDate :', stateCResult.meetingDate);
  console.log('  -> meetingTime :', stateCResult.meetingTime);

  if (stateCResult.meetingDate !== '2026-09-10') {
    throw new Error(`Test C Failed: expected meetingDate "2026-09-10", got "${stateCResult.meetingDate}"`);
  }
  if (stateCResult.meetingTime !== null && stateCResult.meetingTime !== undefined) {
    throw new Error(`Test C Failed: expected meetingTime to be null/undefined, got "${stateCResult.meetingTime}"`);
  }
  if (!resultC.systemPrompt.toLowerCase().includes('what time would you like')) {
    throw new Error('Test C Failed: agent did not ask for meeting time');
  }
  if (resultC.systemPrompt.includes('TARGET FIELD TO COLLECT: CUSTOMERNAME') || resultC.systemPrompt.includes('TARGET FIELD TO COLLECT: EMAIL')) {
    throw new Error('Test C Failed: agent should NOT ask for customer name or email since they already exist');
  }
  console.log('✓ Test C Passed: Agent asks for meeting time only -> Zero name/email interrogation\n');

  // ─────────────────────────────────────────────────────────────
  // TEST D: Time Given Without Date (Details Already in SalesState)
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST D: Time Given Without Date (Details Known) ---');
  const sessionD = 'test-voice-session-d-' + Date.now();
  let stateD = createInitialSalesState(sessionD);
  stateD.customerName = 'Marcus';
  stateD.customerEmail = 'marcus@startup.io';
  stateD.company = 'StartupIO';
  stateD.phone = '555-876-5432';
  updateSessionSalesState(sessionD, stateD);

  console.log('[Test D] User: "I want a meeting at 3 PM."');
  const resultD = await processSalesBrain({
    companyId: 'default-company',
    sessionId: sessionD,
    messages: [
      { role: 'user', content: 'I want a meeting at 3 PM.' },
    ],
  });

  const stateDResult = resultD.salesState;
  console.log('  -> meetingDate :', stateDResult.meetingDate);
  console.log('  -> meetingTime :', stateDResult.meetingTime);

  if (stateDResult.meetingTime !== '15:00') {
    throw new Error(`Test D Failed: expected meetingTime "15:00", got "${stateDResult.meetingTime}"`);
  }
  if (stateDResult.meetingDate !== null && stateDResult.meetingDate !== undefined) {
    throw new Error(`Test D Failed: expected meetingDate to be null/undefined, got "${stateDResult.meetingDate}"`);
  }
  if (!resultD.systemPrompt.toLowerCase().includes('what date would you like')) {
    throw new Error('Test D Failed: agent did not ask for meeting date');
  }
  if (resultD.systemPrompt.includes('TARGET FIELD TO COLLECT: CUSTOMERNAME') || resultD.systemPrompt.includes('TARGET FIELD TO COLLECT: EMAIL')) {
    throw new Error('Test D Failed: agent should NOT ask for customer name or email since they already exist');
  }
  console.log('✓ Test D Passed: Agent asks for meeting date only -> Zero name/email interrogation\n');

  // ─────────────────────────────────────────────────────────────
  // TEST E: Occupied Time / Conflict Handling
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST E: Occupied Time / Conflict Handling ---');
  const sessionE = 'test-voice-session-e-' + Date.now();
  let stateE = createInitialSalesState(sessionE);
  stateE.customerName = 'Elena';
  stateE.customerEmail = 'elena@enterprise.org';
  stateE.company = 'EnterpriseOrg';
  stateE.phone = '555-999-0000';
  stateE.timezone = 'Asia/Kolkata';
  stateE.appointment.timezone = 'Asia/Kolkata';
  updateSessionSalesState(sessionE, stateE);

  // Pre-seed an existing event on September 15 at 10:00 AM using createCalendarMeeting
  const tzE = stateE.timezone;
  const { startIso: preStart, endIso: preEnd } = normalizeDateTimes('2026-09-15', '10:00', '10:30', tzE);
  console.log(`Pre-seeding an existing event on September 15 at 10:00 AM (${tzE})...`);
  const preSeedResult = await createCalendarMeeting({
    title: 'Quarterly Executive Architecture Review (Internal)',
    start: preStart,
    end: preEnd,
    timezone: tzE,
    customerName: 'Executive Team',
    customerEmail: 'exec@enterprise.org',
    meetingPurpose: 'Quarterly Executive Review',
    conversationId: 'pre-seed-conflict',
  });
  console.log('Pre-seeded event ID:', preSeedResult.calendarEventId || preSeedResult.eventId);

  console.log('[Test E] User: "Schedule a meeting on September 15 at 10 AM."');
  const resultE = await processSalesBrain({
    companyId: 'default-company',
    sessionId: sessionE,
    messages: [
      { role: 'user', content: 'Schedule a meeting on September 15 at 10 AM.' },
    ],
  });

  const stateEResult = resultE.salesState;
  console.log('  -> appointmentStatus :', stateEResult.appointmentStatus);
  console.log('  -> calendarEventId   :', stateEResult.calendarEventId);

  if (stateEResult.appointmentStatus === 'confirmed') {
    throw new Error('Test E Failed: appointment should NOT be confirmed for occupied slot');
  }
  if (stateEResult.calendarEventId !== null && stateEResult.calendarEventId !== undefined) {
    throw new Error(`Test E Failed: createCalendarMeeting must NOT be called, but got event ID "${stateEResult.calendarEventId}"`);
  }
  if (!resultE.systemPrompt.includes("isn't available") && !resultE.systemPrompt.includes('Please choose another time') && !resultE.systemPrompt.includes('OCCUPIED')) {
    throw new Error('Test E Failed: system prompt directive did not inform user that the time is unavailable');
  }
  console.log('✓ Test E Passed: Occupied time detected -> createCalendarMeeting NOT called -> User informed to choose another time\n');

  console.log('====================================================');
  console.log('  ALL 5 EXACT VOICE AGENT SCENARIOS PASSED 100%! 🚀 ');
  console.log('====================================================\n');
}

runLiveVoiceConnectionTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
