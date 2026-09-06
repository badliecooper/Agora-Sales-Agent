import { processSalesBrain } from '../lib/sales/brain';
import {
  resetSessionSalesState,
  calculateCalibratedLeadScore,
} from '../lib/sales/tracker';
import { ingestDocument } from '../lib/knowledge/service';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}\n`);
    throw new Error(`[Assertion Failure] ${message}`);
  }
}

async function runNegotiationAndObjectionVerification() {
  console.log('====================================================');
  console.log('  Negotiation & Objection Handling Engine Test Suite ');
  console.log('====================================================\n');

  // Seed vector store with official Agora pricing & objection knowledge
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
      - Unsupported / Custom features: On-premise mainframe COBOL, holographic video, analog tape interfaces are NOT supported and must be verified with solutions engineering.
    `,
  });
  console.log('✓ Vector store seeded with pricing and competitive knowledge\n');

  // =========================================================================
  // Scenario 1: "Your pricing is too expensive."
  // =========================================================================
  console.log('--- Scenario 1: "Your pricing is too expensive." ---');
  const session1 = 'test-session-sc1-' + Date.now();
  resetSessionSalesState(session1);

  const res1 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session1,
    messages: [
      { role: 'assistant', content: 'Our Conversational AI Engine is $0.10 per minute with 300 free minutes monthly.' },
      { role: 'user', content: 'Your pricing is too expensive for our team.' },
    ],
  });

  const state1 = res1.salesState;
  assert(
    state1.salesStage === 'objection_handling',
    `Scenario 1: Stage should be objection_handling, got ${state1.salesStage}`,
  );
  assert(
    state1.detectedObjections.some((o) => o.type === 'price_too_high'),
    'Scenario 1: Should detect price_too_high objection',
  );
  assert(
    res1.retrievedChunks.length > 0,
    'Scenario 1: Should retrieve Pinecone knowledge chunks',
  );
  assert(
    res1.systemPrompt.includes('$0.10'),
    'Scenario 1: System prompt must include grounded pricing facts',
  );
  assert(
    state1.nextBestAction.toLowerCase().includes('price_objection') ||
      state1.nextBestAction.toLowerCase().includes('20% annual'),
    `Scenario 1: nextBestAction should address price objection, got "${state1.nextBestAction}"`,
  );
  console.log(`✓ Objection Type    : ${state1.detectedObjections.map((o) => o.type).join(', ')}`);
  console.log(`✓ Objection Severity: ${state1.detectedObjections[0]?.severity}`);
  console.log(`✓ Stage             : ${state1.salesStage}`);
  console.log(`✓ Next Best Action  : ${state1.nextBestAction}`);
  console.log(`✓ Lead Score        : ${state1.leadScore}\n`);

  // =========================================================================
  // Scenario 2: "Our competitor is 20% cheaper."
  // =========================================================================
  console.log('--- Scenario 2: "Our competitor is 20% cheaper." ---');
  const session2 = 'test-session-sc2-' + Date.now();
  resetSessionSalesState(session2);

  const res2 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session2,
    messages: [
      { role: 'assistant', content: 'Agora provides full turn-taking conversational voice agents.' },
      { role: 'user', content: 'Our competitor is 20% cheaper than Agora.' },
    ],
  });

  const state2 = res2.salesState;
  assert(
    state2.salesStage === 'objection_handling',
    `Scenario 2: Stage should be objection_handling, got ${state2.salesStage}`,
  );
  assert(
    state2.detectedObjections.some((o) => o.type === 'competitor_cheaper'),
    'Scenario 2: Should detect competitor_cheaper objection',
  );
  assert(
    state2.nextBestAction.toLowerCase().includes('sub-500ms') ||
      state2.nextBestAction.toLowerCase().includes('sd-rtn') ||
      state2.nextBestAction.toLowerCase().includes('competitor'),
    `Scenario 2: nextBestAction should focus on Agora competitive strengths, got "${state2.nextBestAction}"`,
  );
  assert(
    res2.systemPrompt.includes('sub-500ms') || res2.systemPrompt.includes('SD-RTN'),
    'Scenario 2: Prompt should provide competitive grounding facts',
  );
  console.log(`✓ Objection Type    : ${state2.detectedObjections.map((o) => o.type).join(', ')}`);
  console.log(`✓ Stage             : ${state2.salesStage}`);
  console.log(`✓ Next Best Action  : ${state2.nextBestAction}\n`);

  // =========================================================================
  // Scenario 3: "Can you give me 30% discount?"
  // =========================================================================
  console.log('--- Scenario 3: "Can you give me 30% discount?" ---');
  const session3 = 'test-session-sc3-' + Date.now();
  resetSessionSalesState(session3);

  const res3 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session3,
    messages: [
      { role: 'assistant', content: 'We offer flexible pay-as-you-go and subscription options.' },
      { role: 'user', content: 'Can you give me 30% discount?' },
    ],
  });

  const state3 = res3.salesState;
  assert(
    state3.negotiation !== undefined,
    'Scenario 3: Negotiation state must be populated',
  );
  assert(
    state3.negotiation.requestedDiscount === '30%',
    `Scenario 3: requestedDiscount should be 30%, got "${state3.negotiation.requestedDiscount}"`,
  );
  assert(
    state3.negotiation.approvalRequired === true,
    'Scenario 3: approvalRequired must be TRUE for 30% discount',
  );
  assert(
    state3.negotiation.allowedDiscount === '20% (annual commitment)',
    `Scenario 3: allowedDiscount should cite official 20% annual plan, got "${state3.negotiation.allowedDiscount}"`,
  );
  assert(
    state3.negotiation.negotiationStatus === 'counter_offered',
    `Scenario 3: negotiationStatus should be counter_offered, got "${state3.negotiation.negotiationStatus}"`,
  );
  assert(
    res3.systemPrompt.includes('NEVER claim that a discount has been approved when it has not') ||
      res3.systemPrompt.includes('NEVER promise or invent custom discounts'),
    'Scenario 3: System prompt must strictly guard against claiming approval for unapproved discounts',
  );
  console.log(`✓ Requested Discount: ${state3.negotiation.requestedDiscount}`);
  console.log(`✓ Allowed Discount  : ${state3.negotiation.allowedDiscount}`);
  console.log(`✓ Approval Required : ${state3.negotiation.approvalRequired}`);
  console.log(`✓ Status            : ${state3.negotiation.negotiationStatus}`);
  console.log(`✓ Next Offer        : ${state3.negotiation.nextOffer}\n`);

  // =========================================================================
  // Scenario 4: "I need approval from my manager."
  // =========================================================================
  console.log('--- Scenario 4: "I need approval from my manager." ---');
  const session4 = 'test-session-sc4-' + Date.now();
  resetSessionSalesState(session4);

  const res4 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session4,
    messages: [
      { role: 'assistant', content: 'Would you like to move forward with a custom plan?' },
      { role: 'user', content: 'I need approval from my manager before I can sign off.' },
    ],
  });

  const state4 = res4.salesState;
  assert(
    state4.detectedObjections.some((o) => o.type === 'need_approval'),
    'Scenario 4: Should detect need_approval objection',
  );
  assert(
    state4.salesStage === 'objection_handling',
    `Scenario 4: Stage should be objection_handling, got ${state4.salesStage}`,
  );
  assert(
    state4.nextBestAction.toLowerCase().includes('decision_maker') ||
      state4.nextBestAction.toLowerCase().includes('manager'),
    `Scenario 4: nextBestAction should offer to include manager, got "${state4.nextBestAction}"`,
  );
  console.log(`✓ Objection Type    : ${state4.detectedObjections.map((o) => o.type).join(', ')}`);
  console.log(`✓ Next Best Action  : ${state4.nextBestAction}\n`);

  // =========================================================================
  // Scenario 5: "We want to deploy this within 2 months."
  // =========================================================================
  console.log('--- Scenario 5: "We want to deploy this within 2 months." ---');
  const session5 = 'test-session-sc5-' + Date.now();
  resetSessionSalesState(session5);

  const res5 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session5,
    messages: [
      { role: 'assistant', content: 'What is your target launch schedule?' },
      { role: 'user', content: 'We want to deploy this within 2 months.' },
    ],
  });

  const state5 = res5.salesState;
  assert(
    state5.timeline?.includes('2 months') || state5.qualification.timeline?.includes('2 months'),
    `Scenario 5: Timeline should be recorded as 2 months, got "${state5.timeline}"`,
  );
  assert(
    state5.leadScore > 10,
    `Scenario 5: Defined timeline should increase calibrated lead score, got ${state5.leadScore}`,
  );
  console.log(`✓ Captured Timeline : ${state5.timeline}`);
  console.log(`✓ Lead Score        : ${state5.leadScore} (Positive timeline boost verified)\n`);

  // =========================================================================
  // Scenario 6: Customer asks about an unsupported feature
  // =========================================================================
  console.log('--- Scenario 6: Unsupported Feature Request ---');
  const session6 = 'test-session-sc6-' + Date.now();
  resetSessionSalesState(session6);

  const res6 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session6,
    messages: [
      { role: 'assistant', content: 'How can Agora support your technical architecture?' },
      { role: 'user', content: 'Do you support on-premise mainframe COBOL voice synthesis?' },
    ],
  });

  const state6 = res6.salesState;
  assert(
    state6.detectedObjections.some((o) => o.type === 'missing_feature'),
    'Scenario 6: Should detect missing_feature objection',
  );
  assert(
    res6.systemPrompt.includes('solutions engineering') ||
      res6.systemPrompt.includes('not supported out-of-the-box') ||
      res6.systemPrompt.includes('verify'),
    'Scenario 6: System prompt must instruct agent to state feature is unconfirmed and needs engineering verification',
  );
  assert(
    res6.systemPrompt.includes('Do NOT invent'),
    'Scenario 6: Strict zero-hallucination constraint must be enforced',
  );
  console.log(`✓ Detected Objection: ${state6.detectedObjections.map((o) => o.type).join(', ')}`);
  console.log(`✓ Prompt Guardrail  : Verified explicit directive against hallucinating unsupported capabilities\n`);

  // =========================================================================
  // Scenario 7: Customer requests a demo
  // =========================================================================
  console.log('--- Scenario 7: Customer requests a demo ---');
  const session7 = 'test-session-sc7-' + Date.now();
  resetSessionSalesState(session7);

  const res7 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session7,
    messages: [
      { role: 'assistant', content: 'Agora provides turn-taking Conversational AI agents.' },
      { role: 'user', content: 'Can we schedule a demo?' },
    ],
  });

  const state7 = res7.salesState;
  assert(
    state7.salesStage === 'closing',
    `Scenario 7: Stage should transition to closing, got ${state7.salesStage}`,
  );
  assert(
    state7.buyingIntent === 'high',
    `Scenario 7: Buying intent should be high, got ${state7.buyingIntent}`,
  );
  assert(
    state7.nextBestAction.toLowerCase().includes('demo'),
    `Scenario 7: nextBestAction should be arrange_demo, got "${state7.nextBestAction}"`,
  );
  assert(
    state7.nextInfoToCollect?.field === 'email',
    `Scenario 7: Should proactively request missing email to book demo, got "${state7.nextInfoToCollect?.field}"`,
  );
  console.log(`✓ Stage             : ${state7.salesStage}`);
  console.log(`✓ Buying Intent     : ${state7.buyingIntent}`);
  console.log(`✓ Next Best Action  : ${state7.nextBestAction}`);
  console.log(`✓ Targeted Ask      : ${state7.nextInfoToCollect?.field} (Zero repeating of known info)\n`);

  // =========================================================================
  // Scenario 8: Customer changes requirement midway through conversation
  // =========================================================================
  console.log('--- Scenario 8: Requirement changed midway through conversation ---');
  const session8 = 'test-session-sc8-' + Date.now();
  resetSessionSalesState(session8);

  // Turn 1: Initial outbound requirement
  const res8a = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session8,
    messages: [
      { role: 'assistant', content: 'Hello! Tell me about the voice project you are planning.' },
      { role: 'user', content: 'I need automated outbound notifications for package delivery updates.' },
    ],
  });
  console.log(`  Turn 1 Need       : ${res8a.salesState.need}`);
  console.log(`  Turn 1 Stage      : ${res8a.salesState.salesStage}`);

  // Turn 2: Customer changes requirements midway
  const res8b = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session8,
    messages: [
      { role: 'user', content: 'I need automated outbound notifications for package delivery updates.' },
      { role: 'assistant', content: 'We can automate outbound updates using our voice engine.' },
      { role: 'user', content: 'Actually, our requirement changed. We need an inbound customer support call center instead.' },
    ],
  });

  const state8 = res8b.salesState;
  assert(
    state8.salesStage === 'needs_analysis',
    `Scenario 8: Stage must move backward to needs_analysis on requirement change, got ${state8.salesStage}`,
  );
  assert(
    state8.need?.toLowerCase().includes('inbound') ||
      state8.qualification.need?.toLowerCase().includes('inbound'),
    `Scenario 8: Need should be updated to inbound customer support, got "${state8.need}"`,
  );
  assert(
    state8.nextBestAction.toLowerCase().includes('clarify_requirement') ||
      state8.nextBestAction.toLowerCase().includes('requirement'),
    `Scenario 8: nextBestAction should be clarify_requirement, got "${state8.nextBestAction}"`,
  );
  console.log(`✓ Updated Need      : ${state8.need}`);
  console.log(`✓ Backward Stage    : ${state8.salesStage} (Evidence-based regression to needs_analysis verified)`);
  console.log(`✓ Next Best Action  : ${state8.nextBestAction}\n`);

  // =========================================================================
  // Negative Lead Scoring Verification
  // =========================================================================
  console.log('--- Negative Lead Scoring Verification ---');
  const dummyProfile = {
    customer: {
      firstName: null,
      lastName: null,
      fullName: null,
      email: null,
      phone: null,
      company: null,
      jobTitle: null,
      companySize: null,
      preferredContactMethod: null,
    },
    qualification: {
      need: null,
      painPoints: [],
      requirements: [],
      currentSolution: null,
      budget: null,
      budgetMin: null,
      budgetMax: null,
      currency: 'USD',
      timeline: null,
      decisionMaker: null,
      decisionProcess: null,
    },
    sales: {
      productsInterested: [],
      competitorsMentioned: [],
      objections: [],
      detectedObjections: [
        {
          id: 'obj-test',
          type: 'price_too_high' as const,
          text: 'way too expensive',
          severity: 'high' as const,
          resolved: false,
          detectedAt: Date.now(),
        },
      ],
      negotiation: {
        customerBudget: null,
        quotedPrice: null,
        requestedDiscount: null,
        allowedDiscount: null,
        approvalRequired: false,
        negotiationStatus: 'not_started' as const,
        lastOffer: null,
        nextOffer: null,
      },
      buyingIntent: 'low' as const,
      salesStage: 'objection_handling' as const,
      nextBestAction: null,
    },
    conversation: {
      informationRequested: [],
      informationRefused: [],
      lastQuestionAsked: null,
    },
  };

  const scoreRejection = calculateCalibratedLeadScore(
    dummyProfile,
    'Not interested, please stop calling us. We have zero budget.',
    'objection_handling',
    'low',
  );
  assert(
    scoreRejection <= 10,
    `Negative penalties should suppress score upon explicit rejection and zero budget, got ${scoreRejection}`,
  );
  console.log(`✓ Explicit Rejection & Zero Budget Score: ${scoreRejection} (Negative penalties properly applied)\n`);

  console.log('====================================================');
  console.log('  All 8 Negotiation & Objection Scenarios Passed!   ');
  console.log('====================================================\n');
}

runNegotiationAndObjectionVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
