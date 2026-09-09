import { analyzeAndUpdateSalesState, createInitialSalesState, detectUserIntent } from '../lib/sales/tracker';
import { processSalesBrain } from '../lib/sales/brain';
import { ChatMessage } from '../lib/sales/types';

async function runPhase1ReplayTest() {
  console.log('====================================================');
  console.log(' PHASE 1 ACCEPTANCE TEST: REFERENCE CONVERSATION REPLAY');
  console.log('====================================================\n');

  let passed = true;
  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      passed = false;
    }
  }

  const sessionId = `phase1-test-${Date.now()}`;
  const conversation: ChatMessage[] = [];

  // =================================================================
  // TURN 1: Prospect introduces location, use case, volume, and budget
  // =================================================================
  console.log('--- TURN 1 ---');
  const userMsg1 = "Hi, I'm calling from Hyderabad. We are building relationship solutions with about 1,000 calls a month and have a $200 budget.";
  console.log(`Prospect: "${userMsg1}"\n`);
  conversation.push({ role: 'user', content: userMsg1 });

  const brainResult1 = await processSalesBrain({
    sessionId,
    messages: conversation,
  });
  const state1 = brainResult1.salesState;

  console.log('Extracted State Turn 1:');
  console.log(`  Location: "${state1.location}"`);
  console.log(`  Volume:   "${state1.volume}"`);
  console.log(`  Budget:   "${state1.budget}"`);
  console.log(`  UseCase:  "${state1.useCase}"`);
  console.log(`  Intent:   "${state1.currentIntent}"`);
  console.log(`  Category: "${state1.nextBestActionCategory}"`);
  console.log(`  Next Q:   "${state1.nextQuestion?.question}"\n`);

  // Assertions for Turn 1:
  assert(state1.location === 'Hyderabad', 'Remembers location: Hyderabad');
  assert(Boolean(state1.volume && state1.volume.includes('1,000')), 'Remembers volume: ~1,000 calls/month');
  assert(state1.budget === '$200', 'Remembers budget: $200');
  assert(Boolean(state1.useCase && state1.useCase.toLowerCase().includes('relationship solutions')), 'Remembers use case: relationship solutions');
  assert(state1.currentIntent === 'USE_CASE', 'Detects intent: USE_CASE');
  assert(state1.nextBestActionCategory === 'CLARIFY', 'Chooses Next Best Action: CLARIFY (not a checklist questionnaire question)');

  // Verify that the prompt contains known facts and forbids re-asking
  const prompt1 = brainResult1.systemPrompt;
  assert(prompt1.includes('Hyderabad'), 'System prompt lists Location as KNOWN');
  assert(prompt1.includes('$200'), 'System prompt lists Budget as KNOWN');
  assert(prompt1.includes('1,000'), 'System prompt lists Volume as KNOWN');
  assert(!state1.nextQuestion?.question?.toLowerCase().includes('budget'), 'Agent does NOT ask for budget since it is already known');
  assert(!state1.nextQuestion?.question?.toLowerCase().includes('where are you'), 'Agent does NOT ask where prospect is located');
  assert(prompt1.includes('STRICT BAN ON BOILERPLATE FILLER'), 'System prompt strictly bans boilerplate filler phrases');

  // Assistant response simulating clarifying question
  const assistantReply1 = state1.nextQuestion?.question || "Could you tell me a bit more about the relationship solutions you're building — is it matchmaking, dating advisory, or relationship coaching?";
  conversation.push({ role: 'assistant', content: assistantReply1 });

  // =================================================================
  // TURN 2: Prospect clarifies use case and immediately requests a demo for tomorrow at 2 PM
  // =================================================================
  console.log('\n--- TURN 2 ---');
  const userMsg2 = "It's a matchmaking and relationship advisory voice bot. Can you arrange a demo for tomorrow at 2 PM?";
  console.log(`Prospect: "${userMsg2}"\n`);
  conversation.push({ role: 'user', content: userMsg2 });

  const brainResult2 = await processSalesBrain({
    sessionId,
    messages: conversation,
  });
  const state2 = brainResult2.salesState;

  console.log('Extracted State Turn 2:');
  console.log(`  Intent:          "${state2.currentIntent}"`);
  console.log(`  Category:        "${state2.nextBestActionCategory}"`);
  console.log(`  Meeting Req:     ${state2.appointmentRequested}`);
  console.log(`  Meeting Date:    "${state2.meetingDate}"`);
  console.log(`  Meeting Time:    "${state2.meetingTime}"`);
  console.log(`  Next Q:          "${state2.nextQuestion?.question}"\n`);

  // Assertions for Turn 2:
  assert(state2.currentIntent === 'BOOKING_REQUEST', 'Detects booking request with highest priority');
  assert(state2.nextBestActionCategory === 'BOOK', 'Immediately switches Next Best Action to BOOK');
  assert(Boolean(state2.appointmentRequested || state2.appointment?.meetingRequested), 'Meeting requested flag is true');
  assert(Boolean(state2.meetingTime || state2.appointment?.preferredTime), 'Time preference (2 PM) is captured');
  
  // Verify qualification is STOPPED
  const nextQ2 = state2.nextQuestion?.question || '';
  assert(
    !nextQ2.toLowerCase().includes('role') &&
    !nextQ2.toLowerCase().includes('company size') &&
    !nextQ2.toLowerCase().includes('budget') &&
    !nextQ2.toLowerCase().includes('timeline'),
    'Agent stops normal qualification and does NOT ask role/size/budget/timeline'
  );

  const prompt2 = brainResult2.systemPrompt;
  assert(
    prompt2.includes('Transition immediately to booking') || prompt2.includes('STOP all qualification questions') || prompt2.includes('calendar invite'),
    'Prompt directs agent to transition immediately to booking and stop qualification'
  );

  console.log('\n====================================================');
  if (passed) {
    console.log(' 🎉 ALL PHASE 1 ACCEPTANCE TESTS PASSED!');
    console.log('====================================================\n');
    process.exit(0);
  } else {
    console.error(' ❌ SOME PHASE 1 TESTS FAILED.');
    console.log('====================================================\n');
    process.exit(1);
  }
}

runPhase1ReplayTest().catch((err) => {
  console.error('Fatal error running Phase 1 verification:', err);
  process.exit(1);
});
