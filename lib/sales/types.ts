export type SalesStage =
  | 'discovery'
  | 'qualification'
  | 'needs_analysis'
  | 'pitch'
  | 'recommendation'
  | 'objection_handling'
  | 'negotiation'
  | 'closing'
  | 'follow_up';

export type BuyingIntent = 'unknown' | 'low' | 'medium' | 'high';

export type FieldStatus = 'known' | 'unknown' | 'not_applicable';

export type CoreObjectionCategory =
  | 'PRICE'
  | 'BUDGET'
  | 'TIMING'
  | 'TRUST'
  | 'COMPETITOR'
  | 'TECHNICAL'
  | 'IMPLEMENTATION'
  | 'NEED'
  | 'AUTHORITY';

export type BuyingSignalStrength = 'strong' | 'medium' | 'none';

export interface BudgetEconomics {
  estimatedMinutes?: number;
  estimatedMonthlyCost?: number;
  statedBudget?: number;
  fitStatus: 'fits_pay_as_you_go' | 'budget_mismatch' | 'needs_clarification' | 'fits_committed_tier';
  explanation: string;
}

export type ObjectionType =
  | 'price_too_high'
  | 'perceived_value'
  | 'implementation_risk'
  | 'competitor_cheaper'
  | 'need_to_think'
  | 'need_approval'
  | 'not_enough_budget'
  | 'missing_feature'
  | 'integration_concern'
  | 'security_concern'
  | 'timing_concern'
  | 'already_using_solution'
  | 'other';

export type ObjectionSeverity = 'low' | 'medium' | 'high';

export interface ObjectionRecord {
  id: string;
  type: ObjectionType;
  category?: CoreObjectionCategory;
  text: string;
  severity: ObjectionSeverity;
  resolved: boolean;
  detectedAt: number;
  resolvedAt?: number;
  resolutionNote?: string;
}

export type NegotiationStatus =
  | 'not_started'
  | 'in_progress'
  | 'offer_made'
  | 'counter_offered'
  | 'agreed'
  | 'rejected';

export interface NegotiationState {
  customerBudget: string | null;
  quotedPrice: string | null;
  requestedDiscount: string | null;
  allowedDiscount: string | null;
  approvalRequired: boolean;
  negotiationStatus: NegotiationStatus;
  lastOffer: string | null;
  nextOffer: string | null;
}

export type MeetingType =
  | 'demo'
  | 'consultation'
  | 'technical_deep_dive'
  | 'follow_up'
  | 'general';

export type MeetingStatus =
  | 'none'
  | 'requested'
  | 'collecting_details'
  | 'collecting_datetime'
  | 'waiting_for_datetime'
  | 'waiting_for_time'
  | 'waiting_for_date'
  | 'slot_proposed'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export type ConfirmationStatus = 'none' | 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export interface TimeSlot {
  start: string;
  end: string;
  formattedTime?: string;
  available?: boolean;
}

export interface AppointmentState {
  meetingRequested: boolean;
  meetingType: MeetingType;
  preferredDate: string | null;
  preferredTime: string | null;
  duration: number;
  timezone: string;
  proposedSlots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  confirmationStatus: ConfirmationStatus;
  calendarEventId: string | null;
  calendarEventLink?: string | null;
  meetingUrl?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  meetingPurpose?: string | null;
  meetingStatus: MeetingStatus;
  idempotencyKey?: string | null;
  lastError?: string | null;
  emailStatus?: 'none' | 'sending' | 'sent' | 'failed';
  emailError?: string | null;
  emailSentAt?: string | null;
  detailsInputMode?: 'conversation' | 'manual';
}

export type NextBestActionType =
  | 'discover_pain_point'
  | 'clarify_requirement'
  | 'ask_budget'
  | 'clarify_budget'
  | 'ask_timeline'
  | 'recommend_product'
  | 'handle_price_objection'
  | 'handle_competitor_objection'
  | 'compare_products'
  | 'request_decision_maker'
  | 'request_email'
  | 'request_phone'
  | 'arrange_demo'
  | 'offer_demo'
  | 'request_meeting'
  | 'schedule_meeting'
  | 'propose_meeting_slot'
  | 'await_meeting_confirmation'
  | 'confirm_appointment'
  | 'handle_calendar_failure'
  | 'send_quote'
  | 'negotiate'
  | 'follow_up'
  | 'arrange_follow_up'
  | 'close';

