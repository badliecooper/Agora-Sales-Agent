/**
 * Verification Script: Two-Way Customer Details Dashboard & Voice Overwrite Conflict Protection
 *
 * Validates:
 * 1. Manual edit updates canonical SalesState and records manualOverrides.
 * 2. Voice overwrite protection: Subsequent conversational utterances with conflicting details
 *    do NOT overwrite fields flagged in manualOverrides.
 * 3. Two-way fluidity: Non-overridden fields (need, budget, timeline, etc.) still update via voice.
 * 4. Validation rules: Enforces required name, RFC email format, and 7-15 digit phone validation.
 * 5. Downstream Integration (Calendar & Gmail): executeAppointmentBooking uses manually updated name & email.
 * 6. Post-Booking Email Change: Modifying email after an appointment was booked updates customer.email
 *    for future actions without altering the existing Calendar event ID or sending duplicate emails.
 * 7. Downstream Integration (HubSpot CRM): buildStructuredCrmPayload uses manually overridden details.
 */

import {
  createInitialSalesState,
  analyzeAndUpdateSalesState,
  updateCustomerDetailsManually,
  buildStructuredCrmPayload,
  executeAppointmentBooking,
} from '../lib/sales/tracker';
import { ChatMessage } from '../lib/sales/types';

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 VERIFYING TWO-WAY CUSTOMER EDITING & VOICE OVERRIDE PROTECTION');
  console.log('================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Initial Voice Collection followed by Manual Edit in SalesState
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 1: Voice Collection followed by Manual Edit');
  let state = createInitialSalesState('session-manual-edit-1');

  // Customer introduces themselves via voice
  const turn1: ChatMessage[] = [
    { role: 'user', content: 'Hi, my name is Rahul from Acme Corp. My email is rahul@acme.com.' },
  ];
  state = analyzeAndUpdateSalesState(state, turn1);

  assert(state.customer.fullName === 'Rahul', 'Voice captured name "Rahul"');
  assert(state.customer.company === 'Acme Corp', 'Voice captured company "Acme Corp"');
  assert(state.customer.email === 'rahul@acme.com', 'Voice captured email "rahul@acme.com"');
  assert(!state.customer.manualOverrides?.email, 'Email not yet manually overridden');

  // User manually edits details via dashboard
  state = updateCustomerDetailsManually(state, {
    fullName: 'Rahul Sharma',
    email: 'rahul.sharma@globaltech.com',
    company: 'GlobalTech Solutions',
    phone: '+1 555-0199',
    jobTitle: 'VP of Engineering',
  });

  assert(state.customer.fullName === 'Rahul Sharma', 'State updated fullName to "Rahul Sharma"');
  assert(state.customer.email === 'rahul.sharma@globaltech.com', 'State updated email to "rahul.sharma@globaltech.com"');
  assert(state.customer.company === 'GlobalTech Solutions', 'State updated company to "GlobalTech Solutions"');
  assert(state.customer.phone === '+1 555-0199', 'State updated phone to "+1 555-0199"');
  assert(state.customer.jobTitle === 'VP of Engineering', 'State updated jobTitle to "VP of Engineering"');
  assert(state.customerName === 'Rahul Sharma', 'Flat alias customerName updated');
  assert(state.email === 'rahul.sharma@globaltech.com', 'Flat alias email updated');
  assert(state.company === 'GlobalTech Solutions', 'Flat alias company updated');
  assert(state.phone === '+1 555-0199', 'Flat alias phone updated');
  assert(state.jobTitle === 'VP of Engineering', 'Flat alias jobTitle updated');
  assert(state.profile.customer.email === 'rahul.sharma@globaltech.com', 'Canonical profile customer email updated');
  assert(Boolean(state.customer.manualOverrides?.email), 'manualOverrides.email is true');
  assert(Boolean(state.customer.manualOverrides?.fullName), 'manualOverrides.fullName is true');
  assert(Boolean(state.customer.manualOverrides?.company), 'manualOverrides.company is true');
  assert(Boolean(state.customer.manualOverrides?.phone), 'manualOverrides.phone is true');
  assert(Boolean(state.customer.manualOverrides?.jobTitle), 'manualOverrides.jobTitle is true');
  console.log('  ✅ Test 1 Passed: Manual edits directly update canonical state.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Conflict Protection against Voice Overwrites
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 2: Voice Overwrite Protection (Subsequent Conflicting Voice Utterances)');

  // Caller later mentions old or conflicting details in conversation
  const turn2: ChatMessage[] = [
    ...turn1,
    { role: 'assistant', content: 'Could you confirm your email and company?' },
    { role: 'user', content: 'Actually, like I said earlier, I work at Acme and my email was old@acme.com, or reach me at rahul@acme.com.' },
  ];

  state = analyzeAndUpdateSalesState(state, turn2);

  // Protected fields MUST NOT revert to voice extractions
  assert(
    state.customer.email === 'rahul.sharma@globaltech.com',
    'Customer email remained "rahul.sharma@globaltech.com" despite conflicting voice utterance',
  );
  assert(
    state.customer.fullName === 'Rahul Sharma',
    'Customer name remained "Rahul Sharma" despite voice turn',
  );
  assert(
    state.customer.company === 'GlobalTech Solutions',
    'Customer company remained "GlobalTech Solutions"',
  );
  assert(
    state.customer.phone === '+1 555-0199',
    'Customer phone remained "+1 555-0199"',
  );
  assert(
    state.customer.jobTitle === 'VP of Engineering',
    'Customer role remained "VP of Engineering"',
  );
  console.log('  ✅ Test 2 Passed: Manual overrides successfully shielded from voice overwrites.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Two-Way Fluidity for Non-Overridden Fields
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 3: Two-Way Fluidity (Non-overridden fields still dynamically update)');

  const turn3: ChatMessage[] = [
    ...turn2,
    { role: 'assistant', content: 'What is your timeline and budget for this project?' },
    { role: 'user', content: 'We want to deploy an inbound voice customer support bot within 3 months with a budget of $25,000.' },
  ];

  state = analyzeAndUpdateSalesState(state, turn3);

  // Qualification fields were not manually locked, so they must update from speech!
  assert(state.qualification.need?.toLowerCase().includes('voice'), 'Need updated from voice turn');
  assert(state.qualification.budget === '$25,000', 'Budget updated to "$25,000" from voice');
  assert(state.qualification.timeline === '3 months', 'Timeline updated to "3 months" from voice');
  // Overridden contact fields remain locked
  assert(state.customer.email === 'rahul.sharma@globaltech.com', 'Email still preserved');
  console.log('  ✅ Test 3 Passed: Two-way synchronization maintains dynamic updates for un-overridden fields.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Validation Rules Enforcement
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 4: Validation Rules Enforcement');

  let validationCaught = false;
  try {
    updateCustomerDetailsManually(state, {
      fullName: '',
      email: 'valid@example.com',
    });
  } catch (err: unknown) {
    validationCaught = true;
    assert((err as Error).message.includes('Full name is required'), 'Caught empty name validation');
  }
  assert(validationCaught, 'Empty name was rejected');

  validationCaught = false;
  try {
    updateCustomerDetailsManually(state, {
      fullName: 'Valid Name',
      email: 'not-an-email',
    });
  } catch (err: unknown) {
    validationCaught = true;
    assert((err as Error).message.includes('valid email address'), 'Caught invalid email format');
  }
  assert(validationCaught, 'Malformed email was rejected');

  validationCaught = false;
  try {
    updateCustomerDetailsManually(state, {
      fullName: 'Valid Name',
      email: 'valid@example.com',
      phone: '123', // Too short
    });
  } catch (err: unknown) {
    validationCaught = true;
    assert((err as Error).message.includes('Phone number must contain between 7 and 15 digits'), 'Caught short phone');
  }
  assert(validationCaught, 'Malformed phone was rejected');
  console.log('  ✅ Test 4 Passed: Input validation enforces data integrity.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Downstream Integration (Calendar & Gmail Booking)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 5: Downstream Calendar & Gmail Integration');

  // Propose a slot and confirm
  state.appointment.proposedSlots = [
    {
      start: '2026-09-15T14:00:00Z',
      end: '2026-09-15T14:30:00Z',
      formattedTime: 'Tuesday, Sep 15 at 2:00 PM EDT',
    },
  ];
  state.appointment.selectedSlot = state.appointment.proposedSlots[0];
  state.appointment.confirmationStatus = 'confirmed';

  const bookedAppt = await executeAppointmentBooking(
    state.appointment,
    state.customer.fullName || 'Customer',
    state.customer.email!,
    state.customer.company,
    state.conversationId,
  );

  state.appointment = bookedAppt;

  assert(state.appointment.meetingStatus === 'confirmed', 'Appointment status is confirmed');
  assert(Boolean(state.appointment.calendarEventId), 'Calendar event ID was created');
  assert(state.appointment.attendeeEmail === 'rahul.sharma@globaltech.com', 'Calendar attendee email is the manually updated email');
  assert(state.appointment.attendeeName === 'Rahul Sharma', 'Calendar attendee name is the manually updated name');
  assert(state.appointment.emailStatus === 'sent', 'Confirmation email sent via Gmail service');
  console.log('  ✅ Test 5 Passed: Calendar and Gmail booking used the manually updated customer details.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Post-Booking Email Change Rule
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 6: Post-Booking Email Modification Safety Guard');

  const originalEventId = state.appointment.calendarEventId;
  const originalEmailStatus = state.appointment.emailStatus;

  // User edits email AFTER meeting was booked
  state = updateCustomerDetailsManually(state, {
    fullName: 'Rahul Sharma',
    email: 'new.inbox@globaltech.com',
    company: 'GlobalTech Solutions',
  });

  assert(state.customer.email === 'new.inbox@globaltech.com', 'Customer email updated to new.inbox@globaltech.com');
  assert(state.appointment.calendarEventId === originalEventId, 'Existing calendar event ID was NOT modified');
  assert(state.appointment.meetingStatus === 'confirmed', 'Meeting status remains confirmed');
  assert(state.appointment.emailStatus === originalEmailStatus, 'Email status untouched (no duplicate emails dispatched)');
  console.log('  ✅ Test 6 Passed: Post-booking email edit does not disrupt existing calendar events or re-send emails.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Downstream Integration (HubSpot CRM Sync Payload)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('Test 7: Downstream HubSpot CRM Sync Payload');

  const crmPayload = buildStructuredCrmPayload(state);

  assert(crmPayload.contact.firstName === 'Rahul', 'HubSpot contact firstName is "Rahul"');
  assert(crmPayload.contact.lastName === 'Sharma', 'HubSpot contact lastName is "Sharma"');
  assert(crmPayload.contact.email === 'new.inbox@globaltech.com', 'HubSpot contact email is the latest manually edited email');
  assert(crmPayload.contact.company === 'GlobalTech Solutions', 'HubSpot contact company is "GlobalTech Solutions"');
  assert(crmPayload.contact.phone === '+1 555-0199', 'HubSpot contact phone is "+1 555-0199"');
  assert(crmPayload.contact.jobTitle === 'VP of Engineering', 'HubSpot contact jobTitle is "VP of Engineering"');
  console.log('  ✅ Test 7 Passed: HubSpot CRM sync payload properly incorporates all manual overrides.\n');

  console.log('================================================================');
  console.log('🎉 ALL 7 TWO-WAY CUSTOMER EDITING & CONFLICT TESTS PASSED!');
  console.log('================================================================\n');
}

runVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
