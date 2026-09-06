import assert from 'assert';
import {
  createInitialSalesState,
  executeAppointmentBooking,
  updateCustomerDetailsManually,
  buildStructuredCrmPayload,
  isValidCustomerEmail,
  isPlaceholderEmail,
} from '../lib/sales/tracker';
import {
  sendMeetingConfirmationEmail,
  resetMockEmail,
  getMockSentEmails,
} from '../lib/email/gmail';
import { resetMockCalendar } from '../lib/calendar/tools';
import { processSalesBrain } from '../lib/sales/brain';

async function runGmailRecipientVerification() {
  console.log('================================================================');
  console.log('  Canonical Customer Email & Gmail Recipient Verification Suite ');
  console.log('================================================================\n');

  resetMockCalendar();
  resetMockEmail();

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Canonical Flow with "realcustomer@gmail.com"
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 1: Full Flow with canonical "realcustomer@gmail.com" ---');
  const targetEmail = 'realcustomer@gmail.com';
  const customerName = 'Real Customer';
  const company = 'Innovatech Global';
  const sessionId = 'session-gmail-test-' + Date.now();

  let state = createInitialSalesState(sessionId);

  // Set selectedSlot and confirmed status on appointment
  state.appointment.meetingRequested = true;
  state.appointment.selectedSlot = {
    start: '2026-09-10T14:00:00-04:00',
    end: '2026-09-10T14:30:00-04:00',
    formattedTime: 'Thursday, Sep 10 at 2:00 PM (America/New_York)',
    available: true,
  };
  state.appointment.confirmationStatus = 'confirmed';

  // Apply customer details via the manual update (matching dashboard edit)
  state = updateCustomerDetailsManually(state, {
    fullName: customerName,
    email: targetEmail,
    company,
    phone: '+1 555-0199',
  });

  // Verify Single Source of Truth
  assert.strictEqual(
    state.customerEmail,
    targetEmail,
    'SalesState.customerEmail MUST be the single source of truth: realcustomer@gmail.com',
  );
  assert.strictEqual(
    state.customer.email,
    targetEmail,
    'SalesState.customer.email must equal realcustomer@gmail.com',
  );
  assert.strictEqual(
    state.email,
    targetEmail,
    'SalesState.email must equal realcustomer@gmail.com',
  );
  assert.strictEqual(
    state.profile.customer.email,
    targetEmail,
    'SalesState.profile.customer.email must equal realcustomer@gmail.com',
  );
  console.log('✓ SalesState.customerEmail Single Source of Truth verified:', state.customerEmail);

  // Execute Appointment Booking
  const bookedAppt = await executeAppointmentBooking(
    state.appointment,
    state.customer.fullName || customerName,
    state.customerEmail!,
    state.customer.company,
    sessionId,
  );
  state.appointment = bookedAppt;

  // 1. Verify Calendar Attendee Email
  assert.strictEqual(
    bookedAppt.meetingStatus,
    'confirmed',
    'Appointment meetingStatus must be "confirmed"',
  );
  assert.strictEqual(
    bookedAppt.attendeeEmail,
    targetEmail,
    `Calendar attendee email MUST be ${targetEmail}, got ${bookedAppt.attendeeEmail}`,
  );
  console.log('✓ Calendar Attendee Email         :', bookedAppt.attendeeEmail);

  // 2. Verify Gmail Recipient Email
  assert.strictEqual(
    bookedAppt.emailStatus,
    'sent',
    'Confirmation emailStatus must be "sent"',
  );
  const sentEmails = getMockSentEmails();
  assert(sentEmails.length > 0, 'At least one confirmation email must have been dispatched');
  const lastEmail = sentEmails[sentEmails.length - 1];
  assert.strictEqual(
    lastEmail.to,
    targetEmail,
    `Gmail recipient MUST be ${targetEmail}, got ${lastEmail.to}`,
  );
  console.log('✓ Gmail Recipient Email           :', lastEmail.to);

  // 3. Verify HubSpot Contact Email
  const crmPayload = buildStructuredCrmPayload(state);
  assert.strictEqual(
    crmPayload.contact.email,
    targetEmail,
    `HubSpot contact email MUST be ${targetEmail}, got ${crmPayload.contact.email}`,
  );
  console.log('✓ HubSpot Contact Email           :', crmPayload.contact.email);

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Two-Way Dashboard Edit Updates SalesState & Future Sends
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Test 2: Dashboard manual edit updates future Gmail sends ---');
  const updatedEmail = 'updated.customer@realdomain.org';

  state = updateCustomerDetailsManually(state, {
    fullName: 'Real Customer Updated',
    email: updatedEmail,
    company: 'Innovatech Global',
  });

  assert.strictEqual(
    state.customerEmail,
    updatedEmail,
    'SalesState.customerEmail must update to new edited address',
  );
  assert.strictEqual(
    state.customer.email,
    updatedEmail,
    'SalesState.customer.email must update to new edited address',
  );

  // Future Gmail send must use updated email without reverting or hardcoded fallback
  const directSendResult = await sendMeetingConfirmationEmail({
    customerName: state.customer.fullName || 'Real Customer',
    customerEmail: state.customerEmail!,
    meetingTitle: 'Updated Demo Confirmation',
    start: '2026-09-10T14:00:00-04:00',
    end: '2026-09-10T14:30:00-04:00',
    timezone: 'America/New_York',
    calendarEventId: 'custom-event-2',
    conversationId: sessionId + '-updated',
  });

  assert.strictEqual(directSendResult.success, true, 'Future Gmail send must succeed');
  assert.strictEqual(
    directSendResult.recipient,
    updatedEmail,
    `Future Gmail send recipient must be ${updatedEmail}`,
  );
  console.log('✓ Future Gmail send used updated address:', directSendResult.recipient);

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Rejection of jordan@example.com in Live Booking Flow
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Test 3: jordan@example.com rejected by live booking flow ---');
  const jordanEmail = 'jordan@example.com';

  assert.strictEqual(
    isPlaceholderEmail(jordanEmail),
    true,
    'isPlaceholderEmail("jordan@example.com") must return true',
  );
  assert.strictEqual(
    isValidCustomerEmail(jordanEmail),
    false,
    'isValidCustomerEmail("jordan@example.com") must return false',
  );

  // A. executeAppointmentBooking with jordan@example.com must reject
  const mockJordanState = {
    ...createInitialSalesState('session-jordan-test').appointment,
    selectedSlot: {
      start: '2026-09-11T11:00:00-04:00',
      end: '2026-09-11T11:30:00-04:00',
      formattedTime: 'Friday, Sep 11 at 11:00 AM (America/New_York)',
      available: true,
    },
    confirmationStatus: 'confirmed' as const,
  };

  const jordanBookingResult = await executeAppointmentBooking(
    mockJordanState,
    'Jordan Lee',
    jordanEmail,
    'Acme Corp',
    'session-jordan-test',
  );

  assert.strictEqual(
    jordanBookingResult.meetingStatus,
    'collecting_details',
    'Meeting status must revert to "collecting_details" when email is jordan@example.com',
  );
  assert.strictEqual(
    jordanBookingResult.calendarEventId,
    null,
    'No calendarEventId must be created when placeholder email is provided',
  );
  assert.strictEqual(
    jordanBookingResult.emailStatus,
    'none',
    'emailStatus must remain "none" (Gmail NOT called)',
  );
  console.log('✓ executeAppointmentBooking rejected jordan@example.com: status = collecting_details');

  // B. Direct sendMeetingConfirmationEmail call with jordan@example.com must be blocked
  const jordanEmailResult = await sendMeetingConfirmationEmail({
    customerName: 'Jordan Lee',
    customerEmail: jordanEmail,
    meetingTitle: 'Agora AI Demo',
    start: '2026-09-11T11:00:00-04:00',
    end: '2026-09-11T11:30:00-04:00',
    timezone: 'America/New_York',
    calendarEventId: 'event-jordan-1',
  });

  assert.strictEqual(
    jordanEmailResult.success,
    false,
    'sendMeetingConfirmationEmail must return success: false for jordan@example.com',
  );
  assert(
    jordanEmailResult.error?.includes('invalid or placeholder'),
    `Expected placeholder rejection error, got: ${jordanEmailResult.error}`,
  );
  console.log('✓ sendMeetingConfirmationEmail blocked jordan@example.com:', jordanEmailResult.error);

  // C. Rejection of other placeholder domains: example.com, test.com, johndoe@example.com
  const testPlaceholders = [
    'johndoe@example.com',
    'user@test.com',
    'sample@domain.com',
    'client@sample.com',
    'fake@fake.com',
    'noemail',
    'missing-at-sign.com',
  ];

  for (const placeholder of testPlaceholders) {
    assert.strictEqual(
      isValidCustomerEmail(placeholder),
      false,
      `isValidCustomerEmail("${placeholder}") should return false`,
    );
  }
  console.log('✓ All common placeholder domains (example.com, test.com, sample.com, etc.) rejected');

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Voice Sales Brain Triggers Customer Details Popup
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Test 4: Missing/placeholder email triggers Customer Details Popup ---');
  const brainSessionId = 'session-brain-popup-' + Date.now();
  const brainResult = await processSalesBrain({
    sessionId: brainSessionId,
    messages: [
      { role: 'user', content: 'Can we schedule a demo for tomorrow?' },
      { role: 'assistant', content: 'We can schedule your demo for tomorrow at 2:00 PM.' },
      { role: 'user', content: 'Yes, please book a demo for me!' },
    ],
  });

  // Since user confirmed but email is missing or not provided,
  // brain must NOT call Gmail or mark confirmed. It must trigger requestCustomerDetails!
  assert(
    brainResult.salesState.pendingDetailsRequest !== null,
    'pendingDetailsRequest must be created when booking without a valid email',
  );
  assert.strictEqual(
    brainResult.salesState.pendingDetailsRequest?.actionType,
    'book_meeting',
    'pendingDetailsRequest.actionType must be "book_meeting"',
  );
  assert.strictEqual(
    brainResult.salesState.appointment?.calendarEventId,
    null,
    'calendarEventId must be null (booking postponed until email is collected)',
  );
  assert(
    brainResult.salesState.appointment?.emailStatus === 'none' ||
      !brainResult.salesState.appointment?.emailStatus,
    'emailStatus must be none (Gmail must NOT be called)',
  );
  console.log('✓ Customer Details popup triggered for book_meeting action');
  console.log('✓ Popup Title      :', brainResult.salesState.pendingDetailsRequest?.title);
  console.log('✓ Required Fields  :', brainResult.salesState.pendingDetailsRequest?.requiredFields);
  console.log('✓ Zero Premature Calls: Gmail API and Calendar Event creation prevented');

  console.log('\n================================================================');
  console.log('  All Verification Tests Passed with 100% Success! 🎉          ');
  console.log('================================================================\n');
}

runGmailRecipientVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
