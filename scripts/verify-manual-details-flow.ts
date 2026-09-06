import {
  createInitialSalesState,
  analyzeAndUpdateSalesState,
  getNextSalesQuestion,
  getNextRequiredInformation,
  determineNextInfoToCollect,
  submitCustomerDetails,
  hasKnownName,
  hasKnownEmail,
  hasKnownCompany,
  hasKnownPhone,
} from '../lib/sales/tracker';
import { processSalesBrain } from '../lib/sales/brain';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`[Assertion Failure] ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function runManualDetailsFlowTests() {
  console.log('====================================================');
  console.log('  Manual Details & Intelligent Appointment Flow Tests');
  console.log('====================================================\n');

  // ====================================================
  // FLOW A: USER CHOOSES MANUAL DETAILS FIRST
  // ====================================================
  console.log('--- Flow A: User Chooses Manual Details First ---');
  {
    const stateA0 = createInitialSalesState('flow-a-session');
    const stateA1 = analyzeAndUpdateSalesState(stateA0, [
      { role: 'user', content: "I'll enter my details manually." },
    ]);

    assert(stateA1.detailsInputMode === 'manual', 'Flow A: detailsInputMode must be "manual"');
    assert(
      stateA1.pendingDetailsRequest !== null && stateA1.pendingDetailsRequest !== undefined,
      'Flow A: pendingDetailsRequest must be created',
    );
    assert(
      stateA1.pendingDetailsRequest?.status === 'pending',
      'Flow A: Customer Details modal must be open (status pending)',
    );

    const questionA = getNextSalesQuestion(stateA1, "I'll enter my details manually.");
    assert(questionA !== null, 'Flow A: AI must provide a conversational response');
    assert(
      questionA?.question.includes('enter your details in the form') ||
        questionA?.field === 'manualDetails',
      `Flow A: AI must say: "Sure, you can enter your details in the form." (actual: "${questionA?.question}")`,
    );

    const requiredA = getNextRequiredInformation(stateA1);
    assert(
      requiredA === null,
      `Flow A: AI must NOT verbally ask for customer details (actual: ${requiredA?.field})`,
    );

    const nextInfoA = determineNextInfoToCollect(
      stateA1,
      stateA1.checklist,
      "I'll enter my details manually.",
      "I'll enter my details manually.",
    );
    assert(
      nextInfoA?.field === 'manualDetails',
      'Flow A: Target info to collect must be manualDetails',
    );
  }

  // ====================================================
  // FLOW B: USER REQUESTS MEETING WITH PARTIAL INFO
  // ====================================================
  console.log('\n--- Flow B: User Requests Meeting with Partial Info ---');
  {
    const stateB0 = createInitialSalesState('flow-b-session');
    // Turn 1: "I want a meeting on Monday."
    const stateB1 = analyzeAndUpdateSalesState(stateB0, [
      { role: 'user', content: 'I want a meeting on Monday.' },
    ]);

    assert(stateB1.appointment.meetingRequested === true, 'Flow B: meetingRequested must be true');
    assert(stateB1.appointment.preferredDate === '2026-09-07', 'Flow B: preferredDate must be Monday (2026-09-07)');
    assert(stateB1.appointment.preferredTime === null, 'Flow B: preferredTime must be null');
    assert(
      !stateB1.pendingDetailsRequest || stateB1.pendingDetailsRequest.status !== 'pending',
      'Flow B: Customer Details modal must stay CLOSED when date/time info is incomplete',
    );

    const questionB1 = getNextSalesQuestion(stateB1, 'I want a meeting on Monday.');
    assert(questionB1 !== null, 'Flow B: AI must ask a follow-up question');
    assert(
      questionB1?.field === 'preferredTime',
      `Flow B: AI target field must be preferredTime (actual: ${questionB1?.field})`,
    );
    assert(
      !!(
        questionB1?.question.toLowerCase().includes('what time') &&
        questionB1?.question.toLowerCase().includes('monday')
      ),
      `Flow B: AI question must ask for time on Monday: "${questionB1?.question}"`,
    );

    // Turn 2: User follows up with "2 PM"
    const stateB2 = analyzeAndUpdateSalesState(stateB1, [
      { role: 'user', content: 'I want a meeting on Monday.' },
      { role: 'assistant', content: 'What time would you like the meeting on Monday?' },
      { role: 'user', content: '2 PM' },
    ]);

    assert(stateB2.appointment.preferredTime === '14:00', 'Flow B Turn 2: preferredTime must be 14:00 (2 PM)');
    assert(stateB2.appointment.selectedSlot !== null, 'Flow B Turn 2: selectedSlot must be set');
  }

  // ====================================================
  // FLOW C: USER CHOOSES MANUAL DETAILS AND GIVES PARTIAL DATE
  // ====================================================
  console.log('\n--- Flow C: User Chooses Manual Details AND Gives Partial Date ---');
  {
    const stateC0 = createInitialSalesState('flow-c-session');
    const stateC1 = analyzeAndUpdateSalesState(stateC0, [
      { role: 'user', content: "I'll enter my details manually, but schedule it for Monday." },
    ]);

    assert(stateC1.detailsInputMode === 'manual', 'Flow C: detailsInputMode must be "manual"');
    assert(stateC1.appointment.meetingRequested === true, 'Flow C: meetingRequested must be true');
    assert(stateC1.appointment.preferredDate === '2026-09-07', 'Flow C: preferredDate must be Monday (2026-09-07)');
    assert(stateC1.appointment.preferredTime === null, 'Flow C: preferredTime must be null');

    assert(
      !!(stateC1.pendingDetailsRequest && stateC1.pendingDetailsRequest.status === 'pending'),
      'Flow C: Customer Details modal must OPEN immediately because user requested manual mode',
    );

    const questionC = getNextSalesQuestion(
      stateC1,
      "I'll enter my details manually, but schedule it for Monday.",
    );
    assert(questionC !== null, 'Flow C: AI must provide a follow-up question');
    assert(
      questionC?.field === 'preferredTime',
      `Flow C: Target field must be preferredTime (actual: ${questionC?.field})`,
    );
    assert(
      !!(
        questionC?.question.toLowerCase().includes('what time') &&
        questionC?.question.toLowerCase().includes('monday')
      ),
      `Flow C: AI must ask ONLY for missing time on Monday: "${questionC?.question}"`,
    );

    const requiredC = getNextRequiredInformation(stateC1);
    assert(
      requiredC?.field === 'preferredTime',
      `Flow C: getNextRequiredInformation must return preferredTime, NOT customer profile fields (actual: ${requiredC?.field})`,
    );
  }

  // ====================================================
  // FLOW D: NEVER ASK FOR EXISTING INFORMATION
  // ====================================================
  console.log('\n--- Flow D: Never Ask for Existing Information ---');
  {
    const stateD0 = createInitialSalesState('flow-d-session');
    stateD0.customer.fullName = 'Alex Vance';
    stateD0.customerName = 'Alex Vance';
    stateD0.customer.email = 'alex@corp.com';
    stateD0.customerEmail = 'alex@corp.com';
    stateD0.email = 'alex@corp.com';
    stateD0.customer.company = 'CloudCorp';
    stateD0.company = 'CloudCorp';
    stateD0.customer.phone = '+1 555 123 4567';
    stateD0.phone = '+1 555 123 4567';

    assert(hasKnownName(stateD0), 'Flow D: hasKnownName must be true');
    assert(hasKnownEmail(stateD0), 'Flow D: hasKnownEmail must be true');
    assert(hasKnownCompany(stateD0), 'Flow D: hasKnownCompany must be true');
    assert(hasKnownPhone(stateD0), 'Flow D: hasKnownPhone must be true');

    const questionD = getNextSalesQuestion(stateD0, 'Can we set up a demo?');
    assert(
      questionD?.field !== 'name' &&
        questionD?.field !== 'email' &&
        questionD?.field !== 'company' &&
        questionD?.field !== 'phone',
      `Flow D: AI must NEVER ask for existing name/email/company/phone (actual ask: ${questionD?.field})`,
    );

    // Partial update: "Actually use my work email alex.vance@enterprise.com"
    const stateD1 = analyzeAndUpdateSalesState(stateD0, [
      { role: 'user', content: 'Actually use my work email alex.vance@enterprise.com' },
    ]);

    assert(
      stateD1.customer.fullName === 'Alex Vance',
      'Flow D: Existing name Alex Vance must be preserved',
    );
    assert(
      stateD1.customer.company === 'CloudCorp',
      'Flow D: Existing company CloudCorp must be preserved',
    );
    assert(
      stateD1.customer.phone === '+1 555 123 4567',
      'Flow D: Existing phone +1 555 123 4567 must be preserved',
    );
  }

  // ====================================================
  // FORM SUBMISSION OVERRIDES & RESUME
  // ====================================================
  console.log('\n--- Form Submission Overrides & Resume ---');
  {
    const stateE0 = createInitialSalesState('flow-e-session');
    stateE0.detailsInputMode = 'manual';
    stateE0.appointment.meetingRequested = true;
    stateE0.appointment.preferredDate = '2026-09-08';
    stateE0.appointment.preferredTime = '15:00';
    stateE0.appointment.duration = 30;
    stateE0.appointment.selectedSlot = {
      start: '2026-09-08T15:00:00-04:00',
      end: '2026-09-08T15:30:00-04:00',
      formattedTime: 'Tuesday, Sep 8 at 3:00 PM (America/New_York)',
      available: true,
    };

    const { state: stateE1 } = await submitCustomerDetails(stateE0, {
      fullName: 'Jordan Lee',
      email: 'jordan.lee@realcorp.com',
      company: 'RealCorp Inc',
      phone: '+1 415 555 9876',
    });

    assert(stateE1.customer.fullName === 'Jordan Lee', 'Form Submission: fullName stored');
    assert(stateE1.customer.email === 'jordan.lee@realcorp.com', 'Form Submission: email stored');
    assert(stateE1.customer.company === 'RealCorp Inc', 'Form Submission: company stored');
    assert(stateE1.customer.manualOverrides?.fullName === true, 'Form Submission: manualOverrides.fullName set');
    assert(stateE1.customer.manualOverrides?.email === true, 'Form Submission: manualOverrides.email set');
    assert(stateE1.pendingDetailsRequest?.status === 'submitted', 'Form Submission: pendingDetailsRequest status is submitted');
  }

  // ====================================================
  // SALES BRAIN SYSTEM PROMPT GROUNDING
  // ====================================================
  console.log('\n--- Sales Brain System Prompt Grounding ---');
  {
    const stateF0 = createInitialSalesState('flow-f-session');
    stateF0.detailsInputMode = 'manual';
    const brainResult = await processSalesBrain({
      companyId: 'default-company',
      sessionId: 'flow-f-session',
      messages: [{ role: 'user', content: "I'll enter my details manually." }],
    });

    assert(
      brainResult.systemPrompt.includes('MANUAL DETAILS MODE ACTIVE'),
      'Sales Brain: Prompt includes MANUAL DETAILS MODE ACTIVE directive',
    );
    assert(
      brainResult.systemPrompt.includes('DO NOT verbally ask for'),
      'Sales Brain: Prompt includes strict constraint not to verbally ask for customer details',
    );
  }

  console.log('\n====================================================');
  console.log('  All Manual Details & Appointment Flow Tests Passed! 🎉');
  console.log('====================================================');
}

runManualDetailsFlowTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
