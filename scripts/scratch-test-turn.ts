import { processSalesBrain } from '../lib/sales/brain';

async function testEcho() {
  const sessionId = 'test-echo-' + Date.now();

  const res = await processSalesBrain({
    sessionId,
    messages: [
      { role: 'user', content: 'Schedule a meeting tomorrow at 3 PM' },
      { role: 'assistant', content: "What's the best email address to send your calendar invite and confirmation to?" },
      { role: 'user', content: "What's the best email address to send your calendar invite and confirmation to?" },
    ],
  });

  console.log('Directive on echo:', res.bookingDirective);
  console.log('CustomerEmail on echo:', res.salesState.customerEmail);
  console.log('MeetingStatus:', res.salesState.meetingStatus);
}

testEcho();
