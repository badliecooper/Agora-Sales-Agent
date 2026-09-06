import { searchKnowledge } from '../knowledge/service';
import { loadKnowledgeBaseForTenant } from '../knowledge/agent-context';
import {
  analyzeAndUpdateSalesState,
  getSessionSalesState,
  updateSessionSalesState,
  requestCustomerDetails,
  isValidCustomerEmail,
  getMissingCustomerDetails,
  executeLiveVoiceBookingFlow,
  formatDateReadable,
  formatTimeReadable,
} from './tracker';
import { ChatMessage, SalesBrainResult, SalesState } from './types';

export interface ProcessSalesBrainInput {
  companyId?: string;
  sessionId?: string;
  messages: ChatMessage[];
}

/**
 * Checks if user input is small talk or greeting to prevent blind vector queries.
 */
export function isGreetingOrSmallTalk(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  const clean = trimmed.replace(/[.!?,;:]+$/, '').trim();
  const smallTalkList = [
    'hi',
    'hello',
    'hey',
    'hi there',
    'hello there',
    'good morning',
    'good afternoon',
    'good evening',
    'how are you',
    'how are you doing',
    'how are things',
    'whats up',
    "what's up",
    'ok',
    'okay',
    'thanks',
    'thank you',
    'sounds good',
    'great',
    'bye',
    'goodbye',
    'see you',
  ];
  return smallTalkList.includes(clean);
}

/**
 * Maps conversational intent to knowledge categories for prioritized semantic search.
 */
export function detectQueryCategory(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/cost|price|pricing|discount|how much|tier|rate|fee|bill|expensive|cheaper|cheap|budget|quote|negotiat/i.test(lower)) {
    return 'pricing';
  }
  if (/competitor|another provider|other provider|twilio|retell|vapi|switch|why agora|why should we/i.test(lower)) {
    return 'objections';
  }
  if (/objection|faq|security|hipaa|soc 2|isolated|interruption|vad|crm|ivr|manager|approval|think about it|timing|integration/i.test(lower)) {
    return 'objections';
  }
  if (/product|feature|architecture|rtc|voice|video|engine|conversational ai|sdk|api|turn-taking|unsupported|mainframe|cobol|holographic/i.test(lower)) {
    return 'product';
  }
  if (/demo|schedule|book|calendar|appointment|slot|availability|meet/i.test(lower)) {
    return 'product';
  }
  if (/case study|customer|success|metric|roi|proven/i.test(lower)) {
    return 'use_cases';
  }
  return undefined;
}

export function isAgentOrDirectiveText(text: string): boolean {
  const clean = text.trim();
  return (
    clean.startsWith('[DIRECTIVE]') ||
    clean.startsWith('[CONFIRMED') ||
    clean.includes('What date and time would you like to schedule the meeting?') ||
    clean.includes('What time would you like for the meeting') ||
    clean.includes('What date would you like for the meeting') ||
    clean.includes("What's the best email address to send your calendar invite") ||
    clean.includes('best email address to send your calendar invite') ||
    clean.includes('best email address to send') ||
    clean.includes('calendar invite and confirmation to?') ||
    clean.includes('Sure, you can enter your details in the form') ||
    clean.includes('Please enter your details in the form') ||
    clean.includes("That time isn't available because you already have another event scheduled") ||
    clean.includes('I have scheduled your demo for') ||
    clean.includes("The meeting is scheduled, but I couldn't send the confirmation email") ||
    clean.includes("I wasn't able to schedule the meeting due to a calendar error")
  );
}

/**
 * Core Sales Brain orchestrator.
 * 1. Tracks and updates structured sales state & stage.
 * 2. Queries Pinecone knowledge base for semantic context (skipping small talk).
 * 3. Formats an anti-hallucination, voice-optimized grounded system prompt.
 */