export type UserIntent =
  | 'GREETING'
  | 'USE_CASE'
  | 'PRICING'
  | 'PRICE_OBJECTION'
  | 'PRODUCT_QUESTION'
  | 'TECHNICAL_QUESTION'
  | 'BUYING_SIGNAL'
  | 'BOOKING_REQUEST'
  | 'RESCHEDULE'
  | 'CANCELLATION'
  | 'FRUSTRATION'
  | 'CONFUSION'
  | 'POSITIVE_SIGNAL'
  | 'NEGATIVE_SIGNAL'
  | 'GOODBYE'
  | 'UNKNOWN';

export type NextBestActionCategory =
  | 'ANSWER'
  | 'ASK'
  | 'CLARIFY'
  | 'HANDLE_OBJECTION'
  | 'QUALIFY'
  | 'RECOMMEND'
  | 'BOOK'
  | 'ESCALATE'
  | 'END';

export interface CanonicalCustomerProfile {
  customer: {
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    location?: string | null;
    jobTitle: string | null;
    companySize: string | null;
    preferredContactMethod: string | null;
    manualOverrides?: Record<string, boolean>;
  };
  qualification: {
    need: string | null;
    useCase?: string | null;
    volume?: string | null;
    painPoints: string[];
    requirements: string[];
    currentSolution: string | null;
    budget: string | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    currency?: string | null;
    timeline: string | null;
    decisionMaker: boolean | string | null;
    decisionProcess: string | null;
  };
  sales: {
    productsInterested: string[];
    competitorsMentioned: string[];
    objections: string[];
    detectedObjections?: ObjectionRecord[];
    negotiation?: NegotiationState;
    appointment?: AppointmentState;
    buyingIntent: BuyingIntent;
    buyingSignals?: string[];
    buyingSignalStrength?: BuyingSignalStrength;
    primaryObjectionCategory?: CoreObjectionCategory;
    budgetEconomics?: BudgetEconomics;
    currentIntent?: UserIntent;
    nextBestActionCategory?: NextBestActionCategory;
    salesStage: SalesStage;
    nextBestAction: string | null;
    recommendedProduct?: string | null;
    recommendationReason?: string | null;
  };
  conversation: {
    informationRequested: string[];
    informationRefused: string[];
    lastQuestionAsked: string | null;
    questionsAlreadyAsked?: string[];
    topicsDiscussed?: string[];
  };
}

export interface StructuredCrmPayload {
  contact: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    company: string | null;
  };
  qualification: {
    need: string | null;
    painPoints: string[];
    requirements: string[];
    companySize: string | null;
    budget: string | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    currency?: string | null;
    timeline: string | null;
    decisionMaker: boolean | string | null;
  };
  sales: {
    productsInterested: string[];
    objections: string[];
    competitorsMentioned: string[];
    buyingIntent: BuyingIntent;
    salesStage: SalesStage;
    nextBestAction: string | null;
    recommendedProduct?: string | null;
    recommendationReason?: string | null;
  };
  conversation: {
    summary: string;
    transcript: string;
  };
}

export interface CustomerInfoChecklist {
  // Identity / Contact
  customerName: FieldStatus;
  email: FieldStatus;
  phone: FieldStatus;
  company: FieldStatus;
  jobTitle: FieldStatus;

  // Qualification
  need: FieldStatus;
  painPoints: FieldStatus;
  requirements: FieldStatus;
  companySize: FieldStatus;
  budget: FieldStatus;
  timeline: FieldStatus;
  decisionMaker: FieldStatus;

  // Sales Context
  productsInterested: FieldStatus;
  competitorsMentioned: FieldStatus;
  objections: FieldStatus;
  buyingIntent: FieldStatus;
}

export interface CrmCollectionStatus {
  name: boolean;
  company: boolean;
  email: boolean;
  role: boolean;
  phone: boolean;
  budget?: boolean;
  timeline?: boolean;
}

export interface NextInformationQuestion {
  field: string;
  reason: string;
  question: string;
}

export interface NextInfoToCollect {
  field: string;
  reason: string;
  priority: 'P0' | 'P1' | 'P2';
}

