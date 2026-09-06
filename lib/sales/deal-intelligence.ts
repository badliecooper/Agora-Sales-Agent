import {
  SalesState,
  ChatMessage,
  BuyingIntent,
  DealIntelligence,
  NegotiationLeverage,
} from './types';

/**
 * Creates the initial clean Deal Intelligence state.
 * Guaranteed to show 'Unknown' or clean baselines rather than hallucinations.
 */
export function createInitialDealIntelligence(): DealIntelligence {
  return {
    customerNeed: 'Unknown',
    budgetPriceSensitivity: 'Unknown',
    timelineUrgency: 'Unknown',
    decisionAuthority: 'Unknown',
    primaryObjection: 'None',
    buyingIntent: 'unknown',
    negotiationLeverage: 'Unknown',
    concessionsGivenByAi: [],
    concessionsRequestedByCustomer: [],
    currentStrategy: 'Uncover core business pain and workflow volume',
    nextBestMove: 'Ask diagnostic discovery questions about voice workflow and scale',
    strategyReason: 'Establish baseline requirements before pitching solutions or quoting prices',
    dealConfidence: 20,
    primaryBlocker: 'None',
    customerPriorities: ['Unknown'],
    customerWants: ['Unknown'],
    aiOffered: ['Agora Conversational AI'],
    giveGetBalance: 'N/A - Early Discovery',
  };
}

/**
 * Deterministically derives the real-time Deal Intelligence layer from the canonical SalesState
 * and conversation history. Reacts dynamically to objections, value affirmations, and strategy pivots.
 */