export async function processSalesBrain(
  input: ProcessSalesBrainInput,
): Promise<SalesBrainResult> {
  const { companyId = 'default-company', sessionId = 'default-session', messages } = input;

  // 1. Update sales state
  const currentState = getSessionSalesState(sessionId);
  let updatedState = analyzeAndUpdateSalesState(currentState, messages);

  // 2. Identify the latest user query (strictly excluding agent directives/echoes)
  const userMessages = messages.filter(
    (m) =>
      m.role === 'user' &&
      typeof m.content === 'string' &&
      m.content.trim() &&
      !isAgentOrDirectiveText(m.content),
  );
  const latestQuery = userMessages.length > 0
    ? userMessages[userMessages.length - 1].content.trim()
    : '';

  // 3. Execute live voice booking flow with end-to-end logging and tool execution
  let bookingDirective: string | undefined;
  if (latestQuery) {
    const bookingResult = await executeLiveVoiceBookingFlow(updatedState, latestQuery, sessionId);
    updatedState = bookingResult.state;
    bookingDirective = bookingResult.speechDirective;
  }

  // 4. Open Customer Details popup ONLY when:
  // - required customer information is genuinely missing, AND
  // - user chose manual entry OR meeting requested with missing email, AND
  // - popup is not already open, AND
  // - details have not already been saved (status !== 'submitted') and not dismissed, AND
  // - all required customer details do NOT already exist!
  const canonicalEmail =
    updatedState.customerEmail ||
    updatedState.customer?.email ||
    updatedState.email ||
    updatedState.profile?.customer?.email;

  const hasName = Boolean((updatedState.customerName || updatedState.customer?.fullName || '').trim());
  const hasEmail = Boolean(canonicalEmail && isValidCustomerEmail(canonicalEmail));
  const hasCompany = Boolean((updatedState.company || updatedState.customer?.company || '').trim());
  const hasAllCustomerDetails = hasName && hasEmail && hasCompany;

  const isAlreadySubmitted = updatedState.pendingDetailsRequest?.status === 'submitted';
  const isAlreadyDismissed = updatedState.pendingDetailsRequest?.status === 'dismissed';
  const isAlreadyPending = updatedState.pendingDetailsRequest?.status === 'pending';

  const userSelectedManualThisTurn =
    Boolean(latestQuery) &&
    (latestQuery.toLowerCase().includes('enter my details manually') ||
      latestQuery.toLowerCase().includes("i'll enter my details") ||
      latestQuery.toLowerCase().includes('ill enter my details') ||
      latestQuery.toLowerCase().includes('fill the form') ||
      latestQuery.toLowerCase().includes('fill in the form') ||
      latestQuery.toLowerCase().includes('use the form') ||
      latestQuery.toLowerCase().includes('enter it myself'));

  const isBookingWithMissingEmail =
    Boolean(updatedState.appointmentRequested || updatedState.appointment?.meetingRequested) &&
    Boolean(updatedState.meetingDate && updatedState.meetingTime) &&
    !hasEmail;

  if (
    !hasAllCustomerDetails &&
    !isAlreadySubmitted &&
    !isAlreadyDismissed &&
    !isAlreadyPending &&
    (userSelectedManualThisTurn || isBookingWithMissingEmail)
  ) {
    updatedState = requestCustomerDetails(updatedState, 'book_meeting', {
      title: 'Customer Details',
      description: 'Please enter your contact information in the form.',
      requiredFields: ['fullName', 'email', 'company'],
      optionalFields: ['phone'],
    });
  }

  // 5. Synchronize canonical appointment fields on root SalesState
  if (updatedState.appointment) {
    updatedState.meetingStatus = updatedState.appointment.meetingStatus;
    updatedState.appointmentStatus = updatedState.appointment.meetingStatus;
    updatedState.calendarEventId = updatedState.appointment.calendarEventId;
    updatedState.meetingUrl = updatedState.appointment.meetingUrl;
    updatedState.start = updatedState.appointment.startTime || updatedState.appointment.selectedSlot?.start || null;
    updatedState.end = updatedState.appointment.endTime || updatedState.appointment.selectedSlot?.end || null;
    updatedState.timezone = updatedState.appointment.timezone;
    updatedState.emailStatus = updatedState.appointment.emailStatus;
    updatedState.confirmationEmailStatus = updatedState.appointment.emailStatus;
    updatedState.emailSentAt = updatedState.appointment.emailSentAt;

    if (updatedState.meetingStatus === 'failed' || updatedState.meetingStatus === 'slot_proposed') {
      updatedState.nextBestAction = `arrange_demo: propose_meeting_slot: ${updatedState.appointment.lastError || "That time isn't available because you already have another event scheduled then. Please choose another time."}`;
    } else if (updatedState.meetingUrl && updatedState.nextBestAction && updatedState.nextBestAction.includes('mock-meet:')) {
      updatedState.nextBestAction = updatedState.nextBestAction.replace(/mock-meet:room-[^\s]+/g, updatedState.meetingUrl);
    }
  }

  updateSessionSalesState(sessionId, updatedState);

  // 3. Selective knowledge retrieval: skip greetings/small talk
  let retrievedChunks: Array<{
    documentName: string;
    category: string;
    score: number;
    text: string;
  }> = [];

  const isSmallTalk = isGreetingOrSmallTalk(latestQuery);
  const targetCategory = detectQueryCategory(latestQuery);

  if (!isSmallTalk) {
    try {
      const searchResults = await searchKnowledge({
        companyId,
        query: latestQuery,
        topK: 4,
        category: targetCategory,
        minScore: 0.05,
      });

      retrievedChunks = searchResults.map((r) => ({
        documentName: r.documentName || 'Unknown Document',
        category: r.category || 'general',
        score: Math.round((r.score ?? 0) * 1000) / 1000,
        text: (r.text || '').trim(),
      }));

      // If category-specific search yielded no results, query broadly
      if (retrievedChunks.length === 0 && targetCategory) {
        const broadResults = await searchKnowledge({
          companyId,
          query: latestQuery,
          topK: 4,
          minScore: 0.05,
        });
        retrievedChunks = broadResults.map((r) => ({
          documentName: r.documentName || 'Unknown Document',
          category: r.category || 'general',
          score: Math.round((r.score ?? 0) * 1000) / 1000,
          text: (r.text || '').trim(),
        }));
      }
    } catch (err) {
      console.warn('[SalesBrain] Knowledge retrieval fallback:', err);
    }

    // Fallback to local knowledge repository if vector store is empty in test/offline environment
    if (retrievedChunks.length === 0) {
      const localDocs = loadKnowledgeBaseForTenant(companyId);
      const queryTokens = latestQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const scoredDocs = localDocs
        .map((doc) => {
          let score = 0;
          const lowerDoc = (doc.title + ' ' + doc.category + ' ' + doc.content).toLowerCase();
          for (const token of queryTokens) {
            if (lowerDoc.includes(token)) score += 1;
          }
          if (
            targetCategory &&
            (doc.category === targetCategory ||
              (targetCategory === 'objections' && (doc.category === 'battlecards' || doc.category === 'objections')))
          ) {
            score += 3;
          }
          return { doc, score };
        })
        .filter((d) => d.score > 0)
        .sort((a, b) => b.score - a.score);

      retrievedChunks = scoredDocs.slice(0, 4).map(({ doc, score }) => ({
        documentName: doc.title,
        category: doc.category,
        score: Math.min(0.95, 0.3 + score * 0.1),
        text: doc.content.slice(0, 1200).trim(),
      }));
    }
  }

  // 4. Update Knowledge Used on Sales State for RAG Visibility
  if (retrievedChunks.length > 0) {
    const newKnowledge = retrievedChunks.map((c) => ({
      title: c.documentName,
      relevance: Math.round(c.score <= 1 ? c.score * 100 : c.score),
      category: c.category,
      retrievedAt: Date.now(),
    }));
    const existing = updatedState.knowledgeUsed || [];
    const merged = [
      ...newKnowledge,
      ...existing.filter((e) => !newKnowledge.some((n) => n.title === e.title)),
    ].slice(0, 10);
    updatedState.knowledgeUsed = merged;
    updateSessionSalesState(sessionId, updatedState);
  }

  // 5. Construct grounded system prompt
  const systemPrompt = formatSalesBrainPrompt(updatedState, retrievedChunks, bookingDirective);

  return {
    salesState: updatedState,
    retrievedChunks,
    systemPrompt,
    bookingDirective,
  };
}