export interface RequiredInformationRequest {
  field: string;
  priority: number;
  reason: string;
  questionIntent: string;
  suggestedQuestion: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export interface EndConversationGuardResult {
  shouldCollect: boolean;
  field?: string;
  reason: string;
  suggestedQuestion?: string;
}

export type CustomerActionType =
  | 'book_meeting'
  | 'send_proposal'
  | 'create_hubspot_lead'
  | 'send_confirmation'
  | 'qualification'
  | 'general_collection'
  | 'custom';

export interface PendingDetailsRequest {
  requestId: string;
  actionType: CustomerActionType;
  action?: CustomerActionType;
  title: string;
  description?: string;
  requiredFields: Array<'fullName' | 'email' | 'company' | 'phone' | string>;
  optionalFields?: Array<'fullName' | 'email' | 'company' | 'phone' | string>;
  status: 'pending' | 'submitted' | 'dismissed';
  context?: Record<string, unknown>;
  createdAt: number;
}

export type NegotiationLeverage = 'Customer' | 'Balanced' | 'Agora (AI)' | 'Unknown';

export interface DealIntelligence {
  /** 1. Customer Need */
  customerNeed: string;
  /** 2. Budget / Price Sensitivity */
  budgetPriceSensitivity: string;
  /** 3. Timeline / Urgency */
  timelineUrgency: string;
  /** 4. Decision Authority */
  decisionAuthority: string;
  /** 5. Current Primary Objection */
  primaryObjection: string;
  /** 6. Buying Intent */
  buyingIntent: BuyingIntent;
  /** 7. Negotiation Leverage */
  negotiationLeverage: NegotiationLeverage;
  /** 8. Concessions given by AI */
  concessionsGivenByAi: string[];
  /** 9. Concessions requested by customer */
  concessionsRequestedByCustomer: string[];
  /** 10. Current AI Strategy */
  currentStrategy: string;
  /** 11. Next Best Move */
  nextBestMove: string;
  /** 12. Short explanation of WHY the current strategy was selected */
  strategyReason: string;

  /** Derived Deal Confidence (0 to 100%) */
  dealConfidence: number;
  /** Primary Blocker label */
  primaryBlocker: string;
  /** Core Customer Priorities */
  customerPriorities: string[];
  /** Negotiation: Customer Wants */
  customerWants: string[];
  /** Negotiation: AI Has Offered */
  aiOffered: string[];
  /** Negotiation: Give/Get Balance */
  giveGetBalance: string;
}

export interface SalesState {
  conversationId: string;

  /**
   * Canonical customer email — single source of truth across Dashboard, Calendar, Gmail, and HubSpot.
   */
  customerEmail?: string;

  // Canonical structured customer details
  customer: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    company?: string;
    location?: string;
    jobTitle?: string;
    companySize?: string;
    manualOverrides?: Record<string, boolean>;
  };

  // Canonical sales qualification
  qualification: {
    need?: string;
    useCase?: string;
    volume?: string;
    painPoints: string[];
    requirements: string[];
    budget?: string;
    budgetMin?: number;
    budgetMax?: number;
    currency?: string;
    timeline?: string;
    decisionMaker?: boolean | string;
    companySize?: string;
  };

  // Canonical sales telemetry
  sales: {
    productsInterested: string[];
    competitors: string[];
    objections: string[];
    detectedObjections?: ObjectionRecord[];
    negotiation?: NegotiationState;
    appointment?: AppointmentState;
    buyingIntent: BuyingIntent;
    salesStage: SalesStage;
    leadScore: number;
    nextBestAction?: string;
    recommendedProduct?: string;
    recommendationReason?: string;
  };

  // Deterministic information collection tracking
  informationCollection: {
    fieldsAsked: string[];
    fieldsCollected: string[];
    fieldsRefused: string[];
    lastRequestedField?: string;
    lastRequestedQuestion?: string;
  };

  // Conversation history & timestamps
  conversation: {
    startedAt: number;
    lastUpdatedAt: number;
    transcript: string;
  };

  // CRM state & idempotency tracker
  crm: {
    synced: boolean;
    syncInProgress: boolean;
    syncFailed?: boolean;
    syncError?: string;
    syncCompletedAt?: string;
    hubspotContactId?: string;
    hubspotCompanyId?: string;
    hubspotDealId?: string;
    hubspotNoteId?: string;
    lastSyncedStage?: string;
  };

  // Embedded profile for backward compatibility with existing profile callers
  profile: CanonicalCustomerProfile;

  // Backward-compatible flat aliases
  customerName?: string;
  email?: string;
  phone?: string;
  company?: string;
  location?: string;
  companySize?: string;
  volume?: string;
  role?: string;
  jobTitle?: string;
  need?: string;
  useCase?: string;
  painPoints: string[];
  requirements: string[];
  budget?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  authority?: string;
  decisionMaker?: boolean | string;
  timeline?: string;
  productsInterested: string[];
  objections: string[];
  detectedObjections: ObjectionRecord[];
  negotiation: NegotiationState;
  appointment: AppointmentState;
  competitorsMentioned: string[];
  buyingIntent: BuyingIntent;
  buyingSignals?: string[];
  buyingSignalStrength?: BuyingSignalStrength;
  primaryObjectionCategory?: CoreObjectionCategory;
  budgetEconomics?: BudgetEconomics;
  currentIntent?: UserIntent;
  nextBestActionCategory?: NextBestActionCategory;
  topicsDiscussed?: string[];
  questionsAlreadyAsked?: string[];
  conversationStateSummary?: {
    known: Record<string, string>;
    unknown: string[];
    relevantNow: string[];
  };
  leadScore: number; // 0 to 100
  salesStage: SalesStage;
  nextBestAction: string;
  recommendedProduct?: string;
  recommendationReason?: string;
  lastUpdated: number;

