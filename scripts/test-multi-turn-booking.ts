import { createInitialSalesState, analyzeAndUpdateSalesState } from '../lib/sales/tracker';
import { processSalesBrain } from '../lib/sales/brain';
import { ChatMessage } from '../lib/sales/types';

async function testMultiTurn() {
  console.log('=== TESTING MULTI-TURN REAL CONVERSATION BOOKING ===\n');

  const sessionId = `test-multi-turn-${Date.now()}`;
  const messages: ChatMessage[] = [];

  // TURN 1: User asks to schedule
  console.log('--- TURN 1 ---');
  messages.push({ role: 'user', content: "I'd like to schedule a demo" });
  let result1 = await processSalesBrain({ sessionId, messages });
  console.log('Directive 1:', result1.bookingDirective);
  console.log('appointmentStatus 1:', result1.salesState.appointmentStatus);
  console.log('meetingDate 1:', result1.salesState.meetingDate);
  console.log('meetingTime 1:', result1.salesState.meetingTime);
  console.log('calendarEventId 1:', result1.salesState.calendarEventId);

  // Assistant response
  messages.push({ role: 'assistant', content: result1.bookingDirective || 'What date and time would you like?' });

  // TURN 2: User provides date & time
  console.log('\n--- TURN 2 ---');
  messages.push({ role: 'user', content: 'Tomorrow at 4 PM' });
  let result2 = await processSalesBrain({ sessionId, messages });
  console.log('Directive 2:', result2.bookingDirective);
  console.log('appointmentStatus 2:', result2.salesState.appointmentStatus);
  console.log('meetingDate 2:', result2.salesState.meetingDate);
  console.log('meetingTime 2:', result2.salesState.meetingTime);
  console.log('calendarEventId 2:', result2.salesState.calendarEventId);

  // Assistant response
  messages.push({ role: 'assistant', content: result2.bookingDirective || "What's your email?" });

  // TURN 3: User provides email
  console.log('\n--- TURN 3 ---');
  messages.push({ role: 'user', content: 'My email is manishrevathi2008@gmail.com' });
  let result3 = await processSalesBrain({ sessionId, messages });
  console.log('Directive 3:', result3.bookingDirective);
  console.log('appointmentStatus 3:', result3.salesState.appointmentStatus);
  console.log('meetingDate 3:', result3.salesState.meetingDate);
  console.log('meetingTime 3:', result3.salesState.meetingTime);
  console.log('calendarEventId 3:', result3.salesState.calendarEventId);
  console.log('confirmationEmailStatus 3:', result3.salesState.confirmationEmailStatus);
  console.log('meetingUrl 3:', result3.salesState.meetingUrl);
}

testMultiTurn();
