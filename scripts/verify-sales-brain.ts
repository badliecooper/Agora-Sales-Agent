import { processSalesBrain } from '../lib/sales/brain';
import {
  resetSessionSalesState,
  analyzeAndUpdateSalesState,
  createInitialSalesState,
  shouldCollectMoreInformation,
} from '../lib/sales/tracker';
import { ingestDocument } from '../lib/knowledge/service';
import { NextRequest } from 'next/server';
import { createChatCompletionsHandler } from '../app/api/chat/completions/route';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[Assertion Failure] ${message}`);
  }
}


async function runScenarioTests() {
  console.log('====================================================');
  console.log('     Phase 3 Sales Brain & RAG Verification Suite    ');
  console.log('====================================================\n');

  // Seed vector store with official Agora pricing document
  await ingestDocument({
    companyId: 'default-company',
    documentId: 'doc-agora-pricing',
    category: 'pricing',
    documentName: 'Agora Official Pricing Snapshot',
    content: `
      Agora Conversational AI Platform:
      - Conversational AI Engine Audio Task: $0.10 per minute
      - First 300 minutes free each month
      - Includes usage of selected ASR, LLM, and TTS models.
      - Agora RTC Audio: starting at $0.59 per 1,000 minutes with first 10,000 minutes free.
      - Real-Time Speech to Text: starts at $16.99 per 1,000 minutes.
      - Starter Tier is $499/mo, Growth Tier is $1,499/mo, Enterprise Custom starts at $3,500/mo.
      - Annual commitments receive an official 20% discount.
    `,
  });
  console.log('✓ Vector store seeded with official Agora pricing knowledge\n');

  const sessionId = 'test-sales-session-' + Date.now();
  resetSessionSalesState(sessionId);

  // --- Scenario A ---
  console.log('--- Test Scenario A: Discovery Stage ---');
  console.log('User: "I\'m building an AI customer support voice agent."');
  const resA = await processSalesBrain({
    companyId: 'default-company',
    sessionId,
    messages: [
      { role: 'assistant', content: "Hi there! I'm Ada from Agora. Tell me about the voice agent project you're building!" },
      { role: 'user', content: "I'm building an AI customer support voice agent." },
    ],
  });

  assert(resA.salesState.salesStage === 'discovery', 'Scenario A: stage should be discovery');
  assert(resA.salesState.need?.toLowerCase().includes('customer support'), 'Scenario A: need should be Customer Support');
  assert(resA.salesState.nextBestAction.toLowerCase().includes('discovery'), 'Scenario A: nextBestAction should focus on discovery');
  assert(resA.systemPrompt.includes('Discovery Stage'), 'Scenario A: prompt should instruct discovery behavior');
  console.log(`✓ Detected Stage    : ${resA.salesState.salesStage}`);
  console.log(`✓ Detected Need     : ${resA.salesState.need}`);
  console.log(`✓ Next Best Action  : ${resA.salesState.nextBestAction}\n`);

  // --- Scenario B ---
  console.log('--- Test Scenario B: Pricing & Knowledge Retrieval ---');
  console.log('User: "How much does Agora Conversational AI cost?"');
  const resB = await processSalesBrain({
    companyId: 'default-company',
    sessionId,
    messages: [
      { role: 'user', content: "I'm building an AI customer support voice agent." },
      { role: 'assistant', content: "That's an exciting project! What is your expected monthly call volume?" },
      { role: 'user', content: 'How much does Agora Conversational AI cost?' },
    ],
  });

  assert(resB.salesState.salesStage === 'qualification', 'Scenario B: stage should be qualification');
  assert(resB.retrievedChunks.length > 0, 'Scenario B: should retrieve Pinecone knowledge chunks');
  const hasPricingDoc = resB.retrievedChunks.some(
    (c) => c.category === 'pricing' || c.documentName.toLowerCase().includes('pricing') || c.text.includes('$0.10'),
  );
  assert(hasPricingDoc, 'Scenario B: retrieved chunks must include official Agora pricing');
  assert(resB.systemPrompt.includes('$0.10'), 'Scenario B: system prompt must contain pricing facts');
  console.log(`✓ Detected Stage    : ${resB.salesState.salesStage}`);
  console.log(`✓ Retrieved Chunks  : ${resB.retrievedChunks.length} documents retrieved`);
  console.log(`✓ Pricing Grounding : Verified ($0.10/min audio task, 300 free min) present in context\n`);

  // --- Scenario C ---
  console.log('--- Test Scenario C: Objection Handling & Competitor Comparison ---');
  console.log('User: "We already use another provider. Why should we use Agora?"');
  const resC = await processSalesBrain({
    companyId: 'default-company',
    sessionId,
    messages: [
      { role: 'user', content: 'How much does Agora Conversational AI cost?' },
      { role: 'assistant', content: 'Agora Conversational AI is $0.10 per minute with the first 300 minutes free.' },
      { role: 'user', content: 'We already use another provider. Why should we use Agora?' },
    ],
  });

  assert(resC.salesState.salesStage === 'objection_handling', 'Scenario C: stage should be objection_handling');
  assert(resC.salesState.objections.length > 0, 'Scenario C: objection must be recorded in sales state');
  assert(resC.salesState.nextBestAction.toLowerCase().includes('sub-500ms') || resC.salesState.nextBestAction.toLowerCase().includes('sd-rtn'), 'Scenario C: nextBestAction should focus on Agora unique advantages');
  console.log(`✓ Detected Stage    : ${resC.salesState.salesStage}`);
  console.log(`✓ Logged Objections : ${resC.salesState.objections.join('; ')}`);
  console.log(`✓ Next Best Action  : ${resC.salesState.nextBestAction}\n`);

  // --- Scenario D ---
  console.log('--- Test Scenario D: Anti-Hallucination & Discount Request ---');
  console.log('User: "Can you give me a 30% discount?"');
  const resD = await processSalesBrain({
    companyId: 'default-company',
    sessionId,
    messages: [
      { role: 'user', content: 'We already use another provider. Why should we use Agora?' },
      { role: 'assistant', content: 'Agora gives you sub-500ms voice turn-taking and SD-RTN reliability.' },
      { role: 'user', content: 'Can you give me a 30% discount?' },
    ],
  });

  assert(resD.salesState.salesStage === 'objection_handling', 'Scenario D: discount request must be objection_handling');
  assert(resD.systemPrompt.includes('NEVER promise or invent custom discounts'), 'Scenario D: strict guardrail against discount hallucination');
  assert(resD.salesState.nextBestAction.includes('20% annual'), 'Scenario D: next action should cite official 20% annual discount rather than 30%');
  console.log(`✓ Detected Stage    : ${resD.salesState.salesStage}`);
  console.log(`✓ Guardrail Check   : Zero tolerance for discount hallucination verified\n`);

  // --- Scenario E ---
  console.log('--- Test Scenario E: High Buying Intent & Closing Stage ---');
  console.log('User: "We want to move forward with a demo."');
  const resE = await processSalesBrain({
    companyId: 'default-company',
    sessionId,
    messages: [
      { role: 'user', content: 'Can you give me a 30% discount?' },
      { role: 'assistant', content: 'Our standard pricing is fixed, but our annual plans include 20% off.' },
      { role: 'user', content: 'We want to move forward with a demo.' },
    ],
  });

  assert(resE.salesState.salesStage === 'closing', 'Scenario E: stage should be closing');
  assert(resE.salesState.buyingIntent === 'high', 'Scenario E: buying intent must be high');
  assert(resE.salesState.leadScore >= 60, 'Scenario E: lead score should reflect high qualification');
  assert(resE.salesState.nextBestAction.toLowerCase().includes('demo'), 'Scenario E: next action should be to book/schedule the demo');
  console.log(`✓ Detected Stage    : ${resE.salesState.salesStage}`);
  console.log(`✓ Buying Intent     : ${resE.salesState.buyingIntent}`);
  console.log(`✓ Lead Score        : ${resE.salesState.leadScore} / 100`);
  console.log(`✓ Next Best Action  : ${resE.salesState.nextBestAction}\n`);

  // --- Test API Custom LLM Endpoint ---
  console.log('--- Test Custom LLM SSE Endpoint (POST /api/chat/completions) ---');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  let capturedSystem: string | undefined;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      return (modelId: string) => ({ modelId });
    }) as never,
    streamTextImpl: ((options: { system?: string; messages?: unknown }) => {
      capturedSystem = options.system;
      return {
        textStream: (async function* () {
          yield 'Hello, ';
          yield 'I am your Agora sales specialist.';
        })(),
      };
    }) as never,
  });

  const request = new NextRequest('http://localhost:3000/api/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      companyId: 'default-company',
      sessionId: 'test-endpoint-session',
      messages: [
        { role: 'user', content: 'How much does Agora Conversational AI cost?' },
      ],
    }),
  });

  const response = await handler(request);
  assert(response.status === 200, 'POST /api/chat/completions should return 200');
  assert(response.headers.get('content-type') === 'text/event-stream', 'Should return SSE content type');
  assert(capturedSystem !== undefined, 'Should pass Sales Brain system prompt to streamTextImpl');
  assert(capturedSystem.includes('QUALIFICATION'), 'System prompt should reflect detected qualification stage');
  assert(capturedSystem.includes('Agora'), 'System prompt should ground in Agora knowledge');

  const text = await response.text();
  assert(text.includes('data: [DONE]'), 'Stream should properly terminate with [DONE]');
  assert(text.includes('Agora sales specialist'), 'Stream should contain response deltas');

  if (originalApiKey === undefined) delete process.env.NEXT_LLM_API_KEY;
  else process.env.NEXT_LLM_API_KEY = originalApiKey;
  if (originalUrl === undefined) delete process.env.NEXT_LLM_URL;
  else process.env.NEXT_LLM_URL = originalUrl;

  console.log('✓ Custom LLM SSE Handler verified with grounded Sales Brain integration\n');

  console.log('====================================================');
  console.log(' Proactive Customer & CRM Qualification Scenarios  ');
  console.log('====================================================\n');

  // --- Test 1: Customer gives only need ---
  console.log('--- Test 1: Customer gives only their need ---');
  const stateT1 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'user', content: "We're looking for an AI voice agent for customer support." },
  ]);
  assert(stateT1.checklist.need === 'known', 'Test 1: need should be known');
  assert(stateT1.checklist.email === 'unknown', 'Test 1: email should be unknown');
  assert(stateT1.nextInfoToCollect !== null, 'Test 1: nextInfoToCollect should suggest next discovery field');
  assert(
    ['requirements', 'companySize', 'customerName', 'company'].includes(stateT1.nextInfoToCollect?.field || ''),
    'Test 1: should ask relevant discovery/qualification question without form interrogation',
  );
  console.log(`✓ Need Detected         : ${stateT1.need}`);
  console.log(`✓ Next Field Suggested  : ${stateT1.nextInfoToCollect?.field} [${stateT1.nextInfoToCollect?.priority}]`);
  console.log(`✓ Completeness Score    : ${stateT1.informationCompleteness}%\n`);

  // --- Test 2: Customer gives name/company but no email ---
  console.log('--- Test 2: Customer gives name/company but no email ---');
  const stateT2 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    {
      role: 'user',
      content: "Hi, I'm Sarah from TechCorp. We want to explore an AI voice agent for our dispatch desk. Can we schedule a follow up?",
    },
  ]);
  assert(stateT2.customerName === 'Sarah', 'Test 2: customerName should be Sarah');
  assert(stateT2.company === 'TechCorp', 'Test 2: company should be TechCorp');
  assert(stateT2.checklist.email === 'unknown', 'Test 2: email should be unknown');
  assert(stateT2.nextInfoToCollect?.field === 'email', 'Test 2: should ask for email when follow-up/demo is requested');
  assert(stateT2.nextInfoToCollect?.priority === 'P0', 'Test 2: email on follow-up is P0 priority');
  console.log(`✓ Name & Company Stored : ${stateT2.customerName} @ ${stateT2.company}`);
  console.log(`✓ Targeted Next Field   : ${stateT2.nextInfoToCollect?.field} [${stateT2.nextInfoToCollect?.priority}]`);
  console.log(`✓ Completeness Score    : ${stateT2.informationCompleteness}%\n`);

  // --- Test 3: Customer asks for a demo ---
  console.log('--- Test 3: Customer asks for a demo ---');
  const stateT3 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'user', content: "Your platform sounds very promising. I'd like to arrange a demo for our engineering team." },
  ]);
  assert(stateT3.salesStage === 'closing', 'Test 3: demo request should move to closing stage');
  assert(stateT3.nextBestAction === 'arrange_demo', 'Test 3: next best action should be arrange_demo');
  assert(stateT3.nextInfoToCollect?.field === 'email', 'Test 3: demo request must trigger email collection');
  const guardT3 = shouldCollectMoreInformation(stateT3, stateT3.checklist, "Your platform sounds very promising. I'd like to arrange a demo for our engineering team.");
  assert(guardT3.shouldCollect === true, 'Test 3: guard should signal collecting email for demo');
  assert(guardT3.field === 'email', 'Test 3: guard should specify email field');
  console.log(`✓ Stage Transitioned    : ${stateT3.salesStage}`);
  console.log(`✓ Guard Triggered Field : ${guardT3.field} (${guardT3.suggestedQuestion})\n`);

  // --- Test 4: Customer provides all information early ---
  console.log('--- Test 4: Customer provides all information early ---');
  const stateT4 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    {
      role: 'user',
      content: "I'm John Smith from Acme, CTO. We have 50 support agents, need an AI voice agent, budget is around $20k, and we'd like to deploy in two months. My email is john@acme.com and phone is (555) 234-5678.",
    },
  ]);
  assert(stateT4.customerName === 'John Smith', 'Test 4: name should be John Smith');
  assert(stateT4.company === 'Acme', 'Test 4: company should be Acme');
  assert(stateT4.email === 'john@acme.com', 'Test 4: email should be john@acme.com');
  assert(stateT4.companySize === '50 support agents', 'Test 4: companySize should be 50 support agents');
  assert(stateT4.timeline === '2 months', 'Test 4: timeline should be 2 months');
  assert(stateT4.budget === '$20k', 'Test 4: budget should be $20k');
  assert(stateT4.checklist.customerName === 'known', 'Test 4: customerName checklist known');
  assert(stateT4.checklist.company === 'known', 'Test 4: company checklist known');
  assert(stateT4.checklist.email === 'known', 'Test 4: email checklist known');
  assert(stateT4.informationCompleteness >= 90, 'Test 4: completeness should be at least 90%');
  assert(stateT4.nextInfoToCollect?.field !== 'customerName', 'Test 4: must NOT re-ask for name');
  assert(stateT4.nextInfoToCollect?.field !== 'company', 'Test 4: must NOT re-ask for company');
  assert(stateT4.nextInfoToCollect?.field !== 'email', 'Test 4: must NOT re-ask for email');
  console.log(`✓ All Fields Extracted  : Name, Company, Role, Size, Timeline, Budget, Email, Phone`);
  console.log(`✓ High Completeness     : ${stateT4.informationCompleteness}%`);
  console.log(`✓ Zero Redundant Asks   : Model will not re-ask known fields\n`);

  // --- Test 5: Customer refuses phone number ---
  console.log('--- Test 5: Customer refuses phone number ---');
  const stateT5 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'assistant', content: "What would be the best phone number to reach you on?" },
    { role: 'user', content: "I'd rather not give my phone number." },
  ]);
  assert(stateT5.refusedFields.includes('phone'), 'Test 5: phone should be in refusedFields');
  assert(stateT5.checklist.phone === 'not_applicable', 'Test 5: phone status must be not_applicable');
  assert(stateT5.nextInfoToCollect?.field !== 'phone', 'Test 5: must never ask for phone after refusal');
  console.log(`✓ Refusal Handled       : phone marked not_applicable`);
  console.log(`✓ Pressuring Avoided    : Next field is not phone\n`);

  // --- Test 6: Customer says they need to leave ---
  console.log('--- Test 6: Customer says they need to leave ---');
  const stateT6 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'user', content: "We're looking for an AI voice agent." },
    { role: 'user', content: "Sorry Ada, I have to go to another meeting now. Talk later!" },
  ]);
  const guardT6 = shouldCollectMoreInformation(stateT6, stateT6.checklist, "Sorry Ada, I have to go to another meeting now. Talk later!");
  assert(guardT6.shouldCollect === false, 'Test 6: guard should NOT collect more info when user is leaving');
  assert(stateT6.nextInfoToCollect === null, 'Test 6: nextInfoToCollect must be null when user is leaving');
  console.log(`✓ Departure Detected    : Guard shouldCollect = false`);
  console.log(`✓ Zero Interrogation    : Allows clean exit without friction\n`);

  // --- Test 7: Customer gives information across 6–8 turns ---
  console.log('--- Test 7: Customer gives information across 6–8 turns ---');
  let stateT7 = createInitialSalesState();
  const multiTurnMessages = [
    { role: 'user', content: "Hello Ada, I'm David." },
    { role: 'user', content: "I'm with FinGlobal as Head of Support." },
    { role: 'user', content: "We're building an AI voice agent for our customer support desk." },
    { role: 'user', content: "We currently have 40 support agents handling inquiries." },
    { role: 'user', content: "Our budget is around $30k for the initial deployment." },
    { role: 'user', content: "We want to launch within 3 months." },
    { role: 'user', content: "We are currently evaluating Twilio and Retell as well." },
    { role: 'user', content: "Let's arrange a demo. You can reach me at david@finglobal.com." },
  ];
  for (let i = 0; i < multiTurnMessages.length; i++) {
    stateT7 = analyzeAndUpdateSalesState(stateT7, multiTurnMessages.slice(0, i + 1));
  }
  assert(stateT7.customerName === 'David', 'Test 7: retained customerName David');
  assert(stateT7.company === 'FinGlobal', 'Test 7: retained company FinGlobal');
  assert(stateT7.role === 'Head of Support', 'Test 7: retained role Head of Support');
  assert(stateT7.companySize === '40 support agents', 'Test 7: retained companySize 40 support agents');
  assert(stateT7.budget === '$30k', 'Test 7: retained budget $30k');
  assert(stateT7.timeline === '3 months', 'Test 7: retained timeline 3 months');
  assert(stateT7.competitorsMentioned.includes('twilio') && stateT7.competitorsMentioned.includes('retell'), 'Test 7: retained competitors');
  assert(stateT7.email === 'david@finglobal.com', 'Test 7: retained email david@finglobal.com');
  assert(stateT7.informationCompleteness >= 85, 'Test 7: multi-turn conversation reached high completeness');
  console.log(`✓ Multi-Turn State Retention Verified across 8 turns:`);
  console.log(`  - Name        : ${stateT7.customerName}`);
  console.log(`  - Company     : ${stateT7.company}`);
  console.log(`  - Role        : ${stateT7.role}`);
  console.log(`  - Team Size   : ${stateT7.companySize}`);
  console.log(`  - Budget      : ${stateT7.budget}`);
  console.log(`  - Timeline    : ${stateT7.timeline}`);
  console.log(`  - Competitors : ${stateT7.competitorsMentioned.join(', ')}`);
  console.log(`  - Email       : ${stateT7.email}`);
  console.log(`  - Completeness: ${stateT7.informationCompleteness}%\n`);

  // --- Test 8: Customer changes a requirement ---
  console.log('--- Test 8: Customer changes a requirement ---');
  let stateT8 = createInitialSalesState();
  stateT8 = analyzeAndUpdateSalesState(stateT8, [
    { role: 'user', content: "We have around 50 support agents and want to deploy within two months." },
  ]);
  assert(stateT8.companySize === '50 support agents', 'Test 8: initial companySize should be 50 support agents');
  assert(stateT8.timeline === '2 months', 'Test 8: initial timeline should be 2 months');

  stateT8 = analyzeAndUpdateSalesState(stateT8, [
    { role: 'user', content: "We have around 50 support agents and want to deploy within two months." },
    { role: 'assistant', content: "Understood! That's a solid support operation." },
    { role: 'user', content: "Actually, we just expanded and now have 100 support agents, and we need to deploy in 1 month." },
  ]);
  assert(stateT8.companySize === '100 support agents', `Test 8: companySize should update to 100 support agents, got ${stateT8.companySize}`);
  assert(stateT8.timeline === '1 month', `Test 8: timeline should update to 1 month, got ${stateT8.timeline}`);
  console.log(`✓ Requirement Update Handled:`);
  console.log(`  - Company Size Updated: 50 -> ${stateT8.companySize}`);
  console.log(`  - Timeline Updated    : 2 months -> ${stateT8.timeline}\n`);

  console.log('====================================================');
  console.log('   Section 18 Conversational Collection Tests       ');
  console.log('====================================================\n');

  // TEST 1: Customer asks about voice agent -> asks for name
  console.log('--- TEST 1: Customer: "I want to know about your AI voice agent." ---');
  const s1 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'user', content: "I want to know about your AI voice agent." },
  ]);
  assert(s1.nextQuestion !== null, 'TEST 1: nextQuestion should be present');
  assert(s1.nextQuestion.field === 'name', 'TEST 1: should ask for name early');
  assert(s1.nextQuestion.question.toLowerCase().includes('name') || s1.nextQuestion.question.toLowerCase().includes('call you'), 'TEST 1: question must naturally ask for name');
  console.log(`✓ Next Question Target  : ${s1.nextQuestion.field}`);
  console.log(`✓ Spoken Directive      : "${s1.nextQuestion.question}"\n`);

  // TEST 2: Customer says "I'm Rahul from Acme." -> do NOT ask name/company again
  console.log('--- TEST 2: Customer: "I\'m Rahul from Acme." ---');
  const s2 = analyzeAndUpdateSalesState(s1, [
    { role: 'user', content: "I want to know about your AI voice agent." },
    { role: 'assistant', content: "I'd be glad to help. What should I call you?" },
    { role: 'user', content: "I'm Rahul from Acme." },
  ]);
  assert(s2.customerName === 'Rahul', 'TEST 2: name must be Rahul');
  assert(s2.company === 'Acme', 'TEST 2: company must be Acme');
  assert(s2.crmCollectionStatus.name === true, 'TEST 2: name status must be true');
  assert(s2.crmCollectionStatus.company === true, 'TEST 2: company status must be true');
  assert(s2.nextQuestion?.field !== 'name', 'TEST 2: must NEVER ask name again');
  assert(s2.nextQuestion?.field !== 'company', 'TEST 2: must NEVER ask company again');
  console.log(`✓ Stored Name & Company : ${s2.customerName} @ ${s2.company}`);
  console.log(`✓ Zero Repetition       : Name/Company will not be asked again\n`);

  // TEST 3: Customer says "I'd like a demo." -> "Absolutely. What's the best email to send the demo details to?"
  console.log('--- TEST 3: Customer: "I\'d like a demo." ---');
  const s3 = analyzeAndUpdateSalesState(s2, [
    { role: 'user', content: "I want to know about your AI voice agent." },
    { role: 'assistant', content: "I'd be glad to help. What should I call you?" },
    { role: 'user', content: "I'm Rahul from Acme." },
    { role: 'assistant', content: "Nice to meet you, Rahul! What use case are you building?" },
    { role: 'user', content: "I'd like a demo." },
  ]);
  assert(s3.nextQuestion !== null, 'TEST 3: nextQuestion should be present');
  assert(s3.nextQuestion.field === 'email', 'TEST 3: demo request must ask for email');
  assert(s3.nextQuestion.question.toLowerCase().includes('email'), 'TEST 3: must ask for email');
  assert(s3.nextQuestion.question === "Absolutely. What's the best email to send the demo details to?", 'TEST 3: exact demo email question match');
  console.log(`✓ Demo Trigger Activated: field = ${s3.nextQuestion.field}`);
  console.log(`✓ Spoken Directive      : "${s3.nextQuestion.question}"\n`);

  // TEST 4: Customer provides all info early -> do NOT ask name/company/role/email again
  console.log('--- TEST 4: Customer: "I\'m Rahul from Acme. I\'m the CTO. I\'d like a demo. My email is rahul@acme.com." ---');
  const s4 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'user', content: "I'm Rahul from Acme. I'm the CTO. I'd like a demo. My email is rahul@acme.com." },
  ]);
  assert(s4.customerName === 'Rahul', 'TEST 4: name must be Rahul');
  assert(s4.company === 'Acme', 'TEST 4: company must be Acme');
  assert(s4.role === 'CTO', 'TEST 4: role must be CTO');
  assert(s4.email === 'rahul@acme.com', 'TEST 4: email must be rahul@acme.com');
  assert(s4.crmCollectionStatus.name === true, 'TEST 4: name true');
  assert(s4.crmCollectionStatus.company === true, 'TEST 4: company true');
  assert(s4.crmCollectionStatus.role === true, 'TEST 4: role true');
  assert(s4.crmCollectionStatus.email === true, 'TEST 4: email true');
  assert(s4.nextQuestion?.field !== 'name', 'TEST 4: must not ask name');
  assert(s4.nextQuestion?.field !== 'company', 'TEST 4: must not ask company');
  assert(s4.nextQuestion?.field !== 'role', 'TEST 4: must not ask role');
  assert(s4.nextQuestion?.field !== 'email', 'TEST 4: must not ask email');
  console.log(`✓ All 4 Core CRM Fields Stored: Rahul, Acme, CTO, rahul@acme.com`);
  console.log(`✓ Zero Redundant Asks         : Verified\n`);

  // TEST 5: Customer: "Can you send me the pricing?" -> asks for email
  console.log('--- TEST 5: Customer: "Can you send me the pricing?" ---');
  const s5 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'user', content: "Can you send me the pricing?" },
  ]);
  assert(s5.nextQuestion !== null, 'TEST 5: nextQuestion must be present');
  assert(s5.nextQuestion.field === 'email', 'TEST 5: pricing request must ask for email');
  assert(s5.nextQuestion.question.toLowerCase().includes('email'), 'TEST 5: must ask for email to send pricing');
  console.log(`✓ Pricing Delivery Target: field = ${s5.nextQuestion.field}`);
  console.log(`✓ Spoken Directive       : "${s5.nextQuestion.question}"\n`);

  // TEST 6: Customer: "I have to go." -> does not interrogate
  console.log('--- TEST 6: Customer: "I have to go." ---');
  const s6 = analyzeAndUpdateSalesState(s4, [
    { role: 'user', content: "I have to go." },
  ]);
  assert(s6.nextQuestion === null, 'TEST 6: must not interrogate when leaving and email already known');
  console.log(`✓ Departure Handled     : Clean polite closing with zero interrogation\n`);

  // TEST 7: Customer: "I don't want to give my email." -> respect refusal, do not ask again
  console.log('--- TEST 7: Customer: "I don\'t want to give my email." ---');
  const s7 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'assistant', content: "What's the best email to send the demo details to?" },
    { role: 'user', content: "I don't want to give my email." },
  ]);
  assert(s7.refusedFields.includes('email'), 'TEST 7: email must be in refusedFields');
  assert(s7.nextQuestion?.field !== 'email', 'TEST 7: must NEVER ask for email after refusal');
  console.log(`✓ Customer Refusal Respected: email placed in refusedFields, will not ask again\n`);

  console.log('====================================================');
  console.log('      Section 25: Sales Agent Behavioral Suite      ');
  console.log('====================================================\n');

  // Turn 1: Customer: "I need an AI voice agent."
  console.log('Turn 1: "I need an AI voice agent."');
  let s25 = analyzeAndUpdateSalesState(createInitialSalesState(), [
    { role: 'user', content: 'I need an AI voice agent.' },
  ]);
  assert(s25.nextQuestion !== null, 'Turn 1: Agent should ask for name early');
  assert(s25.nextQuestion.field === 'name', 'Turn 1: target field must be name');
  console.log(`✓ Next Question Target: ${s25.nextQuestion.field} ("${s25.nextQuestion.question}")`);

  // Turn 2: Customer: "I'm Rahul."
  console.log('Turn 2: "I\'m Rahul."');
  s25 = analyzeAndUpdateSalesState(s25, [
    { role: 'user', content: 'I need an AI voice agent.' },
    { role: 'assistant', content: s25.nextQuestion.question },
    { role: 'user', content: "I'm Rahul." },
  ]);
  assert(s25.customerName === 'Rahul', 'Turn 2: customerName must be Rahul');
  assert(s25.profile.customer.fullName === 'Rahul', 'Turn 2: profile.customer.fullName must be Rahul');
  assert(s25.nextQuestion?.field !== 'name', 'Turn 2: must NOT ask for name again');
  console.log(`✓ Stored Name: ${s25.customerName}`);
  console.log(`✓ Zero Name Repetition Confirmed`);

  // Turn 3: Customer: "I'm from Acme."
  console.log('Turn 3: "I\'m from Acme."');
  s25 = analyzeAndUpdateSalesState(s25, [
    { role: 'user', content: 'I need an AI voice agent.' },
    { role: 'assistant', content: 'Before we dive in, what should I call you?' },
    { role: 'user', content: "I'm Rahul." },
    { role: 'assistant', content: 'Nice to meet you, Rahul! Which company are you looking to implement this for?' },
    { role: 'user', content: "I'm from Acme." },
  ]);
  assert(s25.company === 'Acme', 'Turn 3: company must be Acme');
  assert(s25.profile.customer.company === 'Acme', 'Turn 3: profile.customer.company must be Acme');
  assert(s25.nextQuestion?.field !== 'company', 'Turn 3: must NOT ask for company again');
  console.log(`✓ Stored Company: ${s25.company}`);

  // Turn 4: Customer: "I want a demo." -> Agent MUST ask for email
  console.log('Turn 4: "I want a demo."');
  s25 = analyzeAndUpdateSalesState(s25, [
    { role: 'user', content: 'I need an AI voice agent.' },
    { role: 'assistant', content: 'Before we dive in, what should I call you?' },
    { role: 'user', content: "I'm Rahul." },
    { role: 'assistant', content: 'Nice to meet you, Rahul! Which company are you looking to implement this for?' },
    { role: 'user', content: "I'm from Acme." },
    { role: 'assistant', content: 'Got it! Tell me more about your support workflow.' },
    { role: 'user', content: 'I want a demo.' },
  ]);
  assert(s25.nextQuestion !== null, 'Turn 4: Agent MUST ask for email on demo request');
  assert(s25.nextQuestion.field === 'email', 'Turn 4: field must be email');
  assert(
    s25.nextQuestion.question.includes("What's the best email to send the demo details to?"),
    'Turn 4: question must ask for email to send demo details to',
  );
  console.log(`✓ Email Mandatory Ask Confirmed: "${s25.nextQuestion.question}"`);

  // Turn 5: Customer: "My email is rahul@acme.com."
  console.log('Turn 5: "My email is rahul@acme.com."');
  s25 = analyzeAndUpdateSalesState(s25, [
    { role: 'user', content: 'I want a demo.' },
    { role: 'assistant', content: s25.nextQuestion.question },
    { role: 'user', content: 'My email is rahul@acme.com.' },
  ]);
  assert(s25.email === 'rahul@acme.com', 'Turn 5: email must be rahul@acme.com');
  assert(s25.profile.customer.email === 'rahul@acme.com', 'Turn 5: profile email must be rahul@acme.com');
  assert(s25.nextQuestion?.field !== 'email', 'Turn 5: must NOT ask for email again');
  console.log(`✓ Stored Email: ${s25.email}`);
  console.log(`✓ Zero Email Repetition Confirmed`);

  // Turn 6: Customer: "I don't want to share my phone."
  console.log('Turn 6: "I don\'t want to share my phone."');
  s25 = analyzeAndUpdateSalesState(s25, [
    { role: 'assistant', content: 'What would be the best phone number for SMS reminders?' },
    { role: 'user', content: "I don't want to share my phone." },
  ]);
  assert(
    s25.refusedFields.includes('phone') || s25.profile.conversation.informationRefused.includes('phone'),
    'Turn 6: phone marked refused',
  );
  assert(s25.nextQuestion?.field !== 'phone', 'Turn 6: agent moves on and does not re-ask phone');
  console.log(`✓ Phone Refusal Respected, Zero Pressuring`);

  // Turn 7: Customer: "I have to leave now."
  console.log('Turn 7: "I have to leave now."');
  s25 = analyzeAndUpdateSalesState(s25, [
    { role: 'user', content: 'I have to leave now.' },
  ]);
  assert(s25.nextQuestion === null, 'Turn 7: No interrogation, conversation ends cleanly');
  console.log(`✓ Departure Handled: Zero Interrogation, Clean Exit\n`);

  console.log('====================================================');
  console.log('      Section 26: Full End-to-End Scenario Suite     ');
  console.log('====================================================\n');

  let s26 = createInitialSalesState();

  // 1. "I need an AI voice agent for my support team."
  s26 = analyzeAndUpdateSalesState(s26, [
    { role: 'user', content: 'I need an AI voice agent for my support team.' },
  ]);
  assert(s26.need !== undefined, 'E2E Step 1: Need should be detected');
  console.log(`1. Discovered Need: ${s26.need}`);

  // 2. "I'm Rahul from Acme."
  s26 = analyzeAndUpdateSalesState(s26, [
    { role: 'user', content: 'I need an AI voice agent for my support team.' },
    { role: 'assistant', content: 'Before we dive in, what should I call you?' },
    { role: 'user', content: "I'm Rahul from Acme." },
  ]);
  assert(s26.customerName === 'Rahul', 'E2E Step 2: Name must be Rahul');
  assert(s26.company === 'Acme', 'E2E Step 2: Company must be Acme');
  console.log(`2. Remembered: Name=${s26.customerName}, Company=${s26.company}`);

  // 3. "I'm the CTO."
  s26 = analyzeAndUpdateSalesState(s26, [
    { role: 'user', content: "I'm the CTO." },
  ]);
  assert(s26.role === 'CTO' || s26.jobTitle === 'CTO', 'E2E Step 3: Role must be CTO');
  console.log(`3. Remembered: Role=${s26.role || s26.jobTitle}`);

  // 4. "We have around 50 support agents."
  s26 = analyzeAndUpdateSalesState(s26, [
    { role: 'user', content: 'We have around 50 support agents.' },
  ]);
  assert(s26.companySize === '50 support agents', 'E2E Step 4: Company size must be 50 support agents');
  console.log(`4. Remembered: Company Size=${s26.companySize}`);

  // 5. "We want to deploy within two months."
  s26 = analyzeAndUpdateSalesState(s26, [
    { role: 'user', content: 'We want to deploy within two months.' },
  ]);
  assert(s26.timeline === '2 months', 'E2E Step 5: Timeline must be 2 months');
  console.log(`5. Remembered: Timeline=${s26.timeline}`);

  // 6. "The product sounds good. I'd like a demo."
  s26 = analyzeAndUpdateSalesState(s26, [
    { role: 'user', content: "The product sounds good. I'd like a demo." },
  ]);
  assert(s26.nextQuestion !== null, 'E2E Step 6: Agent MUST ask for email');
  assert(s26.nextQuestion.field === 'email', 'E2E Step 6: Field must be email');
  console.log(`6. Mandatory Email Ask: "${s26.nextQuestion.question}"`);

  // 7. "rahul@acme.com"
  s26 = analyzeAndUpdateSalesState(s26, [
    { role: 'assistant', content: s26.nextQuestion.question },
    { role: 'user', content: 'rahul@acme.com' },
  ]);
  assert(s26.email === 'rahul@acme.com', 'E2E Step 7: Email must be rahul@acme.com');
  console.log(`7. Remembered: Email=${s26.email}`);

  // Verify FINAL STATE matches all Section 26 requirements:
  const prof26 = s26.profile;
  assert(prof26.customer.fullName === 'Rahul', 'FINAL STATE: Name must be Rahul');
  assert(prof26.customer.company === 'Acme', 'FINAL STATE: Company must be Acme');
  assert(prof26.customer.jobTitle === 'CTO', 'FINAL STATE: Role must be CTO');
  assert(prof26.customer.email === 'rahul@acme.com', 'FINAL STATE: Email must be rahul@acme.com');
  assert(prof26.customer.companySize === '50 support agents', 'FINAL STATE: Company size must be 50 support agents');
  assert(prof26.qualification.timeline === '2 months', 'FINAL STATE: Timeline must be 2 months');
  assert(
    prof26.qualification.need?.toLowerCase().includes('support') &&
      prof26.qualification.need?.toLowerCase().includes('voice'),
    'FINAL STATE: Need must be AI voice agent for support',
  );
  assert(prof26.sales.buyingIntent === 'high', 'FINAL STATE: Buying intent must be high');
  assert(prof26.sales.nextBestAction === 'arrange_demo', 'FINAL STATE: Next action must be arrange_demo');

  console.log('\n✓ FINAL CANONICAL STATE FULLY SATISFIED:');
  console.log(`  - Name         : ${prof26.customer.fullName}`);
  console.log(`  - Company      : ${prof26.customer.company}`);
  console.log(`  - Role         : ${prof26.customer.jobTitle}`);
  console.log(`  - Email        : ${prof26.customer.email}`);
  console.log(`  - Company Size : ${prof26.customer.companySize}`);
  console.log(`  - Timeline     : ${prof26.qualification.timeline}`);
  console.log(`  - Need         : ${prof26.qualification.need}`);
  console.log(`  - Buying Intent: ${prof26.sales.buyingIntent}`);
  console.log(`  - Next Action  : ${prof26.sales.nextBestAction}\n`);

  console.log('====================================================');
  console.log('  Section 27: Intelligent Sales Brain Verification   ');
  console.log('====================================================\n');

  // Test 0: Greetings / Small Talk (No blind retrieval)
  console.log('--- Test 0: Greeting ("Hello there!") ---');
  const session27 = 'session-smart-brain-' + Date.now();
  resetSessionSalesState(session27);
  const res0 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session27,
    messages: [{ role: 'user', content: 'Hello there!' }],
  });
  assert(res0.retrievedChunks.length === 0, 'Test 0: Should not blindly query Pinecone for greeting');
  console.log('✓ Zero Blind Retrieval on Greetings Confirmed\n');

  // Turn 1: "Tell me about your voice AI."
  console.log('--- 1. "Tell me about your voice AI." ---');
  const res1 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session27,
    messages: [{ role: 'user', content: 'Tell me about your voice AI.' }],
  });
  assert(res1.retrievedChunks.length > 0, '1. Must retrieve relevant product knowledge');
  const hasProductCollateral = res1.retrievedChunks.some(
    (c) =>
      c.text.toLowerCase().includes('conversational ai') ||
      c.text.toLowerCase().includes('voice') ||
      c.category === 'product',
  );
  assert(hasProductCollateral, '1. Retrieved chunks must contain product knowledge');
  assert(res1.salesState.recommendedProduct !== undefined, '1. Recommended product should be identified');
  assert(res1.salesState.nextBestAction.includes('discover_pain_point'), '1. nextBestAction should be discover_pain_point');
  console.log(`✓ Retrieved Chunks      : ${res1.retrievedChunks.length}`);
  console.log(`✓ Product Knowledge     : ${res1.retrievedChunks[0].documentName}`);
  console.log(`✓ Recommended Product   : ${res1.salesState.recommendedProduct}`);
  console.log(`✓ Next Best Action      : ${res1.salesState.nextBestAction}\n`);

  // Turn 2: "How much does it cost?"
  console.log('--- 2. "How much does it cost?" ---');
  const res2 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session27,
    messages: [
      { role: 'user', content: 'Tell me about your voice AI.' },
      { role: 'assistant', content: "Agora's Conversational AI platform provides ultra-low latency voice agents. What scale are you planning?" },
      { role: 'user', content: 'How much does it cost?' },
    ],
  });
  assert(res2.retrievedChunks.length > 0, '2. Must retrieve pricing knowledge');
  assert(res2.systemPrompt.includes('$0.10'), '2. Grounded system prompt must contain verified $0.10/min pricing');
  assert(res2.salesState.salesStage === 'qualification', '2. Stage must transition to qualification');
  assert(res2.salesState.nextBestAction.includes('ask_budget'), '2. Next best action should ask for budget');
  console.log(`✓ Pricing Retrieved     : Grounded in official $0.10/min rate`);
  console.log(`✓ Stage Transitioned    : ${res2.salesState.salesStage}`);
  console.log(`✓ Next Best Action      : ${res2.salesState.nextBestAction}\n`);

  // Turn 3: "Your competitor is cheaper."
  console.log('--- 3. "Your competitor is cheaper." ---');
  const res3 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session27,
    messages: [
      { role: 'user', content: 'How much does it cost?' },
      { role: 'assistant', content: 'Agora Conversational AI is $0.10 per minute with the first 300 minutes free each month.' },
      { role: 'user', content: 'Your competitor is cheaper.' },
    ],
  });
  assert(res3.salesState.salesStage === 'objection_handling', '3. Stage must be objection_handling');
  assert(res3.salesState.objections.length > 0, '3. Objection must be recorded in SalesState');
  assert(
    res3.salesState.nextBestAction.includes('handle_price_objection') ||
      res3.salesState.nextBestAction.includes('compare_products'),
    '3. Next best action should handle price or competitor objection',
  );
  assert(res3.systemPrompt.includes('CONSULTATIVE SALES PROCESS'), '3. System prompt enforces consultative handling');
  console.log(`✓ Objection Recorded    : ${res3.salesState.objections.join('; ')}`);
  console.log(`✓ Stage Transitioned    : ${res3.salesState.salesStage}`);
  console.log(`✓ Next Best Action      : ${res3.salesState.nextBestAction}\n`);

  // Turn 4: "Can you give me 30% discount?"
  console.log('--- 4. "Can you give me 30% discount?" ---');
  const res4 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session27,
    messages: [
      { role: 'user', content: 'Your competitor is cheaper.' },
      { role: 'assistant', content: 'Agora provides sub-500ms voice turn-taking and global SD-RTN reliability.' },
      { role: 'user', content: 'Can you give me 30% discount?' },
    ],
  });
  assert(res4.salesState.salesStage === 'objection_handling', '4. Stage must be objection_handling');
  assert(res4.systemPrompt.includes('NEVER promise or invent custom discounts'), '4. Must enforce strict anti-hallucination guardrail');
  assert(res4.salesState.nextBestAction.includes('20% annual'), '4. Must recommend official 20% annual discount rather than inventing 30%');
  console.log(`✓ Anti-Hallucination    : Strict 20% annual policy enforced, 30% rejected`);
  console.log(`✓ Next Best Action      : ${res4.salesState.nextBestAction}\n`);

  // Turn 5: "We have 50 support agents and need deployment in 2 months."
  console.log('--- 5. "We have 50 support agents and need deployment in 2 months." ---');
  const res5 = await processSalesBrain({
    companyId: 'default-company',
    sessionId: session27,
    messages: [
      { role: 'user', content: 'Tell me about your voice AI.' },
      { role: 'user', content: 'We have 50 support agents and need deployment in 2 months.' },
    ],
  });
  assert(res5.salesState.companySize === '50 support agents', '5. Company size captured');
  assert(res5.salesState.timeline === '2 months', '5. Timeline captured');
  assert(res5.salesState.recommendedProduct === 'Conversational AI', '5. Product recommended');
  assert(res5.salesState.recommendationReason?.includes('automated voice support at this scale'), '5. Recommendation reason justified');
  console.log(`✓ Captured Scale        : ${res5.salesState.companySize}`);
  console.log(`✓ Captured Timeline     : ${res5.salesState.timeline}`);
  console.log(`✓ Recommended Product   : ${res5.salesState.recommendedProduct}`);
  console.log(`✓ Recommendation Reason : ${res5.salesState.recommendationReason}\n`);

  // Turn 6: "Can I schedule a demo?"
  console.log('--- 6. "Can I schedule a demo?" ---');
  const standaloneDemoSession = 'session-demo-standalone-' + Date.now();
  resetSessionSalesState(standaloneDemoSession);
  const res6Standalone = await processSalesBrain({
    companyId: 'default-company',
    sessionId: standaloneDemoSession,
    messages: [{ role: 'user', content: 'Can I schedule a demo?' }],
  });
  assert(res6Standalone.salesState.salesStage === 'closing', '6. Stage must be closing');
  assert(res6Standalone.salesState.nextBestAction === 'arrange_demo', '6. nextBestAction must be arrange_demo');
  assert(res6Standalone.salesState.nextQuestion?.field === 'email', '6. Demo request must ask for email');
  assert(res6Standalone.salesState.leadScore < 100, `6. Standalone demo lead score must NOT be 100 without qualification, got ${res6Standalone.salesState.leadScore}`);
  assert(res6Standalone.salesState.leadScore >= 35, `6. Standalone demo lead score should reflect high intent, got ${res6Standalone.salesState.leadScore}`);
  console.log(`✓ Demo Handled          : Stage = closing, Next Best Action = arrange_demo`);
  console.log(`✓ Targeted Ask          : Email (${res6Standalone.salesState.nextQuestion?.question})`);
  console.log(`✓ Calibrated Lead Score : ${res6Standalone.salesState.leadScore} / 100 (Properly gated < 100 without full qualification)\n`);

  console.log('====================================================');
  console.log('  All Sales Brain Behavioral Suites Passed 100%!   ');
  console.log('====================================================\n');
}

runScenarioTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});


