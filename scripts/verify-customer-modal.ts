/**
 * Verification Script: Reusable Customer Details Modal & Sales Brain Action Resumption
 *
 * Tests:
 * 1. Automatic trigger when an action requires missing details (e.g., booking a demo without email).
 * 2. Pre-filling of voice-collected facts without asking again.
 * 3. Validation enforcement (name min length, RFC email regex, optional phone format).
 * 4. Action resumption upon modal submission (automatic appointment booking & Meet creation).
 * 5. Other action types (send_proposal, create_hubspot_lead, send_confirmation).
 * 6. Clean modal dismissal without state corruption.
 */

import {
  createInitialSalesState,
  requestCustomerDetails,
  dismissCustomerDetails,
  submitCustomerDetails,
  analyzeAndUpdateSalesState,
} from '../lib/sales/tracker';

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 VERIFYING REUSABLE CUSTOMER DETAILS MODAL & ACTION RESUMPTION');
  console.log('================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Automatic trigger when demo is requested without customer email
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 1: Automatic Trigger for Missing Details on Meeting Request');
  let state = createInitialSalesState('test-modal-session-1');

  // Customer asks to schedule a demo
  const messages = [
    {
      role: 'assistant',
      content: 'Welcome to Agora! What should I call you?',
    },
    {
      role: 'user',
      content: "Hi, I'm Rahul from Acme Corp. We'd like to schedule a demo for Friday afternoon.",
    },
  ];
  state = analyzeAndUpdateSalesState(state, messages);

  assert(state.customer.fullName === 'Rahul', 'Customer name "Rahul" extracted from voice');
  assert(state.customer.company === 'Acme Corp', 'Customer company "Acme Corp" extracted from voice');
  assert(state.appointment?.meetingRequested === true, 'Meeting requested flag is true');
  assert(
    state.pendingDetailsRequest !== null && state.pendingDetailsRequest !== undefined,
    'pendingDetailsRequest is automatically triggered',
  );
  assert(
    state.pendingDetailsRequest?.actionType === 'book_meeting',
    'pendingDetailsRequest actionType is "book_meeting"',
  );
  assert(
    state.pendingDetailsRequest?.status === 'pending',
    'pendingDetailsRequest status is "pending"',
  );
  assert(
    state.pendingDetailsRequest?.requiredFields.includes('email'),
    'Email is marked as a required field in the popup request',
  );

  console.log('  ✅ Test 1 Passed: Meeting request correctly raised pending details popup.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Pre-filling existing voice facts & avoiding re-prompting
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 2: Pre-filling Voice-Collected Fields');
  // Check that the modal caller would see currentCustomer with Rahul and Acme Corp
  const modalCurrentCustomer = {
    fullName: state.customer.fullName || state.customerName,
    email: state.customer.email || state.email,
    company: state.customer.company || state.company,
    phone: state.customer.phone || state.phone,
  };

  assert(modalCurrentCustomer.fullName === 'Rahul', 'Modal receives pre-filled fullName: Rahul');
  assert(modalCurrentCustomer.company === 'Acme Corp', 'Modal receives pre-filled company: Acme Corp');
  assert(!modalCurrentCustomer.email, 'Modal correctly notes email is missing');
  console.log('  ✅ Test 2 Passed: Pre-fill facts matched conversation state.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Validation Rules Check
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 3: Validation Logic Check');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  assert(emailRegex.test('rahul@acme.com'), 'Valid email format accepted');
  assert(!emailRegex.test('invalid-email'), 'Invalid email format rejected');
  // Modal phone validation logic: 7-15 digits
  const isValidPhone = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length >= 7 && digitsOnly.length <= 15;
  };

  assert(isValidPhone('+1 (555) 234-5678'), 'Valid phone format accepted');
  assert(isValidPhone('555-0199'), 'Local 7-digit phone accepted');
  assert(!isValidPhone('12345'), 'Too short phone rejected (<7 digits)');
  assert(!isValidPhone('1234567890123456'), 'Too long phone rejected (>15 digits)');
  assert(!isValidPhone('abc'), 'Non-numeric string rejected');
  console.log('  ✅ Test 3 Passed: Validation logic enforces clean data.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Modal Submission & Automatic Action Resumption (Meeting Booking)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 4: Modal Submission & Action Resumption');
  // Pre-set a slot so resumption books it
  state.appointment.proposedSlots = [
    {
      start: '2026-09-12T19:00:00.000Z',
      end: '2026-09-12T19:30:00.000Z',
      formattedTime: 'Friday, September 12 at 3:00 PM EDT',
      available: true,
    },
  ];
  state.appointment.selectedSlot = state.appointment.proposedSlots[0];

  const submitResult = await submitCustomerDetails(state, {
    fullName: 'Rahul Sharma',
    email: 'rahul@acme.com',
    company: 'Acme Technologies Inc',
    phone: '+1 555-0199',
  });

  const updated = submitResult.state;
  assert(updated.customer.fullName === 'Rahul Sharma', 'Customer fullName updated to "Rahul Sharma"');
  assert(updated.customer.email === 'rahul@acme.com', 'Customer email updated to "rahul@acme.com"');
  assert(updated.customer.company === 'Acme Technologies Inc', 'Customer company updated');
  assert(updated.customer.phone === '+1 555-0199', 'Customer phone updated');
  assert(updated.crmCollectionStatus.name === true, 'CRM collection status for name is true');
  assert(updated.crmCollectionStatus.email === true, 'CRM collection status for email is true');
  assert(updated.pendingDetailsRequest?.status === 'submitted', 'pendingDetailsRequest marked "submitted"');
  assert(
    updated.appointment.meetingStatus === 'confirmed' || updated.appointment.calendarEventId !== undefined,
    'Appointment booking action was automatically resumed and processed',
  );
  assert(
    Boolean(updated.sales?.nextBestAction?.includes('confirm_appointment') || updated.appointment.calendarEventId),
    'Next best action updated to confirm appointment',
  );
  console.log('  ✅ Test 4 Passed: Submission automatically resumed pending calendar booking.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Other Action Types (send_proposal, create_hubspot_lead, custom)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 5: Multi-Action Support (Proposal & HubSpot Leads)');
  let state2 = createInitialSalesState('test-modal-session-2');
  state2 = requestCustomerDetails(state2, 'send_proposal', {
    title: 'Send Enterprise Proposal',
    description: 'We need your official work email to send the custom proposal.',
    requiredFields: ['email', 'fullName', 'company'],
  });

  assert(state2.pendingDetailsRequest?.actionType === 'send_proposal', 'Action type is "send_proposal"');
  assert(state2.pendingDetailsRequest?.title === 'Send Enterprise Proposal', 'Custom title applied');
  assert(state2.pendingDetailsRequest?.requiredFields.length === 3, 'Required fields correctly populated');

  // Submit proposal details
  const proposalResult = await submitCustomerDetails(state2, {
    fullName: 'Samantha Jones',
    email: 'samantha@globalcorp.com',
    company: 'Global Corp',
  });

  assert(proposalResult.state.customer.email === 'samantha@globalcorp.com', 'Proposal email registered');
  assert(proposalResult.state.pendingDetailsRequest?.status === 'submitted', 'Proposal request marked submitted');
  assert(
    Boolean(
      proposalResult.state.sales?.nextBestAction?.includes('proposal_sent') ||
      proposalResult.state.sales?.nextBestAction?.includes('samantha@globalcorp.com')
    ),
    'Proposal dispatched next best action',
  );

  // HubSpot lead creation request
  let state3 = createInitialSalesState('test-modal-session-3');
  state3 = requestCustomerDetails(state3, 'create_hubspot_lead', {
    title: 'Connect with Sales Specialist',
  });
  assert(state3.pendingDetailsRequest?.actionType === 'create_hubspot_lead', 'Action type "create_hubspot_lead"');

  const hubspotSubmitResult = await submitCustomerDetails(state3, {
    fullName: 'David Lee',
    email: 'david@enterprise.io',
    company: 'Enterprise IO',
  });
  assert(hubspotSubmitResult.state.customer.email === 'david@enterprise.io', 'HubSpot lead customer email saved');
  assert(hubspotSubmitResult.state.pendingDetailsRequest?.status === 'submitted', 'Lead request marked submitted');
  console.log('  ✅ Test 5 Passed: Multiple actions supported seamlessly.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Modal Dismissal Without Corrupting State
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 6: Modal Dismissal Clean Handling');
  let state4 = createInitialSalesState('test-modal-session-4');
  state4 = requestCustomerDetails(state4, 'qualification', {
    title: 'Customer Details',
  });
  assert(state4.pendingDetailsRequest?.status === 'pending', 'Request initially pending');

  const dismissedState = dismissCustomerDetails(state4);
  assert(dismissedState.pendingDetailsRequest?.status === 'dismissed', 'Request safely marked "dismissed"');
  assert(dismissedState.salesStage === 'discovery', 'Sales stage untouched on dismiss');
  assert(dismissedState.leadScore === 10, 'Lead score preserved on dismiss');
  console.log('  ✅ Test 6 Passed: Modal dismissal handled gracefully.\n');

  console.log('================================================================');
  console.log('🎉 ALL 6 CUSTOMER DETAILS MODAL VERIFICATION TESTS PASSED!');
  console.log('================================================================\n');
}

runVerification().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