export function deriveDealIntelligence(
  state: SalesState,
  messages: ChatMessage[] = [],
): DealIntelligence {
  const userMessages = messages.filter(
    (m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim(),
  );
  const latestUserText = userMessages.length > 0
    ? userMessages[userMessages.length - 1].content.trim()
    : '';
  const allUserText = userMessages.map((m) => m.content).join(' ');
  const lowerLatest = latestUserText.toLowerCase();
  const lowerAll = allUserText.toLowerCase();

  // ── 1. CUSTOMER NEED ────────────────────────────────────────────────────────
  let customerNeed = 'Unknown';
  if (state.qualification?.need && state.qualification.need.trim()) {
    customerNeed = state.qualification.need.trim();
  } else if (state.need && state.need.trim()) {
    customerNeed = state.need.trim();
  } else if (state.profile?.qualification?.need && state.profile.qualification.need.trim()) {
    customerNeed = state.profile.qualification.need.trim();
  } else if (state.qualification?.requirements && state.qualification.requirements.length > 0) {
    customerNeed = state.qualification.requirements.join(', ');
  } else if (/(?:voice|support|agent|call\s+center|automation|inbound|outbound)/i.test(lowerAll)) {
    customerNeed = 'AI voice customer support automation';
  }

  // ── 2. BUDGET / PRICE SENSITIVITY ──────────────────────────────────────────
  let budgetPriceSensitivity = 'Unknown';
  const knownBudget =
    state.qualification?.budget ||
    state.budget ||
    state.profile?.qualification?.budget ||
    null;

  const hasBudgetAffirmation =
    /(?:we\s+have\s+(?:the\s+)?budget|budget\s+is\s+not\s+(?:an?\s+)?(?:issue|blocker|problem|concern)|have\s+the\s+funds)/i.test(
      lowerAll,
    );
  const hasPriceObjection =
    /(?:₹|\$|rs\.?|inr)?\s*[\d,]+\s*(?:is\s+)?(?:too\s+)?(?:expensive|high|costly|steep)|too\s+expensive|too\s+costly|price\s+is\s+too\s+high|can'?t\s+afford|cannot\s+afford|costs?\s+too\s+much/i.test(
      lowerAll,
    );

  if (hasBudgetAffirmation) {
    budgetPriceSensitivity = knownBudget
      ? `Budget Confirmed: ${knownBudget} (Low Sensitivity)`
      : 'Budget Confirmed (Low Sensitivity)';
  } else if (hasPriceObjection) {
    budgetPriceSensitivity = knownBudget
      ? `High Price Sensitivity (${knownBudget} constrained)`
      : 'High Price Sensitivity';
  } else if (knownBudget) {
    budgetPriceSensitivity = `${knownBudget} (Moderate Sensitivity)`;
  }

  // ── 3. TIMELINE / URGENCY ──────────────────────────────────────────────────
  let timelineUrgency = 'Unknown';
  const knownTimeline =
    state.qualification?.timeline ||
    state.timeline ||
    state.profile?.qualification?.timeline ||
    null;

  if (knownTimeline) {
    timelineUrgency = knownTimeline;
  } else if (/(?:urgent|asap|immediately|right\s+away|this\s+week|this\s+month)/i.test(lowerAll)) {
    timelineUrgency = 'Immediate / High Urgency';
  } else if (/(?:next\s+quarter|q[1-4]|in\s+\d+\s+months?|end\s+of\s+year)/i.test(lowerAll)) {
    const match = lowerAll.match(/(?:q[1-4]|next\s+quarter|in\s+\d+\s+months?|end\s+of\s+year)/i);
    timelineUrgency = match ? match[0].toUpperCase() : 'Planned Future';
  }

  // ── 4. DECISION AUTHORITY ──────────────────────────────────────────────────
  let decisionAuthority = 'Unknown';
  const jobTitle =
    state.customer?.jobTitle ||
    state.jobTitle ||
    state.role ||
    state.profile?.customer?.jobTitle ||
    null;

  const requiresApproval =
    /(?:need|require|get|have\s+to\s+get)\s+(?:approval|sign-off|permission)|approval\s+from\s+my\s+(?:manager|boss|vp|director|team|board)|boss\s+has\s+to\s+approve|manager\s+has\s+to\s+sign|not\s+my\s+decision\s+alone/i.test(
      lowerAll,
    );

  if (requiresApproval) {
    decisionAuthority = jobTitle
      ? `${jobTitle} (Evaluation Champion — Requires Manager Sign-off)`
      : 'Evaluation Champion (Requires Manager Sign-off)';
  } else if (jobTitle) {
    const lowerTitle = jobTitle.toLowerCase();
    if (
      lowerTitle.includes('cto') ||
      lowerTitle.includes('ceo') ||
      lowerTitle.includes('founder') ||
      lowerTitle.includes('vp') ||
      lowerTitle.includes('director') ||
      lowerTitle.includes('head of')
    ) {
      decisionAuthority = `${jobTitle} (Primary Decision Maker)`;
    } else {
      decisionAuthority = `${jobTitle} (Stakeholder)`;
    }
  } else if (state.qualification?.decisionMaker === true || state.decisionMaker === true) {
    decisionAuthority = 'Primary Decision Maker';
  } else if (state.authority) {
    decisionAuthority = state.authority;
  }

  // ── 5. PRIMARY OBJECTION & BLOCKER DETECTION (CHRONOLOGICAL REACTIVITY) ────
  // We scan the user's latest context first, respecting dynamic objection shifts.
  let primaryObjection = 'None';
  let primaryBlocker = 'None';

  // Check the latest message first to respond dynamically to conversation shifts
  const isLatestImplementation =
    /(?:worried|concerned|nervous|unsure|anxious|question)\s+about\s+(?:the\s+)?implementation|implementation\s+(?:risk|concern|issue|trouble|headache|problem|hurdle|effort)|hard\s+to\s+implement|how\s+hard\s+is\s+it\s+to\s+implement|deployment\s+(?:risk|hurdle|delay)|onboarding\s+(?:hurdle|delay|risk)/i.test(
      lowerLatest,
    );

  const isLatestPerceivedValue =
    /(?:we\s+have\s+(?:the\s+)?budget|budget\s+is\s+not\s+(?:the\s+)?(?:issue|blocker)).*?(?:not\s+(?:convinced|sure|certain)\s+it'?s\s+worth|not\s+worth|justify|prove\s+(?:the\s+)?roi)/i.test(
      lowerLatest,
    ) ||
    (/(?:not\s+(?:convinced|sure|certain)\s+it'?s\s+worth|not\s+worth|prove\s+(?:the\s+)?roi|justify\s+the\s+cost|don'?t\s+see\s+the\s+value|is\s+it\s+really\s+worth)/i.test(
      lowerLatest,
    ) &&
      hasBudgetAffirmation) ||
    /(?:not\s+(?:convinced|sure|certain)\s+it'?s\s+worth|not\s+convinced\s+it'?s\s+worth)/i.test(
      lowerLatest,
    );

  const isLatestPrice =
    /(?:₹|\$|rs\.?|inr)?\s*[\d,]+\s*(?:is\s+)?(?:too\s+)?(?:expensive|high|costly|steep)|too\s+expensive|too\s+costly|price\s+is\s+too\s+high|can'?t\s+afford|cannot\s+afford|costs?\s+too\s+much|price\s+concern/i.test(
      lowerLatest,
    );

  const isLatestCompetitor =
    /(?:competitor|another\s+provider|other\s+solution|twilio|retell|vapi)\s+is\s+(?:\d+%\s+)?cheaper|cheaper\s+competitor|\d+%\s+cheaper|cheaper\s+alternative|why\s+pay\s+more\s+than/i.test(
      lowerLatest,
    );

  const isLatestApproval =
    /(?:need|require|get|have\s+to\s+get)\s+(?:approval|sign-off|permission)|approval\s+from\s+my\s+(?:manager|boss|vp|director|team|board)|boss\s+has\s+to\s+approve|manager\s+has\s+to\s+sign|not\s+my\s+decision\s+alone/i.test(
      lowerLatest,
    );

  const isLatestTiming =
    /(?:need|have)\s+to\s+think\s+about\s+it|think\s+it\s+over|not\s+ready\s+to\s+decide|bad\s+timing|not\s+the\s+right\s+time|revisit\s+(?:next\s+quarter|later|next\s+year)|busy\s+right\s+now|too\s+much\s+going\s+on/i.test(
      lowerLatest,
    );

  const isLatestSecurity =
    /security\s+concern|hipaa|soc\s*2|data\s+(?:privacy|isolation|leakage)|where\s+(?:is\s+data\s+stored|are\s+recordings\s+kept)|tenant\s+isolation|gdpr/i.test(
      lowerLatest,
    );

  if (isLatestImplementation) {
    primaryObjection = 'Implementation Risk';
    primaryBlocker = 'Implementation Uncertainty';
  } else if (isLatestPerceivedValue) {
    primaryObjection = 'Perceived Value';
    primaryBlocker = 'Unproven ROI / Value Justification';
  } else if (isLatestPrice) {
    primaryObjection = 'Price';
    primaryBlocker = 'Price Resistance';
  } else if (isLatestCompetitor) {
    primaryObjection = 'Competitor Pricing';
    primaryBlocker = 'Cheaper Competitor Alternative';
  } else if (isLatestApproval) {
    primaryObjection = 'Decision Authority / Approval';
    primaryBlocker = 'Requires Manager Sign-off';
  } else if (isLatestTiming) {
    primaryObjection = 'Timing / Urgency';
    primaryBlocker = 'Timing Delay';
  } else if (isLatestSecurity) {
    primaryObjection = 'Security & Compliance';
    primaryBlocker = 'Security & Compliance Verification';
  } else {
    // If latest message didn't raise a new objection, evaluate existing unresolved objections from history
    const unresolved = (state.detectedObjections || []).filter((o) => !o.resolved);
    if (unresolved.length > 0) {
      const lastObj = unresolved[unresolved.length - 1];
      if (lastObj.type === 'implementation_risk') {
        primaryObjection = 'Implementation Risk';
        primaryBlocker = 'Implementation Uncertainty';
      } else if (lastObj.type === 'perceived_value') {
        primaryObjection = 'Perceived Value';
        primaryBlocker = 'Unproven ROI / Value Justification';
      } else if (lastObj.type === 'price_too_high' || lastObj.type === 'not_enough_budget') {
        if (hasBudgetAffirmation) {
          primaryObjection = 'Perceived Value';
          primaryBlocker = 'Unproven ROI / Value Justification';
        } else {
          primaryObjection = 'Price';
          primaryBlocker = 'Price Resistance';
        }
      } else if (lastObj.type === 'competitor_cheaper') {
        primaryObjection = 'Competitor Pricing';
        primaryBlocker = 'Cheaper Competitor Alternative';
      } else if (lastObj.type === 'need_approval') {
        primaryObjection = 'Decision Authority / Approval';
        primaryBlocker = 'Requires Manager Sign-off';
      } else if (lastObj.type === 'need_to_think' || lastObj.type === 'timing_concern') {
        primaryObjection = 'Timing / Urgency';
        primaryBlocker = 'Timing Delay';
      } else if (lastObj.type === 'security_concern') {
        primaryObjection = 'Security & Compliance';
        primaryBlocker = 'Security & Compliance Verification';
      } else {
        primaryObjection = lastObj.type.replace(/_/g, ' ');
        primaryBlocker = lastObj.text;
      }
    } else if (hasBudgetAffirmation && /not\s+(?:convinced|worth)/i.test(lowerAll)) {
      primaryObjection = 'Perceived Value';
      primaryBlocker = 'Unproven ROI / Value Justification';
    } else if (hasPriceObjection && !hasBudgetAffirmation) {
      primaryObjection = 'Price';
      primaryBlocker = 'Price Resistance';
    }
  }

  // ── 10, 11, 12. CURRENT AI STRATEGY, NEXT BEST MOVE, & STRATEGY REASON ─────
  let currentStrategy = 'Uncover core business pain and workflow volume';
  let nextBestMove = 'Ask diagnostic discovery questions about voice workflow and scale';
  let strategyReason = 'Establish baseline requirements before pitching solutions or quoting prices';

  if (primaryObjection === 'Price') {
    currentStrategy = 'Investigate whether this is budget or perceived value';
    nextBestMove = 'Ask a diagnostic question';
    strategyReason = 'Avoid unnecessary discounting before understanding the objection';
  } else if (primaryObjection === 'Perceived Value') {
    currentStrategy = 'Demonstrate ROI/value';
    nextBestMove = 'Quantify business impact';
    strategyReason = 'Customer explicitly confirmed budget is not the blocker';
  } else if (primaryObjection === 'Implementation Risk') {
    currentStrategy = 'Reduce implementation risk';
    nextBestMove = 'Offer onboarding/support rather than discount';
    strategyReason = "Customer's main blocker is implementation uncertainty";
  } else if (primaryObjection === 'Competitor Pricing') {
    currentStrategy = 'Differentiate on latency and global network reliability';
    nextBestMove = 'Highlight Agora sub-500ms voice pipeline and SD-RTN architecture';
    strategyReason = 'Compete on technical performance rather than engaging in a price war';
  } else if (primaryObjection === 'Decision Authority / Approval') {
    currentStrategy = 'Equip champion and secure joint evaluation';
    nextBestMove = 'Offer to include manager directly in a joint technical demo';
    strategyReason = 'Multi-thread the deal to prevent stalls in the decision-making cycle';
  } else if (primaryObjection === 'Timing / Urgency') {
    currentStrategy = 'Establish cost of inaction and propose phased pilot';
    nextBestMove = 'Inquire about upcoming milestones or offer a low-friction trial';
    strategyReason = 'Overcome inertia by identifying near-term value drivers';
  } else if (primaryObjection === 'Security & Compliance') {
    currentStrategy = 'Provide enterprise compliance and architecture assurance';
    nextBestMove = 'Share SOC2/HIPAA compliance details and zero-data-leakage architecture';
    strategyReason = 'Enterprise compliance concerns block evaluations until verified';
  } else {
    // Stage-based strategy when no primary objection is active
    const stage = state.sales?.salesStage || state.salesStage || 'discovery';
    const isMeetingBooked =
      state.appointment?.meetingStatus === 'confirmed' || state.appointmentStatus === 'confirmed';
    const isMeetingRequested =
      state.appointment?.meetingRequested || state.appointmentRequested;

    if (isMeetingBooked) {
      currentStrategy = 'Deliver seamless confirmation and onboarding prep';
      nextBestMove = 'Send calendar invitation with Google Meet link and prep technical agenda';
      strategyReason = 'Demo is locked; focus shifts to attendee readiness and show rate';
    } else if (isMeetingRequested || stage === 'closing') {
      currentStrategy = 'Accelerate onboarding and demo execution';
      nextBestMove = 'Lock in scheduled time and deliver confirmation details';
      strategyReason = 'High buying intent prospect ready for immediate activation';
    } else if (stage === 'negotiation') {
      currentStrategy = 'Value-based trade-off (Give-to-Get)';
      nextBestMove = 'Offer official 20% annual commitment discount in exchange for annual contract';
      strategyReason = 'Maintain price integrity by trading concessions for commitment';
    } else if (stage === 'recommendation' || stage === 'pitch') {
      currentStrategy = 'Solution alignment with voice automation needs';
      nextBestMove = 'Present Agora Conversational AI architecture tailored to use case';
      strategyReason = 'Demonstrate technical fit directly solving customer pain points';
    } else if (stage === 'qualification' || stage === 'needs_analysis') {
      currentStrategy = 'Map workflow scale and operational constraints';
      nextBestMove = 'Inquire about peak concurrency and target response latency milestones';
      strategyReason = 'Qualify sizing metrics to recommend appropriate architecture tier';
    } else {
      currentStrategy = 'Uncover core business pain and workflow volume';
      nextBestMove = 'Ask diagnostic discovery questions about voice workflow and scale';
      strategyReason = 'Establish baseline requirements before pitching solutions or quoting prices';
    }
  }

  // ── 6. BUYING INTENT ───────────────────────────────────────────────────────
  const buyingIntent: BuyingIntent =
    state.sales?.buyingIntent || state.buyingIntent || 'unknown';

  // ── 7. NEGOTIATION LEVERAGE ────────────────────────────────────────────────
  let negotiationLeverage: NegotiationLeverage = 'Unknown';
  if (userMessages.length >= 2) {
    const hasCompetitorLeverage = /(?:twilio|retell|vapi|cheaper)/i.test(lowerAll);
    const hasTightBudget = primaryObjection === 'Price' && !hasBudgetAffirmation;
    const hasHighIntent =
      buyingIntent === 'high' ||
      state.appointment?.meetingRequested ||
      state.appointmentStatus === 'confirmed' ||
      hasBudgetAffirmation;

    if (hasCompetitorLeverage && hasTightBudget) {
      negotiationLeverage = 'Customer';
    } else if (hasHighIntent && !hasCompetitorLeverage) {
      negotiationLeverage = 'Agora (AI)';
    } else {
      negotiationLeverage = 'Balanced';
    }
  }

  // ── 8 & 9. CONCESSIONS (GIVEN & REQUESTED) ─────────────────────────────────
  const concessionsGivenByAi: string[] = [];
  const concessionsRequestedByCustomer: string[] = [];

  // Concessions requested by customer
  if (hasPriceObjection || lowerAll.includes('discount') || lowerAll.includes('cheaper')) {
    concessionsRequestedByCustomer.push('Price Discount');
  }
  if (isLatestImplementation || lowerAll.includes('implementation') || lowerAll.includes('support')) {
    concessionsRequestedByCustomer.push('Dedicated Setup & Onboarding Assistance');
  }
  if (lowerAll.includes('custom integration') || lowerAll.includes('telephony')) {
    concessionsRequestedByCustomer.push('Custom SIP/Telephony Integration');
  }

  // Concessions given by AI
  if (
    state.sales?.negotiation?.allowedDiscount ||
    state.negotiation?.allowedDiscount ||
    lowerAll.includes('annual') ||
    primaryObjection === 'Price'
  ) {
    concessionsGivenByAi.push('Official 20% Annual Commitment Discount');
  }
  if (primaryObjection === 'Implementation Risk' || isLatestImplementation) {
    concessionsGivenByAi.push('Dedicated Onboarding & Solutions Support');
  }
  if (lowerAll.includes('trial') || lowerAll.includes('free') || userMessages.length > 2) {
    concessionsGivenByAi.push('300 Free Audio Minutes Monthly');
  }

  // ── 10. DEAL CONFIDENCE (0 to 100%) ────────────────────────────────────────
  let dealConfidence = 20;
  const stage = state.sales?.salesStage || state.salesStage || 'discovery';
  switch (stage) {
    case 'discovery':
      dealConfidence = 25;
      break;
    case 'qualification':
      dealConfidence = 40;
      break;
    case 'needs_analysis':
      dealConfidence = 50;
      break;
    case 'recommendation':
    case 'pitch':
      dealConfidence = 65;
      break;
    case 'objection_handling':
      dealConfidence = 50;
      break;
    case 'negotiation':
      dealConfidence = 75;
      break;
    case 'closing':
      dealConfidence = 85;
      break;
    case 'follow_up':
      dealConfidence = 70;
      break;
    default:
      dealConfidence = 20;
  }

  if (customerNeed !== 'Unknown') dealConfidence += 10;
  if (budgetPriceSensitivity !== 'Unknown' && !budgetPriceSensitivity.includes('High Price')) {
    dealConfidence += 10;
  }
  if (decisionAuthority !== 'Unknown' && !decisionAuthority.includes('Requires')) {
    dealConfidence += 10;
  }
  if (state.appointment?.meetingRequested || state.appointmentRequested) dealConfidence += 15;
  if (state.appointment?.meetingStatus === 'confirmed') dealConfidence = 95;
  if (primaryObjection === 'Price') dealConfidence -= 10;
  if (primaryObjection === 'Competitor Pricing') dealConfidence -= 10;

  dealConfidence = Math.max(10, Math.min(98, dealConfidence));
  if (state.appointment?.meetingStatus === 'confirmed') {
    dealConfidence = 100;
  }

  // ── 11. CUSTOMER PRIORITIES ────────────────────────────────────────────────
  const prioritiesSet = new Set<string>();
  if (state.qualification?.requirements && state.qualification.requirements.length > 0) {
    state.qualification.requirements.forEach((r) => prioritiesSet.add(r));
  }
  if (state.qualification?.painPoints && state.qualification.painPoints.length > 0) {
    state.qualification.painPoints.forEach((p) => prioritiesSet.add(p));
  }
  if (prioritiesSet.size === 0 && customerNeed !== 'Unknown') {
    prioritiesSet.add(customerNeed);
  }
  const customerPriorities =
    prioritiesSet.size > 0 ? Array.from(prioritiesSet) : ['Unknown'];

  // ── 12. NEGOTIATION PANEL: CUSTOMER WANTS, AI OFFERED, GIVE/GET BALANCE ─────
  const customerWants: string[] = [];
  if (customerPriorities.length > 0 && customerPriorities[0] !== 'Unknown') {
    customerWants.push(...customerPriorities.slice(0, 3));
  }
  if (concessionsRequestedByCustomer.length > 0) {
    customerWants.push(...concessionsRequestedByCustomer);
  }
  if (customerWants.length === 0) {
    customerWants.push('Unknown');
  }

  const aiOffered: string[] = ['Agora Conversational AI'];
  if (concessionsGivenByAi.length > 0) {
    aiOffered.push(...concessionsGivenByAi);
  } else {
    aiOffered.push('Standard $0.10/min task pricing + 300 free minutes');
  }

  let giveGetBalance = 'N/A - Early Discovery';
  if (concessionsGivenByAi.length > 0 && concessionsRequestedByCustomer.length > 0) {
    giveGetBalance = 'Balanced (Discount traded for annual commitment)';
  } else if (concessionsRequestedByCustomer.length > 0 && concessionsGivenByAi.length === 0) {
    giveGetBalance = 'Customer Demanding (Discount requested without commitment)';
  } else if (concessionsGivenByAi.length > 0 && concessionsRequestedByCustomer.length === 0) {
    giveGetBalance = 'Favoring Customer (Proactive value concessions offered)';
  } else if (userMessages.length > 1) {
    giveGetBalance = 'Favoring Agora (Value demonstrated without unapproved discounts)';
  }

  return {
    customerNeed,
    budgetPriceSensitivity,
    timelineUrgency,
    decisionAuthority,
    primaryObjection,
    buyingIntent,
    negotiationLeverage,
    concessionsGivenByAi,
    concessionsRequestedByCustomer,
    currentStrategy,
    nextBestMove,
    strategyReason,
    dealConfidence,
    primaryBlocker,
    customerPriorities,
    customerWants,
    aiOffered,
    giveGetBalance,
  };
}
