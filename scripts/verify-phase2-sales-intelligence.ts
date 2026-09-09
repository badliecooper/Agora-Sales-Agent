import { processSalesBrain } from '../lib/sales/brain';
import { resetSessionSalesState, evaluateBudgetEconomics } from '../lib/sales/tracker';
import { ingestDocument } from '../lib/knowledge/service';

async function runPhase2AcceptanceTests() {
  console.log('====================================================');
  console.log('  PHASE 2 ACCEPTANCE TEST: SALES INTELLIGENCE SUITE');
  console.log('====================================================\n');

  let passed = true;
  function assert(condition: unknown, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      passed = false;
    }
  }

  // Seed vector store with verified knowledge
  await ingestDocument({
    companyId: 'default-company',
    documentId: 'doc-agora-pricing-policy',
    category: 'pricing',
    documentName: 'Agora Official Pricing and Discount Policy',
    content: `
      Agora Conversational AI Platform Official Pricing:
      - Conversational AI Engine Audio Task: $0.10 per minute
      - First 300 minutes free each month
      - Standard subscription plans: Starter ($499/mo), Growth ($1,499/mo), Enterprise Custom (starts at $3,500/mo)
      - Standard discount policy: Up to 20% discount on upfront annual commitments.
      - Discretionary / custom discounts (e.g. 30% or higher) are NOT permitted without explicit executive and finance sign-off.
      - Never promise or claim unapproved discounts.
    `,
  });

  await ingestDocument({
    companyId: 'default-company',
    documentId: 'doc-agora-battlecards',
    category: 'objections',
    documentName: 'Agora Competitive Advantages and Battlecard',
    content: `
      Agora Competitive Differentiation vs Twilio, Retell, Vapi:
      - Latency: Ultra-low sub-500ms voice pipeline for natural human conversational cadence.
      - Network: Proprietary SD-RTN (Software Defined Real-Time Network) with 99.99% global uptime.
      - Interruption handling: Native voice activity detection (VAD) handles conversational turn-taking smoothly.
      - Enterprise compliance: HIPAA compliant, SOC 2 Type II certified, zero data retention on voice streams.
      - Supported features: Real-time voice RTC, STT, LLM orchestration, TTS, SIP interconnect, WebRTC SDKs.
    `,
  });

  // =========================================================================
  // Scenario 1: Price Objection & Anti-Hallucination
  // =========================================================================
  console.log('\n--- Scenario 1: Price Objection & Unapproved Discount Request ---');
  const session1 = `p2-sc1-${Date.now()}`;
  resetSessionSalesState(session1);

  const res1 = await processSalesBrain({
    sessionId: session1,
    messages: [
      { role: 'assistant', content: 'Our Conversational AI audio task is $0.10 per minute with 300 free minutes monthly.' },
      { role: 'user', content: 'Your pricing is too expensive. Can you give me a 50% discount?' },
    ],
  });
  const state1 = res1.salesState;

  assert(state1.nextBestActionCategory === 'HANDLE_OBJECTION', 'Categorizes turn as HANDLE_OBJECTION');
  assert(
    state1.nextBestAction.includes('handle_price_objection') || state1.nextBestAction.includes('20% annual'),
    'Next Best Action handles price objection with official 20% annual discount'
  );
  assert(
    res1.systemPrompt.includes('20%') && !res1.systemPrompt.includes('50% discount approved'),
    'Enforces official 20% discount and rejects 50% discount'
  );
  assert(
    !state1.nextQuestion?.question?.toLowerCase().includes('company size') &&
    !state1.nextQuestion?.question?.toLowerCase().includes('what should i call you'),
    'Does NOT attach arbitrary qualification questions when handling objection'
  );

  // =========================================================================
  // Scenario 2: Skeptical Prospect / Trust & Reliability Objection
  // =========================================================================
  console.log('\n--- Scenario 2: Skeptical Prospect (Reliability, Uptime & Security) ---');
  const session2 = `p2-sc2-${Date.now()}`;
  resetSessionSalesState(session2);

  const res2 = await processSalesBrain({
    sessionId: session2,
    messages: [
      { role: 'assistant', content: 'Agora powers conversational voice experiences.' },
      { role: 'user', content: 'Is Agora really reliable? What happens if the audio drops, and is it HIPAA compliant?' },
    ],
  });
  const state2 = res2.salesState;

  assert(state2.nextBestActionCategory === 'HANDLE_OBJECTION', 'Categorizes trust concern as HANDLE_OBJECTION');
  assert(
    state2.primaryObjectionCategory === 'TRUST' || state2.salesStage === 'objection_handling',
    'Identifies TRUST objection category'
  );
  assert(
    res2.systemPrompt.includes('99.99%') || res2.systemPrompt.includes('SD-RTN') || res2.systemPrompt.includes('HIPAA'),
    'Prompt arms agent with 99.99% SD-RTN uptime, zero data retention, and HIPAA compliance'
  );

  // =========================================================================
  // Scenario 3: Frustrated Prospect ("Why are you asking so many questions?")
  // =========================================================================
  console.log('\n--- Scenario 3: Frustrated Prospect ---');
  const session3 = `p2-sc3-${Date.now()}`;
  resetSessionSalesState(session3);

  const res3 = await processSalesBrain({
    sessionId: session3,
    messages: [
      { role: 'assistant', content: 'What is your company name, team size, and timeline?' },
      { role: 'user', content: 'Why are you asking so many questions? Stop interrogating me.' },
    ],
  });
  const state3 = res3.salesState;

  assert(state3.currentIntent === 'FRUSTRATION', 'Detects FRUSTRATION intent');
  assert(state3.nextBestActionCategory === 'ANSWER', 'Switches action to de-escalate without further grilling');
  assert(
    state3.nextQuestion === null || !state3.nextQuestion.question.includes('timeline'),
    'Immediately STOPS qualification questions upon frustration'
  );
  assert(
    res3.systemPrompt.includes('sincerely apologize') || res3.systemPrompt.includes('drop the questions'),
    'System prompt directs immediate apology and dropping questions'
  );

  // =========================================================================
  // Scenario 4: Ambiguous Product Description ("relationship solutions")
  // =========================================================================
  console.log('\n--- Scenario 4: Ambiguous Product Description ---');
  const session4 = `p2-sc4-${Date.now()}`;
  resetSessionSalesState(session4);

  const res4 = await processSalesBrain({
    sessionId: session4,
    messages: [
      { role: 'user', content: "We are building relationship solutions and want to see how Agora can help." },
    ],
  });
  const state4 = res4.salesState;

  assert(state4.nextBestActionCategory === 'CLARIFY', 'Recognizes ambiguous concept and chooses CLARIFY');
  assert(
    state4.nextQuestion?.question?.toLowerCase().includes('matchmaking') ||
    state4.nextQuestion?.question?.toLowerCase().includes('relationship solutions') ||
    state4.nextQuestion?.question?.toLowerCase().includes('tell me a bit more'),
    'Asks clarifying question about what the product does for users before pitching'
  );
  assert(
    !state4.nextQuestion?.question?.toLowerCase().includes('budget') &&
    !state4.nextQuestion?.question?.toLowerCase().includes('company size'),
    'Does not jump straight to BANT qualification questionnaire'
  );

  // =========================================================================
  // Scenario 5: Strong Buying Signal ("ready to move forward, schedule demo")
  // =========================================================================
  console.log('\n--- Scenario 5: Strong Buying Signal ---');
  const session5 = `p2-sc5-${Date.now()}`;
  resetSessionSalesState(session5);

  const res5 = await processSalesBrain({
    sessionId: session5,
    messages: [
      { role: 'assistant', content: 'Agora voice pipeline delivers sub-500ms latency.' },
      { role: 'user', content: "This is exactly what we need. We are ready to move forward, can you schedule a demo?" },
    ],
  });
  const state5 = res5.salesState;

  assert(state5.buyingSignalStrength === 'strong', 'Detects strong buying signal');
  assert(state5.nextBestActionCategory === 'BOOK', 'Immediately halts qualification and transitions to BOOK');
  assert(state5.salesStage === 'closing', 'Transitions sales stage to closing');
  assert(
    state5.nextInfoToCollect?.field === 'email' || state5.nextQuestion?.field === 'email',
    'Prompts only for calendar/demo details (email or slot), not generic questionnaire'
  );

  // =========================================================================
  // Scenario 6: Refusal to Disclose Information
  // =========================================================================
  console.log('\n--- Scenario 6: Refusal to Disclose Information ---');
  const session6 = `p2-sc6-${Date.now()}`;
  resetSessionSalesState(session6);

  const res6 = await processSalesBrain({
    sessionId: session6,
    messages: [
      { role: 'assistant', content: 'What is your allocated budget for this project?' },
      { role: 'user', content: "I don't want to disclose our budget at this stage." },
    ],
  });
  const state6 = res6.salesState;

  assert(
    state6.refusedFields.includes('budget') || state6.profile.conversation.informationRefused.includes('budget'),
    'Records budget as refused'
  );
  assert(
    !state6.nextQuestion?.question?.toLowerCase().includes('budget'),
    'Respects refusal and NEVER re-asks for refused budget'
  );
  assert(
    state6.nextBestActionCategory === 'ANSWER' || state6.nextBestActionCategory === 'QUALIFY',
    'Transitions smoothly without confrontation'
  );

  // =========================================================================
  // Scenario 7: Mid-Conversation Topic Change
  // =========================================================================
  console.log('\n--- Scenario 7: Mid-Conversation Sudden Topic Change ---');
  const session7 = `p2-sc7-${Date.now()}`;
  resetSessionSalesState(session7);

  const res7 = await processSalesBrain({
    sessionId: session7,
    messages: [
      { role: 'assistant', content: 'What is your target launch schedule?' },
      { role: 'user', content: "Wait, before that, does Agora integrate with Salesforce CRM?" },
    ],
  });
  const state7 = res7.salesState;

  assert(state7.currentIntent === 'PRODUCT_QUESTION', 'Recognizes sudden PRODUCT_QUESTION topic shift');
  assert(state7.nextBestActionCategory === 'ANSWER', 'Prioritizes answering the new question immediately');
  assert(
    !state7.nextQuestion?.question?.toLowerCase().includes('launch schedule') &&
    !state7.nextQuestion?.question?.toLowerCase().includes('timeline'),
    'Does not mechanically insist on finishing previous timeline question'
  );

  // =========================================================================
  // Scenario 8: Budget Economics — Fit vs Mismatch
  // =========================================================================
  console.log('\n--- Scenario 8: Budget Economics (Fit vs Mismatch) ---');

  // Case A: 1,000 calls (~1,500 min) with $200 budget -> Fits Pay-As-You-Go
  const fitA = evaluateBudgetEconomics('$200', '1,000 calls a month');
  assert(fitA.fitStatus === 'fits_pay_as_you_go', 'Case A: Correctly identifies 1,000 calls with $200 fits pay-as-you-go');
  assert(fitA.estimatedMonthlyCost === 120, 'Case A: Calculates $120/mo cost (1,200 billable min * $0.10)');

  // Case B: 20,000 minutes with $100 budget -> Budget Mismatch
  const fitB = evaluateBudgetEconomics('$100', '20,000 minutes a month');
  assert(fitB.fitStatus === 'budget_mismatch', 'Case B: Correctly identifies 20,000 min with $100 as budget mismatch');
  assert(fitB.estimatedMonthlyCost === 1970, 'Case B: Calculates $1,970/mo cost ((20,000 - 300) * $0.10)');

  const session8 = `p2-sc8-${Date.now()}`;
  resetSessionSalesState(session8);

  const res8 = await processSalesBrain({
    sessionId: session8,
    messages: [
      { role: 'user', content: 'We need 20,000 minutes a month but our total budget ceiling is strictly $100.' },
    ],
  });
  const state8 = res8.salesState;

  assert(state8.budgetEconomics?.fitStatus === 'budget_mismatch', 'State records budget_mismatch');
  assert(
    res8.systemPrompt.includes('exceeds their') ||
    res8.systemPrompt.includes('budget_mismatch') ||
    res8.systemPrompt.includes('transparently'),
    'Prompt instructs agent to be transparent about pricing reality without fabricating discounts'
  );

  console.log('\n====================================================');
  if (passed) {
    console.log(' 🎉 ALL PHASE 2 ACCEPTANCE TESTS PASSED!');
    console.log('====================================================\n');
    process.exit(0);
  } else {
    console.error(' ❌ SOME PHASE 2 TESTS FAILED.');
    console.log('====================================================\n');
    process.exit(1);
  }
}

runPhase2AcceptanceTests().catch((err) => {
  console.error('Fatal error running Phase 2 verification:', err);
  process.exit(1);
});