  // Proactive Information Collection & CRM Checklist
  checklist: CustomerInfoChecklist;
  informationCompleteness: number; // 0 to 100
  nextInfoToCollect: NextInfoToCollect | null;
  refusedFields: string[];

  // Conversational CRM Collection Status & Active Question Directive
  crmCollectionStatus: CrmCollectionStatus;
  nextQuestion: NextInformationQuestion | null;
  recentlyUpdatedField?: { field: string; value: string } | null;

  // Live RAG Visibility — Knowledge Used
  knowledgeUsed?: KnowledgeUsedItem[];

  // Reusable Customer Details Popup / Pending Action Request
  pendingDetailsRequest?: PendingDetailsRequest | null;

  // Manual edits tracking to protect against automated voice overwrites
  manualOverrides?: Record<string, boolean>;

  // Customer Details Input Mode ('conversation' | 'manual')
  detailsInputMode?: 'conversation' | 'manual';

  // Canonical Appointment Fields (Single Source of Truth)
  meetingDate?: string | null;
  meetingTime?: string | null;
  appointmentRequested?: boolean;
  appointmentStatus?: MeetingStatus;
  meetingStatus?: MeetingStatus;
  calendarEventId?: string | null;
  meetingUrl?: string | null;
  start?: string | null;
  end?: string | null;
  timezone?: string;
  emailStatus?: 'none' | 'sending' | 'sent' | 'failed';
  confirmationEmailStatus?: 'none' | 'sending' | 'sent' | 'failed';
  emailSentAt?: string | null;

  // Real-time Deal Intelligence Layer
  dealIntelligence?: DealIntelligence;
}

export interface KnowledgeUsedItem {
  title: string;
  relevance: number;
  category?: string;
  retrievedAt: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | string;
  content: string;
}

export interface SalesBrainResult {
  salesState: SalesState;
  retrievedChunks: Array<{
    documentName: string;
    category: string;
    score: number;
    text: string;
  }>;
  systemPrompt: string;
  bookingDirective?: string;
}

// ==========================================
// Phase 4: Response Validation Types
// ==========================================

export type ValidationRuleId =
  | 'sentence_count'
  | 'question_count'
  | 'repeated_question'
  | 'unsupported_claim'
  | 'fake_booking'
  | 'excessive_filler'
  | 'contradiction';

export type ValidationSeverity = 'warning' | 'error';

export interface ValidationIssue {
  ruleId: ValidationRuleId;
  severity: ValidationSeverity;
  message: string;
  offendingText?: string;
}

export interface ResponseValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  originalResponse: string;
  correctedResponse: string;
  wasCorrected: boolean;
}

export interface ValidatorOptions {
  maxSentences?: number;
  maxQuestions?: number;
  allowPricingBreakdown?: boolean;
  strictTruthful?: boolean;
}

// ==========================================
// Phase 4: Conversation Quality Types
// ==========================================

export type QualityDimension =
  | 'naturalness'
  | 'contextRetention'
  | 'questionQuality'
  | 'conciseness'
  | 'objectionHandling'
  | 'buyingSignalAccuracy'
  | 'actionCorrectness';

export interface DimensionScore {
  score: number; // 0 - 100
  weight: number;
  feedback: string;
  passed: boolean;
}

export interface TurnQualityScore {
  turnIndex: number;
  userQuery: string;
  agentResponse: string;
  dimensions: Record<QualityDimension, DimensionScore>;
  compositeScore: number; // 0 - 100
  issues: string[];
}

export interface ConversationQualityReport {
  totalTurns: number;
  averageCompositeScore: number;
  dimensionAverages: Record<QualityDimension, number>;
  passedBenchmark: boolean;
  summary: string;
  turnScores: TurnQualityScore[];
}

// ==========================================
// Phase 4: Pipeline Latency & Bottlenecks
// ==========================================

export type PipelineStage = 'stt' | 'llm' | 'tool' | 'tts';

export interface StageLatencyMetric {
  stage: PipelineStage;
  durationMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TurnLatencyRecord {
  turnIndex: number;
  timestamp: number;
  stages: Record<PipelineStage, number>;
  totalDurationMs: number;
  bottleneck: PipelineStage;
}

export interface BottleneckReport {
  primaryBottleneck: PipelineStage;
  averageLatencies: Record<PipelineStage, number>;
  totalTurnAverageMs: number;
  recommendations: string[];
}

