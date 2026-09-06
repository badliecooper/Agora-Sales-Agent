import { createInitialSalesState, analyzeAndUpdateSalesState } from '../lib/sales/tracker';
import { executeLiveVoiceBookingFlow } from '../lib/sales/calendar-helper';

async function testBookingFlow() {
  console.log('=== TRACING LIVE VOICE BOOKING FLOW WITH ANALYZE FIRST ===\n');

  let state = createInitialSalesState('test-session-trace');

  const userText = 'Schedule a meeting tomorrow at 3 PM with manishrevathi2008@gmail.com';
  console.log('Input:', userText);

  state = analyzeAndUpdateSalesState(state, [{ role: 'user', content: userText }]);

  console.log('State after analyzeAndUpdateSalesState:');
  console.log('  customerEmail:', state.customerEmail);
  console.log('  email:', state.email);
  console.log('  meetingDate:', state.meetingDate);
  console.log('  meetingTime:', state.meetingTime);

  const result = await executeLiveVoiceBookingFlow(state, userText, 'test-session-trace');

  console.log('\n--- RESULT ---');
  console.log('Booking attempted?:', result.bookingAttempted);
  console.log('Calendar success?:', result.calendarSuccess);
  console.log('Email success?:', result.emailSuccess);
  console.log('Speech directive:', result.speechDirective);
  console.log('Error:', result.error);
  console.log('State appointmentStatus:', result.state.appointmentStatus);
  console.log('State calendarEventId:', result.state.calendarEventId);
  console.log('State meetingUrl:', result.state.meetingUrl);
  console.log('State confirmationEmailStatus:', result.state.confirmationEmailStatus);
  console.log('State appointment lastError:', result.state.appointment?.lastError);
}

testBookingFlow();
