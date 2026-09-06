import { createInitialSalesState, analyzeAndUpdateSalesState } from '../lib/sales/tracker';
import { executeLiveVoiceBookingFlow } from '../lib/sales/calendar-helper';

async function testSecondEmail() {
  let state = createInitialSalesState('test-session-second');
  const userText = 'Schedule a meeting tomorrow at 4 PM with p.manish.reddy1803@gmail.com';
  state = analyzeAndUpdateSalesState(state, [{ role: 'user', content: userText }]);
  const result = await executeLiveVoiceBookingFlow(state, userText, 'test-session-second');
  console.log('Result for p.manish.reddy1803@gmail.com:');
  console.log('Event ID:', result.state.calendarEventId);
  console.log('Meet URL:', result.state.meetingUrl);
  console.log('Directive:', result.speechDirective);
}

testSecondEmail();