function formatSalesBrainPrompt(
  state: SalesState,
  chunks: Array<{ documentName: string; category: string; score: number; text: string }>,
  speechDirective?: string,
): string {
  const knowledgeSection =
    chunks.length > 0
      ? chunks
          .map(
            (c, idx) =>
              `[Chunk ${idx + 1} | Source: ${c.documentName} | Category: ${c.category}]\n${c.text}`,
          )
          .join('\n\n')
      : 'No specific document chunks retrieved. Rely only on verified Agora knowledge.';

  const checklistStatus = state.checklist;
  const nextTarget = state.nextInfoToCollect
    ? `${state.nextInfoToCollect.field.toUpperCase()} [${state.nextInfoToCollect.priority}] — ${state.nextInfoToCollect.reason}`
    : 'All critical CRM information satisfied';

  const isManualMode = state.detailsInputMode === 'manual';
  const missingDetails = getMissingCustomerDetails(state);

  let nextQuestionDirective = '';
  if (speechDirective) {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
${speechDirective}
DO NOT contradict this directive. Answer concisely in 1 to 2 spoken sentences.`;
  } else if (
    state.appointmentStatus === 'waiting_for_datetime' ||
    state.appointment?.meetingStatus === 'waiting_for_datetime'
  ) {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
You have already asked the customer: "What date and time would you like to schedule the meeting?"
You are currently WAITING for the customer's response.
DO NOT repeat the question or generate repeated directives. Wait for the customer to reply with their preferred date and time.`;
  } else if (
    state.appointmentStatus === 'waiting_for_time' ||
    state.appointment?.meetingStatus === 'waiting_for_time'
  ) {
    const readableDate = state.meetingDate ? formatDateReadable(state.meetingDate) : 'that date';
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
You have already asked what time the customer would like on ${readableDate}.
You are currently WAITING for the customer's response.
DO NOT repeat the question or generate repeated directives. Wait for the customer to reply with their preferred time.`;
  } else if (
    state.appointmentStatus === 'waiting_for_date' ||
    state.appointment?.meetingStatus === 'waiting_for_date'
  ) {
    const readableTime = state.meetingTime ? formatTimeReadable(state.meetingTime) : 'that time';
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
You have already asked what date the customer would like at ${readableTime}.
You are currently WAITING for the customer's response.
DO NOT repeat the question or generate repeated directives. Wait for the customer to reply with their preferred date.`;
  } else if (isManualMode) {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
The customer has chosen to enter details manually using the on-screen form.
Say: "Sure, you can enter your details in the form."
DO NOT verbally ask for: Customer Name, Email, Company, Phone, Role, Budget, Timeline.
Wait for the customer to complete the form.`;
  } else if (state.appointmentRequested && state.meetingDate && !state.meetingTime) {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
The customer requested a meeting on ${state.meetingDate}.
YOU MUST ASK: "What time would you like for the meeting on ${formatDateReadable(state.meetingDate)}?"
DO NOT ask for customer name, email, company, or phone.`;
  } else if (state.appointmentRequested && state.meetingTime && !state.meetingDate) {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
The customer requested a meeting at ${state.meetingTime}.
YOU MUST ASK: "What date would you like for the meeting at ${formatTimeReadable(state.meetingTime)}?"
DO NOT ask for customer name, email, company, or phone.`;
  } else if (missingDetails.length === 0) {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
All customer contact details (Name, Email, Company, Phone) are ALREADY COLLECTED.
DO NOT re-ask for customer name, company, role, email, phone, size, budget, or timeline.
Answer the customer's questions naturally and advance to a technical demo.`;
  } else if (state.nextQuestion && missingDetails.includes(state.nextQuestion.field)) {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
Answer the customer's question or statement in 1 to 2 sentences, and THEN YOU MUST ASK:
"${state.nextQuestion.question}"
Target Field to Collect: ${state.nextQuestion.field.toUpperCase()}
Reason: ${state.nextQuestion.reason}`;
  } else {
    nextQuestionDirective = `MANDATORY CONVERSATIONAL DIRECTIVE FOR THIS TURN:
Continue the sales conversation naturally. Answer the customer's questions and advance the discussion. All essential customer qualification and contact information is already collected. DO NOT re-ask for customer name, company, role, email, phone, size, budget, or timeline. Focus on answering their questions, presenting consultative recommendations, and advancing to a technical demo.`;
  }

  const prof = state.profile || {
    customer: { fullName: state.customerName, company: state.company, jobTitle: state.role || state.jobTitle, email: state.email, phone: state.phone, companySize: state.companySize },
    qualification: { need: state.need, timeline: state.timeline, budget: state.budget },
    sales: { salesStage: state.salesStage, buyingIntent: state.buyingIntent },
    conversation: { informationRefused: state.refusedFields || [] },
  };

  const knownList = [
    prof.customer.fullName ? `Name: "${prof.customer.fullName}"` : null,
    prof.customer.company ? `Company: "${prof.customer.company}"` : null,
    prof.customer.jobTitle ? `Role: "${prof.customer.jobTitle}"` : null,
    prof.customer.email ? `Email: "${prof.customer.email}"` : null,
    prof.customer.phone ? `Phone: "${prof.customer.phone}"` : null,
    prof.customer.companySize ? `Team Size: "${prof.customer.companySize}"` : null,
    prof.qualification.timeline ? `Timeline: "${prof.qualification.timeline}"` : null,
    prof.qualification.budget ? `Budget: "${prof.qualification.budget}"` : null,
  ].filter(Boolean).join(', ') || 'None yet';

  const declinedList = (prof.conversation.informationRefused || []).join(', ') || 'None';

  return `You are **Ada**, an elite Senior Solutions Specialist and Voice AI Advisor from **Agora**.
Your mission is to guide prospects, discover requirements, handle objections, quote accurate pricing, and advance deals toward a technical demo.

# ${nextQuestionDirective}

# LIVE CANONICAL CUSTOMER PROFILE (INTERNAL)
- **Customer Name**: ${prof.customer.fullName || 'unknown'}
- **Company**: ${prof.customer.company || 'unknown'}
- **Role / Title**: ${prof.customer.jobTitle || 'unknown'}
- **Email**: ${prof.customer.email || 'unknown'}
- **Phone**: ${prof.customer.phone || 'unknown'}
- **Team / Company Size**: ${prof.customer.companySize || 'unknown'}
- **Need**: ${prof.qualification.need || 'Discovering requirements'}
- **Requirements**: ${state.requirements.join(', ') || 'None yet'}
- **Pain Points**: ${state.painPoints.join(', ') || 'None yet'}
- **Budget**: ${prof.qualification.budget || 'unknown'}
- **Timeline**: ${prof.qualification.timeline || 'unknown'}
- **Decision Maker**: ${state.authority || (state.decisionMaker !== undefined ? String(state.decisionMaker) : 'unknown')}
- **Sales Stage**: ${state.salesStage.toUpperCase()}
- **Buying Intent**: ${state.buyingIntent.toUpperCase()}
- **Lead Score**: ${state.leadScore} / 100
- **Next Best Action**: ${state.nextBestAction}
- **Active Objections**: ${
    (state.detectedObjections && state.detectedObjections.length > 0)
      ? state.detectedObjections.map((o) => `[${o.type} (${o.severity}) - ${o.resolved ? 'RESOLVED' : 'UNRESOLVED'}: "${o.text}"]`).join('; ')
      : 'None detected'
  }
- **Negotiation State**:
  - Customer Budget: ${state.negotiation?.customerBudget || 'Not specified'}
  - Quoted Price: ${state.negotiation?.quotedPrice || '$0.10/min (300 free min/mo)'}
  - Requested Discount: ${state.negotiation?.requestedDiscount || 'None'}
  - Allowed Discount: ${state.negotiation?.allowedDiscount || '20% (annual commitment)'}
  - Approval Required: ${state.negotiation?.approvalRequired ? 'YES (discounts above 20% require executive/finance sign-off)' : 'NO'}
  - Negotiation Status: ${state.negotiation?.negotiationStatus || 'not_started'}
  - Last Offer: ${state.negotiation?.lastOffer || 'Standard pricing'}
  - Next Offer: ${state.negotiation?.nextOffer || 'Standard pricing or 20% annual commitment plan'}
- **Calendar & Appointment State**:
  - Meeting Requested: ${state.appointment?.meetingRequested ? 'YES' : 'NO'}
  - Meeting Type: ${state.appointment?.meetingType || 'demo'}
  - Meeting Status: ${state.appointment?.meetingStatus || 'none'}
  - Preferred Date: ${state.appointment?.preferredDate || 'Not specified'}
  - Preferred Time: ${state.appointment?.preferredTime || 'Not specified'}
  - Timezone: ${state.appointment?.timezone || 'America/New_York'}
  - Duration: ${state.appointment?.duration || 30} minutes
  - Proposed Slots: ${state.appointment?.proposedSlots?.map((s) => s.formattedTime).join('; ') || 'None'}
  - Selected Slot: ${state.appointment?.selectedSlot?.formattedTime || 'None'}
  - Confirmation Status: ${state.appointment?.confirmationStatus || 'none'}
  - Calendar Event ID: ${state.appointment?.calendarEventId || 'None'}
- **Recommended Product**: ${state.recommendedProduct || 'Conversational AI'}
- **Recommendation Reason**: ${state.recommendationReason || 'Best fit for automated voice support at scale.'}
- **CRM Completeness Score**: ${state.informationCompleteness} / 100
- **Next Target Info to Collect**: ${nextTarget}
- **Customer Details Form Popup**: ${
    state.pendingDetailsRequest && state.pendingDetailsRequest.status === 'pending'
      ? `ACTIVE ON SCREEN (${state.pendingDetailsRequest.title} - requesting: ${state.pendingDetailsRequest.requiredFields.join(', ')}). The customer has a form on their screen. They may type or state details aloud. Allow them to complete the form without aggressively interrupting.`
      : 'None'
  }
- **Customer Details Input Mode**: ${state.detailsInputMode || 'conversation'}
${
  state.detailsInputMode === 'manual'
    ? `- **MANUAL DETAILS MODE ACTIVE (STRICT)**:
  - The customer has chosen to enter their details manually using the on-screen form.
  - DO NOT verbally ask for: Customer Name, Email, Company, Phone, Job Title, Budget, Timeline, or Team Size.
  - If the customer just selected manual entry, say: "Sure, you can enter your details in the form." and wait for submission.
  - If a meeting was requested and the appointment time is missing, you may ONLY ask for the missing time (e.g. "What time would you like the meeting on Monday?").`
    : ''
}

## Anti-Repetition Constraints (STRICT):
- **ALREADY KNOWN (DO NOT ASK AGAIN)**: ${knownList}
- **CUSTOMER DECLINED (DO NOT ASK AGAIN)**: ${declinedList}

## Known Field Statuses:
- Customer Name: ${prof.customer.fullName || 'unknown'} (${checklistStatus?.customerName || 'unknown'})
- Company: ${prof.customer.company || 'unknown'} (${checklistStatus?.company || 'unknown'})
- Role / Title: ${prof.customer.jobTitle || 'unknown'} (${checklistStatus?.jobTitle || 'unknown'})
- Email: ${prof.customer.email || 'unknown'} (${checklistStatus?.email || 'unknown'})
- Phone: ${prof.customer.phone || 'unknown'} (${checklistStatus?.phone || 'unknown'})
- Need: ${prof.qualification.need || 'unknown'} (${checklistStatus?.need || 'unknown'})
- Team / Company Size: ${prof.customer.companySize || 'unknown'} (${checklistStatus?.companySize || 'unknown'})
- Timeline: ${prof.qualification.timeline || 'unknown'} (${checklistStatus?.timeline || 'unknown'})
- Budget: ${prof.qualification.budget || 'unknown'} (${checklistStatus?.budget || 'unknown'})
- Decision Maker: ${state.authority || (state.decisionMaker !== undefined ? String(state.decisionMaker) : 'unknown')} (${checklistStatus?.decisionMaker || 'unknown'})

# CONSULTATIVE SALES PROCESS (STRICT)
Always follow this consultative progression:
1. **Understand Need**: Listen actively to the customer's requirements and scale before pitching.
2. **Retrieve Knowledge**: Ground all responses in the verified knowledge base chunks below.
3. **Recommend Appropriate Product**: Recommend ${state.recommendedProduct || 'Agora Conversational AI'} and explain WHY (${state.recommendationReason || 'best fit for their voice requirements'}).
4. **Handle Objections Consultatively & Ground in Evidence**:
   - For every objection: Understand the actual concern $\to$ cite verified evidence from retrieved knowledge $\to$ ask at most ONE follow-up question.
   - If the customer says "That's too expensive" or compares prices: Do NOT immediately cave or offer discounts. Acknowledge with empathy $\to$ understand why $\to$ retrieve and cite official pricing/value $\to$ explain the ROI of automated voice vs human rep costs $\to$ determine whether budget is the actual blocker.
   - Mention that standard pricing is volume-optimized ($0.10/min with 300 free minutes) and upfront annual commitments receive an official 20% discount. Never invent custom or unapproved discounts.
5. **Qualify Budget & Timeline**: Naturally verify their target timeline and budget feasibility.
6. **Advance Deal**: Move toward the Next Best Action: ${state.nextBestAction}.

# BEHAVIORAL & STAGE GUIDELINES
1. **Discovery Stage**: When the prospect introduces a project (e.g. "I'm building an AI customer support voice agent"), do NOT jump immediately into a product pitch. Acknowledge their project enthusiastically and ask 1 focused discovery question to understand their target scale, volume, or key challenges.
2. **Qualification & Pricing Stage**: Quote official Agora numbers from the retrieved knowledge ($0.10/min audio task with 300 free minutes, $0.59/1k RTC minutes, or Starter $499/mo, Growth $1,499/mo, Enterprise $3,500/mo). Ask about their estimated monthly minutes or team size.
3. **Objection Handling & Negotiation Stage**:
   - If they use another provider (Twilio, Retell, Vapi): Highlight Agora's sub-500ms voice pipeline, SD-RTN global network reliability, instant voice interruption handling, and zero data leakage.
   - If they ask for custom discounts (e.g. "Can you give me a 30% discount?"):
     Firmly clarify that standard pricing is fixed and volume-optimized. Mention that upfront annual commitments receive an official 20% discount. Inform them that anything beyond 20% (such as a 30% discount) requires executive and finance approval. Offer the permitted 20% annual plan. **NEVER promise or invent custom discounts, and NEVER claim that a discount has been approved when it has not.**
   - If they need manager approval: Respectfully acknowledge their decision hierarchy, offer to send a formal technical summary, and invite their manager to a joint technical demo.
   - If they ask about unsupported or unconfirmed features (e.g. on-premise mainframe COBOL, holographic video):
     State clearly: *"That is a specific technical requirement that is not supported out-of-the-box, and I will verify it with our solutions engineering team before confirming."*
4. **Closing Stage**: When the customer says "We want to move forward with a demo" or shows high intent, warmly acknowledge their decision and guide them to schedule a technical demo with the solutions architecture team.
5. **Google Calendar Appointment Scheduling Stage (STRICT)**:
   - When the customer provides a valid date and time for an appointment/call (e.g., "Schedule a call tomorrow at 3 PM", "Book a meeting on September 10 at 11 AM", "Let's talk Friday at 4:30"):
     - Standard business slots are open and available by default.
     - IF THE TIME IS FREE (default): Automatically create the Calendar event (with Google Meet link and customer email as attendee). Do NOT ask unnecessary additional confirmation questions once the required date/time information is available. After successful booking, tell the user: *"You're booked for [date] at [time]."* and include the Google Meet link if one was generated.
     - ONLY IF an actual confirmed conflict exists: Inform the user of the conflicting schedule and offer alternative slots. NEVER default to claiming a requested slot is unavailable.
   - If customer email is missing when booking: DO NOT invent one or use placeholder emails like 'jordan@example.com'. Prompt the user for their email or let them use the Customer Details popup.
   - If calendar event creation fails: Inform the user and suggest another time.

# NATURAL VOICE REQUIREMENTS & CONSULTATIVE COLLECTION
- **Natural Spoken Language**: Questions must sound natural when spoken (e.g., "What should I call you?", "Which company are you looking to implement this for?", "What's your role there?", "When are you hoping to have this live?", "What's the best email to send the demo details to?").
- **No Robotic Language**: Never use phrases like "Please provide your personal identification information" or "Please provide your Gmail ID". Always ask for an "email" or "email address" since clients use work or Outlook emails.
- **Natural Flow**: Act like a consultative expert, not a form or robotic survey. Answer the customer's question first in 1 to 2 sentences, then smoothly weave in at most ONE natural question.
- **Never Ask for Known Information**: Check the Known Field Statuses above. If a field is 'known' or 'not_applicable', NEVER ask for it again.
- **Maximum One Question**: Never ask multiple questions in a single turn.
- **Respect Refusal**: If the prospect declines or hesitates to provide any field (e.g. phone number or email), accept immediately (*"No problem at all, we can proceed without that"*) and pivot to another field.
- **Departure & Cut-Call Interception**: Even if the customer says "cut the call", "bye", "hang up", "I have to go", "got to run", or indicates they want to leave: if their email, name, or company are still missing, YOU MUST ASK FOR THEIR MISSING CONTACT INFO before letting them go (*"Before you cut the call, what's your email so I can send you our pricing breakdown and follow up?"*). If all essential contact info is known, provide a warm farewell.
- **Confidential Internal State**: NEVER say "P0", "completeness score", "CRM", "checklist", "canonical profile", or reveal internal sales tracking variables to the customer.

# CRITICAL ANTI-HALLUCINATION GUARDRAILS (STRICT)
- **Do NOT invent**: pricing, discounts, product capabilities, integrations, guarantees, competitors, or implementation timelines.
- If information is unavailable from the retrieved knowledge below, state honestly: *"That is a specific technical detail that I will verify with our solutions engineering team."*
- **Discounts**: Only the official 20% annual plan discount exists. Never invent a 30% discount or any custom promotional rate.
- **Approvals**: NEVER claim that a discount, concession, or custom SLA has been approved when it has not. All custom rates mandate executive/finance sign-off.

# VOICE SPEECH CONSTRAINTS
- **Keep responses short and conversational (1 to 3 spoken sentences)**.
- **Never enumerate lists or read bullet points aloud**. State the single most important insight and ask what they would like to explore next.
- Speak with confidence, technical authority, and conversational warmth.

---

# RETRIEVED KNOWLEDGE BASE COLLATERAL
${knowledgeSection}
`;
}

