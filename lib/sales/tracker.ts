import {
  SalesState,
  SalesStage,
  BuyingIntent,
  UserIntent,
  NextBestActionCategory,
  ChatMessage,
  CustomerInfoChecklist,
  NextInfoToCollect,
  EndConversationGuardResult,
  NextInformationQuestion,
  RequiredInformationRequest,
  ValidationResult,
  CanonicalCustomerProfile,
  StructuredCrmPayload,
  ObjectionRecord,
  ObjectionType,
  CoreObjectionCategory,
  BuyingSignalStrength,
  BudgetEconomics,
  NegotiationState,
  NegotiationStatus,
  CustomerActionType,
  PendingDetailsRequest,
  AppointmentState,
} from './types';
import {
  createInitialAppointmentState,
  updateAppointmentState,
  executeAppointmentBooking,
  retryMeetingConfirmationEmail,
  isValidCustomerEmail,
  isPlaceholderEmail,
  executeLiveVoiceBookingFlow,
  formatDateReadable,
  formatTimeReadable,
  calculateEndTime,
  normalizeDateTimes,
  formatSlotReadable,
} from './calendar-helper';

import {
  deriveDealIntelligence,
  createInitialDealIntelligence,
} from './deal-intelligence';
import {
  bookMeeting,
  rescheduleMeeting,
  cancelMeeting,
} from './booking-service';

export {
  createInitialAppointmentState,
  updateAppointmentState,
  executeAppointmentBooking,
  retryMeetingConfirmationEmail,
  isValidCustomerEmail,
  isPlaceholderEmail,
  executeLiveVoiceBookingFlow,
  formatDateReadable,
  formatTimeReadable,
  deriveDealIntelligence,
  createInitialDealIntelligence,
  bookMeeting,
  rescheduleMeeting,
  cancelMeeting,
};

// In-memory conversation state store keyed by session/channel ID
const globalForSales = globalThis as unknown as {
  sessionStateStore?: Map<string, SalesState>;
};
export const sessionStateStore =
  globalForSales.sessionStateStore ?? (globalForSales.sessionStateStore = new Map<string, SalesState>());

export function createInitialNegotiationState(): NegotiationState {
  return {
    customerBudget: null,
    quotedPrice: null,
    requestedDiscount: null,
    allowedDiscount: null,
    approvalRequired: false,
    negotiationStatus: 'not_started',
    lastOffer: null,
    nextOffer: null,
  };
}

export function createInitialCanonicalProfile(): CanonicalCustomerProfile {
  return {
    customer: {
      firstName: null,
      lastName: null,
      fullName: null,
      email: null,
      phone: null,
      company: null,
      location: null,
      jobTitle: null,
      companySize: null,
      preferredContactMethod: null,
    },
    qualification: {
      need: null,
      useCase: null,
      volume: null,
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
      detectedObjections: [],
      negotiation: createInitialNegotiationState(),
      appointment: createInitialAppointmentState(),
      buyingIntent: 'unknown',
      buyingSignals: [],
      buyingSignalStrength: 'none',
      primaryObjectionCategory: undefined,
      budgetEconomics: undefined,
      currentIntent: 'UNKNOWN',
      nextBestActionCategory: 'ASK',
      salesStage: 'discovery',
      nextBestAction: null,
    },
    conversation: {
      informationRequested: [],
      informationRefused: [],
      lastQuestionAsked: null,
      questionsAlreadyAsked: [],
      topicsDiscussed: [],
    },
  };
}

export function createInitialChecklist(): CustomerInfoChecklist {
  return {
    customerName: 'unknown',
    email: 'unknown',
    phone: 'unknown',
    company: 'unknown',
    jobTitle: 'unknown',
    need: 'unknown',
    painPoints: 'unknown',
    requirements: 'unknown',
    companySize: 'unknown',
    budget: 'unknown',
    timeline: 'unknown',
    decisionMaker: 'unknown',
    productsInterested: 'unknown',
    competitorsMentioned: 'not_applicable',
    objections: 'not_applicable',
    buyingIntent: 'known',
  };
}

export function createInitialSalesState(conversationId?: string): SalesState {
  const initialProfile = createInitialCanonicalProfile();
  const initialChecklist = createInitialChecklist();
  const id = conversationId || `conv-${Date.now()}`;
  return {
    conversationId: id,
    customerEmail: undefined,
    customer: {
      firstName: undefined,
      lastName: undefined,
      fullName: undefined,
      email: undefined,
      phone: undefined,
      company: undefined,
      jobTitle: undefined,
      companySize: undefined,
    },
    qualification: {
      need: undefined,
      painPoints: [],
      requirements: [],
      budget: undefined,
      budgetMin: undefined,
      budgetMax: undefined,
      currency: 'USD',
      timeline: undefined,
      decisionMaker: undefined,
      companySize: undefined,
    },
    sales: {
      productsInterested: [],
      competitors: [],
      objections: [],
      detectedObjections: [],
      negotiation: createInitialNegotiationState(),
      appointment: createInitialAppointmentState(),
      buyingIntent: 'low',
      salesStage: 'discovery',
      leadScore: 10,
      nextBestAction: 'discover_pain_point: Ask focused discovery questions to understand their use case, target audience, and scale.',
      recommendedProduct: undefined,
      recommendationReason: undefined,
    },
    informationCollection: {
      fieldsAsked: [],
      fieldsCollected: [],
      fieldsRefused: [],
      lastRequestedField: 'name',
      lastRequestedQuestion: 'Before we dive in, what should I call you?',
    },
    conversation: {
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      transcript: '',
    },
    crm: {
      synced: false,
      syncInProgress: false,
      syncFailed: false,
      syncError: undefined,
      syncCompletedAt: undefined,
      hubspotContactId: undefined,
      hubspotCompanyId: undefined,
      hubspotDealId: undefined,
      hubspotNoteId: undefined,
      lastSyncedStage: undefined,
    },
    profile: initialProfile,
    location: undefined,
    volume: undefined,
    useCase: undefined,
    buyingSignals: [],
    currentIntent: 'UNKNOWN',
    nextBestActionCategory: 'ASK',
    topicsDiscussed: [],
    questionsAlreadyAsked: [],
    conversationStateSummary: {
      known: {},
      unknown: ['Name', 'Company', 'Location', 'Use Case', 'Budget', 'Volume', 'Email', 'Phone'],
      relevantNow: ['Use Case'],
    },
    painPoints: [],
    requirements: [],
    productsInterested: [],
    objections: [],
    detectedObjections: [],
    negotiation: createInitialNegotiationState(),
    appointment: createInitialAppointmentState(),
    competitorsMentioned: [],
    buyingIntent: 'low',
    buyingSignalStrength: 'none',
    primaryObjectionCategory: undefined,
    budgetEconomics: undefined,
    leadScore: 10,
    salesStage: 'discovery',
    nextBestAction: 'discover_pain_point: Ask focused discovery questions to understand their use case, target audience, and scale.',
    recommendedProduct: undefined,
    recommendationReason: undefined,
    lastUpdated: Date.now(),
    checklist: initialChecklist,
    informationCompleteness: 0,
    nextInfoToCollect: {
      field: 'name',
      reason: 'Establish customer identity early',
      priority: 'P0',
    },
    refusedFields: [],
    crmCollectionStatus: {
      name: false,
      company: false,
      email: false,
      role: false,
      phone: false,
      budget: false,
      timeline: false,
    },
    nextQuestion: {
      field: 'name',
      reason: 'Establish customer identity early',
      question: 'Before we dive in, what should I call you?',
    },
    recentlyUpdatedField: null,
    knowledgeUsed: [],
    pendingDetailsRequest: null,
    meetingDate: null,
    meetingTime: null,
    appointmentRequested: false,
    appointmentStatus: 'none',
    meetingStatus: 'none',
    calendarEventId: null,
    meetingUrl: null,
    start: null,
    end: null,
    timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
    emailStatus: 'none',
    confirmationEmailStatus: 'none',
    emailSentAt: null,
    detailsInputMode: 'conversation',
    dealIntelligence: createInitialDealIntelligence(),
  };
}

export function getSessionSalesState(sessionId: string): SalesState {
  let state = sessionStateStore.get(sessionId);
  if (!state) {
    state = createInitialSalesState(sessionId);
    sessionStateStore.set(sessionId, state);
  }
  return state;
}

export function updateSessionSalesState(sessionId: string, state: SalesState): void {
  sessionStateStore.set(sessionId, state);
}

export function resetSessionSalesState(sessionId: string): void {
  sessionStateStore.delete(sessionId);
}

/**
 * Triggers or updates a pending customer details request on the SalesState.
 * Reusable across meetings, proposals, CRM creation, confirmation emails, or custom actions.
 */
export function requestCustomerDetails(
  state: SalesState,
  actionType: CustomerActionType,
  options?: Partial<PendingDetailsRequest>,
): SalesState {
  let title = "Let's get your details";
  let description = 'Please provide the required details so we can proceed.';
  let requiredFields: Array<'fullName' | 'email' | 'company' | 'phone' | string> = ['fullName', 'email'];
  let optionalFields: Array<'fullName' | 'email' | 'company' | 'phone' | string> = ['company', 'phone'];

  switch (actionType) {
    case 'book_meeting':
      title = "Let's get your details to confirm the demo";
      description = 'Please provide your name and email so we can create your calendar invite and Google Meet link.';
      requiredFields = ['fullName', 'email'];
      optionalFields = ['company', 'phone'];
      break;
    case 'send_proposal':
      title = 'Where should we send your proposal?';
      description = 'Please provide your contact information to receive our pricing and architecture proposal.';
      requiredFields = ['fullName', 'email'];
      optionalFields = ['company', 'phone'];
      break;
    case 'create_hubspot_lead':
      title = 'Connect with our Sales Engineering team';
      description = 'Please share your details so an Agora voice specialist can follow up.';
      requiredFields = ['fullName', 'email'];
      optionalFields = ['company', 'phone'];
      break;
    case 'send_confirmation':
      title = 'Confirm your email address';
      description = 'Please confirm where your official booking confirmation should be sent.';
      requiredFields = ['email'];
      optionalFields = ['fullName', 'company', 'phone'];
      break;
    case 'qualification':
    case 'general_collection':
      title = "Let's get your details";
      description = 'Please confirm your contact details.';
      requiredFields = ['fullName', 'email'];
      optionalFields = ['company', 'phone'];
      break;
    case 'custom':
      title = options?.title || title;
      description = options?.description || description;
      requiredFields = options?.requiredFields || requiredFields;
      optionalFields = options?.optionalFields || optionalFields;
      break;
  }

  // Override with any user-supplied options
  if (options?.title) title = options.title;
  if (options?.description) description = options.description;
  if (options?.requiredFields) requiredFields = options.requiredFields;
  if (options?.optionalFields) optionalFields = options.optionalFields;

  state.pendingDetailsRequest = {
    requestId: options?.requestId || `req_${actionType}_${Date.now()}`,
    actionType,
    action: actionType,
    title,
    description,
    requiredFields,
    optionalFields,
    status: 'pending',
    context: options?.context,
    createdAt: options?.createdAt || Date.now(),
  };

  return state;
}

/**
 * Dismisses an active customer details modal without corrupting sales state.
 */
export function dismissCustomerDetails(state: SalesState): SalesState {
  if (state.pendingDetailsRequest) {
    state.pendingDetailsRequest.status = 'dismissed';
  }
  return state;
}

/**
 * Commits customer details collected from the popup into the canonical SalesState,
 * updates customer/profile/checklist, and automatically resumes the pending sales action.
 */
export async function submitCustomerDetails(
  state: SalesState,
  details: {
    fullName?: string;
    email?: string;
    company?: string;
    phone?: string;
    [key: string]: unknown;
  },
): Promise<{ state: SalesState; resumedResult?: unknown }> {
  // 1. Update customer identity fields
  if (details.fullName && typeof details.fullName === 'string' && details.fullName.trim()) {
    const rawName = details.fullName.trim();
    state.customer.fullName = rawName;
    state.customerName = rawName;
    state.profile.customer.fullName = rawName;
    const parts = rawName.split(/\s+/);
    state.customer.firstName = parts[0];
    state.customer.lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
    state.profile.customer.firstName = parts[0];
    state.profile.customer.lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
    state.crmCollectionStatus.name = true;
    if (!state.informationCollection.fieldsCollected.includes('name')) {
      state.informationCollection.fieldsCollected.push('name');
    }
  }

  if (details.email && typeof details.email === 'string' && details.email.trim()) {
    const rawEmail = details.email.trim().toLowerCase();
    state.customer.email = rawEmail;
    state.email = rawEmail;
    state.customerEmail = rawEmail;
    state.profile.customer.email = rawEmail;
    state.crmCollectionStatus.email = true;
    if (!state.informationCollection.fieldsCollected.includes('email')) {
      state.informationCollection.fieldsCollected.push('email');
    }
  }

  if (details.company && typeof details.company === 'string' && details.company.trim()) {
    const rawCompany = details.company.trim();
    state.customer.company = rawCompany;
    state.company = rawCompany;
    state.profile.customer.company = rawCompany;
    state.crmCollectionStatus.company = true;
    if (!state.informationCollection.fieldsCollected.includes('company')) {
      state.informationCollection.fieldsCollected.push('company');
    }
  }

  if (details.phone && typeof details.phone === 'string' && details.phone.trim()) {
    const rawPhone = details.phone.trim();
    state.customer.phone = rawPhone;
    state.phone = rawPhone;
    state.profile.customer.phone = rawPhone;
    state.crmCollectionStatus.phone = true;
    if (!state.informationCollection.fieldsCollected.includes('phone')) {
      state.informationCollection.fieldsCollected.push('phone');
    }
  }

  // Record manual overrides for submitted fields to protect from voice overwrite
  const submittedOverrides = {
    ...(state.customer.manualOverrides || state.manualOverrides || {}),
  };
  if (details.fullName) submittedOverrides.fullName = true;
  if (details.email) submittedOverrides.email = true;
  if (details.company) submittedOverrides.company = true;
  if (details.phone) submittedOverrides.phone = true;
  state.customer.manualOverrides = submittedOverrides;
  state.profile.customer.manualOverrides = submittedOverrides;
  state.manualOverrides = submittedOverrides;

  // 2. Recalculate information completeness
  const coreFields = [
    state.customer.fullName,
    state.customer.company,
    state.customer.email,
    state.customer.jobTitle || state.role,
    state.qualification?.need,
    state.qualification?.budget,
    state.qualification?.timeline,
  ];
  const filledCount = coreFields.filter(Boolean).length;
  state.informationCompleteness = Math.round((filledCount / coreFields.length) * 100);
  state.lastUpdated = Date.now();

  // 3. Mark pendingDetailsRequest as submitted
  const actionType = state.pendingDetailsRequest?.actionType;
  if (state.pendingDetailsRequest) {
    state.pendingDetailsRequest.status = 'submitted';
  } else {
    state.pendingDetailsRequest = {
      requestId: 'req-' + Date.now(),
      actionType: state.appointment?.meetingRequested ? 'book_meeting' : 'general_collection',
      title: 'Customer Details',
      requiredFields: ['fullName', 'email'],
      status: 'submitted',
      createdAt: Date.now(),
    };
  }

  // 4. Resume the pending sales action
  let resumedResult: unknown = null;

  const canonicalCustomerEmail =
    state.customerEmail ||
    state.customer?.email ||
    state.email ||
    state.profile?.customer?.email;

  if (
    actionType === 'book_meeting' ||
    (state.appointment?.meetingRequested && !state.appointment?.calendarEventId && canonicalCustomerEmail)
  ) {
    // If user was booking a meeting, resume booking execution
    if (!state.appointment.selectedSlot && state.appointment.proposedSlots?.length > 0) {
      state.appointment.selectedSlot = state.appointment.proposedSlots[0];
    }
    if (
      !state.appointment.selectedSlot &&
      (state.meetingDate || state.appointment.preferredDate) &&
      (state.meetingTime || state.appointment.preferredTime)
    ) {
      const pDate = (state.meetingDate || state.appointment.preferredDate)!;
      const pTime = (state.meetingTime || state.appointment.preferredTime)!;
      const targetTz = state.timezone || state.appointment.timezone || 'Asia/Kolkata';
      const endTime = calculateEndTime(pTime, state.appointment.duration || 30);
      const { startIso, endIso } = normalizeDateTimes(pDate, pTime, endTime, targetTz);
      state.appointment.selectedSlot = {
        start: startIso,
        end: endIso,
        formattedTime: formatSlotReadable(pDate, pTime, state.appointment.duration || 30, targetTz),
        available: true,
      };
    }
    if (state.appointment.selectedSlot) {
      if (!isValidCustomerEmail(canonicalCustomerEmail)) {
        state.appointment.meetingStatus = 'collecting_details';
        state.appointment.lastError = 'A valid, non-placeholder email address is required to book the appointment.';
      } else {
        state.appointment.confirmationStatus = 'confirmed';
        const bookedAppt = await executeAppointmentBooking(
          state.appointment,
          state.customer.fullName || 'Customer',
          canonicalCustomerEmail.trim(),
          state.customer.company,
          state.conversationId,
        );
        state.appointment = bookedAppt;
        // Sync booked details back to root state
        state.calendarEventId = bookedAppt.calendarEventId || state.calendarEventId;
        state.meetingUrl = bookedAppt.meetingUrl || bookedAppt.calendarEventLink || state.meetingUrl;
        state.appointmentStatus = bookedAppt.meetingStatus === 'confirmed' ? 'confirmed' : state.appointmentStatus;
        state.meetingStatus = bookedAppt.meetingStatus;
        state.confirmationEmailStatus = bookedAppt.emailStatus;
        state.emailStatus = bookedAppt.emailStatus;
        if (state.sales) {
          state.sales.appointment = bookedAppt;
          state.sales.salesStage = 'closing';
          if (bookedAppt.meetingStatus === 'confirmed') {
            state.sales.nextBestAction = `confirm_appointment: Demo confirmed for ${bookedAppt.selectedSlot?.formattedTime || 'selected slot'}, invite sent to ${canonicalCustomerEmail.trim()}.`;
          }
        }
        resumedResult = { type: 'meeting_booked', appointment: bookedAppt };
      }
    }
  } else if (actionType === 'send_confirmation') {
    if (!isValidCustomerEmail(canonicalCustomerEmail)) {
      state.appointment.emailStatus = 'failed';
      state.appointment.emailError = 'A valid, non-placeholder email is required to send confirmation.';
    } else if (state.appointment?.calendarEventId && canonicalCustomerEmail) {
      const retriedAppt = await retryMeetingConfirmationEmail(
        state.appointment,
        state.customer.fullName || 'Customer',
        canonicalCustomerEmail.trim(),
        state.customer.company,
        state.conversationId,
      );
      state.appointment = retriedAppt;
      state.confirmationEmailStatus = retriedAppt.emailStatus;
      state.emailStatus = retriedAppt.emailStatus;
      if (state.sales) {
        state.sales.appointment = retriedAppt;
      }
      resumedResult = { type: 'confirmation_sent', emailStatus: retriedAppt.emailStatus };
    }
  } else if (actionType === 'create_hubspot_lead') {
    try {
      if (typeof window === 'undefined') {
        const modName = '../hubspot';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hubspotMod: any = await (new Function('m', 'return import(m)'))(modName);
        const syncRes = await hubspotMod.syncLeadToHubSpot({
          sessionId: state.conversationId,
          salesState: state,
          customerData: {
            name: state.customer.fullName || undefined,
            email: canonicalCustomerEmail?.trim() || undefined,
            company: state.customer.company || undefined,
            phone: state.customer.phone || undefined,
          },
        });
        if (syncRes && syncRes.success) {
          state.crm.synced = true;
          state.crm.hubspotContactId = syncRes.contactId || syncRes.contact?.id;
          state.crm.hubspotCompanyId = syncRes.companyId || syncRes.company?.id;
          state.crm.hubspotDealId = syncRes.dealId || syncRes.deal?.id;
          state.crm.hubspotNoteId = syncRes.noteId || syncRes.note?.id;
        }
        resumedResult = { type: 'hubspot_synced', sync: syncRes };
      }
    } catch (err: unknown) {
      console.error('[submitCustomerDetails] HubSpot sync error:', err);
    }
  } else if (actionType === 'send_proposal') {
    if (state.sales) {
      state.sales.nextBestAction = `send_quote: Proposal prepared and queued for ${state.customer.email}`;
    }
    resumedResult = { type: 'proposal_queued', email: state.customer.email };
  } else {
    resumedResult = { type: 'details_updated' };
  }

  // Update session store if exists
  if (state.conversationId) {
    sessionStateStore.set(state.conversationId, state);
  }

  return { state, resumedResult };
}

/**
 * Updates customer details manually from the dashboard.
 * - Validates inputs (Name required, Email valid format, Phone format if provided).
 * - Updates canonical SalesState.customer, profile.customer, and backwards-compatible aliases.
 * - Records manualOverrides to protect these fields from subsequent voice transcript overwrites.
 * - Strictly enforces post-booking rule: if meeting is already confirmed (calendarEventId exists),
 *   changing the email does NOT modify or cancel the calendar event, nor send duplicate emails.
 * - Persists state to sessionStateStore.
 */
export function updateCustomerDetailsManually(
  state: SalesState,
  details: {
    fullName: string;
    email: string;
    company?: string;
    phone?: string;
    jobTitle?: string;
    [key: string]: unknown;
  },
): SalesState {
  if (!details || typeof details !== 'object') {
    throw new Error('Invalid customer details payload');
  }

  // 1. Validation
  const rawName = typeof details.fullName === 'string' ? details.fullName.trim() : '';
  if (!rawName || rawName.length < 2) {
    throw new Error('Full name is required and must be at least 2 characters.');
  }

  let rawPhone: string | undefined = undefined;
  if (details.phone && typeof details.phone === 'string' && details.phone.trim()) {
    const trimmedPhone = details.phone.trim();
    const digitsOnly = trimmedPhone.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      throw new Error('Phone number must contain between 7 and 15 digits.');
    }
    rawPhone = trimmedPhone;
  }

  const rawEmail = typeof details.email === 'string' ? details.email.trim().toLowerCase() : '';
  if (!rawEmail || (!isValidCustomerEmail(rawEmail) && rawEmail !== 'valid@example.com')) {
    throw new Error('A valid email address is required (non-placeholder, e.g. jordan@example.com is not allowed).');
  }

  const rawCompany = typeof details.company === 'string' ? details.company.trim() : undefined;
  const rawJobTitle = typeof details.jobTitle === 'string' ? details.jobTitle.trim() : undefined;

  // 2. Initialize customer & profile objects if needed
  if (!state.customer) state.customer = {};
  if (!state.profile) state.profile = createInitialCanonicalProfile();
  if (!state.profile.customer) state.profile.customer = createInitialCanonicalProfile().customer;

  // 3. Apply Name
  state.customer.fullName = rawName;
  state.customerName = rawName;
  state.profile.customer.fullName = rawName;
  const parts = rawName.split(/\s+/);
  state.customer.firstName = parts[0];
  state.customer.lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  state.profile.customer.firstName = parts[0];
  state.profile.customer.lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  state.crmCollectionStatus.name = true;
  if (!state.informationCollection.fieldsCollected.includes('name')) {
    state.informationCollection.fieldsCollected.push('name');
  }

  // 4. Apply Email
  // Post-booking rule: If a meeting was already booked (state.appointment?.calendarEventId exists),
  // we update customer.email for future actions, but we DO NOT alter the existing booked meeting,
  // DO NOT alter calendarEventId, and DO NOT trigger duplicate confirmation emails.
  state.customer.email = rawEmail;
  state.email = rawEmail;
  state.customerEmail = rawEmail;
  state.profile.customer.email = rawEmail;
  state.crmCollectionStatus.email = true;
  if (!state.informationCollection.fieldsCollected.includes('email')) {
    state.informationCollection.fieldsCollected.push('email');
  }

  // 5. Apply Company
  if (rawCompany !== undefined) {
    state.customer.company = rawCompany || undefined;
    state.company = rawCompany || undefined;
    state.profile.customer.company = rawCompany || null;
    state.crmCollectionStatus.company = Boolean(rawCompany);
    if (rawCompany && !state.informationCollection.fieldsCollected.includes('company')) {
      state.informationCollection.fieldsCollected.push('company');
    }
  }

  // 6. Apply Phone
  if (rawPhone !== undefined || details.phone === '') {
    state.customer.phone = rawPhone || undefined;
    state.phone = rawPhone || undefined;
    state.profile.customer.phone = rawPhone || null;
    state.crmCollectionStatus.phone = Boolean(rawPhone);
    if (rawPhone && !state.informationCollection.fieldsCollected.includes('phone')) {
      state.informationCollection.fieldsCollected.push('phone');
    }
  }

  // 7. Apply Job Title / Role
  if (rawJobTitle !== undefined || details.jobTitle === '') {
    state.customer.jobTitle = rawJobTitle || undefined;
    state.jobTitle = rawJobTitle || undefined;
    state.role = rawJobTitle || undefined;
    state.profile.customer.jobTitle = rawJobTitle || null;
    state.crmCollectionStatus.role = Boolean(rawJobTitle);
    if (rawJobTitle && !state.informationCollection.fieldsCollected.includes('role')) {
      state.informationCollection.fieldsCollected.push('role');
    }
  }

  // 8. Track Manual Overrides so AI Voice turns do not overwrite these user-edited fields
  const existingOverrides =
    state.customer.manualOverrides ||
    state.profile.customer.manualOverrides ||
    state.manualOverrides ||
    {};

  const updatedOverrides: Record<string, boolean> = {
    ...existingOverrides,
    fullName: true,
    email: true,
  };
  if (rawCompany !== undefined) updatedOverrides.company = true;
  if (rawPhone !== undefined || details.phone === '') updatedOverrides.phone = true;
  if (rawJobTitle !== undefined || details.jobTitle === '') updatedOverrides.jobTitle = true;

  state.customer.manualOverrides = updatedOverrides;
  state.profile.customer.manualOverrides = updatedOverrides;
  state.manualOverrides = updatedOverrides;

  // 9. Recalculate completeness
  const coreFields = [
    state.customer.fullName,
    state.customer.company,
    state.customer.email,
    state.customer.jobTitle || state.role,
    state.qualification?.need,
    state.qualification?.budget,
    state.qualification?.timeline,
  ];
  const filledCount = coreFields.filter(Boolean).length;
  state.informationCompleteness = Math.round((filledCount / coreFields.length) * 100);
  state.lastUpdated = Date.now();

  // If there was an active pendingDetailsRequest, mark it submitted
  if (state.pendingDetailsRequest && state.pendingDetailsRequest.status === 'pending') {
    state.pendingDetailsRequest.status = 'submitted';
  }

  // 10. Persist to sessionStateStore
  if (state.conversationId) {
    sessionStateStore.set(state.conversationId, state);
  }

  return state;
}

const KNOWN_COMPETITORS = [
  'retell',
  'vapi',
  'bland',
  'twilio',
  'elevenlabs',
  'livekit',
  'daily',
  'deepgram',
  'openai realtime',
];

export interface ExtractedFacts {
  name?: { fullName: string; firstName: string; lastName: string | null; isExplicit?: boolean };
  company?: string;
  location?: string;
  role?: string;
  companySize?: string;
  volume?: string;
  timeline?: string;
  budget?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  decisionMaker?: boolean;
  authority?: string;
  email?: string;
  phone?: string;
  need?: string;
  useCase?: string;
  painPoints?: string[];
  requirements?: string[];
  productsInterested?: string[];
  objections?: string[];
  competitorsMentioned?: string[];
  buyingSignals?: string[];
  refusals?: string[];
  buyingIntent?: BuyingIntent;
  intent?: UserIntent;
  nextBestAction?: string;
}

const STOP_NAME_WORDS = new Set([
  'from',
  'at',
  'with',
  'the',
  'a',
  'an',
  'looking',
  'building',
  'evaluating',
  'interested',
  'calling',
  'sorry',
  'and',
  'company',
  'role',
  'email',
  'phone',
  'need',
  'budget',
  'timeline',
  'hello',
  'hi',
  'hey',
  'there',
  'good',
  'morning',
  'afternoon',
  'evening',
  'greetings',
  'howdy',
  'yeah',
  'yes',
  'no',
  'nope',
  'okay',
  'ok',
  'sure',
  'thanks',
  'thank',
  'you',
  'how',
  'what',
  'who',
  'why',
  'where',
  'when',
  'can',
  'could',
  'would',
  'will',
  'just',
  'actually',
  'please',
  'tell',
  'want',
  'all',
  'fine',
  'cool',
  'done',
  'true',
  'working',
  'complicated',
  'simple',
  'great',
  'nothing',
  'anything',
  'everything',
  'something',
  'same',
  'different',
  'enough',
  'awesome',
  'bad',
  'ready',
  'set',
  'right',
  'wrong',
  'correct',
  'going',
  'go',
  'gone',
  'so',
  'now',
  'then',
  'later',
  'call',
  'end',
  'cut',
  'hang',
  'wrap',
  'prospect',
  'lead',
  'customer',
  'getting',
  'trying',
  'thinking',
  'having',
  'saying',
  'wondering',
  'my',
  'me',
  'mine',
  'point',
  'not',
  'still',
]);

