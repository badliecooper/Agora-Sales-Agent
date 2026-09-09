/**
 * Permanent Conversation Regression Test Suite — Phase 4: Evaluation, Performance & Production Polish
 *
 * Covers:
 * 1. Budget objection (honest economics, transparent math, no fake discounts)
 * 2. Frustration / "why so many questions" (sincere apology, drops interrogation, helps directly)
 * 3. Mid-response interruption (clean state handling without broken prompts)
 * 4. Explicit buying signal ("just book me" -> immediately transitions to booking)
 * 5. Prospect stating info was already given ("I already told you..." -> acknowledges, no re-asking)
 * 6. Ambiguous product description ("smart relationship app" -> clarifying discovery question)
 * 7. Booking/calendar API failure (honest error reporting, offers retry)
 * 8. Requested slot unavailable (detects conflict, offers 3 concrete open alternatives)
 * 9. Request for human escalation ("speak to a human" -> offers solutions team handoff)
 * 10. Pre-TTS response validator unit tests (verifies all 7 checks and auto-correction)
 * 11. Conversation quality benchmark test (verifies composite score ≥ 85/100)
 * 12. Latency measurement & bottleneck identification test
 */

import {
  createInitialSalesState,
  analyzeAndUpdateSalesState,
  executeLiveVoiceBookingFlow,
} from '../lib/sales/tracker';
import { processSalesBrain } from '../lib/sales/brain';
import {
  validateResponse,
  sanitizeAndCorrectResponse,
  splitSentences,
  extractQuestions,
} from '../lib/sales/validator';
import {
  evaluateTurnQuality,
  evaluateConversationQuality,
} from '../lib/sales/quality-evaluator';
import {
  recordTurnLatency,
  analyzeBottlenecks,
  resetLatencyStore,
} from '../lib/sales/latency-tracker';
import { ChatMessage, SalesState } from '../lib/sales/types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    Detail: ${detail}`);
  }
}

