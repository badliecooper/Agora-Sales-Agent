import { createInitialSalesState, analyzeAndUpdateSalesState } from '../lib/sales/tracker';
import { deriveDealIntelligence } from '../lib/sales/deal-intelligence';
import { ChatMessage } from '../lib/sales/types';

function runScenarioTest() {
  console.log('================================================================');
  console.log('🧪 VERIFYING DEAL INTELLIGENCE & OBJECTION TRANSITION FLOW');
  console.log('================================================================\n');

  let state = createInitialSalesState('test-deal-intelligence-session');

  // Verify Initial State
  console.log('1️⃣ Initial State Verification:');
  console.log('  Primary Objection:', state.dealIntelligence?.primaryObjection);
  console.log('  Current Strategy:', state.dealIntelligence?.currentStrategy);
  console.log('  Next Best Move:', state.dealIntelligence?.nextBestMove);
  console.log('  Strategy Reason:', state.dealIntelligence?.strategyReason);
  console.log('  Deal Confidence:', state.dealIntelligence?.dealConfidence + '%');
  console.log('  Negotiation Leverage:', state.dealIntelligence?.negotiationLeverage);
  console.log('  Customer Need:', state.dealIntelligence?.customerNeed);
  console.log('  Budget/Sensitivity:', state.dealIntelligence?.budgetPriceSensitivity);

  if (state.dealIntelligence?.primaryObjection !== 'None') {
    throw new Error(`Expected initial objection to be 'None', got ${state.dealIntelligence?.primaryObjection}`);
  }

  // Turn 1: Discovery & Needs
  console.log('\n2️⃣ Turn 1: Prospect shares requirements:');
  const messagesTurn1: ChatMessage[] = [
    { role: 'assistant', content: 'Hi there! Welcome to Agora. What are you looking to build?' },
    { role: 'user', content: 'We need an AI voice customer support agent to handle about 100 hours of monthly calls.' },
  ];
  state = analyzeAndUpdateSalesState(state, messagesTurn1);

  console.log('  Customer Need:', state.dealIntelligence?.customerNeed);
  console.log('  Customer Priorities:', state.dealIntelligence?.customerPriorities);
  console.log('  AI Strategy:', state.dealIntelligence?.currentStrategy);
  console.log('  Next Best Move:', state.dealIntelligence?.nextBestMove);

  if (!state.dealIntelligence?.customerNeed.toLowerCase().includes('support')) {
    throw new Error(`Customer need was not correctly recognized: ${state.dealIntelligence?.customerNeed}`);
  }

  // Turn 2: Customer raises PRICE objection: "₹50,000 is too expensive."
  console.log('\n3️⃣ Turn 2: Customer raises Price Objection: "₹50,000 is too expensive."');
  const messagesTurn2: ChatMessage[] = [
    ...messagesTurn1,
    { role: 'assistant', content: 'For that scale, Agora Conversational AI provides sub-500ms real-time voice latency. Standard pricing is ₹50,000.' },
    { role: 'user', content: '₹50,000 is too expensive.' },
  ];
  state = analyzeAndUpdateSalesState(state, messagesTurn2);

  console.log('  Primary Objection:', state.dealIntelligence?.primaryObjection);
  console.log('  Current AI Strategy:', state.dealIntelligence?.currentStrategy);
  console.log('  Next Best Move:', state.dealIntelligence?.nextBestMove);
  console.log('  Why?:', state.dealIntelligence?.strategyReason);
  console.log('  Budget/Sensitivity:', state.dealIntelligence?.budgetPriceSensitivity);
  console.log('  Concessions Requested:', state.dealIntelligence?.concessionsRequestedByCustomer);
  console.log('  Concessions Given by AI:', state.dealIntelligence?.concessionsGivenByAi);

  // Exact requirements check
  if (state.dealIntelligence?.primaryObjection !== 'Price') {
    throw new Error(`Expected primary objection 'Price', got '${state.dealIntelligence?.primaryObjection}'`);
  }
  if (state.dealIntelligence?.currentStrategy !== 'Investigate whether this is budget or perceived value') {
    throw new Error(`Expected strategy 'Investigate whether this is budget or perceived value', got '${state.dealIntelligence?.currentStrategy}'`);
  }
  if (state.dealIntelligence?.nextBestMove !== 'Ask a diagnostic question') {
    throw new Error(`Expected next best move 'Ask a diagnostic question', got '${state.dealIntelligence?.nextBestMove}'`);
  }
  if (state.dealIntelligence?.strategyReason !== 'Avoid unnecessary discounting before understanding the objection') {
    throw new Error(`Expected reason 'Avoid unnecessary discounting before understanding the objection', got '${state.dealIntelligence?.strategyReason}'`);
  }
  console.log('  ✅ Turn 2 Price Objection assertions PASSED');

  // Turn 3: Customer shifts: "We have the budget. I'm just not convinced it's worth ₹50,000."
  console.log('\n4️⃣ Turn 3: Customer shifts: "We have the budget. I\'m just not convinced it\'s worth ₹50,000."');
  const messagesTurn3: ChatMessage[] = [
    ...messagesTurn2,
    { role: 'assistant', content: 'Is this primarily a budget limitation for your team right now, or are you comparing the ROI against what you currently spend on support?' },
    { role: 'user', content: "We have the budget. I'm just not convinced it's worth ₹50,000." },
  ];
  state = analyzeAndUpdateSalesState(state, messagesTurn3);

  console.log('  Primary Objection:', state.dealIntelligence?.primaryObjection);
  console.log('  Current AI Strategy:', state.dealIntelligence?.currentStrategy);
  console.log('  Next Best Move:', state.dealIntelligence?.nextBestMove);
  console.log('  Why?:', state.dealIntelligence?.strategyReason);
  console.log('  Budget/Sensitivity:', state.dealIntelligence?.budgetPriceSensitivity);

  // Exact requirements check
  if (state.dealIntelligence?.primaryObjection !== 'Perceived Value') {
    throw new Error(`Expected primary objection 'Perceived Value', got '${state.dealIntelligence?.primaryObjection}'`);
  }
  if (state.dealIntelligence?.currentStrategy !== 'Demonstrate ROI/value') {
    throw new Error(`Expected strategy 'Demonstrate ROI/value', got '${state.dealIntelligence?.currentStrategy}'`);
  }
  if (state.dealIntelligence?.nextBestMove !== 'Quantify business impact') {
    throw new Error(`Expected next best move 'Quantify business impact', got '${state.dealIntelligence?.nextBestMove}'`);
  }
  if (state.dealIntelligence?.strategyReason !== 'Customer explicitly confirmed budget is not the blocker') {
    throw new Error(`Expected reason 'Customer explicitly confirmed budget is not the blocker', got '${state.dealIntelligence?.strategyReason}'`);
  }
  console.log('  ✅ Turn 3 Perceived Value assertions PASSED');

  // Turn 4: Customer shifts: "I'm worried about implementation."
  console.log('\n5️⃣ Turn 4: Customer shifts: "I\'m worried about implementation."');
  const messagesTurn4: ChatMessage[] = [
    ...messagesTurn3,
    { role: 'assistant', content: 'By automating 70% of routine inquiries with sub-500ms latency, our customers save over 200 human support hours each month, delivering full payback in weeks.' },
    { role: 'user', content: "I'm worried about implementation." },
  ];
  state = analyzeAndUpdateSalesState(state, messagesTurn4);

  console.log('  Primary Objection:', state.dealIntelligence?.primaryObjection);
  console.log('  Current AI Strategy:', state.dealIntelligence?.currentStrategy);
  console.log('  Next Best Move:', state.dealIntelligence?.nextBestMove);
  console.log('  Why?:', state.dealIntelligence?.strategyReason);
  console.log('  Concessions Given by AI:', state.dealIntelligence?.concessionsGivenByAi);

  // Exact requirements check
  if (state.dealIntelligence?.primaryObjection !== 'Implementation Risk') {
    throw new Error(`Expected primary objection 'Implementation Risk', got '${state.dealIntelligence?.primaryObjection}'`);
  }
  if (state.dealIntelligence?.currentStrategy !== 'Reduce implementation risk') {
    throw new Error(`Expected strategy 'Reduce implementation risk', got '${state.dealIntelligence?.currentStrategy}'`);
  }
  if (state.dealIntelligence?.nextBestMove !== 'Offer onboarding/support rather than discount') {
    throw new Error(`Expected next best move 'Offer onboarding/support rather than discount', got '${state.dealIntelligence?.nextBestMove}'`);
  }
  if (state.dealIntelligence?.strategyReason !== "Customer's main blocker is implementation uncertainty") {
    throw new Error(`Expected reason "Customer's main blocker is implementation uncertainty", got '${state.dealIntelligence?.strategyReason}'`);
  }
  console.log('  ✅ Turn 4 Implementation Risk assertions PASSED');

  // Turn 5: Move to Close / Appointment
  console.log('\n6️⃣ Turn 5: Objections addressed -> Customer books Demo:');
  const messagesTurn5: ChatMessage[] = [
    ...messagesTurn4,
    { role: 'assistant', content: 'Our solutions engineering team provides dedicated onboarding and SDK integration support to get your voice agent live in under 48 hours.' },
    { role: 'user', content: 'That sounds great! Can we schedule a demo for tomorrow at 3 PM? My email is manishrevathi2008@gmail.com' },
  ];
  state = analyzeAndUpdateSalesState(state, messagesTurn5);

  console.log('  Primary Objection:', state.dealIntelligence?.primaryObjection);
  console.log('  Current AI Strategy:', state.dealIntelligence?.currentStrategy);
  console.log('  Deal Confidence:', state.dealIntelligence?.dealConfidence + '%');
  console.log('  Buying Intent:', state.dealIntelligence?.buyingIntent);
  console.log('  Negotiation Leverage:', state.dealIntelligence?.negotiationLeverage);
  console.log('  Give/Get Balance:', state.dealIntelligence?.giveGetBalance);

  console.log('\n================================================================');
  console.log('🎉 ALL DEAL INTELLIGENCE DYNAMIC TRANSITIONS VERIFIED 100%!');
  console.log('================================================================');
}

runScenarioTest();