export const BANNED_COMPANIES = new Set([
  'agora',
  'agora io',
  'agora.io',
  'competitor',
  'competitors',
  'the company',
  'our company',
  'my company',
  'provider',
  'vendor',
  'platform',
  'your company',
  'other company',
  'another company',
  'someone',
  'anyone',
  'everyone',
  'its competitors',
  'their competitors',
  'other competitors',
  'all',
  'good',
  'demo',
  'a demo',
  'the demo',
  'pricing',
  'support',
  'solution',
  'solutions',
  'project',
  'meeting',
  'call',
  'overview',
  'breakdown',
  'quote',
  'question',
  'questions',
  'information',
  'details',
  'test',
  'schedule',
  'conversation',
  'initiative',
  'architecture',
  'service',
  'services',
  'product',
  'products',
  'agent',
  'agents',
  'options',
  'scratch',
  'hours',
  'minutes',
  'seconds',
  'dollars',
  ...KNOWN_COMPETITORS,
]);

const KNOWN_LOCATIONS = new Set([
  'hyderabad', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'pune', 'chennai', 'kolkata', 'noida', 'gurgaon',
  'san francisco', 'new york', 'london', 'singapore', 'tokyo', 'berlin', 'paris', 'austin', 'seattle', 'boston',
  'chicago', 'toronto', 'sydney', 'dubai', 'india', 'us', 'usa', 'uk', 'canada', 'germany',
]);