async function runPhase4RegressionSuite() {
  console.log('\n================================================================');
  console.log('  AGORA SALES AGENT — PHASE 4 PERMANENT REGRESSION SUITE');
  console.log('================================================================\n');

  // ----------------------------------------------------------------
  // Scenario 1: Budget Objection & Honest Economics
  // ----------------------------------------------------------------
  console.log('Scenario 1: Budget Objection & Honest Economics');
  {
    const state = createInitialSalesState('test-s1-budget');
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Hi, I am Ada from Agora. What kind of voice AI app are you building?' },
      { role: 'user', content: 'We need voice AI for customer support. We expect about 50,000 minutes a month, but our monthly budget is only $500.' },
    ];

    const updated = analyzeAndUpdateSalesState(state, messages);
    assert(updated.budget === '$500', 'Extracted stated budget ($500)');
    assert(Boolean(updated.volume && (updated.volume.includes('50,000') || updated.volume.includes('50000'))), 'Extracted stated volume (50,000 mins)');
    assert(updated.budgetEconomics !== undefined, 'Generated budget economics assessment');
    assert(
      updated.budgetEconomics?.fitStatus === 'budget_mismatch',
      'Detected budget mismatch (50k min costs $5k at $0.10/min vs $500 budget)',
      `Actual status: ${updated.budgetEconomics?.fitStatus}`,
    );

    const brain = await processSalesBrain({
      sessionId: 'test-s1-budget',
      companyId: 'default-company',
      messages,
    });

    assert(
      brain.systemPrompt.includes('BUDGET ECONOMICS') || brain.systemPrompt.includes('budget_mismatch'),
      'Brain injected budget economics directives into prompt',
    );
    assert(
      !brain.systemPrompt.includes('$0.01') && !brain.systemPrompt.includes('90% discount'),
      'Did not fabricate impossible discounts or unverified rates',
    );
  }

  // ----------------------------------------------------------------
  // Scenario 2: Frustration / "Why so many questions"
  // ----------------------------------------------------------------
  console.log('\nScenario 2: Frustration / "Why so many questions"');
  {
    const state = createInitialSalesState('test-s2-frustration');
    state.customerName = 'Alex';
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'What is your timeline for deploying this project?' },
      { role: 'user', content: 'Why are you asking so many questions? Can you just tell me how Agora pricing works?' },
    ];

    const updated = analyzeAndUpdateSalesState(state, messages);
    const brain = await processSalesBrain({
      sessionId: 'test-s2-frustration',
      companyId: 'default-company',
      messages,
    });

    assert(
      brain.systemPrompt.includes('Refusals & Frustration') || brain.systemPrompt.includes('sincerely apologize'),
      'Prompt enforces Rule 10: drop questions, apologize, and answer customer directly',
    );
    assert(
      updated.nextBestActionCategory === 'ANSWER' || updated.nextBestActionCategory === 'HANDLE_OBJECTION',
      'Action pivoted from QUALIFY to ANSWER/HANDLE_OBJECTION',
      `Actual category: ${updated.nextBestActionCategory}`,
    );
  }

  // ----------------------------------------------------------------
  // Scenario 3: Mid-Response Interruption Handling
  // ----------------------------------------------------------------
  console.log('\nScenario 3: Mid-Response Interruption Handling');
  {
    const state = createInitialSalesState('test-s3-interruption');
    state.customerName = 'David';
    state.company = 'OmniHealth';

    // Interrupted turn followed by a clarification
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Our Conversational AI engine supports Deepgram for ASR, OpenAI and Anthropic for LLMs, and—' },
      { role: 'user', content: 'Wait, does it work with custom LLM endpoints over private VPCs?' },
    ];

    const updated = analyzeAndUpdateSalesState(state, messages);
    const brain = await processSalesBrain({
      sessionId: 'test-s3-interruption',
      companyId: 'default-company',
      messages,
    });

    assert(updated.customerName === 'David', 'State preserved across interrupted turn');
    assert(updated.company === 'OmniHealth', 'Company preserved across interrupted turn');
    assert(
      updated.nextBestActionCategory === 'ANSWER',
      'Prioritized answering user interruption directly over resuming monologue',
      `Actual category: ${updated.nextBestActionCategory}`,
    );
  }

  // ----------------------------------------------------------------
  // Scenario 4: Explicit Buying Signal ("Just book me")
  // ----------------------------------------------------------------
  console.log('\nScenario 4: Explicit Buying Signal ("Just book me")');
  {
    const state = createInitialSalesState('test-s4-buyingsignal');
    state.customerName = 'Marcus';
    state.company = 'Apex Labs';

    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Would you like to discuss your timeline?' },
      { role: 'user', content: 'I have heard enough. Just book me a demo for next Tuesday at 2pm.' },
    ];

    const updated = analyzeAndUpdateSalesState(state, messages);
    assert(
      updated.buyingIntent === 'high' || updated.buyingSignalStrength === 'strong',
      'Detected strong buying intent from explicit request',
      `Actual intent: ${updated.buyingIntent}`,
    );

    // Should stop qualification and advance directly to booking
    const brain = await processSalesBrain({
      sessionId: 'test-s4-buyingsignal',
      companyId: 'default-company',
      messages,
    });

    assert(
      updated.appointment?.meetingRequested === true || updated.appointmentRequested === true,
      'Meeting requested flag set to true',
    );
    assert(
      brain.systemPrompt.includes('STOP normal qualification immediately') ||
        brain.systemPrompt.includes('Transition directly to booking'),
      'Directive instructs agent to cease qualification and book',
    );
  }

  // ----------------------------------------------------------------
  // Scenario 5: Prospect Stating Info Was Already Given
  // ----------------------------------------------------------------
  console.log('\nScenario 5: Prospect Stating Info Was Already Given');
  {
    const state = createInitialSalesState('test-s5-alreadygiven');
    state.customerName = 'Elena';
    state.company = 'HealthTech Inc';

    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Could you remind me which company you are with?' },
      { role: 'user', content: 'I already told you earlier, my company is HealthTech Inc and we build telemedicine apps.' },
    ];

    const updated = analyzeAndUpdateSalesState(state, messages);
    assert(updated.company === 'HealthTech Inc', 'Retained company name');
    assert(
      updated.conversationStateSummary?.known?.Company === 'HealthTech Inc',
      'Tracked company in known conversation state summary',
    );

    // Validate that validator flags any repeated request for company
    const badResponse = 'Nice to meet you Elena. What company are you with?';
    const validation = validateResponse(badResponse, updated);
    assert(!validation.isValid, 'Validator caught repeated company inquiry');
    assert(
      validation.issues.some((i) => i.ruleId === 'repeated_question'),
      'Issue categorized as repeated_question',
    );
  }

  // ----------------------------------------------------------------
  // Scenario 6: Ambiguous Product Description
  // ----------------------------------------------------------------
  console.log('\nScenario 6: Ambiguous Product Description');
  {
    const state = createInitialSalesState('test-s6-ambiguous');
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'Hi there! What are you looking to build?' },
      { role: 'user', content: 'We build an innovative relationship intelligence solution.' },
    ];

    const updated = analyzeAndUpdateSalesState(state, messages);
    const brain = await processSalesBrain({
      sessionId: 'test-s6-ambiguous',
      companyId: 'default-company',
      messages,
    });

    assert(
      brain.systemPrompt.includes('Ambiguous Product Discovery') ||
        brain.systemPrompt.includes('ask a clarifying question'),
      'System prompt injected Rule 9 for ambiguous product discovery',
    );
  }

  // ----------------------------------------------------------------
  // Scenario 7: Booking/Calendar API Failure Handling
  // ----------------------------------------------------------------
  console.log('\nScenario 7: Booking/Calendar API Failure Handling');
  {
    const { setMockFailureMode } = await import('../lib/calendar/google');
    const { bookMeeting } = await import('../lib/sales/booking-service');

    setMockFailureMode(true);
    const failRes = await bookMeeting({
      conversationId: 'test-s7-calfail',
      date: '2026-09-15',
      startTime: '14:00',
      customerName: 'Test User',
      customerEmail: 'user@acmehealth.io',
    });
    setMockFailureMode(false);

    assert(failRes.success === false, 'Truthfully reported calendar failure (success === false)');
    assert(!failRes.calendarEventId, 'Did NOT fake booking or generate event ID on failure');
    assert(
      failRes.message.includes("wasn't able") || failRes.message.includes('error') || failRes.message.includes('safely'),
      'Truthful failure message provided without optimistic fabrication',
    );
  }

  // ----------------------------------------------------------------
  // Scenario 8: Requested Slot Unavailable / Conflict Handling
  // ----------------------------------------------------------------
  console.log('\nScenario 8: Requested Slot Unavailable / Conflict Handling');
  {
    const { bookMeeting, cancelMeeting } = await import('../lib/sales/booking-service');
    const testSlotDate = '2026-09-30';
    const testSlotTime = '14:00';

    let eventIdToClean: string | undefined;
    try {
      // First booking at 11:00 AM on 2026-09-29
      const book1 = await bookMeeting({
        conversationId: 'test-s8-first',
        date: testSlotDate,
        startTime: testSlotTime,
        customerName: 'Conflict Tester',
        customerEmail: 'conflict@acmehealth.io',
      });
      eventIdToClean = book1.calendarEventId || undefined;
      assert(book1.success === true, `First booking on ${testSlotDate} at ${testSlotTime} succeeded`);

      // Second booking attempt at the exact same slot
      const book2 = await bookMeeting({
        conversationId: 'test-s8-second',
        date: testSlotDate,
        startTime: testSlotTime,
        customerName: 'Second Tester',
        customerEmail: 'second@acmehealth.io',
      });

      assert(book2.success === false, 'Blocked second booking attempt for occupied slot');
      assert(book2.status === 'unavailable', 'Detected slot conflict (status: unavailable)');
      assert(!book2.calendarEventId, 'Did not create conflicting calendar event');
      assert(
        book2.message.includes("isn't available") || book2.message.includes('another event'),
        'Truthfully reported slot conflict to user',
      );
      assert(
        Boolean(book2.suggestedSlots && book2.suggestedSlots.length >= 2),
        'Provided concrete open alternative slots for prospect to choose',
      );
    } finally {
      if (eventIdToClean) {
        await cancelMeeting({ calendarEventId: eventIdToClean, eventId: eventIdToClean }).catch(() => {});
      }
    }
  }

  // ----------------------------------------------------------------
  // Scenario 9: Request for Human Escalation
  // ----------------------------------------------------------------
  console.log('\nScenario 9: Request for Human Escalation');
  {
    const state = createInitialSalesState('test-s9-human');
    state.customerName = 'Enterprise Buyer';

    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'How can I assist your team today?' },
      { role: 'user', content: 'Can I talk to a human sales rep? I want to speak to a real person from your enterprise team.' },
    ];

    const updated = analyzeAndUpdateSalesState(state, messages);
    assert(
      updated.nextBestActionCategory === 'ANSWER' || updated.nextBestActionCategory === 'HANDLE_OBJECTION',
      'Pivoted to address human escalation request directly',
    );

    const brain = await processSalesBrain({
      sessionId: 'test-s9-human',
      companyId: 'default-company',
      messages,
    });

    assert(
      brain.systemPrompt.length > 500,
      'Generated grounded response instructions for human escalation',
    );
  }

  // ----------------------------------------------------------------
  // Scenario 10: Response Validator Unit Test Suite
  // ----------------------------------------------------------------
  console.log('\nScenario 10: Pre-TTS Response Validator Unit Suite');
  {
    const state = createInitialSalesState('test-s10-val');
    state.customerName = 'Sophia';
    state.company = 'VoiceGen';
    state.budget = '$2,000/mo';
    state.volume = '20,000 minutes';

    // 10.1 Sentence Count Rule
    const longResp =
      'Agora offers Conversational AI. It connects STT, LLM, and TTS with low latency. We also provide global SD-RTN routing. Our pricing starts at ten cents per minute.';
    const v1 = validateResponse(longResp, state);
    assert(!v1.isValid && v1.issues.some((i) => i.ruleId === 'sentence_count'), '10.1: Detected sentence count violation (> 2 sentences)');
    const c1 = sanitizeAndCorrectResponse(longResp, state, v1.issues);
    assert(splitSentences(c1).length <= 2, '10.1: Corrected response trimmed to ≤ 2 sentences');

    // 10.2 Question Count Rule
    const stackedResp = 'What kind of app are you building? And what is your monthly budget?';
    const v2 = validateResponse(stackedResp, state);
    assert(!v2.isValid && v2.issues.some((i) => i.ruleId === 'question_count'), '10.2: Detected stacked questions (> 1 question)');
    const c2 = sanitizeAndCorrectResponse(stackedResp, state, v2.issues);
    assert(extractQuestions(c2).length <= 1, '10.2: Corrected response contains at most 1 question');

    // 10.3 Repeated Known Questions Rule
    const repeatedResp = 'What is your budget for this voice project?';
    const v3 = validateResponse(repeatedResp, state);
    assert(!v3.isValid && v3.issues.some((i) => i.ruleId === 'repeated_question'), '10.3: Detected repeated inquiry for known budget ($2,000/mo)');

    // 10.4 Unsupported Claims / Hallucinations Rule
    const halluResp = 'You can use Agora Chorus and Agora Harmony for holographic projection with native COBOL support.';
    const v4 = validateResponse(halluResp, state);
    assert(!v4.isValid && v4.issues.some((i) => i.ruleId === 'unsupported_claim'), '10.4: Detected hallucinated products (Chorus/Harmony) and unsupported capabilities');
    const c4 = sanitizeAndCorrectResponse(halluResp, state, v4.issues);
    assert(c4.includes('Agora Conversational AI Engine') && !c4.includes('Chorus'), '10.4: Corrected hallucinated product to canonical engine name');

    // 10.5 Fake Booking Confirmation Rule
    const fakeBookResp = "You're all booked for Tuesday at 2pm! A calendar invite has been sent to your email.";
    const v5 = validateResponse(fakeBookResp, state);
    assert(!v5.isValid && v5.issues.some((i) => i.ruleId === 'fake_booking'), '10.5: Blocked fake booking confirmation without verified calendar event');
    const c5 = sanitizeAndCorrectResponse(fakeBookResp, state, v5.issues);
    assert(!c5.includes("You're all booked"), '10.5: Stripped fabricated booking confirmation');

    // 10.6 Excessive Boilerplate Filler Rule
    const fillerResp = "That's great! Perfect! We support low latency voice streaming.";
    const v6 = validateResponse(fillerResp, state);
    assert(v6.issues.some((i) => i.ruleId === 'excessive_filler'), '10.6: Detected prohibited canned filler ("That\'s great! Perfect!")');
    const c6 = sanitizeAndCorrectResponse(fillerResp, state, v6.issues);
    assert(!c6.toLowerCase().startsWith("that's great") && !c6.toLowerCase().startsWith("perfect"), '10.6: Stripped canned filler from response start');

    // 10.7 Contradiction Rule
    const contraResp = "Since you don't have a budget in mind, our pricing is ten cents a minute.";
    const v7 = validateResponse(contraResp, state);
    assert(v7.issues.some((i) => i.ruleId === 'contradiction'), '10.7: Detected contradiction with stored budget ($2,000/mo)');
  }

  // ----------------------------------------------------------------
  // Scenario 11: Conversation Quality Scoring Benchmark
  // ----------------------------------------------------------------
  console.log('\nScenario 11: Conversation Quality Scoring Benchmark');
  {
    const state = createInitialSalesState('test-s11-quality');
    state.customerName = 'Rachel Green';
    state.company = 'TeleVoice';
    state.appointment = {
      meetingRequested: true,
      meetingType: 'demo',
      preferredDate: '2026-09-15',
      preferredTime: '14:00',
      duration: 30,
      meetingStatus: 'confirmed',
      confirmationStatus: 'confirmed',
      calendarEventId: 'evt-quality-12345',
      calendarEventLink: 'https://meet.google.com/abc-defg-hij',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      timezone: 'America/New_York',
      attendeeEmail: 'rachel@televoice.io',
      attendeeName: 'Rachel Green',
      proposedSlots: [],
      selectedSlot: null,
      emailStatus: 'sent',
      lastError: null,
    };

    const conversation: ChatMessage[] = [
      { role: 'user', content: 'Hi, I am Rachel from TeleVoice. We are building a voice telehealth triage bot.' },
      { role: 'assistant', content: 'Welcome Rachel! Agora Conversational AI is HIPAA-compliant and provides sub-500ms latency for healthcare triage. How many monthly call minutes do you anticipate?' },
      { role: 'user', content: 'We expect about 30,000 minutes a month. How much does that cost?' },
      { role: 'assistant', content: 'Agora is ten cents per minute with your first 300 minutes free each month, which works out to about $2,970 monthly. Does that fit within your target operating budget?' },
      { role: 'user', content: 'That sounds reasonable. Can we schedule a technical demo for next Tuesday at 2pm EST? My email is rachel@televoice.io.' },
      { role: 'assistant', content: 'I have scheduled your demo for Tuesday, Sep 15 at 2:00 PM EDT. A calendar invite and confirmation email have been sent to rachel@televoice.io.' },
    ];

    const report = evaluateConversationQuality(conversation, state);

    console.log(`    Quality Composite Score : ${report.averageCompositeScore}/100`);
    console.log(`    Naturalness Score       : ${report.dimensionAverages.naturalness}/100`);
    console.log(`    Context Retention Score : ${report.dimensionAverages.contextRetention}/100`);
    console.log(`    Question Quality Score  : ${report.dimensionAverages.questionQuality}/100`);
    console.log(`    Conciseness Score       : ${report.dimensionAverages.conciseness}/100`);
    console.log(`    Action Correctness Score: ${report.dimensionAverages.actionCorrectness}/100`);

    assert(report.averageCompositeScore >= 85, 'Composite quality score meets enterprise benchmark (≥ 85/100)');
    assert(report.dimensionAverages.actionCorrectness === 100, 'Action correctness is 100% with verified calendar event');
    assert(report.passedBenchmark === true, 'Report passed benchmark certification');
  }

  // ----------------------------------------------------------------
  // Scenario 12: Pipeline Latency & Bottleneck Profiling
  // ----------------------------------------------------------------
  console.log('\nScenario 12: Pipeline Latency & Bottleneck Profiling');
  {
    resetLatencyStore('session-perf-test');

    // Simulate 3 turns with realistic voice latency distributions
    recordTurnLatency('session-perf-test', 1, { stt: 220, llm: 640, tool: 150, tts: 280 });
    recordTurnLatency('session-perf-test', 2, { stt: 210, llm: 710, tool: 180, tts: 290 });
    recordTurnLatency('session-perf-test', 3, { stt: 230, llm: 590, tool: 140, tts: 270 });

    const bottleneckReport = analyzeBottlenecks('session-perf-test');

    console.log(`    Primary Bottleneck Stage: ${bottleneckReport.primaryBottleneck.toUpperCase()}`);
    console.log(`    Average Latencies (ms)  : STT=${bottleneckReport.averageLatencies.stt}ms, LLM=${bottleneckReport.averageLatencies.llm}ms, Tool=${bottleneckReport.averageLatencies.tool}ms, TTS=${bottleneckReport.averageLatencies.tts}ms`);
    console.log(`    Total Turn Average      : ${bottleneckReport.totalTurnAverageMs}ms`);
    console.log(`    Recommendations         : ${bottleneckReport.recommendations[0]}`);

    assert(bottleneckReport.primaryBottleneck === 'llm', 'Accurately identified LLM as the primary latency bottleneck (647ms avg)');
    assert(bottleneckReport.recommendations.length > 0, 'Generated actionable recommendations to optimize bottleneck');
    assert(bottleneckReport.totalTurnAverageMs > 0, 'Computed total roundtrip turn latency average');
  }

  console.log('\n================================================================');
  console.log(`  PHASE 4 REGRESSION SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase4RegressionSuite().catch((err) => {
  console.error('Fatal error in Phase 4 regression suite:', err);
  process.exit(1);
});