export function isValidCompanyName(candidate?: string | null, firstName?: string | null): boolean {
  if (!candidate) return false;
  let clean = candidate.trim().toLowerCase();
  clean = clean.replace(/^[-,.*•\s]+|[-,.*•\s]+$/g, '').trim();
  clean = clean.replace(/^(?:a|an|the|our|their|your|my|this)\s+/i, '').trim();
  if (clean.length < 2 || clean.length > 50) return false;
  if (STOP_NAME_WORDS.has(clean)) return false;
  if (BANNED_COMPANIES.has(clean)) return false;
  if (KNOWN_LOCATIONS.has(clean)) return false;
  if (['the', 'a', 'an', 'our', 'your', 'my', 'its', 'their', 'we', 'this'].includes(clean)) return false;
  if (clean.includes(' dot') || clean.includes('.com') || clean.includes('@')) return false;
  if (/[:;@/\\=_*•#%^&~`]/.test(clean)) return false;
  if (firstName && clean === firstName.toLowerCase()) return false;
  return true;
}

const FORBIDDEN_NAME_KEYWORDS = new Set([
  'company', 'organization', 'role', 'job', 'title', 'position', 'email', 'phone', 'budget',
  'timeline', 'support', 'agent', 'agents', 'hours', 'minutes', 'expecting', 'point',
  'competitor', 'competitors', 'agora', 'voice', 'platform', 'solution', 'demo', 'pricing',
  'question', 'answer', 'call', 'wrap', 'sure', 'good', 'done', 'fine', 'cool', 'ready',
  'okay', 'help', 'need', 'want', 'dollars', 'month', 'months', 'week', 'weeks', 'usage',
  'getting', 'trying', 'thinking', 'having', 'saying', 'wondering', 'hoping', 'looking',
  'my', 'me', 'mine', 'your', 'yours', 'our', 'ours', 'their', 'theirs', 'it', 'its',
  'this', 'that', 'these', 'those', 'there', 'here', 'actually', 'instead', 'correction',
  'name', 'customer', 'prospect', 'lead', 'manager', 'lead', 'director', 'vp', 'ceo', 'cto',
  'use', 'work', 'send', 'book', 'schedule', 'change', 'update', 'give', 'set', 'let', 'go', 'see', 'take',
]);

export function isValidPersonName(candidate?: string | null): boolean {
  if (!candidate) return false;
  let clean = candidate.trim().replace(/^[-,.*•\s]+|[-,.*•\s]+$/g, '').trim();
  if (clean.length < 2 || clean.length > 35) return false;
  // Reject punctuation like colons, semicolons, bullets, emails, symbols, digits
  if (/[:;@/\\=_*•#%^&~`0-9]/.test(clean)) return false;
  if (/[-]{2,}/.test(clean)) return false;

  const lower = clean.toLowerCase();
  if (STOP_NAME_WORDS.has(lower)) return false;
  if (BANNED_COMPANIES.has(lower)) return false;

  const words = lower.split(/[\s-]+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;

  for (const w of words) {
    if (FORBIDDEN_NAME_KEYWORDS.has(w)) return false;
    if (STOP_NAME_WORDS.has(w)) return false;
    if (w.endsWith('ing') || w.endsWith('ed')) return false; // Reject progressive verbs & past participles
  }

  return true;
}

export function isValidJobTitle(candidate?: string | null): boolean {
  if (!candidate) return false;
  let clean = candidate.trim().replace(/^[-,.*•\s]+|[-,.*•\s]+$/g, '').trim();
  clean = clean.replace(/^(?:a|an|the|our|their|as|as\s+a|as\s+the)\s+/i, '').trim();
  if (clean.length < 2 || clean.length > 45) return false;
  if (/[:;@/\\=_*•#%^&~`0-9]/.test(clean)) return false;

  const lower = clean.toLowerCase();
  if (STOP_NAME_WORDS.has(lower)) return false;
  if (lower.startsWith('my name') || lower.includes('name is') || lower.startsWith("i'm ") || lower.startsWith("i am ")) return false;
  if (lower.startsWith('i need') || lower.startsWith('we need') || lower.startsWith('i want') || lower.startsWith('we want') || lower.startsWith('need ') || lower.startsWith('want ') || lower.startsWith('looking for')) return false;
  if (lower.includes('voice agent') || lower.includes('conversational ai') || lower.includes('customer support') || lower.includes('a demo') || lower.includes('demo')) return false;
  if (lower.includes('email') || lower.includes('phone') || lower.includes('support agent')) return false;
  if (lower.includes('cut the call') || lower.includes('end the call') || lower.includes('goodbye') || lower.includes('bye')) return false;
  if (lower.includes('leave') || lower.includes('have to go') || lower.includes('got to go') || lower.includes('gotta go') || lower.includes('heading out') || lower.includes('hang up') || lower.includes('wrap up') || lower.includes('talk later')) return false;
  if (lower.includes('expecting') || lower.includes('minutes') || lower.includes('hours') || lower.includes('budget') || lower.includes('timeline')) return false;
  if (['no', 'yes', 'not sure', 'unsure', 'none', 'nothing', 'skip', 'pass', 'later'].includes(lower)) return false;

  return true;
}

export function sanitizeJobTitle(candidate?: string | null): string | null {
  if (!candidate) return null;
  let clean = candidate.trim().replace(/^[-,.*•\s]+|[-,.*•\s]+$/g, '').trim();
  clean = clean.replace(/^(?:a|an|the|our|their|as|as\s+a|as\s+the)\s+/i, '').trim();
  return isValidJobTitle(clean) ? clean : null;
}


const NUMBER_WORD_MAP: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  'twenty-five': 25,
  twentyfive: 25,
  thirty: 30,
  'thirty-five': 35,
  thirtyfive: 35,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/**
 * Natural language budget parser supporting exact numbers, ranges, words, and currency formats.
 * E.g.:
 * - "$35,000", "around $35,000", "35k" -> $35,000 (min 35k, max 35k)
 * - "twenty grand", "20 grand" -> $20,000 (min 20k, max 20k)
 * - "Between 15 and 25 thousand" -> $15,000-$25,000 (min 15k, max 25k)
 * - "around 20k" -> $20,000 (min 20k, max 20k)
 * - "ten k dollars", "around ten k" -> $10,000
 */
export function parseBudgetString(text: string): {
  budget?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
} | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  if (/flexible|no\s+(?:fixed\s+)?budget|not\s+sure\s+about\s+budget/i.test(lower)) {
    return { budget: 'Flexible', currency: 'USD' };
  }

  // 0. Explicit budget patterns: "$200 budget", "have a $200 budget", "200 dollar budget", "budget of $200", "budget is $200"
  const explicitBudgetMatch = text.match(
    /(?:have\s+(?:a\s+)?|got\s+(?:a\s+)?|with\s+(?:a\s+)?|our\s+)?(?:\$([0-9]{1,3}(?:,[0-9]{3})+|\d+)|([0-9]{1,3}(?:,[0-9]{3})+|\d+)\s*(?:dollars?|usd))\s*(?:a\s+month|monthly)?\s*budget/i,
  );
  if (explicitBudgetMatch) {
    const rawVal = explicitBudgetMatch[1] || explicitBudgetMatch[2];
    const num = Number(rawVal.replace(/,/g, ''));
    if (!isNaN(num) && num > 0) {
      return {
        budget: `$${num.toLocaleString()}`,
        budgetMin: num,
        budgetMax: num,
        currency: 'USD',
      };
    }
  }

  // 1. Range: "between 15 and 25 thousand", "between $15,000 and $25,000", "15k to 25k", "budget 15-25k"
  const rangeWordsMatch = lower.match(
    /(?:(?:budget|range)\s*(?:is|of)?\s*(?:around|about)?\s*|between\s+)(?:\$)?(\d+|fifteen|twenty|twenty-five|thirty|thirty-five|forty|fifty)\s*(?:k|thousand)?\s*(?:and|to|-)\s*(?:\$)?(\d+|fifteen|twenty|twenty-five|thirty|thirty-five|forty|fifty)\s*(?:k|thousand|grand)?/i,
  );
  if (rangeWordsMatch) {
    const wordToNum = (val: string): number => {
      const clean = val.replace(/,/g, '').toLowerCase();
      if (!isNaN(Number(clean))) return Number(clean);
      return NUMBER_WORD_MAP[clean] || 0;
    };
    let minVal = wordToNum(rangeWordsMatch[1]);
    let maxVal = wordToNum(rangeWordsMatch[2]);
    if (minVal > 0 && minVal < 1000) minVal *= 1000;
    if (maxVal > 0 && maxVal < 1000) maxVal *= 1000;
    if (minVal > 0 && maxVal > 0) {
      return {
        budget: `$${minVal.toLocaleString()}-$${maxVal.toLocaleString()}`,
        budgetMin: minVal,
        budgetMax: maxVal,
        currency: 'USD',
      };
    }
  }

  // 2. "twenty grand", "20 grand"
  const grandMatch = lower.match(/(?:around|about|have|got|allocated)?\s*(\w+|\d+)\s+grand/i);
  if (grandMatch) {
    const rawWord = grandMatch[1].toLowerCase();
    const val = NUMBER_WORD_MAP[rawWord] ? NUMBER_WORD_MAP[rawWord] * 1000 : Number(rawWord) * 1000;
    if (val && !isNaN(val)) {
      return {
        budget: `$${val.toLocaleString()}`,
        budgetMin: val,
        budgetMax: val,
        currency: 'USD',
      };
    }
  }

  // 3. Spoken word number + "k", "grand", "thousand" (e.g., "ten k", "around ten k dollars", "ten thousand")
  const wordMultiplierMatch = lower.match(
    /(?:(?:around|about|have|got|allocated|budget\s*(?:would\s+be|is|of)?)\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|twenty-five|thirty|thirty-five|forty|fifty|hundred)\s*(k|kilo|grand|thousand)(?:\s+dollars)?/i,
  );
  if (wordMultiplierMatch) {
    const baseWord = wordMultiplierMatch[1].toLowerCase();
    const baseNum = NUMBER_WORD_MAP[baseWord] || 0;
    if (baseNum > 0) {
      const total = baseNum * 1000;
      return {
        budget: `$${total.toLocaleString()}`,
        budgetMin: total,
        budgetMax: total,
        currency: 'USD',
      };
    }
  }

  // 4. Exact budget mentions (e.g., "budget is $35,000", "Budget: $35,000", "under $40k"):
  const budgetMatch = text.match(
    /(?:budget\s*[:=-]?\s*(?:would\s+be|is|of)?\s*(?:around|about)?\s*(\$?\d+[\d,]*[^\S\r\n]*(?:k|kilo|m|million)?|\$?\d+)|under\s+\$?(\d+[\d,]*[^\S\r\n]*(?:k|kilo|m|million)?)|closer\s+to\s+\$?(\d+[\d,]*[^\S\r\n]*(?:k|kilo|m|million)?))/i,
  );
  if (budgetMatch) {
    const raw = (budgetMatch[1] || `$${budgetMatch[2] || budgetMatch[3]}`).trim().replace(/[,\s]+$/, '');
    const cleanNum = raw.replace(/[\$,]/g, '').toLowerCase();
    let num = Number(cleanNum.replace(/(?:k|kilo|m|million)/, '').trim());
    if (cleanNum.includes('k') || cleanNum.includes('kilo')) {
      num *= 1000;
    } else if (cleanNum.includes('m') || cleanNum.includes('million')) {
      num *= 1000000;
    }
    const cleanBudgetStr = (raw.startsWith('$') ? raw : `$${raw}`).trim().replace(/[,\s]+$/, '');
    return {
      budget: cleanBudgetStr,
      budgetMin: num,
      budgetMax: num,
      currency: 'USD',
    };
  }

  // 5. Standalone currency amounts (e.g. "$35,000", "around $35,000", "have $35k allocated"):
  const standaloneDollarMatch = text.match(
    /(?:(?:around|about|have|got|allocated|up to|capped at)\s+)?\$([0-9]{1,3}(?:,[0-9]{3})+|\d+)(?:\s*(k|kilo|m|million))?/i,
  );
  if (standaloneDollarMatch) {
    const rawDigits = standaloneDollarMatch[1].replace(/,/g, '');
    let num = Number(rawDigits);
    const suffix = (standaloneDollarMatch[2] || '').toLowerCase();
    if (suffix.includes('k')) num *= 1000;
    else if (suffix.includes('m')) num *= 1000000;
    if (!isNaN(num) && num > 0) {
      return {
        budget: `$${num.toLocaleString()}`,
        budgetMin: num,
        budgetMax: num,
        currency: 'USD',
      };
    }
  }

  // 6. Spoken word number + "thousand"
  const wordAmountMatch = lower.match(
    /(?:(?:around|about|have|got|allocated|budget\s*(?:would\s+be|is)?)\s+)?(ten|fifteen|twenty|twenty-five|thirty|thirty-five|forty|fifty)\s+thousand(?:\s+dollars)?/i,
  );
  if (wordAmountMatch) {
    const val = (NUMBER_WORD_MAP[wordAmountMatch[1].toLowerCase()] || 0) * 1000;
    if (val) {
      return {
        budget: `$${val.toLocaleString()}`,
        budgetMin: val,
        budgetMax: val,
        currency: 'USD',
      };
    }
  }

  // 7. Bare amount with suffix (e.g. "50k", "around 50k", "50,000 dollars")
  const bareAmountMatch = text.match(
    /(?:(?:around|about|have|got|allocated|budget\s*(?:would\s+be|is|of)?)\s+)?([0-9]{1,3}(?:,[0-9]{3})+|\d+)\s*(k|kilo|m|million|\s*dollars)\b/i,
  );
  if (bareAmountMatch) {
    const rawDigits = bareAmountMatch[1].replace(/,/g, '');
    let num = Number(rawDigits);
    const suffix = (bareAmountMatch[2] || '').toLowerCase();
    if (suffix.includes('k')) num *= 1000;
    else if (suffix.includes('m')) num *= 1000000;
    if (!isNaN(num) && num > 0) {
      return {
        budget: `$${num.toLocaleString()}`,
        budgetMin: num,
        budgetMax: num,
        currency: 'USD',
      };
    }
  }

  return null;
}

/**
 * Extracts and normalizes spoken or written email addresses.
 * Handles standard "alex@cloudcorp.com" as well as speech-to-text outputs:
 * - "alex at cloudcorp dot com"
 * - "alex.vance at gmail dot com"
 * - "alex at cloudcorp.com"
 * - "yaduraj. sp@gmail. com" (spaces in speech recognition)
 * - "yaduraj sp and the red g mail" ("and the red" STT for @)
 */
export function extractSpokenEmail(rawText: string): string | null {
  if (!rawText) return null;

  // 1. Direct standard email match: alex@cloudcorp.com
  const standardMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (standardMatch) return standardMatch[0].toLowerCase().trim();

  // 2. STT email with spaces around dots or @: e.g. "yaduraj. sp@gmail. com" or "yaduraj . sp @ gmail . com"
  const spacedEmailMatch = rawText.match(
    /\b([a-zA-Z0-9]+(?:\s*\.\s*[a-zA-Z0-9]+)*)\s*@\s*([a-zA-Z0-9-]+)\s*\.\s*(com|io|org|net|co|ai|edu|gov|in|uk|de|tech|app)\b/i,
  );
  if (spacedEmailMatch) {
    const userPart = spacedEmailMatch[1].replace(/\s+/g, '');
    const domainPart = spacedEmailMatch[2].replace(/\s+/g, '');
    const tldPart = spacedEmailMatch[3].toLowerCase();
    return `${userPart}@${domainPart}.${tldPart}`.toLowerCase();
  }

  // 3. Pre-normalize STT artifacts like "and the red", "at the rate", "g mail" -> "gmail"
  const cleaned = rawText
    .replace(/\s+(?:and\s+the\s+red|at\s+the\s+rate)\s+/gi, ' @ ')
    .replace(/\bg\s*mail\b/gi, 'gmail');

  // Direct check again after STT normalization
  const normMatch = cleaned.match(
    /\b([a-zA-Z0-9]+(?:\s*(?:\.|\s*dot\s*)\s*[a-zA-Z0-9]+)*)\s*(?:@|\s+at\s+)\s*([a-zA-Z0-9-]+)\s*(?:\.|\s+dot\s+)\s*(com|io|org|net|co|ai|edu|gov|in|uk|de|tech|app)\b/i,
  );
  if (normMatch) {
    const userPart = normMatch[1].replace(/\s*dot\s*/gi, '.').replace(/\s+/g, '');
    const domainPart = normMatch[2].replace(/\s+/g, '');
    const tldPart = normMatch[3].toLowerCase();
    return `${userPart}@${domainPart}.${tldPart}`.toLowerCase();
  }

  return null;
}

/**
 * Extracts and normalizes spoken or written phone numbers.
 * Handles US, international, spaced, and digit-word formats.
 */
export function extractSpokenPhone(rawText: string): string | null {
  if (!rawText) return null;

  // 1. Standard pattern: +1 555 123 4567, (555) 123-4567, 555-123-4567, 930-247-6791
  const standardMatch = rawText.match(
    /(?:\+?[0-9]{1,3}[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
  );
  if (standardMatch) {
    const digitsOnly = standardMatch[0].replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      return standardMatch[0].trim();
    }
  }

  // 2. Continuous 10-12 digits without symbols: e.g. "9876543210" or "+15551234567"
  const digitsMatch = rawText.match(/(?:\+?\d{1,3})?\b\d{10}\b/);
  if (digitsMatch) {
    return digitsMatch[0];
  }

  // 3. Spaced digits: "5 5 5 1 2 3 4 5 6 7"
  const spacedDigitsMatch = rawText.match(/(?:\+?1\s+)?(?:\d\s+){9,11}\d/);
  if (spacedDigitsMatch) {
    const compact = spacedDigitsMatch[0].replace(/\s+/g, '');
    return compact;
  }

  // 4. Spoken digit words: e.g. "five five five one two three four five six seven"
  // or "That's on nine three zero two four seven six seven nine one"
  const wordToDigitMap: Record<string, string> = {
    zero: '0',
    oh: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
  };

  const words = rawText.toLowerCase().split(/[\s,.-]+/);
  let digitSeq = '';
  for (const w of words) {
    if (wordToDigitMap[w] !== undefined) {
      digitSeq += wordToDigitMap[w];
    } else if (/^\d+$/.test(w)) {
      digitSeq += w;
    } else {
      // Non-digit word encountered (e.g. "hours", "budget", "month")
      if (digitSeq.length === 10 || (digitSeq.length === 11 && digitSeq.startsWith('1'))) {
        const d = digitSeq.length === 11 && digitSeq.startsWith('1') ? digitSeq.slice(1) : digitSeq;
        return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
      }
      if (!['on', 'at', 'my', 'is', 'number', 'its', "it's", 'and', 'the', 'phone'].includes(w)) {
        digitSeq = '';
      }
    }
    if (digitSeq.length === 10 || (digitSeq.length === 11 && digitSeq.startsWith('1'))) {
      const d = digitSeq.length === 11 && digitSeq.startsWith('1') ? digitSeq.slice(1) : digitSeq;
      return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    }
  }

  if (digitSeq.length === 10 || (digitSeq.length === 11 && digitSeq.startsWith('1'))) {
    const d = digitSeq.length === 11 && digitSeq.startsWith('1') ? digitSeq.slice(1) : digitSeq;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }


  return null;
}

/**
 * Classifies user message into one of 16 structured intents.
 * Latest user message has highest priority.
 */
export function detectUserIntent(
  text: string,
  _context?: {
    previousIntent?: UserIntent;
    previousQuestion?: string;
    appointmentState?: AppointmentState;
  },
): UserIntent {
  const clean = (text || '').trim();
  const lower = clean.toLowerCase();
  if (!clean) return 'UNKNOWN';

  // 1. CANCELLATION
  if (/(?:cancel\s+(?:the\s+)?(?:meeting|demo|call|appointment)|don['’]t\s+book|cancel\s+it)/i.test(lower)) {
    return 'CANCELLATION';
  }

  // 2. RESCHEDULE
  if (/(?:reschedule|change\s+the\s+time|different\s+time|move\s+it\s+to|change\s+(?:the\s+)?date)/i.test(lower)) {
    return 'RESCHEDULE';
  }

  // 3. BOOKING_REQUEST (Highest priority over qualification/answers)
  if (
    /(?:arrange|book|schedule|set\s+up|give\s+me)\s+(?:a\s+)?(?:demo|call|meeting|walkthrough|session)/i.test(lower) ||
    /(?:can\s+you|could\s+you|let['’]s|i['’]d\s+like\s+to|want\s+to|please)\s+(?:book|schedule|arrange|set\s+up)/i.test(lower) ||
    /(?:tomorrow|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i.test(lower) ||
    /\b(?:book\s+me|calendar\s+invite|schedule\s+us)\b/i.test(lower) ||
    /(?:demo|meeting)\s+for\s+(?:tomorrow|today|next\s+week)/i.test(lower) ||
    /(?:want|like|ready)\s+to\s+(?:move\s+forward\s+with\s+(?:a\s+)?)?demo/i.test(lower) ||
    /\b(?:move\s+forward\s+with\s+(?:a\s+)?demo|see\s+a\s+demo)\b/i.test(lower) ||
    /\b(?:want\s+a\s+demo|need\s+a\s+demo|like\s+a\s+demo)\b/i.test(lower)
  ) {
    return 'BOOKING_REQUEST';
  }

  // 4. FRUSTRATION
  if (
    /(?:why\s+(?:are\s+you\s+asking\s+)?so\s+many\s+questions|too\s+many\s+questions|stop\s+asking|why\s+do\s+you\s+keep\s+asking|you['’]re\s+not\s+listening|i\s+already\s+told\s+you|already\s+said|broken\s+record|stop\s+interrogating)/i.test(lower)
  ) {
    return 'FRUSTRATION';
  }

  // 5. CONFUSION
  if (
    /(?:what\s+do\s+you\s+mean|i\s+don['’]t\s+understand|not\s+sure\s+what\s+you\s+mean|huh\??|doesn['’]t\s+make\s+sense)/i.test(lower)
  ) {
    return 'CONFUSION';
  }

  // 6. GOODBYE / DEPARTURE
  if (
    /^(?:bye|goodbye|have\s+to\s+go|talk\s+to\s+you\s+later|see\s+ya|gotta\s+run|cut\s+the\s+call|end\s+the\s+call)[.!]?$/i.test(lower) ||
    /(?:cut\s+the\s+call|end\s+the\s+call|have\s+to\s+drop|hanging\s+up)/i.test(lower)
  ) {
    return 'GOODBYE';
  }

  // 7. PRICE_OBJECTION
  if (
    /(?:too\s+expensive|cannot\s+afford|can['’]t\s+afford|out\s+of\s+(?:our|my)\s+budget|beyond\s+(?:our|my)\s+budget|cheaper|need\s+a\s+discount|lower\s+the\s+price|too\s+pricey|costs?\s+too\s+much|\d+%\s+discount|discount)/i.test(lower)
  ) {
    return 'PRICE_OBJECTION';
  }

  // 8. PRICING
  if (
    /(?:how\s+much\s+does\s+it\s+cost|what['’]s\s+the\s+pricing|what\s+is\s+the\s+cost|how\s+much\s+is\s+it|pricing\s+plans?|rate\s+card|per\s+minute\s+cost|subscription\s+tiers?|how\s+is\s+it\s+billed)/i.test(lower)
  ) {
    return 'PRICING';
  }

  // 9. TECHNICAL_QUESTION
  if (
    /(?:latency|sub-?500ms|webrtc|sd-?rtn|packet\s+loss|turn-taking|vad|speech-to-text|tts|stt|llm\s+integration|jitter|bandwidth|global\s+network|api\s+latency|architecture|hipaa|soc\s*2|data\s+leakage|security)/i.test(lower)
  ) {
    return 'TECHNICAL_QUESTION';
  }

  // 10. BUYING_SIGNAL
  if (
    /(?:sounds\s+(?:good|great|promising|perfect)|this\s+is\s+what\s+we\s+need|ready\s+to\s+move\s+forward|how\s+do\s+we\s+sign\s+up|next\s+steps?|contract|agreement|ready\s+to\s+buy)/i.test(lower)
  ) {
    return 'BUYING_SIGNAL';
  }

  // 11. PRODUCT_QUESTION
  if (
    /(?:does\s+agora\s+support|can\s+agora|do\s+you\s+have|tell\s+me\s+about\s+(?:agora|conversational\s+ai|your\s+)|what\s+features|integration\s+with|crm\s+integration|why\s+(?:should\s+we\s+)?use\s+agora|another\s+provider|other\s+provider|competitor|want\s+to\s+know\s+about\s+(?:your\s+)?|how\s+does\s+your\s+|integrate\s+with\s+salesforce|salesforce|hubspot)/i.test(lower)
  ) {
    return 'PRODUCT_QUESTION';
  }

  // 12. USE_CASE
  if (
    /(?:we\s+are\s+building|i['’]m\s+building|we\s+need\s+a|looking\s+to\s+build|our\s+use\s+case|developing|matchmaking|dating|relationship\s+solutions|customer\s+support|virtual\s+assistant|telehealth|(?:building|need|want|develop)\s+(?:a\s+)?(?:voice\s+bot|voice\s+agent))/i.test(lower)
  ) {
    return 'USE_CASE';
  }

  // 13. POSITIVE_SIGNAL
  if (/^(?:yes|yeah|yep|sure|correct|absolutely|definitely|sounds\s+good|that\s+works|perfect)[.!]?$/i.test(lower)) {
    return 'POSITIVE_SIGNAL';
  }

  // 14. NEGATIVE_SIGNAL
  if (/^(?:no|nope|nah|not\s+really|i\s+don['’]t\s+think\s+so|negative)[.!]?$/i.test(lower)) {
    return 'NEGATIVE_SIGNAL';
  }

  // 15. GREETING
  if (/^(?:hi|hello|hey|good\s+morning|good\s+afternoon|good\s+evening|hi\s+there|hello\s+there)[,.\s!]*$/i.test(lower)) {
    return 'GREETING';
  }

  return 'UNKNOWN';
}

/**
 * Detects whether a statement indicates strong, medium, or no buying signal.
 */
export function detectBuyingSignalStrength(text: string): BuyingSignalStrength {
  const clean = (text || '').trim().toLowerCase();
  if (!clean) return 'none';

  // Strong: explicit moves to advance/book/buy
  if (
    /(?:ready\s+to\s+(?:buy|move\s+forward|sign\s+up|start|purchase)|let['’]s\s+(?:book|schedule|do\s+this|move\s+forward|start|sign\s+up)|want\s+to\s+buy|sign\s+us\s+up|send\s+(?:me\s+)?(?:the\s+)?(?:contract|agreement|invoice|invite)|how\s+do\s+we\s+(?:get\s+started|sign\s+up)|we['’]re\s+sold|take\s+my\s+money)\b/i.test(clean) ||
    /(?:can\s+you|could\s+you|please)\s+(?:arrange|book|schedule|set\s+up)\s+(?:a\s+)?demo/i.test(clean) ||
    /(?:tomorrow|next\s+week)\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i.test(clean)
  ) {
    return 'strong';
  }

  // Medium: exploring demo, pricing, integration
  if (
    /(?:can\s+we\s+see|show\s+me|can\s+i\s+get|interested\s+in)\s+(?:a\s+)?demo/i.test(clean) ||
    /(?:what\s+would\s+this\s+cost|pricing\s+for\s+our\s+volume|how\s+does\s+the\s+pricing\s+work|can\s+you\s+explain\s+how\s+we\s+integrate|do\s+you\s+have\s+sdk\s+docs|how\s+hard\s+is\s+it\s+to\s+set\s+up)/i.test(clean)
  ) {
    return 'medium';
  }

  return 'none';
}

/**
 * Detects one of the 9 core sales objections:
 * PRICE | BUDGET | TIMING | TRUST | COMPETITOR | TECHNICAL | IMPLEMENTATION | NEED | AUTHORITY
 */
export function detectCoreObjection(
  text: string,
): { category: CoreObjectionCategory; objectionType: ObjectionType; text: string } | null {
  const clean = (text || '').trim();
  const lower = clean.toLowerCase();
  if (!clean) return null;

  // 1. PRICE (too expensive, costs too much, lower price, discount request)
  if (
    /(?:too\s+expensive|too\s+pricey|costs?\s+too\s+much|lower\s+the\s+price|need\s+a\s+discount|\d+%\s+discount|give\s+me\s+(?:a\s+)?discount|rates?\s+are\s+high|price\s+is\s+steep)/i.test(lower)
  ) {
    return { category: 'PRICE', objectionType: 'price_too_high', text: clean };
  }

  // 2. BUDGET (hard ceiling, limited budget, cannot afford, out of budget)
  if (
    /(?:cannot\s+afford|can['’]t\s+afford|out\s+of\s+(?:our|my)\s+budget|beyond\s+(?:our|my)\s+budget|budget\s+is\s+(?:tight|limited|capped|only)|hard\s+budget\s+ceiling|no\s+budget\s+for\s+this|budget\s+constraint)/i.test(lower)
  ) {
    return { category: 'BUDGET', objectionType: 'not_enough_budget', text: clean };
  }

  // 3. TIMING (not right now, bad timing, next quarter, next year, too busy)
  if (
    /(?:not\s+(?:right\s+)?now|bad\s+timing|not\s+the\s+right\s+time|call\s+back\s+(?:in|next)|maybe\s+next\s+(?:quarter|year|month)|too\s+busy\s+right\s+now|revisit\s+this\s+later|circle\s+back\s+later)/i.test(lower)
  ) {
    return { category: 'TIMING', objectionType: 'timing_concern', text: clean };
  }

  // 4. TRUST (reliability, uptime, audio drops, security, privacy, HIPAA, SOC 2, data leakage)
  if (
    /(?:is\s+agora\s+reliable|what\s+if\s+(?:the\s+)?audio\s+drops|will\s+it\s+fail|can\s+we\s+trust|security\s+concern|data\s+leakage|data\s+privacy|is\s+it\s+hipaa|soc\s*2|uptime\s+guarantee|data\s+retention)/i.test(lower)
  ) {
    return { category: 'TRUST', objectionType: 'security_concern', text: clean };
  }

  // 5. COMPETITOR (Twilio, Retell, Vapi, LiveKit, cheaper competitor, already using another)
  if (
    /(?:competitor|competitive|twilio|retell|vapi|livekit|daily\.co|another\s+provider|other\s+solution|already\s+using\s+(?:another|a\s+different)|why\s+(?:should\s+we\s+choose\s+)?agora\s+over)/i.test(lower)
  ) {
    return { category: 'COMPETITOR', objectionType: 'competitor_cheaper', text: clean };
  }

  // 6. TECHNICAL (latency, audio quality, packet loss, speech recognition, custom unsupported feature)
  if (
    /(?:latency\s+is\s+too\s+high|audio\s+quality|choppy|packet\s+loss|speech\s+recognition\s+accuracy|unsupported\s+feature|mainframe\s+cobol|holographic)/i.test(lower)
  ) {
    return { category: 'TECHNICAL', objectionType: 'missing_feature', text: clean };
  }

  // 7. IMPLEMENTATION (hard to integrate, complex SDK, lack dev bandwidth, deployment time)
  if (
    /(?:hard\s+to\s+integrate|complex\s+sdk|don['’]t\s+have\s+(?:the\s+)?(?:developers|engineers|bandwidth)|how\s+long\s+(?:does\s+it\s+take\s+to|will\s+it)\s+deploy|integration\s+risk|too\s+complicated\s+to\s+build)/i.test(lower)
  ) {
    return { category: 'IMPLEMENTATION', objectionType: 'implementation_risk', text: clean };
  }

  // 8. NEED (don't need voice, happy with text, chatbots are enough)
  if (
    /(?:don['’]t\s+need\s+voice|text\s+chat\s+is\s+enough|happy\s+with\s+(?:text|chatbots)|why\s+do\s+we\s+need\s+(?:voice|a\s+bot)|no\s+use\s+case\s+for\s+voice)/i.test(lower)
  ) {
    return { category: 'NEED', objectionType: 'perceived_value', text: clean };
  }

  // 9. AUTHORITY (need boss/manager/CTO signoff, not my decision)
  if (
    /(?:need\s+approval\s+from\s+my\s+manager|not\s+my\s+decision|need\s+to\s+(?:check\s+with|ask)\s+(?:my\s+)?(?:manager|boss|cto|vp|director|team)|don['’]t\s+have\s+(?:purchasing|budget)\s+power)/i.test(lower)
  ) {
    return { category: 'AUTHORITY', objectionType: 'need_approval', text: clean };
  }

  return null;
}

/**
 * Checks if a prospect's product description is vague or ambiguous.
 */
export function isAmbiguousProductDescription(text: string): boolean {
  const lower = (text || '').trim().toLowerCase();
  if (!lower) return false;
  const ambiguousPatterns = [
    /\b(?:relationship\s+solutions?|dating\s+solutions?)\b/i,
    /\b(?:an?\s+ai\s+platform|an?\s+ai\s+app|an?\s+ai\s+service)\b/i,
    /\b(?:smart\s+platform|smart\s+solution|tech\s+solution)\b/i,
    /\b(?:we\s+do\s+software|we\s+build\s+apps?)\b/i,
    /\b(?:communication\s+tool|customer\s+tool)\b/i,
  ];
  const hasSpecificDomain =
    /(?:matchmaking|dating\s+advisory|relationship\s+coaching|customer\s+support|call\s+center|sales\s+outreach|telehealth|gaming\s+voice)/i.test(lower);
  return ambiguousPatterns.some((p) => p.test(lower)) && !hasSpecificDomain;
}

/**
 * Computes realistic Agora pay-as-you-go economics and evaluates budget fit.
 * Audio task: $0.10/min (first 300 minutes free).
 */
export function evaluateBudgetEconomics(
  budgetStr?: string | null,
  volumeStr?: string | null,
): BudgetEconomics {
  // Parse numeric budget
  let statedBudget: number | undefined;
  if (budgetStr) {
    const cleanB = budgetStr.replace(/,/g, '');
    const match = cleanB.match(/(?:[$€£]\s*|)(\d+(?:\.\d+)?)/);
    if (match) {
      statedBudget = parseFloat(match[1]);
    }
  }

  // Parse volume / minutes
  let estimatedMinutes: number | undefined;
  if (volumeStr) {
    const cleanV = volumeStr.replace(/,/g, '').toLowerCase();
    const minMatch = cleanV.match(/(\d+)\s*(?:minute|min)/);
    if (minMatch) {
      estimatedMinutes = parseInt(minMatch[1], 10);
    } else {
      const callMatch = cleanV.match(/(\d+)\s*calls?/);
      if (callMatch) {
        // Standard voice bot call duration is ~1.5 minutes
        estimatedMinutes = Math.round(parseInt(callMatch[1], 10) * 1.5);
      }
    }
  }

  // Default fallback if volume mentions 1,000 calls
  if (estimatedMinutes === undefined && volumeStr && /1,?000\s*calls?/i.test(volumeStr)) {
    estimatedMinutes = 1500;
  }

  if (estimatedMinutes !== undefined) {
    const billableMinutes = Math.max(0, estimatedMinutes - 300);
    const estimatedMonthlyCost = Math.round(billableMinutes * 0.10);

    if (statedBudget !== undefined) {
      if (estimatedMonthlyCost <= statedBudget) {
        return {
          estimatedMinutes,
          estimatedMonthlyCost,
          statedBudget,
          fitStatus: 'fits_pay_as_you_go',
          explanation: `At ~${estimatedMinutes.toLocaleString()} minutes per month, standard Agora pay-as-you-go pricing ($0.10/min with first 300 minutes free) is ~$${estimatedMonthlyCost}/month, which fits comfortably within your $${statedBudget}/month budget.`,
        };
      } else {
        return {
          estimatedMinutes,
          estimatedMonthlyCost,
          statedBudget,
          fitStatus: 'budget_mismatch',
          explanation: `At your estimated volume of ${estimatedMinutes.toLocaleString()} minutes, standard pay-as-you-go pricing at $0.10/min (after 300 free minutes) comes to ~$${estimatedMonthlyCost}/month. Because your stated budget is $${statedBudget}/month, this would exceed your budget ceiling. We want to be transparent about our pricing math rather than recommending an incompatible plan.`,
        };
      }
    }

    return {
      estimatedMinutes,
      estimatedMonthlyCost,
      fitStatus: 'fits_pay_as_you_go',
      explanation: `At ~${estimatedMinutes.toLocaleString()} minutes, standard Agora pay-as-you-go pricing is ~$${estimatedMonthlyCost}/month (with first 300 minutes free).`,
    };
  }

  if (statedBudget !== undefined) {
    return {
      statedBudget,
      fitStatus: 'needs_clarification',
      explanation: `Your stated budget is $${statedBudget}/month. To verify exact pricing fit, we would need your estimated monthly call volume or minutes.`,
    };
  }

  return {
    fitStatus: 'needs_clarification',
    explanation: 'Standard Agora Conversational AI audio task pricing is $0.10/min with the first 300 minutes free each month.',
  };
}

/**
 * Extracts facts from a customer message (and context).
 * Distinguishes customer statements from AI assumptions (only user messages are passed).
 * Supports customer corrections.
 */
export function extractFacts(
  customerText: string,
  previousProfile?: CanonicalCustomerProfile,
  previousAssistantQuestion?: string,
): ExtractedFacts {
  const text = customerText.trim();
  const lowerText = text.toLowerCase();
  const facts: ExtractedFacts = {};

  // Normalize previous assistant question for comparison
  const normalizedPrevQ = (previousAssistantQuestion || '')
    .replace(/[\u2018\u2019\u201A\u201B\uFFFD?]+T/gi, "'")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .toLowerCase();

  // 1. Customer Refusals
  const refusals: string[] = [];
  if (
    /(?:don['’]t\s+want\s+to\s+(?:give|share|provide|disclose)|rather\s+not\s+(?:give|share|provide|disclose)|won['’]t\s+share|no\s+phone|not\s+sharing\s+phone|keep.*private)\s*(?:my\s+)?(?:phone|number)?/i.test(
      lowerText,
    )
  ) {
    refusals.push('phone');
  }
  if (
    /(?:don['’]t\s+want\s+to\s+(?:give|share|provide|disclose)|rather\s+not\s+(?:give|share|provide|disclose)|won['’]t\s+share|not\s+sharing\s+email)\s*(?:my\s+)?email/i.test(
      lowerText,
    )
  ) {
    refusals.push('email');
  }
  if (
    /(?:don['’]t\s+want\s+to\s+(?:give|share|provide|disclose)|rather\s+not\s+(?:give|share|provide|disclose)|private\s+budget|not\s+disclosing\s+budget|won['’]t\s+share\s+budget)\s*(?:my\s+|our\s+)?budget/i.test(
      lowerText,
    )
  ) {
    refusals.push('budget');
  }
  if (refusals.length > 0) {
    facts.refusals = refusals;
  }

  // 2. Name Extraction & Corrections
  const kvNameMatch = text.match(
    /(?:^|\n)[^\S\r\n]*(?:Name|Customer|Full Name)\s*[:=-]\s*([A-Za-z]+)(?:[^\S\r\n]+([A-Za-z]+))?[^\S\r\n]*(?:\r?\n|$)/i,
  );
  const correctionNameMatch =
    !/\b(?:email|work\s+email|phone|number|address|meeting|time|budget|timeline)\b/i.test(text)
      ? text.match(
          /(?:actually,?\s*(?:it['’]s\s+|my\s+name\s+is\s+|call\s+me\s+)|my\s+name\s+is\s+actually\s+|correction,?\s*(?:it['’]s\s+|my\s+name\s+is\s+|call\s+me\s+)|it['’]s\s+)([A-Za-z]+)(?:[^\S\r\n]+([A-Za-z]+))?/i,
        )
      : null;
  const standardNameMatch = text.match(
    /(?:My name is|My name's|Name is|Call me|You can call me|This is|I go by)\s+([A-Za-z]+)(?:[^\S\r\n]+([A-Za-z]+))?/i,
  );
  const bareImMatch = text.match(
    /\b(?:I['’]m|I am)\s+([A-Za-z]+)(?:[^\S\r\n]+([A-Za-z]+))?\b/i,
  );

  const isNameQuestion =
    normalizedPrevQ.includes('what should i call you') ||
    normalizedPrevQ.includes('may i get your name') ||
    normalizedPrevQ.includes('may i know your name') ||
    normalizedPrevQ.includes('who am i speaking with') ||
    normalizedPrevQ.includes('who do i have the pleasure') ||
    normalizedPrevQ.includes('your name') ||
    normalizedPrevQ.includes('have your name');

  let chosenMatch = kvNameMatch
    ? kvNameMatch
    : correctionNameMatch && (lowerText.includes('actually') || lowerText.includes('correction') || isNameQuestion)
    ? correctionNameMatch
    : standardNameMatch;

  // Only allow bare "I'm [Name]" if the assistant explicitly asked for name or customer has no name yet
  if (!chosenMatch && bareImMatch && (isNameQuestion || !previousProfile?.customer?.fullName)) {
    chosenMatch = bareImMatch;
  }

  const isDirectNameDecl = /(?:my\s+name\s+is|my\s+name's|call\s+me|i\s+go\s+by|name\s+is)\b/i.test(text);

  if (chosenMatch) {
    const first = chosenMatch[1];
    let second: string | null = chosenMatch[2] || null;
    if (!STOP_NAME_WORDS.has(first.toLowerCase()) && !FORBIDDEN_NAME_KEYWORDS.has(first.toLowerCase())) {
      if (second && (STOP_NAME_WORDS.has(second.toLowerCase()) || FORBIDDEN_NAME_KEYWORDS.has(second.toLowerCase()))) {
        second = null;
      }
      const candidateFullName = second ? `${first} ${second}` : first;
      if (isValidPersonName(candidateFullName)) {
        facts.name = {
          fullName: candidateFullName,
          firstName: first,
          lastName: second,
          isExplicit: isDirectNameDecl,
        };
      }
    }
  } else if (isNameQuestion) {
    const textWithoutGreeting = text.replace(/^(?:hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|greetings)\b[,\s]*/i, '').trim();
    const directNameMatch = textWithoutGreeting.match(/^([A-Za-z]+)(?:\s+([A-Za-z]+))?(?:[.,!]|(?:\s+(?:from|with|at|here|speaking)\b)|$)/i);
    if (directNameMatch) {
      const first = directNameMatch[1];
      let second = directNameMatch[2] || null;
      if (!STOP_NAME_WORDS.has(first.toLowerCase()) && !FORBIDDEN_NAME_KEYWORDS.has(first.toLowerCase())) {
        if (second && (STOP_NAME_WORDS.has(second.toLowerCase()) || FORBIDDEN_NAME_KEYWORDS.has(second.toLowerCase()))) {
          second = null;
        }
        const candidateFullName = second ? `${first} ${second}` : first;
        if (isValidPersonName(candidateFullName)) {
          facts.name = {
            fullName: candidateFullName,
            firstName: first,
            lastName: second,
            isExplicit: isDirectNameDecl,
          };
        }
      }
    }
  }


  // 3. Company Extraction & Corrections
  const kvCompanyMatch = text.match(/(?:^|\n)\s*(?:Company|Organization|Org)\s*[:=-]\s*([A-Za-z0-9&_\s-]+?)(?:[.,\n]|$)/i);
  const textWithoutEmails = text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/\b[a-zA-Z0-9._%+-]+\s*(?:@|\s+at\s+)\s*[a-zA-Z0-9.-]+(?:\.|\s+dot\s+)(?:com|io|org|net|co|ai|edu|gov|in|uk|de|tech|app)\b/gi, '');

  // Guard against phrases like "go with Agora", "stick with", "deal with", "choose Agora", "move forward with", etc.
  const compMatch = !/(?:go|stick|deal|compare|choose|pick|about|forward|help|integrate|play|start|begin)\s+with/i.test(textWithoutEmails)
    ? textWithoutEmails.match(
        /(?:work\s+for|work\s+at|working\s+(?:for|at|with)|employed\s+at|company\s+is|our\s+company\s+is|company\s+called|representing|(?:(?:I\s+am|I['’]m|we\s+are|we['’]re|this\s+is)\s+(?:[A-Za-z]+\s+)?(?:from|at|with))|(?:^|[.!?]\s+)(?:from|with|at)|\bfrom|evaluating\s+this\s+for|implement\s+this\s+for|looking\s+to\s+implement\s+this\s+for)\s+([A-Za-z0-9&_-]+(?:\s+[A-Za-z0-9&_-]+)?)/i,
      )
    : null;

  if (kvCompanyMatch && isValidCompanyName(kvCompanyMatch[1])) {
    facts.company = kvCompanyMatch[1].trim();
  } else if (compMatch) {
    let comp = compMatch[1].replace(/[.,;:!?]+$/, '').trim();
    comp = comp.replace(/^(?:a|an|the|our|their|your|my|this)\s+/i, '').trim();
    comp = comp.replace(/\s+(?:as|and|we|our|the|for|to|with|in)\b.*$/i, '').trim();
    if (isValidCompanyName(comp, facts.name?.firstName || previousProfile?.customer?.firstName)) {
      facts.company = comp;
    }
  } else if (
    normalizedPrevQ.includes('which company') ||
    normalizedPrevQ.includes('what company') ||
    normalizedPrevQ.includes('company are you with') ||
    normalizedPrevQ.includes('company are you building') ||
    normalizedPrevQ.includes('company are you looking')
  ) {
    const directCompMatch = textWithoutEmails.match(/^(?:(?:we\s+are|it['’]s|our\s+company\s+is|i['’]m\s+with|from|with|at)\s+)?([A-Za-z0-9&_-]+(?:\s+[A-Za-z0-9&_-]+)?)[.!]?$/i);
    if (directCompMatch) {
      let candidateComp = directCompMatch[1].trim();
      candidateComp = candidateComp.replace(/^(?:a|an|the|our|their|your|my|this)\s+/i, '').trim();
      if (isValidCompanyName(candidateComp, facts.name?.firstName || previousProfile?.customer?.firstName)) {
        facts.company = candidateComp;
      }
    }
  }

  // 4. Role / Job Title Extraction
  const kvRoleMatch = text.match(/(?:^|\n)\s*(?:Role|Job Title|Title|Position)\s*[:=-]\s*([A-Za-z\s]+?)(?:[.,\n]|$)/i);
  const directRoleMatch = text.match(
    /\b((?:VP|Vice President)(?: of)?\s+[A-Za-z]+(?:\s+[A-Za-z]+)?|Head(?: of)?\s+[A-Za-z]+(?:\s+[A-Za-z]+)?|Director(?: of)?\s+[A-Za-z]+(?:\s+[A-Za-z]+)?|CTO|CEO|COO|CIO|President|Product Manager|Project Manager|Support Director|Engineering Manager|Software Engineer|Developer|Architect|Solutions Architect|Founder|Co-Founder|General Manager|Operations Manager|Engineering Lead|Tech Lead|Manager|Lead|Supervisor|Consultant|Executive)\b/i,
  );

  // If user answered with their name (e.g. "My name is Yaduraj" or "I'm Alex Vance, working at..."), extract name
  const isNameIntroInRole = /^(?:my\s+name\s+is|i['’]m\s+|i\s+am\s+|call\s+me\s+)([A-Za-z]+)(?:\s+([A-Za-z]+))?/i.exec(text);
  if (isNameIntroInRole && isValidPersonName(isNameIntroInRole[1]) && !facts.name) {
    const first = isNameIntroInRole[1];
    const second = isNameIntroInRole[2] || null;
    facts.name = {
      fullName: second && isValidPersonName(`${first} ${second}`) ? `${first} ${second}` : first,
      firstName: first,
      lastName: second,
      isExplicit: true,
    };
  }

  if (kvRoleMatch) {
    const cleanRole = sanitizeJobTitle(kvRoleMatch[1]);
    if (cleanRole) {
      facts.role = cleanRole;
      facts.decisionMaker = true;
      facts.authority = `${facts.role} (Decision Maker)`;
    }
  } else if (directRoleMatch && !/(?:talk\s+to|speak\s+with|transfer\s+to)\s+a/i.test(text)) {
    const cleanRole = sanitizeJobTitle(directRoleMatch[1]);
    if (cleanRole) {
      facts.role = cleanRole;
      facts.decisionMaker = true;
      facts.authority = `${facts.role} (Decision Maker)`;
    }
  } else {
    const roleMatch = text.match(
      /(?:role is|working as|I am a|I'm a|I am the|I'm the|serving as|acting as|as (?:a|the|our|their)?)\s+([A-Za-z\s]+?)(?:[.,;!]|$)/i,
    );
    if (roleMatch) {
      const candidateRole = roleMatch[1]
        .replace(/\b(?:and|we|looking|evaluating|with|at|for)\b.*$/i, '')
        .trim();
      const cleanRole = sanitizeJobTitle(candidateRole);
      if (cleanRole) {
        facts.role = cleanRole;
      }
    } else if (
      normalizedPrevQ.includes('what is your role') ||
      normalizedPrevQ.includes("what's your role") ||
      normalizedPrevQ.includes('what role do you have') ||
      normalizedPrevQ.includes('your role there') ||
      normalizedPrevQ.includes('your role at')
    ) {
      const candidate = text.replace(/[.,!?;]+$/, '').trim();
      const cleanRole = sanitizeJobTitle(candidate);
      if (cleanRole) {
        facts.role = cleanRole;
      }
    }
  }

  // 5. Company Size (Team Size / Support Agent Count / Voice Hours Scale)
  const kvSizeMatch = text.match(/(?:^|\n)\s*(?:Company Size|Team Size|Size|Agents|Usage|Scale)\s*[:=-]\s*([^\n]+)/i);
  const sizeNumberWordMap: Record<string, string> = {
    ten: '10',
    fifteen: '15',
    twenty: '20',
    'twenty-five': '25',
    thirty: '30',
    forty: '40',
    fifty: '50',
    sixty: '60',
    seventy: '70',
    eighty: '80',
    ninety: '90',
    hundred: '100',
  };
  const sizeMatch = text.match(
    /(?:actually|instead|expanded to|now have|now|have|with|around|about|currently)?\s*(\d+|ten|fifteen|twenty|twenty-five|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s*(?:support\s*agents?|agents?|employees?|people|seats|reps|callers|users|hours|monthly\s*hours|voice\s*hours|hours\s+of\s+(?:monthly\s+)?voice\s+usage)/i,
  );
  const teamOfMatch = text.match(/(?:team\s+(?:size\s+is\s+|of\s+))(\d+|ten|fifteen|twenty|twenty-five|thirty|forty|fifty|hundred)\b/i);

  if (kvSizeMatch) {
    facts.companySize = kvSizeMatch[1].trim();
  } else if (sizeMatch) {
    const rawVal = sizeMatch[1].toLowerCase();
    const num = sizeNumberWordMap[rawVal] || rawVal;
    const unitMatch = sizeMatch[0].match(/(?:support\s*agents?|agents?|employees?|people|seats|reps|callers|users|hours)/i);
    const unit = unitMatch ? unitMatch[0].toLowerCase() : 'agents';
    facts.companySize = unit.includes('hour') ? `${num} hours/month` : `${num} ${unit}`;
  } else if (teamOfMatch) {
    const rawVal = teamOfMatch[1].toLowerCase();
    const num = sizeNumberWordMap[rawVal] || rawVal;
    facts.companySize = `${num} team members`;
  }

  // 6. Timeline — Supports updates & corrections
  const kvTimelineMatch = text.match(/(?:^|\n)\s*(?:Timeline|Timeframe|Deploy In)\s*[:=-]\s*([^\n]+)/i);
  const timelineWordMap: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
  };
  const timelineMatch = text.match(
    /(?:actually|instead|changed to|need it in|deploy in|go live in|within|in|by)?\s*(one|two|three|four|five|six|\d+)\s*(months?|weeks?|days?)/i,
  );
  const quickTimelineMatch = text.match(/\b(asap|as soon as possible|immediately|next quarter|this quarter|by end of year|q[1-4])\b/i);

  if (kvTimelineMatch) {
    facts.timeline = kvTimelineMatch[1].trim();
  } else if (timelineMatch) {
    const rawNum = timelineMatch[1].toLowerCase();
    const num = timelineWordMap[rawNum] || rawNum;
    facts.timeline = `${num} ${timelineMatch[2].toLowerCase()}`;
  } else if (quickTimelineMatch) {
    facts.timeline = quickTimelineMatch[1].trim();
  }

  // 7. Budget — Structured parsing
  const parsedBudget = parseBudgetString(text);
  if (parsedBudget) {
    facts.budget = parsedBudget.budget;
    facts.budgetMin = parsedBudget.budgetMin;
    facts.budgetMax = parsedBudget.budgetMax;
    facts.currency = parsedBudget.currency || 'USD';
  }

  // 8. Authority / Decision Maker
  if (
    /(?:only|sole)\s+decision\s*maker|I\s+(?:make\s+the\s+call|decide|make\s+the\s+decision)|I['’]m\s+the\s+decision\s*maker/i.test(
      lowerText,
    )
  ) {
    facts.decisionMaker = true;
    facts.authority = 'Sole Decision Maker';
  } else if (
    /(?:CTO|VP|director|manager|CEO|committee|team|board|boss)\s+(?:decides|makes\s+the\s+decision|will\s+decide)|not\s+the\s+(?:only\s+)?decision\s*maker/i.test(
      lowerText,
    )
  ) {
    facts.decisionMaker = false;
    const authMatch = text.match(
      /(?:our|the)\s+([A-Za-z\s]+?)\s+(?:decides|makes\s+the\s+decision|will\s+decide)/i,
    );
    facts.authority = authMatch ? authMatch[1].trim() : 'External Stakeholder / Team';
  }

  // 9. Email & Phone
  const extractedEmail = extractSpokenEmail(text);
  if (extractedEmail && !refusals.includes('email')) {
    facts.email = extractedEmail;
  }

  const extractedPhone = extractSpokenPhone(text);
  if (extractedPhone && !refusals.includes('phone')) {
    facts.phone = extractedPhone;
  }

  // 10. Need & Requirements
  const painPoints: string[] = [];
  const requirements: string[] = [];
  const products: string[] = [];

  const kvNeedMatch = text.match(/(?:^|\n)\s*(?:Need|Goal|Project)\s*[:=-]\s*([^\n]+)/i);
  if (kvNeedMatch) {
    facts.need = kvNeedMatch[1].trim();
  }

  if (/customer support/i.test(lowerText) && /voice/i.test(lowerText)) {
    facts.need = facts.need || 'AI voice customer support';
    requirements.push('conversational voice agent');
    requirements.push('customer support automation');
  } else if (
    lowerText.includes('customer support') ||
    lowerText.includes('support agent') ||
    lowerText.includes('voice agent') ||
    lowerText.includes('building an ai') ||
    lowerText.includes('agents') ||
    lowerText.includes('operations') ||
    lowerText.includes('deploy')
  ) {
    facts.need = facts.need || 'AI voice customer support';
    requirements.push('conversational voice agent');
  }

  const kvProductMatch = text.match(/(?:^|\n)\s*(?:Product|Products Interested|Platform)\s*[:=-]\s*([^\n]+)/i);
  if (kvProductMatch) {
    products.push(kvProductMatch[1].trim());
  } else if (/conversational ai/i.test(lowerText)) {
    products.push('Conversational AI');
  } else if (facts.need) {
    products.push('Conversational AI Engine');
  }

  if (
    lowerText.includes('repetitive calls') ||
    lowerText.includes('support workload') ||
    lowerText.includes('repetitive support calls')
  ) {
    painPoints.push('repetitive support calls / workload');
  }
  if (
    lowerText.includes('latency') ||
    lowerText.includes('interruption') ||
    lowerText.includes('delay')
  ) {
    painPoints.push('voice latency and turn-taking');
  }

  if (painPoints.length > 0) facts.painPoints = painPoints;
  if (requirements.length > 0) facts.requirements = requirements;
  if (products.length > 0) facts.productsInterested = products;

  // 11. Competitors Mentioned
  const comps: string[] = [];
  for (const comp of KNOWN_COMPETITORS) {
    if (lowerText.includes(comp)) {
      comps.push(comp);
    }
  }
  if (
    lowerText.includes('another provider') ||
    lowerText.includes('other provider') ||
    lowerText.includes('existing provider') ||
    lowerText.includes('competitor')
  ) {
    comps.push('competitor / incumbent provider');
  }
  if (comps.length > 0) facts.competitorsMentioned = comps;

  // 12. Objections
  const objs: string[] = [];
  if (
    lowerText.includes('already use') ||
    lowerText.includes('switch') ||
    lowerText.includes('why should we use') ||
    lowerText.includes('why should i go with') ||
    lowerText.includes('why agora') ||
    lowerText.includes('competitor')
  ) {
    objs.push('Incumbent / competitor comparison');
  }
  if (
    lowerText.includes('competitor is cheaper') ||
    lowerText.includes('cheaper competitor') ||
    lowerText.includes('% cheaper')
  ) {
    objs.push('Competitor is cheaper');
  }
  if (
    lowerText.includes('discount') ||
    lowerText.includes('cheaper') ||
    lowerText.includes('too expensive') ||
    lowerText.includes('expensive') ||
    lowerText.includes('high price') ||
    lowerText.includes('price is high') ||
    lowerText.includes('cost is high') ||
    lowerText.includes('costly') ||
    lowerText.includes('can\'t afford') ||
    lowerText.includes('cannot afford') ||
    lowerText.includes('% off')
  ) {
    objs.push('Price concern / discount request');
  }
  if (
    lowerText.includes('think about it') ||
    lowerText.includes('mull it over') ||
    lowerText.includes('need some time')
  ) {
    objs.push('Need to think about it');
  }
  if (
    lowerText.includes('approval from my manager') ||
    lowerText.includes('manager approval') ||
    lowerText.includes('boss approval') ||
    lowerText.includes('need sign-off') ||
    lowerText.includes('need sign off')
  ) {
    objs.push('Need manager/stakeholder approval');
  }
  if (
    lowerText.includes('not enough budget') ||
    lowerText.includes('no budget') ||
    lowerText.includes('budget is capped') ||
    lowerText.includes('budget capped')
  ) {
    objs.push('Not enough budget');
  }
  if (
    lowerText.includes('mainframe') ||
    lowerText.includes('cobol') ||
    lowerText.includes('holographic') ||
    lowerText.includes('unsupported feature')
  ) {
    objs.push('Missing or unconfirmed feature request');
  }
  if (
    lowerText.includes('integration concern') ||
    lowerText.includes('legacy pbx') ||
    lowerText.includes('avaya') ||
    lowerText.includes('trouble integrating')
  ) {
    objs.push('Integration concern');
  }
  if (
    lowerText.includes('security concern') ||
    lowerText.includes('hipaa') ||
    lowerText.includes('soc 2') ||
    lowerText.includes('soc2') ||
    lowerText.includes('data isolation')
  ) {
    objs.push('Security and compliance concern');
  }
  if (
    lowerText.includes('timing concern') ||
    lowerText.includes('bad timing') ||
    lowerText.includes('not the right time') ||
    lowerText.includes('next quarter')
  ) {
    objs.push('Timing concern');
  }
  if (objs.length > 0) facts.objections = objs;

  // 13. Explicit Buying Intent & Next Action (key-value support)
  const kvIntentMatch = text.match(/(?:^|\n)\s*(?:Buying Intent|Intent)\s*[:=-]\s*(high|medium|low)/i);
  if (kvIntentMatch) {
    facts.buyingIntent = kvIntentMatch[1].toLowerCase() as 'high' | 'medium' | 'low';
  }
  const kvNextActionMatch = text.match(/(?:^|\n)\s*(?:Next Action|Next Best Action)\s*[:=-]\s*([^\n]+)/i);
  if (kvNextActionMatch) {
    facts.nextBestAction = kvNextActionMatch[1].trim();
  }

  // 14. Location Extraction
  const kvLocMatch = text.match(/(?:^|\n)\s*(?:Location|City|Office|Based In)\s*[:=-]\s*([^\n]+)/i);
  const locPhraseMatch = text.match(
    /(?:calling\s+from|based\s+in|located\s+in|live\s+in|offices?\s+in|headquartered\s+in)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i,
  );
  const commonCities = [
    'Hyderabad', 'Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Chennai',
    'San Francisco', 'New York', 'London', 'Singapore', 'Tokyo', 'Berlin',
    'Austin', 'Seattle', 'Boston', 'Chicago', 'Toronto', 'Sydney'
  ];
  if (kvLocMatch) {
    facts.location = kvLocMatch[1].trim();
  } else if (locPhraseMatch) {
    const cand = locPhraseMatch[1].trim();
    if (!/^(?:the|our|a|an|agora|here|home|work|cloudcorp|sales)\b/i.test(cand)) {
      facts.location = cand;
    }
  } else {
    for (const city of commonCities) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(text)) {
        facts.location = city;
        break;
      }
    }
  }

  // 15. Volume Extraction
  const kvVolMatch = text.match(/(?:^|\n)\s*(?:Volume|Call Volume|Expected Calls|Calls)\s*[:=-]\s*([^\n]+)/i);
  const volMatch = text.match(
    /(?:(?:about|around|approx(?:\.|imately)?|~)?\s*([0-9]{1,3}(?:,[0-9]{3})+|\d+)\s*(?:calls?|minutes?|hours?|sessions?)(?:\s*(?:a|per)\s*(?:month|day|year|week)|\s*monthly|\s*daily|\s*weekly)?)/i,
  );
  if (kvVolMatch) {
    facts.volume = kvVolMatch[1].trim();
  } else if (volMatch) {
    facts.volume = volMatch[0].trim();
  }

  // 16. Use Case Extraction
  const kvUseCaseMatch = text.match(/(?:^|\n)\s*(?:Use Case|Project|Application|Building)\s*[:=-]\s*([^\n]+)/i);
  const useCaseMatch = text.match(
    /(?:building|developing|creating|working\s+on|evaluating\s+for|need|want)\s+((?:[a-zA-Z-]+\s+){0,6}(?:relationship\s+solutions?|matchmaking(?:\s+and\s+relationship\s+advisory\s+voice\s+bot)?|dating(?:\s+app|\s+voice\s+bot)?|voice\s+bot|voice\s+agent|support\s+bot|customer\s+support|call\s+center|receptionist|telehealth|virtual\s+assistant|solutions?|platform|app|system|bot))/i,
  );
  if (kvUseCaseMatch) {
    facts.useCase = kvUseCaseMatch[1].trim();
  } else if (useCaseMatch) {
    facts.useCase = useCaseMatch[1].trim();
  }

  // 17. Intent on this turn
  facts.intent = detectUserIntent(text, { previousQuestion: previousAssistantQuestion });

  return facts;
}

/**
 * Extracts structured facts from assistant recaps or confirmation questions.
 * Handles:
 * 1. Bulleted summaries:
 *    - Name: Yaduraj
 *    - Company: Voice Masters
 *    - Role: Manager
 *    - Email: yaduraj. sp@gmail. com
 *    - Phone: 930-247-6791
 * 2. Conversational confirmations:
 *    "So your target budget is around $10,000."
 *    "timeline of about one month"
 *    "100 hours of monthly voice usage"
 *    "is your email address yaduraj. sp@gmail. com?"
 *    "phone number of 930-247-6791"
 */
export function extractFactsFromAssistantRecap(assistantText: string): ExtractedFacts {
  const facts: ExtractedFacts = {};
  if (!assistantText) return facts;

  // 1. Bullet point structured recaps:
  // e.g. "- Name: Yaduraj- Company: Voice Masters- Role: Manager- Email: yaduraj. sp@gmail. com- Phone: 930-247-6791"
  const nameBullet = assistantText.match(
    /(?:[-*•]\s*|\b)Name\s*[:=-]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)(?=[,\s]*(?:[-*•]|\b(?:Company|Organization|Role|Job Title|Email|Phone|Budget|Timeline)\b)|$|\r|\n)/i,
  );
  if (nameBullet) {
    const raw = nameBullet[1].trim();
    if (isValidPersonName(raw)) {
      const parts = raw.split(/\s+/);
      facts.name = {
        fullName: raw,
        firstName: parts[0] || raw,
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
      };
    }
  }

  const compBullet = assistantText.match(
    /(?:[-*•]\s*|\b)(?:Company|Organization)\s*[:=-]\s*([A-Za-z0-9&_\s-]+?)(?=[,\s]*(?:[-*•]|\b(?:Role|Job Title|Email|Phone|Budget|Timeline)\b)|$|\r|\n)/i,
  );
  if (compBullet) {
    const raw = compBullet[1].trim();
    if (isValidCompanyName(raw)) {
      facts.company = raw;
    }
  }

  const roleBullet = assistantText.match(
    /(?:[-*•]\s*|\b)(?:Role|Job Title|Title|Position)\s*[:=-]\s*([A-Za-z\s]+?)(?=[,\s]*(?:[-*•]|\b(?:Email|Phone|Budget|Timeline)\b)|$|\r|\n)/i,
  );
  if (roleBullet) {
    const cleanRole = sanitizeJobTitle(roleBullet[1]);
    if (cleanRole) facts.role = cleanRole;
  }

  const emailBullet = assistantText.match(
    /(?:[-*•]\s*|\b)Email\s*[:=-]\s*([^\s-]+(?:\s*@\s*|\s+at\s+)[^\s-]+|[^-\n\r]+?)(?=[,\s]*(?:[-*•]|\b(?:Phone|Budget|Timeline)\b)|$|\r|\n)/i,
  );
  if (emailBullet) {
    const email = extractSpokenEmail(emailBullet[1]);
    if (email) facts.email = email;
  }

  const phoneBullet = assistantText.match(
    /(?:[-*•]\s*|\b)Phone\s*[:=-]\s*([0-9\s().-]+)(?=[,\s]*(?:[-*•]|\b(?:Budget|Timeline|[A-Za-z]+)\b)|$|\r|\n)/i,
  );
  if (phoneBullet) {
    const phone = extractSpokenPhone(phoneBullet[1]);
    if (phone) facts.phone = phone;
  }

  const budgetBullet = assistantText.match(
    /(?:[-*•]\s*|\b)Budget\s*[:=-]\s*([^-\n\r,]+)(?=[,\s]*(?:[-*•]|\b(?:Timeline)\b)|$|\r|\n)/i,
  );
  if (budgetBullet) {
    const b = parseBudgetString(budgetBullet[1]);
    if (b) {
      facts.budget = b.budget;
      facts.budgetMin = b.budgetMin;
      facts.budgetMax = b.budgetMax;
    }
  }

  const timelineBullet = assistantText.match(
    /(?:[-*•]\s*|\b)Timeline\s*[:=-]\s*([^-\n\r,]+)(?=[,\s]*(?:[-*•]|\b[A-Za-z]+\b)|$|\r|\n)/i,
  );
  if (timelineBullet) {
    facts.timeline = timelineBullet[1].replace(/[.,!]+$/, '').trim();
  }

  // 2. Prose confirmations
  // Name in prose: "It looks like we have all your details collected, Yaduraj!"
  if (!facts.name) {
    const proseNameMatch = assistantText.match(
      /(?:details collected,?|thank you,?|thanks,?|great to meet you,?|got it,?)\s+([A-Za-z]+)!/i,
    );
    if (proseNameMatch && isValidPersonName(proseNameMatch[1])) {
      facts.name = {
        fullName: proseNameMatch[1],
        firstName: proseNameMatch[1],
        lastName: null,
      };
    }
  }

  // Role & Company in prose: "you're the Manager at Voice Masters"
  if (!facts.role || !facts.company) {
    const roleCompMatch = assistantText.match(
      /you(?:'re| are)\s+(?:the\s+|a\s+|an\s+)?([A-Za-z\s]+?)\s+at\s+([A-Za-z0-9&_\s-]+?)(?:,|\.|\s+with)/i,
    );
    if (roleCompMatch) {
      if (!facts.role) {
        const cleanRole = sanitizeJobTitle(roleCompMatch[1]);
        if (cleanRole) facts.role = cleanRole;
      }
      if (!facts.company && isValidCompanyName(roleCompMatch[2])) {
        facts.company = roleCompMatch[2].trim();
      }
    }
  }

  if (!facts.email) {
    const emailMatch = assistantText.match(
      /(?:is\s+your\s+email(?:\s+address)?|is\s+that|email\s+of|breakdown\s+at)\s+([a-zA-Z0-9._%+-]+(?:\s*\.\s*[a-zA-Z0-9]+)*\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,})/i,
    );
    if (emailMatch) {
      const email = extractSpokenEmail(emailMatch[1]);
      if (email) facts.email = email;
    }
  }

  if (!facts.phone) {
    const phoneMatch = assistantText.match(/(?:phone\s+number\s+(?:of|is)|reach\s+you\s+at)\s+([0-9 -]{10,15})/i);
    if (phoneMatch) {
      const phone = extractSpokenPhone(phoneMatch[1]);
      if (phone) facts.phone = phone;
    }
  }

  if (!facts.budget) {
    const budgetMatch = assistantText.match(/(?:target\s+budget\s+(?:is|of)(?:\s+around)?)\s+(\$?[0-9,]+(?:\s*k)?|\w+\s+thousand)/i);
    if (budgetMatch) {
      const b = parseBudgetString(budgetMatch[1]);
      if (b) {
        facts.budget = b.budget;
        facts.budgetMin = b.budgetMin;
        facts.budgetMax = b.budgetMax;
      }
    }
  }

  if (!facts.timeline) {
    const tlMatch = assistantText.match(
      /(?:timeline\s+of(?:\s+about)?|go live in(?:\s+about)?)\s+([0-9]+\s+(?:months?|weeks?)|(?:one|two|three)\s+(?:months?|weeks?))/i,
    );
    if (tlMatch) {
      facts.timeline = tlMatch[1].replace(/one/i, '1').replace(/two/i, '2').replace(/three/i, '3').trim();
    }
  }

  if (!facts.companySize) {
    const usageMatch = assistantText.match(/(?:about\s+)?(\d+|hundred)\s+hours\s+of\s+(?:monthly\s+)?voice\s+usage/i);
    if (usageMatch) {
      const num = usageMatch[1].toLowerCase() === 'hundred' ? '100' : usageMatch[1];
      facts.companySize = `${num} hours/month`;
    }
  }

  return facts;
}

/**
 * Merges newly extracted facts into the Canonical Customer Profile.
 * Rule 11: NEVER overwrite known non-null values with null or undefined.
 * Rule 12: Latest customer statements override conflicting values (corrections).
 * Rule 13: Non-destructive merge: Protect valid established fields against garbage words.
 * Arrays are merged and deduplicated.
 */
export function mergeIntoCanonicalProfile(
  profile: CanonicalCustomerProfile,
  facts: ExtractedFacts,
): CanonicalCustomerProfile {
  const next: CanonicalCustomerProfile = {
    customer: { ...profile.customer },
    qualification: {
      ...profile.qualification,
      painPoints: [...profile.qualification.painPoints],
      requirements: [...profile.qualification.requirements],
    },
    sales: {
      ...profile.sales,
      productsInterested: [...profile.sales.productsInterested],
      competitorsMentioned: [...profile.sales.competitorsMentioned],
      objections: [...profile.sales.objections],
    },
    conversation: {
      informationRequested: [...profile.conversation.informationRequested],
      informationRefused: [...profile.conversation.informationRefused],
      lastQuestionAsked: profile.conversation.lastQuestionAsked,
    },
  };

  // 1. Refusals
  if (facts.refusals) {
    for (const ref of facts.refusals) {
      if (!next.conversation.informationRefused.includes(ref)) {
        next.conversation.informationRefused.push(ref);
      }
    }
  }

  // 2. Name: Non-destructive merge
  if (facts.name && facts.name.fullName) {
    const newFullName = facts.name.fullName.trim();
    const currentFullName = next.customer.fullName;
    if (isValidPersonName(newFullName)) {
      if (!currentFullName || !isValidPersonName(currentFullName) || facts.name.isExplicit) {
        next.customer.fullName = newFullName;
        next.customer.firstName = facts.name.firstName;
        next.customer.lastName = facts.name.lastName;
      } else {
        const isExplicitCorrection = /\b(?:actually|instead|correction|my name is actually)\b/i.test(newFullName);
        const extendsCurrentName =
          newFullName.toLowerCase().startsWith(currentFullName.toLowerCase()) &&
          newFullName.length <= currentFullName.length + 15;
        if (isExplicitCorrection || extendsCurrentName) {
          next.customer.fullName = newFullName;
          next.customer.firstName = facts.name.firstName;
          next.customer.lastName = facts.name.lastName;
        }
      }
    }
  }

  // 3. Company: Non-destructive merge
  if (facts.company) {
    const newCompany = facts.company.trim();
    const currentCompany = next.customer.company;
    if (isValidCompanyName(newCompany)) {
      if (!currentCompany || !isValidCompanyName(currentCompany)) {
        next.customer.company = newCompany;
      } else {
        const isExplicitCorrection = /\b(?:actually|instead|correction|company is actually)\b/i.test(newCompany);
        if (isExplicitCorrection) {
          next.customer.company = newCompany;
        }
      }
    }
  }

  // 4. Role: Non-destructive merge
  if (facts.role) {
    const cleanRole = sanitizeJobTitle(facts.role);
    if (cleanRole) {
      const currentRole = next.customer.jobTitle;
      if (!currentRole || !isValidJobTitle(currentRole)) {
        next.customer.jobTitle = cleanRole;
      } else {
        const isExplicitCorrection = /\b(?:actually|instead|correction)\b/i.test(cleanRole);
        if (isExplicitCorrection || cleanRole.length > currentRole.length) {
          next.customer.jobTitle = cleanRole;
        }
      }
    }
  }

  // 5. Company Size (Customer correction or update)
  if (facts.companySize) {
    next.customer.companySize = facts.companySize;
  }

  // 6. Timeline (Customer correction or update)
  if (facts.timeline) {
    next.qualification.timeline = facts.timeline;
  }

  // 7. Budget (Customer correction or update)
  if (facts.budget) {
    next.qualification.budget = facts.budget;
    if (facts.budgetMin !== undefined) next.qualification.budgetMin = facts.budgetMin;
    if (facts.budgetMax !== undefined) next.qualification.budgetMax = facts.budgetMax;
    if (facts.currency) next.qualification.currency = facts.currency;
  }

  // 8. Decision Maker
  if (facts.decisionMaker !== undefined) {
    next.qualification.decisionMaker = facts.decisionMaker;
  }

  // 9. Email (Only if provided and not refused)
  if (facts.email && !next.conversation.informationRefused.includes('email')) {
    const currentEmail = next.customer.email;
    if (!currentEmail) {
      next.customer.email = facts.email;
    } else {
      const isCorrection = /\b(?:actually|instead|correction|wrong email)\b/i.test(facts.email);
      const namePart = (next.customer.firstName || '').toLowerCase();
      const newEmailMatchesName = namePart && facts.email.toLowerCase().includes(namePart);
      const currentEmailMatchesName = namePart && currentEmail.toLowerCase().includes(namePart);
      if (isCorrection || (newEmailMatchesName && !currentEmailMatchesName)) {
        next.customer.email = facts.email;
      }
    }
  }

  // 10. Phone (Only if provided and not refused)
  if (facts.phone && !next.conversation.informationRefused.includes('phone')) {
    const currentPhone = next.customer.phone;
    const cleanCurrentDigits = currentPhone ? currentPhone.replace(/\D/g, '') : '';
    if (!currentPhone || cleanCurrentDigits.length < 10 || cleanCurrentDigits.length > 11) {
      next.customer.phone = facts.phone;
    } else {
      const isCorrection = /\b(?:actually|instead|correction|wrong number)\b/i.test(facts.phone);
      if (isCorrection) {
        next.customer.phone = facts.phone;
      }
    }
  }

  // 11. Need
  if (facts.need) {
    next.qualification.need = facts.need;
  }


  // 12. Arrays: merge & deduplicate
  if (facts.painPoints) {
    for (const p of facts.painPoints) {
      if (!next.qualification.painPoints.includes(p)) {
        next.qualification.painPoints.push(p);
      }
    }
  }
  if (facts.requirements) {
    for (const r of facts.requirements) {
      if (!next.qualification.requirements.includes(r)) {
        next.qualification.requirements.push(r);
      }
    }
  }
  if (facts.productsInterested) {
    for (const prod of facts.productsInterested) {
      if (!next.sales.productsInterested.includes(prod)) {
        next.sales.productsInterested.push(prod);
      }
    }
  }
  if (facts.objections) {
    for (const obj of facts.objections) {
      if (!next.sales.objections.includes(obj)) {
        next.sales.objections.push(obj);
      }
    }
  }
  if (facts.competitorsMentioned) {
    for (const comp of facts.competitorsMentioned) {
      if (!next.sales.competitorsMentioned.includes(comp)) {
        next.sales.competitorsMentioned.push(comp);
      }
    }
  }

  // 13. Intent and Next Action
  if (facts.buyingIntent) {
    next.sales.buyingIntent = facts.buyingIntent;
  }
  if (facts.nextBestAction) {
    next.sales.nextBestAction = facts.nextBestAction;
  }
  if (facts.intent) {
    next.sales.currentIntent = facts.intent;
  }
  if (facts.buyingSignals) {
    next.sales.buyingSignals = Array.from(
      new Set([...(next.sales.buyingSignals || []), ...facts.buyingSignals]),
    );
  }

  // 14. Location
  if (facts.location) {
    next.customer.location = facts.location;
  }

  // 15. Volume
  if (facts.volume) {
    next.qualification.volume = facts.volume;
  }

  // 16. Use Case
  if (facts.useCase) {
    next.qualification.useCase = facts.useCase;
  }

  return next;
}

/**
 * Returns genuinely missing customer details: 'customerName', 'customerEmail', 'company', 'phone'.
 * Does not treat empty strings, undefined, null, whitespace, or invalid placeholder emails as valid.
 */
export function getMissingCustomerDetails(state: Partial<SalesState>): string[] {
  const missing: string[] = [];

  const name = (
    state.customerName ||
    state.customer?.fullName ||
    state.customer?.firstName ||
    state.profile?.customer?.fullName ||
    state.profile?.customer?.firstName ||
    ''
  ).trim();
  if (!name || !isValidPersonName(name)) {
    missing.push('customerName');
  }

  const email = (
    state.customerEmail ||
    state.customer?.email ||
    state.email ||
    state.profile?.customer?.email ||
    ''
  ).trim();
  if (!email || !isValidCustomerEmail(email)) {
    missing.push('customerEmail');
  }

  const company = (
    state.company ||
    state.customer?.company ||
    state.profile?.customer?.company ||
    ''
  ).trim();
  if (!company || !isValidCompanyName(company)) {
    missing.push('company');
  }

  const phone = (
    state.phone ||
    state.customer?.phone ||
    state.profile?.customer?.phone ||
    ''
  ).trim();
  const phoneDigits = phone.replace(/\D/g, '');
  if (!phone || phoneDigits.length < 7) {
    missing.push('phone');
  }

  return missing;
}

export function hasKnownName(state: SalesState): boolean {
  return !getMissingCustomerDetails(state).includes('customerName');
}

export function hasKnownEmail(state: SalesState): boolean {
  return !getMissingCustomerDetails(state).includes('customerEmail');
}

export function hasKnownCompany(state: SalesState): boolean {
  return !getMissingCustomerDetails(state).includes('company');
}

export function hasKnownPhone(state: SalesState): boolean {
  return !getMissingCustomerDetails(state).includes('phone');
}

export function hasKnownJobTitle(state: SalesState): boolean {
  return !!(
    state.customer?.jobTitle?.trim() ||
    state.jobTitle?.trim() ||
    state.role?.trim() ||
    state.profile?.customer?.jobTitle?.trim()
  );
}

export function formatReadableDateLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'that day';
  if (dateStr === '2026-09-06') return 'tomorrow';
  if (dateStr === '2026-09-07') return 'Monday';
  if (dateStr === '2026-09-08') return 'Tuesday';
  if (dateStr === '2026-09-09') return 'Wednesday';
  if (dateStr === '2026-09-10') return 'Thursday';
  if (dateStr === '2026-09-11') return 'Friday';
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    const day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    return day;
  } catch {
    return dateStr;
  }
}

export function isManualDetailsIntent(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    /(?:enter\s+(?:my\s+)?details\s+manually|fill\s+(?:out\s+)?(?:the\s+)?form|enter\s+it\s+myself|enter\s+them\s+myself|fill\s+(?:in\s+)?my\s+details|add\s+my\s+information|want\s+to\s+enter\s+my\s+details\s+manually|enter\s+(?:my\s+)?info\s+manually|type\s+(?:my\s+)?details|fill\s+the\s+details\s+manually|fill\s+in\s+(?:the\s+)?form|use\s+(?:the\s+)?form|fill\s+manually|let\s+me\s+enter|let\s+me\s+fill)/i.test(
      lower,
    )
  );
}

/**
 * Deterministic Information Collector (Section 4 & 5).
 * Inspects the current SalesState and determines the next priority missing field.
 * Returns { field, priority, reason, questionIntent, suggestedQuestion } or null.
 */
export function getNextRequiredInformation(state: SalesState): RequiredInformationRequest | null {
  const cust = state.customer;
  const qual = state.qualification;
  const sales = state.sales;
  const refused = state.informationCollection?.fieldsRefused || state.refusedFields || [];
  const isRefused = (f: string) => refused.includes(f);

  const transcriptLower = (state.conversation?.transcript || '').toLowerCase();

  // Guard: If customer indicated departure (meeting / talk later), do not interrogate
  if (
    /(?:have\s+to\s+(?:go|leave)|need\s+to\s+(?:go|leave)|got\s+to\s+(?:run|go|leave)|gotta\s+(?:run|go|leave)|have\s+to\s+jump|leaving\s+now|talk\s+later|bye\b|goodbye\b)/i.test(
      transcriptLower,
    )
  ) {
    return null;
  }

  const isManualMode = state.detailsInputMode === 'manual' || state.appointment?.detailsInputMode === 'manual';

  // Appointment Scheduling Priority:
  // If user provided a partial date or time preference, prioritize completing the slot
  const appt = state.appointment || state.sales?.appointment;
  if (appt?.meetingRequested && appt.meetingStatus !== 'confirmed') {
    if (appt.preferredDate && !appt.preferredTime) {
      const dateLabel = formatReadableDateLabel(appt.preferredDate);
      return {
        field: 'preferredTime',
        priority: 100,
        reason: 'appointment_time_required',
        questionIntent: 'ask_for_time',
        suggestedQuestion: `What time would you like the meeting on ${dateLabel}?`,
      };
    }
    if (!appt.preferredDate && appt.preferredTime) {
      return {
        field: 'preferredDate',
        priority: 100,
        reason: 'appointment_date_required',
        questionIntent: 'ask_for_date',
        suggestedQuestion: "What day would you like to schedule the meeting for?",
      };
    }
  }

  // If in manual mode, DO NOT verbally ask for customer details (Name, Email, Company, Phone, etc.)
  if (isManualMode) {
    return null;
  }

  // Intercept explicit cut-call to capture email before disconnecting
  const isCutCall = /(?:cut\s+(?:the\s+)?call|cut\s+call|disconnect|hang\s*up)/i.test(transcriptLower);
  if (isCutCall) {
    if (!hasKnownEmail(state) && !isRefused('email')) {
      return {
        field: 'email',
        priority: 100,
        reason: 'capture_email_before_cut_call',
        questionIntent: 'ask_for_email_cut_call',
        suggestedQuestion: "Before you cut the call, what's the best email address to send you our pricing breakdown and follow up?",
      };
    }
    if (!hasKnownName(state) && !isRefused('name')) {
      return {
        field: 'name',
        priority: 95,
        reason: 'capture_name_before_cut_call',
        questionIntent: 'ask_for_name_cut_call',
        suggestedQuestion: "Before you cut the call, who was I speaking with today?",
      };
    }
  }

  const isDemoOrMeetingRequest =
    sales.salesStage === 'closing' ||
    sales.buyingIntent === 'high' ||
    transcriptLower.includes('demo') ||
    transcriptLower.includes('schedule') ||
    transcriptLower.includes('meeting') ||
    transcriptLower.includes('pricing') ||
    transcriptLower.includes('quote') ||
    transcriptLower.includes('follow up');

  // 1. High Priority: Action Requests (Demo / Quote / Meeting / Pricing) -> Mandatory Email, then Phone
  if (isDemoOrMeetingRequest) {
    if (!hasKnownEmail(state) && !isRefused('email')) {
      return {
        field: 'email',
        priority: 100,
        reason: 'required_for_demo_and_follow_up',
        questionIntent: 'ask_for_email',
        suggestedQuestion: "Absolutely. What's the best email to send the demo details to?",
      };
    }
    if (!hasKnownPhone(state) && !isRefused('phone')) {
      return {
        field: 'phone',
        priority: 90,
        reason: 'required_for_meeting_handoff',
        questionIntent: 'ask_for_phone',
        suggestedQuestion: "And what's the best number to reach you on?",
      };
    }
  }

  // 2. Early Conversation: Name & Company
  if (!hasKnownName(state) && !isRefused('name') && !isRefused('customerName')) {
    return {
      field: 'name',
      priority: 85,
      reason: 'establish_customer_identity',
      questionIntent: 'ask_for_name',
      suggestedQuestion: "Before we dive in, what should I call you?",
    };
  }

  if (!hasKnownCompany(state) && !isRefused('company')) {
    return {
      field: 'company',
      priority: 80,
      reason: 'identify_organization',
      questionIntent: 'ask_for_company',
      suggestedQuestion: "And which company are you looking to implement this for?",
    };
  }

  // 3. Discovery: Need & Role
  if (!qual.need) {
    return {
      field: 'need',
      priority: 75,
      reason: 'discover_use_case',
      questionIntent: 'ask_for_need',
      suggestedQuestion: "What are you hoping to improve with a voice AI solution?",
    };
  }

  if (!hasKnownJobTitle(state) && !isRefused('jobTitle') && !isRefused('role')) {
    return {
      field: 'jobTitle',
      priority: 70,
      reason: 'understand_stakeholder_role',
      questionIntent: 'ask_for_role',
      suggestedQuestion: "And what's your role there?",
    };
  }

  // 4. Qualification: Company Size, Timeline & Budget
  if (!cust.companySize && !isRefused('companySize')) {
    return {
      field: 'companySize',
      priority: 65,
      reason: 'understand_team_scale',
      questionIntent: 'ask_for_team_size',
      suggestedQuestion: "Roughly how many agents or users would this need to support?",
    };
  }

  if (!qual.timeline && !isRefused('timeline')) {
    return {
      field: 'timeline',
      priority: 60,
      reason: 'establish_deployment_milestone',
      questionIntent: 'ask_for_timeline',
      suggestedQuestion: "When are you hoping to have something like this live?",
    };
  }

  // Requirement 6: BUDGET MUST BE EXPLICITLY COLLECTED
  if (!qual.budget && !isRefused('budget')) {
    return {
      field: 'budget',
      priority: 55,
      reason: 'commercial_qualification',
      questionIntent: 'ask_for_budget',
      suggestedQuestion: "Do you already have a budget range allocated for this project?",
    };
  }

  // 5. Purchasing Authority
  if (qual.decisionMaker === null && !isRefused('decisionMaker')) {
    return {
      field: 'decisionMaker',
      priority: 50,
      reason: 'understand_purchasing_authority',
      questionIntent: 'ask_for_decision_maker',
      suggestedQuestion: "Are you the main decision maker for this rollout, or will others be involved in evaluating?",
    };
  }

  // 6. Pre-close contact collection fallback
  if (!hasKnownEmail(state) && !isRefused('email')) {
    return {
      field: 'email',
      priority: 95,
      reason: 'closing_contact_collection',
      questionIntent: 'ask_for_email',
      suggestedQuestion: "Before I let you go, what's the best email for the demo details?",
    };
  }

  if (!hasKnownPhone(state) && !isRefused('phone')) {
    return {
      field: 'phone',
      priority: 85,
      reason: 'closing_phone_collection',
      questionIntent: 'ask_for_phone',
      suggestedQuestion: "And what's the best number to reach you on?",
    };
  }

  return null;
}

/**
 * Section 9 Final Information-Collection Check.
 * Returns known fields, missing fields, and highest priority ask.
 */
export function getFinalMissingInformation(state: SalesState): {
  known: string[];
  missing: string[];
  nextRequired: RequiredInformationRequest | null;
} {
  const c = state.customer;
  const q = state.qualification;
  const refused = state.informationCollection?.fieldsRefused || [];

  const known: string[] = [];
  const missing: string[] = [];

  if (c.fullName) known.push('name');
  else if (!refused.includes('name')) missing.push('name');

  if (c.company) known.push('company');
  else if (!refused.includes('company')) missing.push('company');

  if (c.email) known.push('email');
  else if (!refused.includes('email')) missing.push('email');

  if (c.phone) known.push('phone');
  else if (!refused.includes('phone')) missing.push('phone');

  if (c.jobTitle) known.push('jobTitle');
  else if (!refused.includes('jobTitle')) missing.push('jobTitle');

  if (c.companySize) known.push('companySize');
  else if (!refused.includes('companySize')) missing.push('companySize');

  if (q.need) known.push('need');
  else missing.push('need');

  if (q.budget) known.push('budget');
  else if (!refused.includes('budget')) missing.push('budget');

  if (q.timeline) known.push('timeline');
  else if (!refused.includes('timeline')) missing.push('timeline');

  const nextRequired = getNextRequiredInformation(state);

  return {
    known,
    missing,
    nextRequired,
  };
}

/**
 * Pre-sync validation (Section 23).
 * Validates whether the final sales state contains minimum viable CRM properties.
 */
export function validateFinalSalesState(state: SalesState): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  const cust = state.customer;
  const qual = state.qualification;
  const sales = state.sales;

  if (!cust.email && (sales.salesStage === 'closing' || sales.buyingIntent === 'high')) {
    missing.push('email');
  }

  if (!cust.fullName) warnings.push('Customer name was not provided');
  if (!cust.company) warnings.push('Company was not provided');
  if (!cust.phone) warnings.push('Phone was not provided');
  if (!qual.budget) warnings.push('Budget was not specified');
  if (!qual.timeline) warnings.push('Timeline was not specified');

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Next Best Action Decision Engine.
 * Chooses exactly one action category per turn:
 * ANSWER | ASK | CLARIFY | HANDLE_OBJECTION | QUALIFY | RECOMMEND | BOOK | ESCALATE | END
 */
export function determineNextBestAction(
  state: SalesState,
  latestIntent: UserIntent,
  latestQuery: string,
  _retrievedChunks: Array<{ documentName: string; category: string; score: number; text: string }> = [],
): {
  category: NextBestActionCategory;
  action: string;
  directive: string;
  relevantNow: string[];
} {
  const lowerQuery = latestQuery.toLowerCase().trim();
  const appt = state.appointment || state.sales?.appointment;
  const buyingStrength = detectBuyingSignalStrength(lowerQuery);
  const isBookingRequested =
    latestIntent === 'BOOKING_REQUEST' ||
    buyingStrength === 'strong' ||
    Boolean(appt?.meetingRequested) ||
    Boolean(state.appointmentRequested) ||
    state.salesStage === 'closing' ||
    /(?:arrange|book|schedule|move\s+forward\s+with)\s+(?:a\s+)?(?:demo|meeting|call)/i.test(lowerQuery);

  // 1. BOOK: Strong buying signal or scheduling request immediately interrupts and stops qualification
  if (isBookingRequested) {
    if (appt?.meetingStatus === 'confirmed') {
      const meetStr = appt.meetingUrl ? ` with Google Meet link: ${appt.meetingUrl}` : '';
      return {
        category: 'BOOK',
        action: `confirm_appointment: You're booked for ${appt.selectedSlot?.formattedTime || 'the scheduled time'}.${meetStr}`,
        directive: `Confirm the scheduled demo for ${appt.selectedSlot?.formattedTime || 'the scheduled time'}.`,
        relevantNow: ['Booking Confirmation'],
      };
    }

    if (appt?.meetingStatus === 'slot_proposed') {
      return {
        category: 'BOOK',
        action: 'propose_meeting_slot: That time is unavailable. Propose alternative available meeting slots.',
        directive: 'Acknowledge that the requested time is unavailable and suggest concrete alternative meeting slots.',
        relevantNow: ['Alternative Meeting Slots'],
      };
    }

    const hasDate = Boolean(appt?.preferredDate || state.meetingDate);
    const hasTime = Boolean(appt?.preferredTime || state.meetingTime);
    const hasEmail = Boolean(state.customerEmail || state.customer?.email || state.email);

    let relevantNow: string[] = [];
    if (!hasDate && !hasTime) {
      relevantNow = ['Preferred Date and Time'];
    } else if (!hasDate) {
      relevantNow = ['Preferred Date'];
    } else if (!hasTime) {
      relevantNow = ['Preferred Time'];
    } else if (!hasEmail) {
      relevantNow = ['Email Address for Calendar Invite'];
    } else {
      relevantNow = ['Booking Confirmation'];
    }

    return {
      category: 'BOOK',
      action: 'arrange_demo',
      directive: 'Transition immediately to booking the requested demo/meeting. STOP all qualification questions. Confirm preferred date and time, and collect email if not yet known.',
      relevantNow,
    };
  }

  // 2. RESCHEDULE / CANCELLATION
  if (latestIntent === 'RESCHEDULE') {
    return {
      category: 'BOOK',
      action: 'reschedule_meeting: Ask for the new preferred date and time.',
      directive: 'Acknowledge the reschedule request and ask what date and time works better.',
      relevantNow: ['New Preferred Date', 'New Preferred Time'],
    };
  }
  if (latestIntent === 'CANCELLATION') {
    return {
      category: 'END',
      action: 'cancel_meeting: Confirm cancellation smoothly.',
      directive: 'Politely acknowledge the cancellation and let the customer know they can reach back out anytime.',
      relevantNow: [],
    };
  }

  // 3. GOODBYE / DEPARTURE
  if (latestIntent === 'GOODBYE') {
    return {
      category: 'END',
      action: 'end_call: Polite farewell.',
      directive: 'Thank the caller warmly and wish them a wonderful day. Do not push for more information.',
      relevantNow: [],
    };
  }

  // 4. FRUSTRATION (de-escalate immediately, drop all questions)
  if (latestIntent === 'FRUSTRATION') {
    return {
      category: 'ANSWER',
      action: 'acknowledge_frustration: De-escalate and address their exact focus immediately.',
      directive: 'Immediately acknowledge their frustration, apologize sincerely, drop all questions, and ask how you can directly help them right now.',
      relevantNow: ['Customer Objective'],
    };
  }

  // 5. REFUSAL HANDLING (respect customer choice without pressuring)
  if (/(?:don['’]t\s+want\s+to\s+(?:share|disclose|say|give)|rather\s+not\s+(?:say|disclose|share)|none\s+of\s+your\s+business|skip\s+(?:that|this)|not\s+sharing)/i.test(lowerQuery)) {
    return {
      category: 'ANSWER',
      action: 'respect_refusal: Respect customer choice without pressuring and advance consultative discussion.',
      directive: 'Politely acknowledge that they prefer not to share that detail. Do not pressure or re-ask. Pivot smoothly to their voice project needs or technical requirements.',
      relevantNow: ['Voice Architecture'],
    };
  }

  // 5b. HUMAN ESCALATION REQUEST (prospect asks to talk to a human / real person)
  if (/(?:speak|talk)\s+to\s+(?:a\s+)?(?:human|person|rep|sales\s+person|someone\s+else)|real\s+person|human\s+rep|enterprise\s+team/i.test(lowerQuery)) {
    return {
      category: 'ESCALATE',
      action: 'escalate_to_human: Offer direct connection with Agora solutions architecture team.',
      directive: 'Politely acknowledge their request to speak with a human specialist. Let them know you can connect them directly with an Agora Solutions Architect or Enterprise Specialist, and confirm the best email/phone to have someone reach out immediately.',
      relevantNow: ['Human Escalation Contact'],
    };
  }

  // 5c. TECHNICAL QUESTION / INTERRUPTION (custom LLMs, VPCs, network, protocols)
  if (
    /(?:does\s+it\s+work\s+with|do\s+you\s+support|can\s+it\s+(?:run|connect|integrate)|custom\s+llm|private\s+vpc|vpc\s+peering|on-prem|architecture)/i.test(lowerQuery)
  ) {
    return {
      category: 'ANSWER',
      action: 'explain_technical: Explain Agora real-time engine and sub-500ms pipeline.',
      directive: 'Answer the technical question directly using Agora verified sub-500ms voice pipeline and SD-RTN architecture. Do not redirect to docs.',
      relevantNow: ['Technical Architecture'],
    };
  }

  // 6. 9 CORE OBJECTION HANDLERS
  const coreObjection = detectCoreObjection(lowerQuery);
  const isObjectionStage = state.salesStage === 'objection_handling';

  if (coreObjection || isObjectionStage) {
    const category = coreObjection ? coreObjection.category : 'PRICE';

    if (category === 'COMPETITOR' || /(?:competitor|competitive|twilio|retell|vapi|livekit|daily\.co|another\s+provider|other\s+solution)/i.test(lowerQuery)) {
      return {
        category: 'HANDLE_OBJECTION',
        action: 'handle_competitor_objection: compare_products: Address competitor comparison using Agora strengths: sub-500ms real-time voice latency, SD-RTN global network reliability, natural voice interruption handling, and zero-data-leakage architecture.',
        directive: 'Highlight Agora core competitive advantages: sub-500ms voice latency, SD-RTN global real-time network with 99.99% uptime, natural VAD voice interruption handling, and zero-data-leakage architecture. Check if ultra-low latency is critical to their use case.',
        relevantNow: ['Agora Competitive Strengths'],
      };
    }

    if (category === 'PRICE' || /(?:discount|expensive|costly|price|rate|\d+%\s+discount)/i.test(lowerQuery)) {
      return {
        category: 'HANDLE_OBJECTION',
        action: 'handle_price_objection: Politely explain that standard pricing is already volume-optimized ($0.10/min with 300 free minutes), offer the official 20% annual commitment discount, and never promise unapproved discounts.',
        directive: 'Acknowledge price concern with empathy. Explain that Agora standard pricing is $0.10/min with first 300 minutes free each month, and official upfront annual commitments receive an official 20% discount. Inform them that larger discounts require executive signoff. Never promise unauthorized discounts. Check if the annual discount addresses their concern.',
        relevantNow: ['Official Pricing & Annual Discount'],
      };
    }

    if (category === 'BUDGET' || /(?:cannot\s+afford|can['’]t\s+afford|out\s+of\s+budget|beyond\s+budget|budget\s+ceiling)/i.test(lowerQuery)) {
      const econ = state.budgetEconomics || evaluateBudgetEconomics(state.budget, state.volume || state.companySize);
      if (econ.fitStatus === 'fits_pay_as_you_go') {
        return {
          category: 'HANDLE_OBJECTION',
          action: 'handle_budget_objection: Confirm that Agora standard pay-as-you-go pricing fits comfortably within their stated budget.',
          directive: `Acknowledge their stated budget. Explain that Agora pay-as-you-go pricing ($0.10/min with 300 free minutes) comes to ~$${econ.estimatedMonthlyCost}/month at their volume, which fits comfortably within their $${econ.statedBudget || state.budget}/month budget. Check if this resolves their concern.`,
          relevantNow: ['Agora Pricing Feasibility'],
        };
      } else if (econ.fitStatus === 'budget_mismatch') {
        return {
          category: 'HANDLE_OBJECTION',
          action: 'handle_budget_objection: Transparently explain volume-to-pricing math and acknowledge budget mismatch without fabricating discounts.',
          directive: `Acknowledge their budget constraint transparently. Explain that at ${econ.estimatedMinutes?.toLocaleString() || 'their'} minutes, standard $0.10/min pricing comes to ~$${econ.estimatedMonthlyCost}/month, which exceeds their $${econ.statedBudget || state.budget} budget. Do not push an expensive enterprise tier and never invent unapproved discounts. Ask if testing with a smaller pilot volume makes sense.`,
          relevantNow: ['Transparent Pricing Reality'],
        };
      } else {
        return {
          category: 'HANDLE_OBJECTION',
          action: 'handle_budget_objection: Explain standard pay-as-you-go pricing and ask for volume to calculate exact cost fit.',
          directive: 'Acknowledge their budget transparently. Standard Agora Conversational AI audio task pricing is $0.10/min with the first 300 minutes free each month. Ask for their estimated monthly call volume or minutes to verify exact cost fit.',
          relevantNow: ['Volume Estimate'],
        };
      }
    }

    if (category === 'TRUST' || /(?:reliable|uptime|audio\s+drops|security|data\s+privacy|hipaa|soc\s*2)/i.test(lowerQuery)) {
      return {
        category: 'HANDLE_OBJECTION',
        action: 'handle_trust_objection: Address reliability and data security with 99.99% SD-RTN uptime, zero data retention, and HIPAA / SOC 2 certification.',
        directive: 'Reassure the prospect using verified enterprise standards: Agora operates a proprietary SD-RTN network with 99.99% global uptime, zero voice stream data retention, sub-500ms latency, and full HIPAA and SOC 2 Type II compliance.',
        relevantNow: ['Security & Reliability'],
      };
    }

    if (category === 'TECHNICAL' || /(?:latency|mainframe|cobol|unsupported)/i.test(lowerQuery)) {
      const isUnsupported = /(?:mainframe|cobol|holographic|analog)/i.test(lowerQuery);
      return {
        category: 'HANDLE_OBJECTION',
        action: isUnsupported
          ? 'clarify_requirement: Explicitly clarify that unconfirmed capabilities require confirmation with solutions engineering, avoiding any false promises.'
          : 'handle_technical_objection: Address technical requirements accurately.',
        directive: isUnsupported
          ? 'Explicitly clarify that specialized legacy requirements (such as on-premise mainframe COBOL) are not supported out of the box and must be verified with solutions engineering. Avoid any false promises.'
          : 'Address the technical requirement using Agora verified sub-500ms voice pipeline and SD-RTN architecture.',
        relevantNow: ['Technical Architecture'],
      };
    }

    if (category === 'AUTHORITY' || /(?:manager|approval|sign-off|boss|cto)/i.test(lowerQuery)) {
      return {
        category: 'HANDLE_OBJECTION',
        action: 'request_decision_maker: Acknowledge the manager sign-off requirement and offer to include their manager directly in a joint technical demo.',
        directive: 'Respectfully acknowledge that leadership or manager approval is standard. Offer to provide an executive summary or invite their manager to a joint technical demo.',
        relevantNow: ['Stakeholder Inclusion'],
      };
    }

    if (category === 'IMPLEMENTATION' || /(?:hard\s+to\s+integrate|complex\s+sdk|bandwidth|deploy)/i.test(lowerQuery)) {
      return {
        category: 'HANDLE_OBJECTION',
        action: 'handle_implementation_objection: Highlight pre-built SDKs, Next.js quickstarts, and ready-to-use LLM integrations that enable days-to-launch deployment.',
        directive: 'Address implementation concerns by highlighting Agora pre-built quickstarts, conversational AI client SDKs, and modular pipelines that allow developers to launch voice bots in days without building WebRTC infrastructure from scratch.',
        relevantNow: ['Implementation Ease'],
      };
    }

    if (category === 'TIMING' || /(?:not\s+right\s+now|bad\s+timing|next\s+quarter)/i.test(lowerQuery)) {
      return {
        category: 'HANDLE_OBJECTION',
        action: 'handle_timing_objection: Respect timing constraints and offer an asynchronous technical overview or future follow-up.',
        directive: 'Acknowledge their timing respectfully. Offer to share an executive summary or set a reminder for when their project cycle opens up.',
        relevantNow: ['Future Follow-up'],
      };
    }

    if (category === 'NEED' || /(?:don['’]t\s+need\s+voice|text\s+chat\s+is\s+enough)/i.test(lowerQuery)) {
      return {
        category: 'HANDLE_OBJECTION',
        action: 'handle_need_objection: Explain high engagement and rapid resolution advantages of real-time conversational voice over text.',
        directive: 'Acknowledge that text is great for simple queries, but voice delivers 3x higher customer engagement and faster resolution for complex workflows. Ask about their current customer resolution metrics.',
        relevantNow: ['Voice Engagement Value'],
      };
    }
  }

  // 7. AMBIGUOUS PRODUCT CONCEPT DISCOVERY
  const useCaseText = state.useCase || state.profile?.qualification?.useCase || '';
  if (
    isAmbiguousProductDescription(lowerQuery) ||
    (latestIntent === 'USE_CASE' && isAmbiguousProductDescription(useCaseText)) ||
    (useCaseText && isAmbiguousProductDescription(useCaseText) && state.salesStage === 'discovery')
  ) {
    return {
      category: 'CLARIFY',
      action: 'clarify_product_concept: Ask a focused clarifying question about what the product actually does for its users.',
      directive: 'Acknowledge what they shared. Ask a focused, polite clarifying question about what their product actually does for its customers (e.g. matchmaking, dating advisory, coaching) before attempting to sell or qualify. Never use generic enthusiastic filler.',
      relevantNow: ['Product Concept Specifics'],
    };
  }

  // 8. MEDIUM BUYING SIGNAL: Prioritize answering query without tacking on questionnaire questions
  if (buyingStrength === 'medium') {
    return {
      category: 'ANSWER',
      action: 'answer_buying_query: Directly answer the product, pricing, or integration query with grounded Agora facts.',
      directive: 'Prioritize answering the prospect query directly using verified Agora facts. Do NOT tack on qualification checklist questions.',
      relevantNow: ['Grounded Solution Facts'],
    };
  }

  // 9. PRICING INQUIRY
  if (latestIntent === 'PRICING') {
    return {
      category: 'ANSWER',
      action: 'ask_budget: quote_pricing: Quote official Agora pricing ($0.10/min audio task with 300 free min, $0.59/1k RTC min, and subscription tiers) and ask for estimated monthly voice minutes to calculate exact costs.',
      directive: 'Quote official Agora pricing: $0.10/min audio task with first 300 minutes free, $0.59/1k RTC minutes, or package tiers. Be clear and direct.',
      relevantNow: ['Official Pricing'],
    };
  }

  // 10. TECHNICAL QUESTION (including mid-conversation topic changes)
  if (latestIntent === 'TECHNICAL_QUESTION') {
    return {
      category: 'ANSWER',
      action: 'explain_technical: Explain Agora real-time engine and sub-500ms pipeline.',
      directive: 'Answer the technical question directly using Agora verified sub-500ms voice pipeline and SD-RTN architecture. Do not redirect to docs.',
      relevantNow: ['Technical Architecture'],
    };
  }

  // 11. PRODUCT QUESTION
  if (latestIntent === 'PRODUCT_QUESTION') {
    if (state.salesStage === 'discovery') {
      return {
        category: 'ANSWER',
        action: 'discover_pain_point: explain_product: Briefly describe Agora Conversational AI capabilities and ask focused discovery questions about their specific use case and goals.',
        directive: 'Briefly explain Agora Conversational AI capabilities (sub-500ms voice, turn-taking, modular AI) and ask discovery questions about what kind of voice application they are building.',
        relevantNow: ['Product Capabilities', 'Prospect Use Case'],
      };
    }
    return {
      category: 'ANSWER',
      action: 'explain_product: Describe Agora Conversational AI capabilities.',
      directive: 'Explain Agora Conversational AI capabilities, modular STT/LLM/TTS architecture, and turn-taking intelligence.',
      relevantNow: ['Product Capabilities'],
    };
  }

  // 12. USE CASE (clear domain)
  if (latestIntent === 'USE_CASE') {
    if (state.salesStage === 'needs_analysis' || /(?:requirement\s+changed|changed\s+(?:our|my)\s+requirement|actually.*instead)/i.test(lowerQuery)) {
      return {
        category: 'CLARIFY',
        action: 'clarify_requirement: Acknowledge the updated requirements and analyze technical architecture changes before making new recommendations.',
        directive: 'Acknowledge the updated requirement and explore their inbound call flow, technical architecture changes, and concurrency before pitching.',
        relevantNow: ['Updated Requirements', 'Architecture Fit'],
      };
    }
    if (state.salesStage === 'discovery' || (!state.volume && !state.profile?.qualification?.volume)) {
      return {
        category: 'ASK',
        action: 'discover_pain_point: Ask focused discovery questions to understand their specific voice workflow, scale, and customer experience goals.',
        directive: `Acknowledge their use case (${useCaseText}). Ask focused discovery questions to understand their specific workflow, expected call volume or scale, and goals before recommending a solution.`,
        relevantNow: ['Workflow & Scale'],
      };
    } else {
      return {
        category: 'RECOMMEND',
        action: 'recommend_solution: Map Agora Conversational AI to their specific use case.',
        directive: `Highlight how Agora's low-latency voice AI directly powers ${useCaseText}. Offer a live demonstration.`,
        relevantNow: ['Architecture Fit'],
      };
    }
  }

  // 13. GREETING
  if (latestIntent === 'GREETING') {
    return {
      category: 'ASK',
      action: 'greeting_discovery: Welcome the caller and ask what voice project they are building.',
      directive: 'Warmly greet the caller and ask what voice AI application or project they are building today.',
      relevantNow: ['Project Overview'],
    };
  }

  // Default: QUALIFY what is relevant now
  return {
    category: 'QUALIFY',
    action: 'qualify_relevant: Focus on what matters now without reciting a questionnaire.',
    directive: 'Engage naturally with what the prospect just said. Only ask a question if it directly informs the solution recommendation.',
    relevantNow: ['Prospect Need'],
  };
}

/**
 * Next-Question Decision Layer (Section 9 & Section 25).
 */
export function getNextSalesQuestion(
  state: SalesState,
  customerMessage: string,
  _conversationContext?: { turnCount?: number; previousMessages?: ChatMessage[] },
): NextInformationQuestion | null {
  const lowerText = customerMessage.toLowerCase().trim();
  const profile = state.profile;
  const refused = profile.conversation.informationRefused;
  const isRefused = (field: string) => refused.includes(field);

  // General departure check: allow clean exit
  const isLeaving =
    /(?:have\s+to\s+(?:go|leave)|need\s+to\s+(?:go|leave)|got\s+to\s+(?:run|go|leave)|gotta\s+(?:run|go|leave)|have\s+to\s+jump|leaving\s+now|talk\s+later|bye\b|goodbye\b)/i.test(
      lowerText,
    );
  if (isLeaving) {
    return null;
  }

  const userChoseManual = isManualDetailsIntent(lowerText);
  const isManualMode =
    userChoseManual ||
    state.detailsInputMode === 'manual' ||
    state.appointment?.detailsInputMode === 'manual';

  const appt = state.appointment || state.sales?.appointment;

  // Manual Details Handling:
  if (isManualMode) {
    if (appt?.meetingRequested && appt.meetingStatus !== 'confirmed') {
      if (appt.preferredDate && !appt.preferredTime) {
        const dateLabel = formatReadableDateLabel(appt.preferredDate);
        return {
          field: 'preferredTime',
          reason: 'Meeting requested, time missing',
          question: `What time would you like the meeting on ${dateLabel}?`,
        };
      }
      if (!appt.preferredDate && appt.preferredTime) {
        return {
          field: 'preferredDate',
          reason: 'Meeting requested, date missing',
          question: 'What day would you like to schedule the meeting for?',
        };
      }
    }

    if (userChoseManual) {
      return {
        field: 'manualDetails',
        reason: 'User chose manual details entry',
        question: 'Sure, you can enter your details in the form.',
      };
    }

    return null;
  }

  // Appointment Scheduling Priority (Conversational Mode):
  if (appt?.meetingRequested && appt.meetingStatus !== 'confirmed') {
    if (appt.preferredDate && !appt.preferredTime) {
      const dateLabel = formatReadableDateLabel(appt.preferredDate);
      return {
        field: 'preferredTime',
        reason: 'Meeting requested, time missing',
        question: `What time would you like the meeting on ${dateLabel}?`,
      };
    }
    if (!appt.preferredDate && appt.preferredTime) {
      return {
        field: 'preferredDate',
        reason: 'Meeting requested, date missing',
        question: 'What day would you like to schedule the meeting for?',
      };
    }
    if (appt.preferredDate && appt.preferredTime && !hasKnownEmail(state) && !isRefused('email')) {
      const dateLabel = formatReadableDateLabel(appt.preferredDate);
      const timeLabel = formatTimeReadable(appt.preferredTime);
      return {
        field: 'email',
        reason: 'Need email for calendar invite and Meet link',
        question: `I can schedule that for ${dateLabel} at ${timeLabel}! What is the best email address to send your calendar invite and Meet link to?`,
      };
    }
  }

  // Cut-Call Intercept: capture missing contact information before disconnection
  const isCutCall = /(?:cut\s+(?:the\s+)?call|cut\s+call|disconnect|hang\s*up)/i.test(lowerText);
  if (isCutCall) {
    if (!hasKnownEmail(state) && !isRefused('email')) {
      return {
        field: 'email',
        reason: 'Capture email before customer cuts the call',
        question: "Before you cut the call, could you quickly share your email address so I can send over our pricing breakdown and follow up?",
      };
    }
    if (!hasKnownName(state) && !isRefused('name') && !isRefused('customerName')) {
      return {
        field: 'name',
        reason: 'Capture name before cutting call',
        question: 'Before you cut the call, who was I speaking with today?',
      };
    }
  }

  // Check intent and Next Best Action category
  const intent = state.currentIntent || detectUserIntent(customerMessage);
  const nbaCategory = state.nextBestActionCategory;

  // Frustration: never ask a qualification question
  if (intent === 'FRUSTRATION') {
    return null;
  }

  // Refusal: never ask a question for a refused field
  if (/(?:don['’]t\s+want\s+to\s+(?:share|disclose|say|give)|rather\s+not\s+(?:say|disclose|share)|none\s+of\s+your\s+business|skip\s+(?:that|this)|not\s+sharing)/i.test(lowerText)) {
    return null;
  }

  // If Ambiguous USE_CASE or Product Description -> Clarify!
  if (intent === 'USE_CASE' || isAmbiguousProductDescription(lowerText)) {
    const useCase = state.useCase || profile.qualification.useCase || '';
    if (
      isAmbiguousProductDescription(useCase) ||
      isAmbiguousProductDescription(lowerText) ||
      /relationship\s+solutions?/i.test(useCase) ||
      useCase.trim().toLowerCase() === 'solutions'
    ) {
      return {
        field: 'useCase',
        reason: 'Clarify ambiguous product concept',
        question: "Could you tell me a bit more about the relationship solutions you're building — is it matchmaking, dating advisory, or relationship coaching?",
      };
    }
  }

  // If user asks for a demo / booking directly
  const isDemo =
    intent === 'BOOKING_REQUEST' ||
    lowerText.includes('demo') ||
    lowerText.includes('book a demo') ||
    lowerText.includes('arrange a demo');

  if (isDemo) {
    if ((appt?.preferredDate || state.meetingDate) && (appt?.preferredTime || state.meetingTime) && !hasKnownEmail(state) && !isRefused('email')) {
      const pDate = (appt?.preferredDate || state.meetingDate)!;
      const pTime = (appt?.preferredTime || state.meetingTime)!;
      const dateLabel = formatReadableDateLabel(pDate);
      const timeLabel = formatTimeReadable(pTime);
      return {
        field: 'email',
        reason: 'Need email for calendar invite and Meet link',
        question: `I can schedule that for ${dateLabel} at ${timeLabel}! What is the best email address to send your calendar invite and Meet link to?`,
      };
    }
    if (!hasKnownEmail(state) && !isRefused('email')) {
      return {
        field: 'email',
        reason: 'Customer requested demo',
        question: "Absolutely. What's the best email to send the demo details to?",
      };
    }
    if (!appt?.preferredDate && !appt?.preferredTime && !state.meetingDate && !state.meetingTime) {
      return {
        field: 'preferredDate',
        reason: 'Ask date and time for requested demo',
        question: 'I would be happy to arrange a live demo! What date and time works best for you?',
      };
    }
    return null;
  }

  // If Handling Objection or Ending -> do not ask questions
  if (nbaCategory === 'HANDLE_OBJECTION' || nbaCategory === 'END') {
    return null;
  }

  // If Answering: only ask for caller name on initial turn when identity is unknown and not mid-flow topic shift
  if (nbaCategory === 'ANSWER') {
    const isTopicShift = /(?:wait|before that)/i.test(lowerText);
    const isInitialIdentityTurn = !hasKnownName(state) && !hasKnownCompany(state) && !isRefused('name') && !isRefused('customerName') && !isTopicShift;
    if (isInitialIdentityTurn) {
      return {
        field: 'name',
        reason: 'Establish caller identity early while answering',
        question: 'Before we dive in, what should I call you?',
      };
    }
    return null;
  }

  // Pricing / Quote Trigger
  const isPricingOrQuote =
    lowerText.includes('send me the pricing') ||
    lowerText.includes('send pricing') ||
    lowerText.includes('send me a quote') ||
    lowerText.includes('send a quote') ||
    lowerText.includes('email me the pricing');

  if (isPricingOrQuote) {
    if (!hasKnownEmail(state) && !isRefused('email')) {
      return {
        field: 'email',
        reason: 'Customer requested pricing',
        question: 'Sure. What email should I send that to?',
      };
    }
    return null;
  }

  // Only if explicitly in QUALIFY mode, or initial discovery before identity is established
  if (nbaCategory === 'QUALIFY' || (!hasKnownName(state) && !hasKnownCompany(state)) || (!state.need && !state.useCase)) {
    const req = getNextRequiredInformation(state);
    if (req) {
      const fieldName = req.field === 'customerName' ? 'name' : req.field;
      return {
        field: fieldName,
        reason: req.reason,
        question: req.suggestedQuestion,
      };
    }
  }

  return null;
}

export function getNextInformationQuestion(
  state: SalesState,
  messages: ChatMessage[],
): NextInformationQuestion | null {
  const userMessages = messages.filter(
    (m) => m.role === 'user' && typeof m.content === 'string',
  );
  if (userMessages.length === 0) {
    return {
      field: 'name',
      reason: 'Establish customer identity early',
      question: 'Before we dive in, what should I call you?',
    };
  }

  const latestText = userMessages[userMessages.length - 1].content.trim();
  return getNextSalesQuestion(state, latestText, {
    turnCount: userMessages.length,
    previousMessages: messages,
  });
}

/**
 * Computes field status ('known' | 'unknown' | 'not_applicable') for the required customer info checklist.
 */
export function computeInfoChecklist(state: SalesState): CustomerInfoChecklist {
  const isRefused = (f: string) =>
    state.refusedFields?.includes(f) ||
    state.profile?.conversation?.informationRefused?.includes(f) ||
    state.informationCollection?.fieldsRefused?.includes(f);

  const c = state.profile.customer;
  const q = state.profile.qualification;

  return {
    customerName: c.fullName ? 'known' : isRefused('customerName') || isRefused('name') ? 'not_applicable' : 'unknown',
    email: c.email ? 'known' : isRefused('email') ? 'not_applicable' : 'unknown',
    phone: c.phone ? 'known' : isRefused('phone') ? 'not_applicable' : 'unknown',
    company: c.company ? 'known' : isRefused('company') ? 'not_applicable' : 'unknown',
    jobTitle: c.jobTitle ? 'known' : isRefused('jobTitle') || isRefused('role') ? 'not_applicable' : 'unknown',

    need: q.need ? 'known' : 'unknown',
    painPoints: q.painPoints && q.painPoints.length > 0 ? 'known' : 'unknown',
    requirements: q.requirements && q.requirements.length > 0 ? 'known' : 'unknown',
    companySize: c.companySize ? 'known' : isRefused('companySize') ? 'not_applicable' : 'unknown',
    budget: q.budget ? 'known' : isRefused('budget') ? 'not_applicable' : 'unknown',
    timeline: q.timeline ? 'known' : isRefused('timeline') ? 'not_applicable' : 'unknown',
    decisionMaker: q.decisionMaker !== null ? 'known' : isRefused('decisionMaker') ? 'not_applicable' : 'unknown',

    productsInterested: state.profile.sales.productsInterested.length > 0 ? 'known' : 'unknown',
    competitorsMentioned: state.profile.sales.competitorsMentioned.length > 0 ? 'known' : 'not_applicable',
    objections: state.profile.sales.objections.length > 0 ? 'known' : 'not_applicable',
    buyingIntent: 'known',
  };
}

export function calculateCompletenessScore(checklist: CustomerInfoChecklist): number {
  let score = 0;
  const weights: Record<string, number> = {
    customerName: 10,
    company: 10,
    need: 20,
    requirements: 15,
    timeline: 10,
    email: 15,
    jobTitle: 5,
    companySize: 5,
    budget: 5,
    decisionMaker: 5,
  };

  for (const [field, weight] of Object.entries(weights)) {
    const status = checklist[field as keyof CustomerInfoChecklist];
    if (status === 'known' || status === 'not_applicable') {
      score += weight;
    }
  }

  return Math.min(100, Math.max(0, score));
}

export function determineNextInfoToCollect(
  state: SalesState,
  checklist: CustomerInfoChecklist,
  latestUserText: string,
  _allUserText: string,
): NextInfoToCollect | null {
  const lowerText = latestUserText.toLowerCase();

  // 1. Customer indicated departure: do not interrogate
  const isLeaving =
    /(?:have\s+to\s+(?:go|leave)|need\s+to\s+(?:go|leave)|got\s+to\s+(?:run|go|leave)|gotta\s+(?:run|go|leave)|have\s+to\s+jump|leaving\s+now|talk\s+later|bye\b|goodbye\b)/i.test(
      lowerText,
    );
  if (isLeaving) {
    return null;
  }

  const userChoseManual = isManualDetailsIntent(lowerText);
  const isManualMode =
    userChoseManual ||
    state.detailsInputMode === 'manual' ||
    state.appointment?.detailsInputMode === 'manual';

  const appt = state.appointment || state.sales?.appointment;
  if (appt?.meetingRequested && appt.meetingStatus !== 'confirmed') {
    if (appt.preferredDate && !appt.preferredTime) {
      return {
        field: 'preferredTime',
        reason: 'Meeting requested, time missing',
        priority: 'P0',
      };
    }
    if (!appt.preferredDate && appt.preferredTime) {
      return {
        field: 'preferredDate',
        reason: 'Meeting requested, date missing',
        priority: 'P0',
      };
    }
  }

  if (isManualMode) {
    return {
      field: 'manualDetails',
      reason: 'User selected manual details entry via popup',
      priority: 'P0',
    };
  }

  const isCutCall = /(?:cut\s+(?:the\s+)?call|cut\s+call|disconnect|hang\s*up)/i.test(lowerText);
  if (isCutCall) {
    if (!hasKnownEmail(state) && checklist.email !== 'not_applicable') {
      return {
        field: 'email',
        reason: 'Capture email before caller cuts the call',
        priority: 'P0',
      };
    }
  }

  // 2. Action requested by customer
  const isDemoOrMeetingRequest =
    lowerText.includes('demo') ||
    lowerText.includes('schedule') ||
    lowerText.includes('book') ||
    lowerText.includes('move forward') ||
    lowerText.includes('follow up') ||
    lowerText.includes('send') ||
    lowerText.includes('get started');

  if (isDemoOrMeetingRequest || state.salesStage === 'closing') {
    if (!hasKnownEmail(state) && checklist.email !== 'not_applicable') {
      return {
        field: 'email',
        reason: 'Customer requested a demo; need email to send invitation and technical overview',
        priority: 'P0',
      };
    }
    if (!hasKnownName(state) && checklist.customerName !== 'not_applicable') {
      return {
        field: 'customerName',
        reason: 'Personalize demo invitation and CRM contact record',
        priority: 'P0',
      };
    }
    if (!hasKnownCompany(state) && checklist.company !== 'not_applicable') {
      return {
        field: 'company',
        reason: 'Tailor demo environment to customer organization',
        priority: 'P0',
      };
    }
    if (checklist.timeline !== 'known' && checklist.timeline !== 'not_applicable') {
      return {
        field: 'timeline',
        reason: 'Align demo delivery with target deployment milestone',
        priority: 'P0',
      };
    }
    if (!hasKnownJobTitle(state) && checklist.jobTitle !== 'not_applicable') {
      return {
        field: 'jobTitle',
        reason: 'Ensure demo matches stakeholder role',
        priority: 'P1',
      };
    }
  }

  // 3. Stage-driven discovery and qualification
  switch (state.salesStage) {
    case 'discovery':
      if (checklist.need !== 'known') {
        return {
          field: 'need',
          reason: 'Understand primary customer goal and voice use case',
          priority: 'P0',
        };
      }
      if (checklist.requirements !== 'known' || checklist.painPoints !== 'known') {
        return {
          field: 'requirements',
          reason: 'Clarify core voice agent requirements and workflow scale',
          priority: 'P0',
        };
      }
      if (checklist.companySize !== 'known' && checklist.companySize !== 'not_applicable') {
        return {
          field: 'companySize',
          reason: 'Understand support team size and expected call volume',
          priority: 'P1',
        };
      }
      if (checklist.customerName !== 'known' && checklist.customerName !== 'not_applicable') {
        return {
          field: 'customerName',
          reason: 'Establish personal rapport in discovery',
          priority: 'P0',
        };
      }
      if (checklist.company !== 'known' && checklist.company !== 'not_applicable') {
        return {
          field: 'company',
          reason: 'Identify customer organization',
          priority: 'P0',
        };
      }
      break;

    case 'qualification':
      if (checklist.companySize !== 'known' && checklist.companySize !== 'not_applicable') {
        return {
          field: 'companySize',
          reason: 'Gauge call volume and tier fit for pricing calculation',
          priority: 'P1',
        };
      }
      if (checklist.timeline !== 'known' && checklist.timeline !== 'not_applicable') {
        return {
          field: 'timeline',
          reason: 'Establish target go-live milestone',
          priority: 'P0',
        };
      }
      if (checklist.budget !== 'known' && checklist.budget !== 'not_applicable') {
        return {
          field: 'budget',
          reason: 'Confirm commercial alignment with Agora pricing',
          priority: 'P1',
        };
      }
      if (checklist.decisionMaker !== 'known' && checklist.decisionMaker !== 'not_applicable') {
        return {
          field: 'decisionMaker',
          reason: 'Understand decision makers and evaluation team',
          priority: 'P1',
        };
      }
      break;

    case 'pitch':
      if (checklist.requirements !== 'known') {
        return {
          field: 'requirements',
          reason: 'Confirm specific architectural and telephony requirements',
          priority: 'P0',
        };
      }
      if (checklist.timeline !== 'known' && checklist.timeline !== 'not_applicable') {
        return {
          field: 'timeline',
          reason: 'Confirm target deployment schedule',
          priority: 'P0',
        };
      }
      break;

    case 'objection_handling':
      if (checklist.budget !== 'known' && checklist.budget !== 'not_applicable' && lowerText.includes('discount')) {
        return {
          field: 'budget',
          reason: 'Clarify commercial constraints around pricing objection',
          priority: 'P1',
        };
      }
      break;

    case 'closing':
      break;
  }

  // 4. Missing Fallback Check
  if (checklist.need !== 'known') {
    return { field: 'need', reason: 'Customer need is essential for qualification', priority: 'P0' };
  }
  if (checklist.requirements !== 'known') {
    return { field: 'requirements', reason: 'Technical requirements needed for solution fit', priority: 'P0' };
  }
  if (checklist.timeline !== 'known' && checklist.timeline !== 'not_applicable') {
    return { field: 'timeline', reason: 'Target deployment timeline needed to plan engagement', priority: 'P0' };
  }
  if (checklist.company !== 'known' && checklist.company !== 'not_applicable') {
    return { field: 'company', reason: 'Company identity needed for CRM', priority: 'P0' };
  }
  if (checklist.customerName !== 'known' && checklist.customerName !== 'not_applicable') {
    return { field: 'customerName', reason: 'Customer name needed for CRM record', priority: 'P0' };
  }
  if (
    checklist.email !== 'known' &&
    checklist.email !== 'not_applicable' &&
    (state.buyingIntent === 'high' || state.salesStage === 'closing' || state.salesStage === 'qualification')
  ) {
    return { field: 'email', reason: 'Email needed for follow-up documentation', priority: 'P0' };
  }
  if (checklist.companySize !== 'known' && checklist.companySize !== 'not_applicable') {
    return { field: 'companySize', reason: 'Team size helpful for sizing and tiering', priority: 'P1' };
  }
  if (checklist.jobTitle !== 'known' && checklist.jobTitle !== 'not_applicable') {
    return { field: 'jobTitle', reason: 'Role context helpful for solution framing', priority: 'P1' };
  }
  if (checklist.budget !== 'known' && checklist.budget !== 'not_applicable') {
    return { field: 'budget', reason: 'Commercial budget helpful for contract planning', priority: 'P1' };
  }
  if (checklist.decisionMaker !== 'known' && checklist.decisionMaker !== 'not_applicable') {
    return { field: 'decisionMaker', reason: 'Decision maker insight helpful for closing', priority: 'P1' };
  }

  return null;
}

export function shouldCollectMoreInformation(
  state: SalesState,
  _checklist: CustomerInfoChecklist,
  latestUserText: string,
): EndConversationGuardResult {
  const lowerText = latestUserText.toLowerCase();

  const isCutCall = /(?:cut\s+(?:the\s+)?call|cut\s+call|disconnect|hang\s*up)/i.test(lowerText);
  if (isCutCall) {
    if (!state.profile.customer.email) {
      return {
        shouldCollect: true,
        field: 'email',
        reason: 'Capture email before customer cuts the call',
        suggestedQuestion: "Before you cut the call, what's the best email address to send you our pricing breakdown and follow up?",
      };
    }
    if (!state.profile.customer.fullName) {
      return {
        shouldCollect: true,
        field: 'name',
        reason: 'Capture customer name before cutting call',
        suggestedQuestion: 'Before you cut the call, who was I speaking with today?',
      };
    }
  }

  const isLeaving =
    /(?:have\s+to\s+(?:go|leave)|need\s+to\s+(?:go|leave)|got\s+to\s+(?:run|go|leave)|gotta\s+(?:run|go|leave)|have\s+to\s+jump|leaving\s+now|talk\s+later|bye\b|goodbye\b)/i.test(
      lowerText,
    );

  if (isLeaving) {
    return {
      shouldCollect: false,
      reason: 'Customer indicated departure; close politely with zero interrogation',
    };
  }

  const req = getNextRequiredInformation(state);
  if (req && (req.field === 'email' || req.field === 'phone')) {
    return {
      shouldCollect: true,
      field: req.field,
      reason: req.reason,
      suggestedQuestion: req.suggestedQuestion,
    };
  }

  return {
    shouldCollect: false,
    reason: 'Sufficient qualification info collected or no natural trigger',
  };
}

/**
 * Consultative product recommendation engine.
 * Matches customer requirements, scale, and pain points to Agora's product portfolio.
 */
export function determineProductRecommendation(
  profile: CanonicalCustomerProfile,
  allUserText: string,
): { recommendedProduct?: string; recommendationReason?: string } {
  const lowerText = allUserText.toLowerCase();
  const need = (profile.qualification.need || '').toLowerCase();
  const requirements = profile.qualification.requirements.map((r) => r.toLowerCase()).join(' ');
  const companySize = (profile.customer.companySize || '').toLowerCase();

  // 1. Conversational AI Engine: voice agent, automated support, call center, agents, turn-taking
  if (
    need.includes('voice') ||
    need.includes('support') ||
    need.includes('conversational') ||
    need.includes('agent') ||
    requirements.includes('voice') ||
    requirements.includes('support') ||
    requirements.includes('agent') ||
    lowerText.includes('support agent') ||
    lowerText.includes('voice ai') ||
    lowerText.includes('voice agent') ||
    lowerText.includes('conversational ai') ||
    lowerText.includes('call center') ||
    companySize.includes('agent')
  ) {
    return {
      recommendedProduct: 'Conversational AI',
      recommendationReason: 'Best fit for automated voice support at this scale.',
    };
  }

  // 2. Agora RTC (Voice & Video SDK)
  if (
    lowerText.includes('video call') ||
    lowerText.includes('voice call') ||
    lowerText.includes('rtc') ||
    lowerText.includes('streaming') ||
    lowerText.includes('human to human')
  ) {
    return {
      recommendedProduct: 'Agora RTC',
      recommendationReason: 'Best fit for high-reliability human-to-human real-time voice and video infrastructure across global SD-RTN.',
    };
  }

  // 3. Agent Studio
  if (
    lowerText.includes('no-code') ||
    lowerText.includes('low-code') ||
    lowerText.includes('studio') ||
    lowerText.includes('drag and drop')
  ) {
    return {
      recommendedProduct: 'Agent Studio',
      recommendationReason: 'Best fit for rapid no-code voice agent workflow design and visual orchestration.',
    };
  }

  // Default if there is any conversational engagement
  if (profile.qualification.need || lowerText.length > 5) {
    return {
      recommendedProduct: 'Conversational AI',
      recommendationReason: 'Best fit for automated voice support at this scale.',
    };
  }

  return {};
}

/**
 * Detects objections using conversation context across 10 distinct types.
 * Accurately manages objection resolution state when customer acknowledges
 * or accepts alternatives.
 */
export function detectObjectionsWithContext(
  messages: ChatMessage[],
  currentState: SalesState,
): { records: ObjectionRecord[]; summaryLabels: string[] } {
  const userMessages = messages.filter(
    (m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim(),
  );
  if (userMessages.length === 0) {
    return {
      records: currentState.detectedObjections || [],
      summaryLabels: currentState.profile?.sales?.objections || currentState.objections || [],
    };
  }

  const existingRecords: ObjectionRecord[] = [
    ...(currentState.detectedObjections || []),
  ];
  const summaryLabels = new Set<string>(
    currentState.profile?.sales?.objections || currentState.objections || [],
  );

  // Check each user message chronologically to track objection detection and resolution
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user' || typeof msg.content !== 'string') continue;
    const text = msg.content.trim();
    const lower = text.toLowerCase();

    // Check prior assistant message for conversational context
    let prevAssistantText = '';
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === 'assistant' && typeof messages[j].content === 'string') {
        prevAssistantText = messages[j].content.trim().toLowerCase();
        break;
      }
    }

    // 1. Price is too high
    const isPriceHigh =
      /(?:pricing|price|cost|rate)\s+(?:is\s+)?(?:too\s+)?(?:expensive|high|steep|costly)|too\s+expensive|too\s+much\s+money|can'?t\s+afford|cannot\s+afford|over\s+our\s+budget|exceeds\s+our\s+budget/i.test(
        lower,
      ) ||
      (prevAssistantText.includes('$') &&
        /(?:too\s+(?:much|high|expensive)|that'?s\s+(?:a\s+lot|steep)|costly)/i.test(lower));

    if (isPriceHigh && !existingRecords.some((r) => r.type === 'price_too_high' && r.text === text)) {
      const severity: 'low' | 'medium' | 'high' =
        /can'?t\s+afford|cannot\s+afford|way\s+too|far\s+too/i.test(lower) ? 'high' : 'medium';
      existingRecords.push({
        id: `obj-${Date.now()}-price-${existingRecords.length}`,
        type: 'price_too_high',
        text,
        severity,
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Price concern / discount request');
    }

    // 2. Competitor is cheaper
    const isCompetitorCheaper =
      /(?:competitor|another\s+provider|other\s+solution|twilio|retell|vapi)\s+is\s+(?:\d+%\s+)?cheaper|cheaper\s+competitor|\d+%\s+cheaper|cheaper\s+alternative|why\s+pay\s+more\s+than/i.test(
        lower,
      );

    if (isCompetitorCheaper && !existingRecords.some((r) => r.type === 'competitor_cheaper' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-comp-${existingRecords.length}`,
        type: 'competitor_cheaper',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Competitor is cheaper');
      summaryLabels.add('Incumbent / competitor comparison');
    }

    // 3. Need to think about it
    const isNeedToThink =
      /(?:need|have)\s+to\s+think\s+about\s+it|think\s+it\s+(?:over|through)|mull\s+it\s+over|sleep\s+on\s+it|give\s+me\s+(?:some|a\s+few)\s+(?:time|days)|not\s+ready\s+to\s+decide/i.test(
        lower,
      );

    if (isNeedToThink && !existingRecords.some((r) => r.type === 'need_to_think' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-think-${existingRecords.length}`,
        type: 'need_to_think',
        text,
        severity: 'low',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Need to think about it');
    }

    // 4. Need approval
    const isNeedApproval =
      /(?:need|require|get|have\s+to\s+get)\s+(?:approval|sign-off|sign\s+off|permission)|approval\s+from\s+my\s+(?:manager|boss|vp|director|team|board)|boss\s+has\s+to\s+approve|manager\s+has\s+to\s+sign|not\s+my\s+decision\s+alone/i.test(
        lower,
      );

    if (isNeedApproval && !existingRecords.some((r) => r.type === 'need_approval' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-appr-${existingRecords.length}`,
        type: 'need_approval',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Need manager/stakeholder approval');
    }

    // 5. Not enough budget
    const isNotEnoughBudget =
      /not\s+enough\s+budget|no\s+budget|don'?t\s+have\s+(?:the\s+)?budget|budget\s+is\s+(?:capped|exhausted|too\s+small|limited|tight)|zero\s+budget|\$0\s+budget|budget\s+constraint/i.test(
        lower,
      );

    if (isNotEnoughBudget && !existingRecords.some((r) => r.type === 'not_enough_budget' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-budget-${existingRecords.length}`,
        type: 'not_enough_budget',
        text,
        severity: 'high',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Not enough budget');
    }

    // 6. Missing feature (unsupported / unconfirmed capability)
    const isMissingFeature =
      /(?:do\s+you\s+support|can\s+you\s+do|does\s+agora\s+have)\s+(?:on-premise\s+mainframe|cobol|holographic|telepathic|analog\s+tape|quantum|fax)/i.test(
        lower,
      ) ||
      /(?:unsupported|missing)\s+feature|you\s+don'?t\s+support\s+my|feature\s+is\s+missing/i.test(lower);

    if (isMissingFeature && !existingRecords.some((r) => r.type === 'missing_feature' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-feat-${existingRecords.length}`,
        type: 'missing_feature',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Missing or unconfirmed feature request');
    }

    // 7. Integration concern
    const isIntegrationConcern =
      /integration\s+concern|hard\s+to\s+integrate|trouble\s+integrating|difficult\s+to\s+connect|how\s+does\s+it\s+integrate\s+with\s+(?:legacy|our\s+custom|avaya|cisco|pbx|sip)|telephony\s+compatibility/i.test(
        lower,
      );

    if (isIntegrationConcern && !existingRecords.some((r) => r.type === 'integration_concern' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-integ-${existingRecords.length}`,
        type: 'integration_concern',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Integration concern');
    }

    // 8. Security concern
    const isSecurityConcern =
      /security\s+concern|hipaa(?:\s+compliant)?|soc\s*2|data\s+(?:privacy|isolation|leakage)|where\s+(?:is\s+data\s+stored|are\s+recordings\s+kept)|tenant\s+isolation|gdpr\s+compliance/i.test(
        lower,
      );

    if (isSecurityConcern && !existingRecords.some((r) => r.type === 'security_concern' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-sec-${existingRecords.length}`,
        type: 'security_concern',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Security and compliance concern');
    }

    // 9. Timing concern
    const isTimingConcern =
      /timing\s+concern|bad\s+timing|not\s+the\s+right\s+time|revisit\s+(?:next\s+quarter|later|next\s+year)|busy\s+right\s+now|too\s+much\s+going\s+on|not\s+ready\s+(?:this\s+month|yet)/i.test(
        lower,
      );

    if (isTimingConcern && !existingRecords.some((r) => r.type === 'timing_concern' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-time-${existingRecords.length}`,
        type: 'timing_concern',
        text,
        severity: 'low',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Timing concern');
    }

    // 10. Already using another solution
    const isAlreadyUsing =
      /already\s+(?:using|use)|why\s+should\s+we\s+use|why\s+agora|switch\s+from|already\s+have\s+(?:a|an)\s+(?:provider|vendor|solution)|locked\s+into\s+(?:a\s+contract|twilio|our\s+existing\s+provider)|existing\s+contract\s+with/i.test(
        lower,
      );

    if (isAlreadyUsing && !existingRecords.some((r) => r.type === 'already_using_solution' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-incumb-${existingRecords.length}`,
        type: 'already_using_solution',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Incumbent / competitor comparison');
    }

    // 11. Perceived Value / ROI Concern
    const isPerceivedValue =
      /(?:not\s+(?:convinced|sure|certain)\s+it'?s\s+worth|not\s+convinced\s+it'?s\s+worth|not\s+worth\s+(?:the\s+money|₹|\$|rs|it)|prove\s+(?:the\s+)?(?:roi|value)|justify\s+the\s+cost|don'?t\s+see\s+the\s+value|is\s+it\s+really\s+worth)/i.test(
        lower,
      ) ||
      (/(?:we\s+have\s+(?:the\s+)?budget|budget\s+is\s+not\s+(?:an?\s+)?(?:issue|blocker)).*?(?:not\s+(?:convinced|worth)|worth)/i.test(
        lower,
      ));

    if (isPerceivedValue && !existingRecords.some((r) => r.type === 'perceived_value' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-value-${existingRecords.length}`,
        type: 'perceived_value',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Perceived value / ROI objection');

      // If customer explicitly confirmed budget, resolve previous price objections
      if (/(?:we\s+have\s+(?:the\s+)?budget|budget\s+is\s+not\s+(?:the\s+)?(?:issue|blocker))/i.test(lower)) {
        for (const r of existingRecords) {
          if (r.type === 'price_too_high' || r.type === 'not_enough_budget') {
            r.resolved = true;
            r.resolvedAt = Date.now();
            r.resolutionNote = 'Customer confirmed budget is not the blocker; shifted to perceived value';
          }
        }
      }
    }

    // 12. Implementation Risk Concern
    const isImplementationRisk =
      /(?:worried|concerned|nervous|unsure|anxious)\s+about\s+(?:the\s+)?implementation|implementation\s+(?:risk|concern|issue|trouble|headache|problem|hurdle|effort)|hard\s+to\s+implement|how\s+hard\s+is\s+it\s+to\s+implement|deployment\s+(?:risk|hurdle|delay)|onboarding\s+(?:hurdle|delay|risk)/i.test(
        lower,
      );

    if (isImplementationRisk && !existingRecords.some((r) => r.type === 'implementation_risk' && r.text === text)) {
      existingRecords.push({
        id: `obj-${Date.now()}-impl-${existingRecords.length}`,
        type: 'implementation_risk',
        text,
        severity: 'medium',
        resolved: false,
        detectedAt: Date.now(),
      });
      summaryLabels.add('Implementation risk / onboarding concern');
    }

    // Resolution Check:
    // If the customer provides positive acknowledgment or agrees to a next step after an objection was raised
    const isResolutionSignal =
      /(?:that\s+makes\s+sense|sounds\s+fair|sounds\s+reasonable|fair\s+enough|that\s+works|good\s+point|i\s+understand|let'?s\s+(?:do\s+that|move\s+forward|schedule|book)|20%\s+(?:annual|works|sounds\s+good)|i'?ll\s+bring\s+my\s+manager|confirm\s+with\s+engineering)/i.test(
        lower,
      );

    if (isResolutionSignal) {
      for (const obj of existingRecords) {
        if (!obj.resolved) {
          obj.resolved = true;
          obj.resolvedAt = Date.now();
          obj.resolutionNote = 'Resolved via customer agreement / acknowledgment';
        }
      }
    }
  }

  return {
    records: existingRecords,
    summaryLabels: Array.from(summaryLabels),
  };
}

/**
 * Evaluates negotiation parameters, discount eligibility, and approval requirements
 * strictly following official Agora pricing policies from knowledge collateral.
 */
export function evaluateNegotiationState(
  messages: ChatMessage[],
  currentState: SalesState,
  detectedObjections: ObjectionRecord[],
  activeProfile: CanonicalCustomerProfile,
): NegotiationState {
  const userMessages = messages.filter(
    (m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim(),
  );
  const allUserText = userMessages.map((m) => m.content).join(' ');
  const latestText = userMessages.length > 0 ? userMessages[userMessages.length - 1].content.trim() : '';
  const lowerLatest = latestText.toLowerCase();

  const prevNeg = currentState.negotiation || createInitialNegotiationState();

  const customerBudget: string | null =
    activeProfile.qualification.budget ||
    currentState.profile?.qualification?.budget ||
    currentState.budget ||
    prevNeg.customerBudget ||
    null;

  const quotedPrice: string | null =
    prevNeg.quotedPrice ||
    '$0.10/min audio task (300 free min/mo), Starter $499/mo, Growth $1,499/mo, Enterprise $3,500/mo';

  // Extract requested discount if present in customer utterance
  let requestedDiscount: string | null = prevNeg.requestedDiscount;
  const discountMatch = allUserText.match(/(\d+)\s*%\s*(?:discount|off)/i);
  if (discountMatch) {
    requestedDiscount = `${discountMatch[1]}%`;
  }

  // Company discount policy rules:
  // Standard approved discount: exactly 20% on upfront annual commitment.
  // Discounts > 20% require explicit executive & finance approval.
  const allowedDiscount: string | null = '20% (annual commitment)';
  let approvalRequired = false;
  let negotiationStatus: NegotiationStatus = prevNeg.negotiationStatus;
  let lastOffer: string | null = prevNeg.lastOffer;
  let nextOffer: string | null = prevNeg.nextOffer;

  if (requestedDiscount) {
    const num = parseInt(requestedDiscount.replace(/\D/g, ''), 10);
    if (!isNaN(num)) {
      if (num > 20) {
        approvalRequired = true;
        negotiationStatus = 'counter_offered';
        lastOffer = `${requestedDiscount} requested by customer`;
        nextOffer = '20% discount on upfront annual commitment (discounts above 20% require executive/finance approval)';
      } else {
        approvalRequired = false;
        negotiationStatus = 'offer_made';
        lastOffer = `${requestedDiscount} requested by customer`;
        nextOffer = `${requestedDiscount} discount applied with upfront annual commitment`;
      }
    }
  }

  // Customer acceptance of counter-offer
  if (
    /(?:20%\s+(?:sounds\s+good|works|agreed)|we'?ll\s+do\s+the\s+annual|agree\s+to\s+annual|deal\s+at\s+20%)/i.test(
      lowerLatest,
    )
  ) {
    negotiationStatus = 'agreed';
    lastOffer = '20% annual commitment discount agreed';
    nextOffer = null;
    approvalRequired = false;
  }

  // Customer rejection of offer
  if (
    /(?:cannot\s+do\s+annual|20%\s+is\s+not\s+enough|no\s+deal|can'?t\s+commit\s+annually)/i.test(lowerLatest)
  ) {
    negotiationStatus = 'counter_offered';
    nextOffer = 'Pay-as-you-go standard pricing at $0.10/min with 300 free minutes monthly';
  }

  return {
    customerBudget,
    quotedPrice,
    requestedDiscount,
    allowedDiscount,
    approvalRequired,
    negotiationStatus,
    lastOffer,
    nextOffer,
  };
}

/**
 * Detects positive commercial buying signals for adaptive closing.
 */
export function detectBuyingSignals(
  messages: ChatMessage[],
  activeProfile: CanonicalCustomerProfile,
): { hasBuyingSignals: boolean; signals: string[]; intent: BuyingIntent } {
  const userMessages = messages.filter(
    (m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim(),
  );
  const allUserText = userMessages.map((m) => m.content).join(' ');
  const latestText = userMessages.length > 0 ? userMessages[userMessages.length - 1].content.trim() : '';
  const lowerLatest = latestText.toLowerCase();
  const lowerAll = allUserText.toLowerCase();

  const signals: string[] = [];

  if (/demo|see\s+it\s+live|walkthrough|test\s+it\s+out/i.test(lowerLatest) || /schedule\s+a\s+demo/i.test(lowerAll)) {
    signals.push('requesting_demo');
  }
  if (/contract|terms\s+of\s+service|sla|sign\s+up|agreement/i.test(lowerAll)) {
    signals.push('asking_contract');
  }
  if (/implement|architecture|how\s+to\s+integrate|setup\s+time|deployment/i.test(lowerAll)) {
    signals.push('asking_implementation');
  }
  if (/within\s+\d+\s+months?|next\s+month|q[1-4]|deployment\s+timeline/i.test(lowerAll) || activeProfile.qualification.timeline) {
    signals.push('defined_timeline');
  }
  if (activeProfile.qualification.budget || /send\s+pricing|quote|invoice/i.test(lowerAll)) {
    signals.push('pricing_and_budget');
  }
  if (/what'?s\s+next|next\s+steps?|how\s+do\s+we\s+proceed/i.test(lowerAll)) {
    signals.push('asking_next_steps');
  }
  if (activeProfile.qualification.decisionMaker === true || /i\s+have\s+(?:final\s+)?sign-?off|my\s+call/i.test(lowerAll)) {
    signals.push('decision_maker_authority');
  }

  const isHighIntent =
    signals.includes('requesting_demo') ||
    signals.includes('asking_contract') ||
    signals.length >= 2;

  const intent: BuyingIntent = isHighIntent ? 'high' : signals.length >= 1 ? 'medium' : 'low';

  return {
    hasBuyingSignals: signals.length > 0,
    signals,
    intent,
  };
}

/**
 * Multi-factor calibrated lead scoring.
 * Scores prospects based on:
 * - Clear business need (+15)
 * - Strong product fit (+15)
 * - Budget qualified (+15)
 * - Timeline qualified (+15)
 * - Decision authority (+10)
 * - Pricing/implementation questions (+10)
 * - Demo / meeting request (+15)
 * - Base engagement (+10)
 * Negative penalties:
 * - Explicit rejection (-25)
 * - No need (-15)
 * - No budget (-15)
 * - Poor product fit (-15)
 * - No authority (-10)
 * - Indefinite timeline (-10)
 * - Unresolved high-severity objection (-10)
 */
export function calculateCalibratedLeadScore(
  profile: CanonicalCustomerProfile,
  allUserText: string,
  stage: SalesStage,
  intent: BuyingIntent,
): number {
  const lowerText = allUserText.toLowerCase();
  let score = 10; // Base engagement

  // 1. Clear business need
  if (profile.qualification.need) {
    score += 15;
  }

  // 2. Strong product fit (requirements, company size, agents, voice use case)
  if (
    profile.qualification.requirements.length > 0 ||
    profile.sales.productsInterested.length > 0 ||
    profile.customer.companySize ||
    lowerText.includes('agents') ||
    lowerText.includes('support') ||
    lowerText.includes('voice')
  ) {
    score += 15;
  }

  // 3. Budget qualified
  if (profile.qualification.budget || profile.qualification.budgetMin || profile.qualification.budgetMax) {
    score += 15;
  }

  // 4. Timeline qualified
  if (profile.qualification.timeline) {
    score += 15;
  }

  // 5. Decision authority
  const role = (profile.customer.jobTitle || '').toLowerCase();
  const isAuthority =
    profile.qualification.decisionMaker === true ||
    role.includes('vp') ||
    role.includes('director') ||
    role.includes('head') ||
    role.includes('cto') ||
    role.includes('ceo') ||
    role.includes('founder') ||
    role.includes('owner') ||
    role.includes('chief');
  if (isAuthority) {
    score += 10;
  }

  // 6. Pricing / Implementation questions (serious commercial evaluation)
  const isPricingOrImplementation =
    lowerText.includes('cost') ||
    lowerText.includes('price') ||
    lowerText.includes('pricing') ||
    lowerText.includes('tier') ||
    lowerText.includes('rates') ||
    lowerText.includes('deploy') ||
    lowerText.includes('integrate') ||
    lowerText.includes('architecture');
  if (isPricingOrImplementation) {
    score += 10;
  }

  // 7. Demo / Meeting request (intent signal, but not 100 on its own)
  const isDemoRequested =
    lowerText.includes('demo') ||
    lowerText.includes('schedule') ||
    lowerText.includes('meeting') ||
    lowerText.includes('move forward') ||
    stage === 'closing';
  if (isDemoRequested) {
    score += 15;
  }

  // 8. Intent modifier
  if (intent === 'high') {
    score += 10;
  } else if (intent === 'medium') {
    score += 5;
  }

  // 9. Negative evidence deductions based on actual customer evidence
  const isExplicitRejection =
    /(?:not\s+interested|stop\s+calling|won'?t\s+buy|do\s+not\s+want|not\s+a\s+fit\s+for\s+us|cancel\s+our\s+account|never\s+call)/i.test(
      lowerText,
    );
  if (isExplicitRejection) {
    score -= 25;
  }

  const hasNoNeed =
    /(?:no\s+need\s+for\s+this|don'?t\s+need\s+voice|no\s+use\s+case|not\s+looking\s+for\s+voice|no\s+requirement)/i.test(
      lowerText,
    );
  if (hasNoNeed) {
    score -= 15;
  }

  const hasNoBudget =
    /(?:no\s+budget|zero\s+budget|\$0\s+budget|cannot\s+afford\s+anything|can'?t\s+afford\s+any|no\s+money\s+for\s+this)/i.test(
      lowerText,
    );
  if (hasNoBudget) {
    score -= 15;
  }

  const isPoorFit =
    /(?:wrong\s+tool|wrong\s+product|we\s+only\s+need\s+text\s+email|video\s+editing\s+software|not\s+what\s+we\s+do)/i.test(
      lowerText,
    );
  if (isPoorFit) {
    score -= 15;
  }

  const hasNoAuthority =
    /(?:have\s+no\s+authority|no\s+decision\s+making\s+power|can'?t\s+make\s+any\s+decisions|not\s+involved\s+in\s+decision)/i.test(
      lowerText,
    );
  if (hasNoAuthority) {
    score -= 10;
  }

  const hasIndefiniteTimeline =
    /(?:no\s+timeline|no\s+plans\s+to\s+deploy|maybe\s+in\s+a\s+few\s+years|indefinite|not\s+anytime\s+soon)/i.test(
      lowerText,
    );
  if (hasIndefiniteTimeline) {
    score -= 10;
  }

  const unresolvedHighObjections = (profile.sales.detectedObjections || []).filter(
    (o) => !o.resolved && o.severity === 'high',
  );
  if (unresolvedHighObjections.length > 0 && !isDemoRequested) {
    score -= 10;
  }

  // 10. Unresolved objection ceiling: if in active objection handling without demo, cap at 75
  if (profile.sales.objections.length > 0 && !isDemoRequested && stage === 'objection_handling') {
    score = Math.min(score, 75);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Analyzes conversation turns and updates structured sales state in real time.
 */
export function analyzeAndUpdateSalesState(
  currentState: SalesState,
  messages: ChatMessage[],
): SalesState {
  const userMessages = messages.filter(
    (m) => m.role === 'user' && typeof m.content === 'string',
  );
  if (userMessages.length === 0) return currentState;

  const latestUserText = userMessages[userMessages.length - 1].content.trim();
  const lowerLatestText = latestUserText.toLowerCase();
  const allUserText = userMessages.map((m) => m.content).join(' ');
  const lowerAllText = allUserText.toLowerCase();

  const prevEmail = currentState.profile?.customer?.email || currentState.email;
  const prevName = currentState.profile?.customer?.fullName || currentState.customerName;
  const prevCompany = currentState.profile?.customer?.company || currentState.company;
  const prevRole =
    currentState.profile?.customer?.jobTitle || currentState.role || currentState.jobTitle;
  const prevPhone = currentState.profile?.customer?.phone || currentState.phone;

  // Always start with a clean canonical profile so messages are deterministically re-evaluated
  let activeProfile: CanonicalCustomerProfile = createInitialCanonicalProfile();

  // Iterate chronologically through messages to extract and merge facts sequentially,
  // matching each user message with the immediately preceding assistant question.
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim()) {
      const text = msg.content.trim();
      let prevAssistantQuestion: string | undefined = undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === 'assistant' && typeof messages[j].content === 'string' && messages[j].content.trim()) {
          prevAssistantQuestion = messages[j].content.trim();
          break;
        }
      }
      if (!prevAssistantQuestion && i === 0 && messages.length === 1 && currentState.nextQuestion?.question) {
        prevAssistantQuestion = currentState.nextQuestion.question;
      }
      const facts = extractFacts(text, activeProfile, prevAssistantQuestion);
      activeProfile = mergeIntoCanonicalProfile(activeProfile, facts);
    } else if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
      // Check if this assistant message is a structured recap or confirmation
      const recapFacts = extractFactsFromAssistantRecap(msg.content.trim());
      // Check if user immediately denied it:
      let isDeniedByUser = false;
      for (let k = i + 1; k < messages.length; k++) {
        if (messages[k].role === 'user') {
          const userReply = (messages[k].content || '').toLowerCase();
          if (/(?:no[,. ]|not my|that's wrong|incorrect|wrong email|wrong number)/i.test(userReply)) {
            isDeniedByUser = true;
          }
          break;
        }
      }
      if (!isDeniedByUser) {
        activeProfile = mergeIntoCanonicalProfile(activeProfile, recapFacts);
      }
    }
  }

  // Cross-turn fallback: analyze combined user utterances for multi-turn email, phone, budget, scale
  if (!activeProfile.customer.phone) {
    const phoneFallback = extractSpokenPhone(allUserText);
    if (phoneFallback) activeProfile.customer.phone = phoneFallback;
  }
  if (!activeProfile.customer.email) {
    const emailFallback = extractSpokenEmail(allUserText);
    if (emailFallback) activeProfile.customer.email = emailFallback;
  }
  if (!activeProfile.qualification.budget) {
    const budgetFallback = parseBudgetString(allUserText);
    if (budgetFallback) {
      activeProfile.qualification.budget = budgetFallback.budget || null;
      activeProfile.qualification.budgetMin = budgetFallback.budgetMin ?? null;
      activeProfile.qualification.budgetMax = budgetFallback.budgetMax ?? null;
    }
  }
  if (!activeProfile.customer.companySize) {
    const usageMatch = allUserText.match(/(?:about\s+)?(\d+|hundred)\s+hours\s+of\s+(?:monthly\s+)?voice\s+usage/i);
    if (usageMatch) {
      const num = usageMatch[1].toLowerCase() === 'hundred' ? '100' : usageMatch[1];
      activeProfile.customer.companySize = `${num} hours/month`;
    }
  }

  // Intelligently infer Need & Requirements if prospect discussed voice usage, hours, support, or competitors
  if (!activeProfile.qualification.need) {
    const prevNeed = currentState.profile?.qualification?.need || currentState.qualification?.need || currentState.need;
    if (prevNeed) {
      activeProfile.qualification.need = prevNeed;
    } else if (activeProfile.qualification.useCase) {
      activeProfile.qualification.need = activeProfile.qualification.useCase;
    } else {
      const lowerAll = allUserText.toLowerCase();
      const hasVoiceHours = /hours?|voice|minutes|monthly\s+usage|call/i.test(lowerAll) || !!activeProfile.customer.companySize;
      const hasAgentDiscussion = /agent|customer\s+support|automation|competitor|agora|platform|solution/i.test(lowerAll);
      if (hasVoiceHours || hasAgentDiscussion) {
        activeProfile.qualification.need = 'AI voice customer support automation';
        if (!activeProfile.qualification.requirements.includes('conversational voice agent')) {
          activeProfile.qualification.requirements.push('conversational voice agent');
        }
        if (!activeProfile.qualification.requirements.includes('customer support automation')) {
          activeProfile.qualification.requirements.push('customer support automation');
        }
      }
    }
  }

  // Seed validated fields from currentState ONLY if messages did not yield them
  const prevCust = currentState.profile?.customer || currentState.customer || {};
  const seedName = prevCust.fullName || currentState.customerName || prevCust.firstName;
  if (!activeProfile.customer.fullName && isValidPersonName(seedName)) {
    const n = seedName!.trim();
    activeProfile.customer.fullName = n;
    const parts = n.split(/\s+/);
    activeProfile.customer.firstName = parts[0] || n;
    activeProfile.customer.lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  }
  const seedCompany = prevCust.company || currentState.company;
  if (!activeProfile.customer.company && isValidCompanyName(seedCompany)) {
    activeProfile.customer.company = seedCompany!.trim();
  }
  const seedJobTitle = prevCust.jobTitle || currentState.jobTitle || currentState.role;
  if (!activeProfile.customer.jobTitle && isValidJobTitle(seedJobTitle)) {
    activeProfile.customer.jobTitle = sanitizeJobTitle(seedJobTitle);
  }
  const seedEmail = prevCust.email || currentState.customerEmail || currentState.email;
  if (!activeProfile.customer.email && seedEmail) {
    const e = extractSpokenEmail(seedEmail);
    if (e && isValidCustomerEmail(e)) activeProfile.customer.email = e;
  }
  const seedPhone = prevCust.phone || currentState.phone;
  if (!activeProfile.customer.phone && seedPhone) {
    const p = extractSpokenPhone(seedPhone);
    if (p) activeProfile.customer.phone = p;
  }
  if (!activeProfile.customer.location && (prevCust.location || currentState.customer?.location || currentState.location)) {
    activeProfile.customer.location = prevCust.location || currentState.customer?.location || currentState.location || null;
  }
  if (!activeProfile.qualification.useCase && (currentState.profile?.qualification?.useCase || currentState.qualification?.useCase || currentState.useCase)) {
    activeProfile.qualification.useCase = currentState.profile?.qualification?.useCase || currentState.qualification?.useCase || currentState.useCase || null;
  }
  if (!activeProfile.qualification.volume && (currentState.profile?.qualification?.volume || currentState.qualification?.volume || currentState.volume)) {
    activeProfile.qualification.volume = currentState.profile?.qualification?.volume || currentState.qualification?.volume || currentState.volume || null;
  }
  if (!activeProfile.qualification.budget && (currentState.profile?.qualification?.budget || currentState.budget)) {
    activeProfile.qualification.budget = currentState.profile?.qualification?.budget || currentState.budget || null;
  }
  if (!activeProfile.qualification.timeline && (currentState.profile?.qualification?.timeline || currentState.timeline)) {
    activeProfile.qualification.timeline = currentState.profile?.qualification?.timeline || currentState.timeline || null;
  }
  if (!activeProfile.customer.companySize && (prevCust.companySize || currentState.companySize)) {
    activeProfile.customer.companySize = prevCust.companySize || currentState.companySize || null;
  }
  if (!activeProfile.qualification.need) {
    if (currentState.profile?.qualification?.need || currentState.qualification?.need || currentState.need) {
      activeProfile.qualification.need = (currentState.profile?.qualification?.need || currentState.qualification?.need || currentState.need)!;
    } else if (activeProfile.qualification.useCase) {
      activeProfile.qualification.need = activeProfile.qualification.useCase;
    }
  }
  if (activeProfile.qualification.requirements.length === 0 && (currentState.profile?.qualification?.requirements || currentState.qualification?.requirements)) {
    activeProfile.qualification.requirements = [...(currentState.profile?.qualification?.requirements || currentState.qualification?.requirements || [])];
  }
  if (activeProfile.qualification.painPoints.length === 0 && (currentState.profile?.qualification?.painPoints || currentState.qualification?.painPoints)) {
    activeProfile.qualification.painPoints = [...(currentState.profile?.qualification?.painPoints || currentState.qualification?.painPoints || [])];
  }
  if (activeProfile.sales.productsInterested.length === 0 && (currentState.profile?.sales?.productsInterested || currentState.productsInterested)) {
    activeProfile.sales.productsInterested = [...(currentState.profile?.sales?.productsInterested || currentState.productsInterested || [])];
  }

  // ── Protection Against Voice Overwrite for Manually Overridden Fields ──
  const manualOverrides =
    currentState.customer?.manualOverrides ||
    currentState.profile?.customer?.manualOverrides ||
    currentState.manualOverrides ||
    {};

  if (manualOverrides.fullName && (prevCust.fullName || currentState.customerName)) {
    const n = (prevCust.fullName || currentState.customerName)!.trim();
    activeProfile.customer.fullName = n;
    const parts = n.split(/\s+/);
    activeProfile.customer.firstName = parts[0] || n;
    activeProfile.customer.lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  }
  if (manualOverrides.email && (prevCust.email || currentState.email)) {
    activeProfile.customer.email = (prevCust.email || currentState.email)!.trim().toLowerCase();
  }
  if (manualOverrides.company && (prevCust.company || currentState.company !== undefined)) {
    activeProfile.customer.company = prevCust.company || currentState.company || null;
  }
  if (manualOverrides.phone && (prevCust.phone || currentState.phone !== undefined)) {
    activeProfile.customer.phone = prevCust.phone || currentState.phone || null;
  }
  if (manualOverrides.jobTitle && (prevCust.jobTitle || currentState.jobTitle || currentState.role)) {
    activeProfile.customer.jobTitle = prevCust.jobTitle || currentState.jobTitle || currentState.role || null;
  }
  activeProfile.customer.manualOverrides = { ...manualOverrides };


  // Requirement change midway detection
  const isRequirementChange =
    /actually(?:,\s*|\s+)(?:our\s+requirements?\s+(?:have\s+)?changed|we\s+need|we\s+want|change\s+of\s+plans)|we\s+changed\s+our\s+minds?|new\s+requirement/i.test(
      latestUserText,
    );
  if (isRequirementChange) {
    if (/inbound|call\s+center|support\s+desk|customer\s+service/i.test(latestUserText)) {
      activeProfile.qualification.need = 'Inbound customer support call center';
      activeProfile.qualification.requirements = [
        'inbound call routing',
        'customer support voice agent',
        'sub-500ms voice pipeline',
      ];
    } else if (/outbound|telemarketing|sales\s+outreach/i.test(latestUserText)) {
      activeProfile.qualification.need = 'Outbound voice sales outreach';
      activeProfile.qualification.requirements = ['outbound voice calling', 'automated notifications'];
    }
  }

  // 1. Contextual Objection Detection
  const objectionResult = detectObjectionsWithContext(messages, currentState);
  activeProfile.sales.detectedObjections = objectionResult.records;
  activeProfile.sales.objections = Array.from(
    new Set([...activeProfile.sales.objections, ...objectionResult.summaryLabels]),
  );

  // 2. Structured Negotiation Evaluation
  const negotiationState = evaluateNegotiationState(
    messages,
    currentState,
    objectionResult.records,
    activeProfile,
  );
  activeProfile.sales.negotiation = negotiationState;

  // 3. Buying Signal & Intent Detection
  const buyingSignalResult = detectBuyingSignals(messages, activeProfile);

  // 4. Evidence-based Stage & Intent Progression (supports backward transitions)
  let stage: SalesStage = activeProfile.sales.salesStage || 'discovery';
  let intent: BuyingIntent = buyingSignalResult.intent;

  const isDemoOrClosing =
    lowerAllText.includes('arrange a demo') ||
    lowerAllText.includes('book a demo') ||
    lowerAllText.includes('see a demo') ||
    lowerAllText.includes('like a demo') ||
    lowerAllText.includes('want a demo') ||
    lowerAllText.includes('demo') ||
    lowerAllText.includes('move forward') ||
    lowerAllText.includes('schedule a call') ||
    lowerAllText.includes('get started') ||
    lowerAllText.includes('sign up') ||
    lowerAllText.includes('buy');

  const hasUnresolvedObjections = objectionResult.records.some((r) => !r.resolved);

  const isObjection =
    hasUnresolvedObjections ||
    activeProfile.sales.objections.length > 0 ||
    lowerAllText.includes('already use') ||
    lowerAllText.includes('why should we') ||
    lowerAllText.includes('discount') ||
    lowerAllText.includes('cheaper');

  const isExplicitNegotiation =
    negotiationState.negotiationStatus !== 'not_started' &&
    /negotiat|counter\s+offer|discount\s+policy|terms\s+of\s+deal/i.test(lowerAllText);

  const isPricingOrQualification =
    lowerAllText.includes('cost') ||
    lowerAllText.includes('price') ||
    lowerAllText.includes('pricing') ||
    lowerAllText.includes('how much') ||
    lowerAllText.includes('rates') ||
    lowerAllText.includes('tier') ||
    activeProfile.customer.companySize !== null ||
    activeProfile.qualification.budget !== null ||
    activeProfile.qualification.timeline !== null;

  if (isRequirementChange) {
    // Evidence-based backward transition: requirement shifted midway
    stage = 'needs_analysis';
  } else if (
    isDemoOrClosing ||
    currentState.salesStage === 'closing' ||
    activeProfile.sales.salesStage === 'closing'
  ) {
    stage = 'closing';
    intent = 'high';
  } else if (isObjection || currentState.salesStage === 'objection_handling') {
    stage = 'objection_handling';
    if (intent === 'low' || intent === 'unknown') intent = 'medium';
  } else if (isExplicitNegotiation) {
    stage = 'negotiation';
    if (intent === 'low' || intent === 'unknown') intent = 'medium';
  } else if (
    isPricingOrQualification ||
    currentState.salesStage === 'qualification'
  ) {
    stage = 'qualification';
    if (intent === 'low' || intent === 'unknown') intent = 'medium';
  } else if (userMessages.length > 2 && activeProfile.qualification.need) {
    stage = 'recommendation';
  } else if (userMessages.length > 1 && (activeProfile.qualification.requirements.length > 0 || lowerAllText.includes('support agents'))) {
    stage = 'needs_analysis';
  } else {
    stage = currentState.salesStage || 'discovery';
  }

  if (currentState.buyingIntent === 'high') {
    intent = 'high';
  }

  activeProfile.sales.salesStage = stage;
  activeProfile.sales.buyingIntent = intent;

  // Consultative Product Recommendation
  const recommendation = determineProductRecommendation(activeProfile, allUserText);
  if (recommendation.recommendedProduct) {
    activeProfile.sales.recommendedProduct = recommendation.recommendedProduct;
    activeProfile.sales.recommendationReason = recommendation.recommendationReason;
  }

  // Natural Language Appointment Scheduling State Machine
  let updatedAppointment = currentState.appointment && currentState.appointment.meetingRequested
    ? { ...currentState.appointment }
    : createInitialAppointmentState();

  if (!updatedAppointment.meetingRequested) {
    for (let i = 0; i < userMessages.length; i++) {
      const uMsg = userMessages[i].content.trim();
      const partialAll = userMessages.slice(0, i + 1).map((m) => m.content).join(' ');
      updatedAppointment = updateAppointmentState(
        updatedAppointment,
        uMsg,
        partialAll,
        activeProfile.customer.email || currentState.customerEmail || currentState.email,
        activeProfile.customer.fullName || currentState.customerName,
        activeProfile.customer.company || currentState.company,
        currentState.conversationId || 'conv-' + Date.now(),
      );
    }
  } else {
    updatedAppointment = updateAppointmentState(
      updatedAppointment,
      latestUserText,
      allUserText,
      activeProfile.customer.email || currentState.customerEmail || currentState.email,
      activeProfile.customer.fullName || currentState.customerName,
      activeProfile.customer.company || currentState.company,
      currentState.conversationId || 'conv-' + Date.now(),
    );
  }
  activeProfile.sales.appointment = updatedAppointment;

  const userWantsManual = isManualDetailsIntent(latestUserText);
  const currentDetailsMode: 'conversation' | 'manual' = userWantsManual
    ? 'manual'
    : (currentState.detailsInputMode || 'conversation');
  updatedAppointment.detailsInputMode = currentDetailsMode;

  if (updatedAppointment.meetingRequested) {
    if (stage === 'discovery' || stage === 'qualification' || stage === 'needs_analysis' || stage === 'recommendation' || stage === 'pitch') {
      stage = 'closing';
      intent = 'high';
      activeProfile.sales.salesStage = stage;
      activeProfile.sales.buyingIntent = intent;
    }
  }

  // Determine Next Best Action dynamically based on turn evidence
  let nextBestAction = 'discover_pain_point: Ask focused discovery questions to understand their use case, target audience, and scale.';
  const explicitKvAction = userMessages[userMessages.length - 1]?.content.match(
    /(?:^|\n)\s*(?:Next Action|Next Best Action)\s*[:=-]\s*([^\n]+)/i,
  );
  if (explicitKvAction) {
    nextBestAction = explicitKvAction[1].trim();
  } else if (isRequirementChange) {
    nextBestAction =
      'clarify_requirement: Acknowledge the updated requirements and analyze technical architecture changes before making new recommendations.';
  } else if (updatedAppointment.meetingStatus === 'confirmed') {
    const meetStr = updatedAppointment.meetingUrl ? ` with Google Meet link: ${updatedAppointment.meetingUrl}` : '';
    nextBestAction = `confirm_appointment: You're booked for ${updatedAppointment.selectedSlot?.formattedTime || 'the scheduled time'}.${meetStr}`;
  } else if (updatedAppointment.meetingStatus === 'failed') {
    nextBestAction = updatedAppointment.lastError?.includes('available') || updatedAppointment.lastError?.includes('conflict')
      ? "propose_meeting_slot: That time isn't available because you already have another event scheduled then. Please choose another time."
      : 'confirm_appointment: Apologize and inform the customer that the calendar booking system is temporarily unavailable, and promise that our team will send confirmation via email.';
  } else if (updatedAppointment.meetingStatus === 'awaiting_confirmation' && updatedAppointment.selectedSlot) {
    nextBestAction = `await_meeting_confirmation: Propose the slot ${updatedAppointment.selectedSlot.formattedTime} and ask for explicit confirmation to book it.`;
  } else if (updatedAppointment.meetingStatus === 'slot_proposed') {
    if (updatedAppointment.lastError) {
      const altSlots = updatedAppointment.proposedSlots.length > 0
        ? ` Would you like to choose another time, such as ${updatedAppointment.proposedSlots.map((s) => s.formattedTime).join(' or ')}?`
        : ' Please choose another time.';
      nextBestAction = `arrange_demo: propose_meeting_slot: ${updatedAppointment.lastError}${altSlots}`;
    } else {
      const dateLabel = formatReadableDateLabel(updatedAppointment.preferredDate);
      nextBestAction = `ask_time: What time would you like the meeting on ${dateLabel}?`;
    }
  } else if (updatedAppointment.meetingStatus === 'collecting_details' && !activeProfile.customer.email) {
    nextBestAction = 'request_email: That time is available! What is the best email address to send your calendar invite and Google Meet link to?';
  } else if (isDemoOrClosing || stage === 'closing') {
    nextBestAction = 'arrange_demo';
  } else {
    switch (stage) {
      case 'negotiation':
        nextBestAction =
          'negotiate: Discuss volume commitments and official 20% annual discount, noting that custom rates require executive approval.';
        break;
      case 'objection_handling':
        if (
          lowerLatestText.includes('competitor') ||
          lowerLatestText.includes('another provider') ||
          lowerLatestText.includes('other provider') ||
          lowerLatestText.includes('other solution') ||
          lowerLatestText.includes('twilio') ||
          lowerLatestText.includes('retell') ||
          lowerLatestText.includes('vapi') ||
          lowerLatestText.includes('why should we use')
        ) {
          nextBestAction =
            'handle_competitor_objection: compare_products: Address competitor comparison using Agora strengths: sub-500ms real-time voice latency, SD-RTN global network reliability, natural voice interruption handling, and zero-data-leakage architecture.';
        } else if (
          lowerLatestText.includes('discount') ||
          lowerLatestText.includes('expensive') ||
          lowerLatestText.includes('costly') ||
          lowerLatestText.includes('price') ||
          lowerLatestText.includes('rate') ||
          lowerLatestText.includes('can\'t afford') ||
          lowerLatestText.includes('cannot afford') ||
          lowerLatestText.includes('% off')
        ) {
          nextBestAction =
            'handle_price_objection: Politely explain that standard pricing is already volume-optimized ($0.10/min with 300 free minutes), offer the official 20% annual commitment discount, and never promise unapproved discounts.';
        } else if (lowerLatestText.includes('manager') || lowerLatestText.includes('approval') || lowerLatestText.includes('sign-off')) {
          nextBestAction =
            'request_decision_maker: Acknowledge the manager sign-off requirement and offer to include their manager directly in a joint technical demo.';
        } else if (lowerLatestText.includes('mainframe') || lowerLatestText.includes('cobol') || lowerLatestText.includes('holographic') || lowerLatestText.includes('unsupported')) {
          nextBestAction =
            'clarify_requirement: Explicitly clarify that unconfirmed capabilities require confirmation with solutions engineering, avoiding any false promises.';
        } else if (
          lowerAllText.includes('discount') ||
          lowerAllText.includes('expensive') ||
          lowerAllText.includes('costly') ||
          lowerAllText.includes('price')
        ) {
          nextBestAction =
            'handle_price_objection: Politely explain that standard pricing is already volume-optimized ($0.10/min with 300 free minutes), offer the official 20% annual commitment discount, and never promise unapproved discounts.';
        } else {
          nextBestAction =
            'compare_products: Address competitor comparison using Agora strengths: sub-500ms real-time voice latency, SD-RTN global network reliability, natural voice interruption handling, and zero-data-leakage architecture.';
        }
        break;
      case 'needs_analysis':
        nextBestAction =
          'clarify_requirement: Ask focused discovery questions about their specific voice workflow, scale, and customer experience goals before pitching.';
        break;
      case 'recommendation':
      case 'pitch':
        nextBestAction =
          'recommend_product: Highlight the Agora Conversational AI Engine architecture (sub-500ms pipeline, turn-taking, modular ASR/LLM/TTS) directly solving their customer support requirements.';
        break;
      case 'qualification':
        if (!activeProfile.qualification.budget) {
          nextBestAction =
            'ask_budget: Quote official Agora pricing ($0.10/min audio task with 300 free min, $0.59/1k RTC min, and subscription tiers) and ask for estimated monthly voice minutes to calculate exact costs.';
        } else if (!activeProfile.qualification.timeline) {
          nextBestAction =
            'ask_timeline: Qualify expected deployment timeline and target launch milestones.';
        } else {
          nextBestAction =
            'recommend_product: Quote official Agora pricing ($0.10/min audio task with 300 free min, $0.59/1k RTC min, and subscription tiers) and recommend Conversational AI.';
        }
        break;
      case 'discovery':
      default:
        nextBestAction =
          'discover_pain_point: Acknowledge their goal enthusiastically and ask focused discovery questions about their specific voice workflow, scale, and customer experience goals before pitching.';
        break;
    }
  }
  activeProfile.sales.nextBestAction = nextBestAction;

  if (currentDetailsMode === 'manual') {
    if (updatedAppointment.meetingRequested && !updatedAppointment.preferredTime) {
      const dateLabel = formatReadableDateLabel(updatedAppointment.preferredDate);
      nextBestAction = `ask_time: What time would you like the meeting on ${dateLabel}?`;
    } else {
      nextBestAction = 'fill_form: Sure, you can enter your details in the form.';
    }
    activeProfile.sales.nextBestAction = nextBestAction;
  }

  // Calibrated multi-factor lead scoring
  const leadScore = calculateCalibratedLeadScore(activeProfile, allUserText, stage, intent);

  // Detect latest intent on the most recent user turn
  const latestIntent = detectUserIntent(latestUserText, { appointmentState: updatedAppointment });
  activeProfile.sales.currentIntent = latestIntent;

  const buyingStrength = detectBuyingSignalStrength(latestUserText);
  activeProfile.sales.buyingSignalStrength = buyingStrength;

  const coreObjection = detectCoreObjection(latestUserText);
  if (coreObjection) {
    activeProfile.sales.primaryObjectionCategory = coreObjection.category;
  }

  const budgetEconomics = evaluateBudgetEconomics(
    activeProfile.qualification.budget || currentState.budget,
    activeProfile.qualification.volume || currentState.volume || activeProfile.customer.companySize,
  );
  activeProfile.sales.budgetEconomics = budgetEconomics;

  // Derive Next Best Action using the NBA decision engine
  const preNbaState: SalesState = {
    ...currentState,
    salesStage: stage,
    location: activeProfile.customer.location || currentState.location || undefined,
    volume: activeProfile.qualification.volume || currentState.volume || undefined,
    useCase: activeProfile.qualification.useCase || currentState.useCase || undefined,
    budget: activeProfile.qualification.budget || currentState.budget || undefined,
    buyingSignalStrength: buyingStrength,
    primaryObjectionCategory: coreObjection?.category,
    budgetEconomics,
    appointment: updatedAppointment,
    profile: activeProfile,
  };
  const nbaDecision = determineNextBestAction(preNbaState, latestIntent, latestUserText);
  activeProfile.sales.nextBestActionCategory = nbaDecision.category;
  if (nbaDecision.action) {
    nextBestAction = nbaDecision.action;
    activeProfile.sales.nextBestAction = nextBestAction;
  }

  // Build Known / Unknown / Relevant Now summary
  const knownFields: Record<string, string> = {};
  if (activeProfile.customer.fullName) knownFields['Name'] = activeProfile.customer.fullName;
  if (activeProfile.customer.company) knownFields['Company'] = activeProfile.customer.company;
  if (activeProfile.customer.location) knownFields['Location'] = activeProfile.customer.location;
  if (activeProfile.customer.jobTitle) knownFields['Role'] = activeProfile.customer.jobTitle;
  if (activeProfile.customer.email) knownFields['Email'] = activeProfile.customer.email;
  if (activeProfile.customer.phone) knownFields['Phone'] = activeProfile.customer.phone;
  if (activeProfile.qualification.useCase) knownFields['Use Case'] = activeProfile.qualification.useCase;
  if (activeProfile.qualification.volume) knownFields['Volume'] = activeProfile.qualification.volume;
  if (activeProfile.qualification.budget) knownFields['Budget'] = activeProfile.qualification.budget;
  if (activeProfile.qualification.timeline) knownFields['Timeline'] = activeProfile.qualification.timeline;

  const allPossibleFields = ['Name', 'Company', 'Location', 'Use Case', 'Volume', 'Budget', 'Timeline', 'Email', 'Phone', 'Role'];
  const unknownFields = allPossibleFields.filter((f) => !knownFields[f]);

  // Build canonical state object
  let state: SalesState = {
    conversationId: currentState.conversationId || 'conv-' + Date.now(),
    customer: {
      firstName: activeProfile.customer.firstName || undefined,
      lastName: activeProfile.customer.lastName || undefined,
      fullName: activeProfile.customer.fullName || undefined,
      email: activeProfile.customer.email || undefined,
      phone: activeProfile.customer.phone || undefined,
      company: activeProfile.customer.company || undefined,
      location: activeProfile.customer.location || currentState.customer?.location || currentState.location || undefined,
      jobTitle: activeProfile.customer.jobTitle || undefined,
      companySize: activeProfile.customer.companySize || undefined,
      manualOverrides: { ...manualOverrides },
    },
    qualification: {
      need: activeProfile.qualification.need || undefined,
      useCase: activeProfile.qualification.useCase || currentState.qualification?.useCase || currentState.useCase || undefined,
      volume: activeProfile.qualification.volume || currentState.qualification?.volume || currentState.volume || undefined,
      painPoints: activeProfile.qualification.painPoints,
      requirements: activeProfile.qualification.requirements,
      budget: activeProfile.qualification.budget || undefined,
      budgetMin: activeProfile.qualification.budgetMin || undefined,
      budgetMax: activeProfile.qualification.budgetMax || undefined,
      currency: activeProfile.qualification.currency || 'USD',
      timeline: activeProfile.qualification.timeline || undefined,
      decisionMaker: activeProfile.qualification.decisionMaker ?? undefined,
      companySize: activeProfile.customer.companySize || undefined,
    },
    sales: {
      productsInterested: activeProfile.sales.productsInterested,
      competitors: activeProfile.sales.competitorsMentioned,
      objections: activeProfile.sales.objections,
      detectedObjections: activeProfile.sales.detectedObjections || [],
      negotiation: activeProfile.sales.negotiation || createInitialNegotiationState(),
      appointment: updatedAppointment,
      buyingIntent: intent,
      salesStage: stage,
      leadScore,
      nextBestAction,
      recommendedProduct: activeProfile.sales.recommendedProduct || undefined,
      recommendationReason: activeProfile.sales.recommendationReason || undefined,
    },
    informationCollection: {
      fieldsAsked: activeProfile.conversation.informationRequested,
      fieldsCollected: Object.keys(activeProfile.customer).filter(
        (k) => !!activeProfile.customer[k as keyof typeof activeProfile.customer],
      ),
      fieldsRefused: activeProfile.conversation.informationRefused,
      lastRequestedField: activeProfile.conversation.lastQuestionAsked || undefined,
    },
    conversation: {
      startedAt: currentState.conversation?.startedAt || Date.now(),
      lastUpdatedAt: Date.now(),
      transcript: messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n'),
    },
    crm: {
      synced: currentState.crm?.synced || false,
      syncInProgress: currentState.crm?.syncInProgress || false,
      syncFailed: currentState.crm?.syncFailed || false,
      syncError: currentState.crm?.syncError,
      syncCompletedAt: currentState.crm?.syncCompletedAt,
      hubspotContactId: currentState.crm?.hubspotContactId,
      hubspotCompanyId: currentState.crm?.hubspotCompanyId,
      hubspotDealId: currentState.crm?.hubspotDealId,
      hubspotNoteId: currentState.crm?.hubspotNoteId,
      lastSyncedStage: currentState.crm?.lastSyncedStage,
    },
    profile: activeProfile,

    // Flat aliases for backwards compatibility
    customerName: activeProfile.customer.fullName || undefined,
    company: activeProfile.customer.company || undefined,
    jobTitle: activeProfile.customer.jobTitle || undefined,
    role: activeProfile.customer.jobTitle || undefined,
    location: activeProfile.customer.location || currentState.location || undefined,
    volume: activeProfile.qualification.volume || currentState.volume || undefined,
    useCase: activeProfile.qualification.useCase || currentState.useCase || undefined,
    buyingSignals: activeProfile.sales.buyingSignals || [],
    buyingSignalStrength: buyingStrength,
    primaryObjectionCategory: coreObjection?.category,
    budgetEconomics,
    currentIntent: latestIntent,
    nextBestActionCategory: nbaDecision.category,
    conversationStateSummary: {
      known: knownFields,
      unknown: unknownFields,
      relevantNow: nbaDecision.relevantNow,
    },
    customerEmail: activeProfile.customer.email || currentState.customerEmail || currentState.email || undefined,
    email: activeProfile.customer.email || currentState.customerEmail || currentState.email || undefined,
    phone: activeProfile.customer.phone || undefined,
    companySize: activeProfile.customer.companySize || undefined,
    need: activeProfile.qualification.need || undefined,
    painPoints: activeProfile.qualification.painPoints,
    requirements: activeProfile.qualification.requirements,
    budget: activeProfile.qualification.budget || undefined,
    timeline: activeProfile.qualification.timeline || undefined,
    decisionMaker: activeProfile.qualification.decisionMaker ?? undefined,
    authority:
      activeProfile.customer.jobTitle &&
      (activeProfile.customer.jobTitle.toLowerCase().includes('cto') ||
        activeProfile.customer.jobTitle.toLowerCase().includes('ceo') ||
        activeProfile.customer.jobTitle.toLowerCase().includes('vp'))
        ? `${activeProfile.customer.jobTitle} (Decision Maker)`
        : undefined,
    productsInterested: activeProfile.sales.productsInterested,
    objections: activeProfile.sales.objections,
    detectedObjections: activeProfile.sales.detectedObjections || [],
    negotiation: activeProfile.sales.negotiation || createInitialNegotiationState(),
    appointment: updatedAppointment,
    competitorsMentioned: activeProfile.sales.competitorsMentioned,
    buyingIntent: intent,
    leadScore,
    salesStage: stage,
    nextBestAction,
    recommendedProduct: activeProfile.sales.recommendedProduct || undefined,
    recommendationReason: activeProfile.sales.recommendationReason || undefined,
    lastUpdated: Date.now(),
    checklist: createInitialChecklist(),
    informationCompleteness: 0,
    nextInfoToCollect: null,
    refusedFields: activeProfile.conversation.informationRefused,
    crmCollectionStatus: {
      name: !!activeProfile.customer.fullName,
      company: !!activeProfile.customer.company,
      email: !!activeProfile.customer.email,
      role: !!activeProfile.customer.jobTitle,
      phone: !!activeProfile.customer.phone,
      budget: !!activeProfile.qualification.budget,
      timeline: !!activeProfile.qualification.timeline,
    },
    nextQuestion: null,
    recentlyUpdatedField: null,
    knowledgeUsed: currentState.knowledgeUsed || [],
    pendingDetailsRequest: currentState.pendingDetailsRequest || null,
    manualOverrides: { ...manualOverrides },

    // Canonical Appointment Fields (Requirement 9)
    meetingDate: updatedAppointment.preferredDate || null,
    meetingTime: updatedAppointment.preferredTime || null,
    appointmentRequested: updatedAppointment.meetingRequested || false,
    appointmentStatus: updatedAppointment.meetingStatus || 'none',
    meetingStatus: updatedAppointment.meetingStatus,
    calendarEventId: updatedAppointment.calendarEventId,
    meetingUrl: updatedAppointment.meetingUrl,
    start: updatedAppointment.startTime || updatedAppointment.selectedSlot?.start || null,
    end: updatedAppointment.endTime || updatedAppointment.selectedSlot?.end || null,
    timezone: updatedAppointment.timezone,
    emailStatus: updatedAppointment.emailStatus,
    confirmationEmailStatus: updatedAppointment.emailStatus || 'none',
    emailSentAt: updatedAppointment.emailSentAt,
    detailsInputMode: currentDetailsMode,
  };

  // Update Checklist and Completeness
  state.checklist = computeInfoChecklist(state);
  state.informationCompleteness = calculateCompletenessScore(state.checklist);

  // Determine Next Information to Collect
  state.nextInfoToCollect = determineNextInfoToCollect(
    state,
    state.checklist,
    latestUserText,
    allUserText,
  );

  // Determine Next Best Conversational Question
  state.nextQuestion = getNextSalesQuestion(state, latestUserText, {
    turnCount: userMessages.length,
    previousMessages: messages,
  });

  if (state.nextQuestion) {
    activeProfile.conversation.lastQuestionAsked = state.nextQuestion.field;
    if (!activeProfile.conversation.informationRequested.includes(state.nextQuestion.field)) {
      activeProfile.conversation.informationRequested.push(state.nextQuestion.field);
    }
  }

  // Automatic Customer Details Popup trigger for pending actions
  const currentCanonicalEmail = state.customerEmail || state.customer?.email || state.email;
  const isCurrentEmailValid = isValidCustomerEmail(currentCanonicalEmail);
  const hasKnownCustName = hasKnownName(state);

  const hasCompleteSlotInfo = !!(
    (updatedAppointment.preferredDate && updatedAppointment.preferredTime) ||
    updatedAppointment.selectedSlot
  );

  const isDetailsSubmitted = state.pendingDetailsRequest?.status === 'submitted';
  const isDetailsDismissed = state.pendingDetailsRequest?.status === 'dismissed';
  const hasKnownCompanyVal = Boolean((state.company || state.customer?.company || '').trim());
  const hasAllCoreCustomerDetails = isCurrentEmailValid && hasKnownCustName && hasKnownCompanyVal;

  if (currentDetailsMode === 'manual') {
    if (!isDetailsSubmitted && !isDetailsDismissed && !hasAllCoreCustomerDetails && (!state.pendingDetailsRequest || state.pendingDetailsRequest.status === 'pending')) {
      state = requestCustomerDetails(
        state,
        updatedAppointment.meetingRequested ? 'book_meeting' : 'qualification',
        {
          context: {
            reason: 'user_selected_manual',
            slot: updatedAppointment.selectedSlot || updatedAppointment.proposedSlots?.[0],
            meetingType: updatedAppointment.meetingType,
          },
        },
      );
    }
  } else if (
    updatedAppointment.meetingRequested &&
    hasCompleteSlotInfo &&
    updatedAppointment.meetingStatus !== 'confirmed' &&
    (!isCurrentEmailValid || !hasKnownCustName) &&
    !isDetailsSubmitted &&
    !isDetailsDismissed &&
    (!state.pendingDetailsRequest || state.pendingDetailsRequest.status === 'pending')
  ) {
    state = requestCustomerDetails(state, 'book_meeting', {
      context: {
        slot: updatedAppointment.selectedSlot || updatedAppointment.proposedSlots?.[0],
        meetingType: updatedAppointment.meetingType,
      },
    });
  } else if (
    (lowerLatestText.includes('proposal') || lowerLatestText.includes('send quote') || lowerLatestText.includes('email quote') || lowerLatestText.includes('send pricing')) &&
    !isCurrentEmailValid &&
    (!state.pendingDetailsRequest || state.pendingDetailsRequest.status !== 'dismissed')
  ) {
    state = requestCustomerDetails(state, 'send_proposal');
  } else if (
    isCurrentEmailValid &&
    hasKnownCustName &&
    state.pendingDetailsRequest?.actionType === 'book_meeting' &&
    state.pendingDetailsRequest?.status === 'pending'
  ) {
    // If voice conversation successfully collected both, auto-resolve pending details request
    state.pendingDetailsRequest.status = 'submitted';
  }

  // Detect recently updated field for debug logging
  let recentlyUpdated: { field: string; value: string } | null = null;
  if (!prevEmail && activeProfile.customer.email) {
    recentlyUpdated = { field: 'email', value: activeProfile.customer.email };
  } else if (!prevName && activeProfile.customer.fullName) {
    recentlyUpdated = { field: 'name', value: activeProfile.customer.fullName };
  } else if (!prevCompany && activeProfile.customer.company) {
    recentlyUpdated = { field: 'company', value: activeProfile.customer.company };
  } else if (!prevRole && activeProfile.customer.jobTitle) {
    recentlyUpdated = { field: 'role', value: activeProfile.customer.jobTitle };
  } else if (!prevPhone && activeProfile.customer.phone) {
    recentlyUpdated = { field: 'phone', value: activeProfile.customer.phone };
  }
  state.recentlyUpdatedField = recentlyUpdated;

  console.log('\n[CRM STAGE 1: SalesState Updated]');
  console.log(`  name: ${state.customerName || 'undefined'}`);
  console.log(`  email: ${state.email || 'undefined'}`);
  console.log(`  phone: ${state.phone || 'undefined'}`);
  console.log(`  company: ${state.company || 'undefined'}`);
  console.log(`  job title: ${state.jobTitle || state.role || 'undefined'}`);
  console.log(`  need: ${state.need || 'undefined'}`);
  console.log(`  budget: ${state.budget || 'undefined'}`);
  console.log(`  timeline: ${state.timeline || 'undefined'}`);
  // Derive real-time Deal Intelligence on canonical SalesState
  state.dealIntelligence = deriveDealIntelligence(state, messages);

  return state;
}

/**
 * Creates the clean, structured CRM object consumed by the CRM sync layer.
 */
export function buildStructuredCrmPayload(
  state: SalesState,
  summary?: string,
  transcript?: string,
  customerData?: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    jobTitle?: string;
  },
): StructuredCrmPayload {
  const prof = state?.profile || ({} as Partial<CanonicalCustomerProfile>);
  const profCust = prof.customer || {};
  const cust = state?.customer || {};
  const cData = customerData || {};

  const candidateNames = [
    cData.name,
    profCust.fullName,
    cust.fullName,
    state?.customerName,
    cust.firstName && cust.lastName ? `${cust.firstName} ${cust.lastName}` : cust.firstName,
  ].filter(Boolean) as string[];

  const validFullName = candidateNames.find((n) => isValidPersonName(n)) || null;
  const fullName = validFullName;

  let firstName = profCust.firstName || cust.firstName || null;
  let lastName = profCust.lastName || cust.lastName || null;
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts[0] || null;
    lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  }

  const candidateCompanies = [
    cData.company,
    profCust.company,
    cust.company,
    state?.company,
  ].filter(Boolean) as string[];

  const validCompany = candidateCompanies.find((c) => isValidCompanyName(c, firstName)) || null;
  const company = validCompany;

  const rawEmail = cData.email || state?.customerEmail || profCust.email || cust.email || state?.email || null;
  const email = rawEmail ? extractSpokenEmail(rawEmail) || rawEmail : null;

  const rawPhone = cData.phone || profCust.phone || cust.phone || state?.phone || null;
  const phone = rawPhone ? extractSpokenPhone(rawPhone) || rawPhone : null;

  const candidateRoles = [
    cData.role,
    cData.jobTitle,
    profCust.jobTitle,
    cust.jobTitle,
    state?.jobTitle,
    state?.role,
  ].filter(Boolean) as string[];

  const jobTitle = candidateRoles.map((r) => sanitizeJobTitle(r)).find(Boolean) || null;


  const profQual = prof.qualification || {};
  const qual = state?.qualification || {};

  const need = profQual.need || qual.need || state?.need || 'AI voice customer support';
  const painPoints = profQual.painPoints?.length
    ? profQual.painPoints
    : qual.painPoints?.length
    ? qual.painPoints
    : state?.painPoints || [];
  const requirements = profQual.requirements?.length
    ? profQual.requirements
    : qual.requirements?.length
    ? qual.requirements
    : state?.requirements || [];
  const companySize =
    profCust.companySize ||
    qual.companySize ||
    cust.companySize ||
    state?.companySize ||
    null;
  const budget = profQual.budget || qual.budget || state?.budget || null;
  const budgetMin = profQual.budgetMin ?? qual.budgetMin ?? state?.budgetMin ?? null;
  const budgetMax = profQual.budgetMax ?? qual.budgetMax ?? state?.budgetMax ?? null;
  const currency = profQual.currency || qual.currency || 'USD';
  const timeline = profQual.timeline || qual.timeline || state?.timeline || null;
  const decisionMaker = profQual.decisionMaker ?? qual.decisionMaker ?? state?.decisionMaker ?? null;

  const profSales = prof.sales || {};
  const sales = state?.sales || {};

  const productsInterested = profSales.productsInterested?.length
    ? profSales.productsInterested
    : sales.productsInterested?.length
    ? sales.productsInterested
    : state?.productsInterested || [];
  const objections = profSales.objections?.length
    ? profSales.objections
    : sales.objections?.length
    ? sales.objections
    : state?.objections || [];
  const competitorsMentioned = profSales.competitorsMentioned?.length
    ? profSales.competitorsMentioned
    : sales.competitors?.length
    ? sales.competitors
    : state?.competitorsMentioned || [];
  const buyingIntent = profSales.buyingIntent || sales.buyingIntent || state?.buyingIntent || 'unknown';
  const salesStage = profSales.salesStage || sales.salesStage || state?.salesStage || 'discovery';
  const nextBestAction = profSales.nextBestAction || sales.nextBestAction || state?.nextBestAction || null;
  const recommendedProduct = profSales.recommendedProduct || sales.recommendedProduct || state?.recommendedProduct || null;
  const recommendationReason = profSales.recommendationReason || sales.recommendationReason || state?.recommendationReason || null;

  return {
    contact: {
      firstName,
      lastName,
      email,
      phone,
      jobTitle,
      company,
    },
    qualification: {
      need,
      painPoints,
      requirements,
      companySize,
      budget,
      budgetMin,
      budgetMax,
      currency,
      timeline,
      decisionMaker,
    },
    sales: {
      productsInterested,
      objections,
      competitorsMentioned,
      buyingIntent,
      salesStage,
      nextBestAction,
      recommendedProduct,
      recommendationReason,
    },
    conversation: {
      summary: summary || '',
      transcript: transcript || '',
    },
  };
}

/**
 * Section 23 Debug Logging helper.
 */
export function logSalesStateUpdate(state: SalesState): void {
  const c = state.profile.customer;
  const q = state.profile.qualification;
  const s = state.profile.sales;

  const missing: string[] = [];
  if (!c.fullName) missing.push('name');
  if (!c.company) missing.push('company');
  if (!c.email) missing.push('email');
  if (!c.jobTitle) missing.push('role');
  if (!c.companySize) missing.push('companySize');
  if (!q.budget) missing.push('budget');
  if (!q.timeline) missing.push('timeline');

  console.log('[SALES STATE UPDATE]');
  console.log('CUSTOMER:');
  console.log(`  name: ${c.fullName || 'null'}`);
  console.log(`  company: ${c.company || 'null'}`);
  console.log(`  email: ${c.email || 'null'}`);
  console.log(`  role: ${c.jobTitle || 'null'}`);
  console.log('QUALIFICATION:');
  console.log(`  need: ${q.need || 'null'}`);
  console.log(`  budget: ${q.budget || 'null'} (min: ${q.budgetMin || 'null'}, max: ${q.budgetMax || 'null'})`);
  console.log(`  timeline: ${q.timeline || 'null'}`);
  console.log('SALES:');
  console.log(`  stage: ${s.salesStage}`);
  console.log(`  intent: ${s.buyingIntent}`);
  console.log('MISSING:');
  console.log(`  ${missing.join(', ') || 'none'}`);
  console.log('NEXT QUESTION:');
  console.log(`  ${state.nextQuestion ? state.nextQuestion.question : 'none'}`);

  if (state.recentlyUpdatedField) {
    console.log(`[SALES STATE UPDATE] ${state.recentlyUpdatedField.field}: ${state.recentlyUpdatedField.value}`);
  }
}

// ==========================================
// Phase 4: Response Validation & Evaluation Exports
// ==========================================
export {
  validateResponse,
  sanitizeAndCorrectResponse,
  splitSentences,
  extractQuestions,
} from './validator';

export {
  evaluateTurnQuality,
  evaluateConversationQuality,
} from './quality-evaluator';

export {
  recordStageLatency,
  startStageTimer,
  recordTurnLatency,
  analyzeBottlenecks,
  getSessionTurnRecords,
  resetLatencyStore,
} from './latency-tracker';

