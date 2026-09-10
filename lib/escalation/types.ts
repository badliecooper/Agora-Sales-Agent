export type EscalationCategory =
  | 'PAYMENT_BILLING'
  | 'REFUND_REQUEST'
  | 'HUMAN_REQUEST'
  | 'UNRESOLVED_SUPPORT'
  | 'ACCOUNT_ISSUE';

export type EscalationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EscalationStatus =
  | 'NOT_REQUIRED'
  | 'RECOMMENDED'
  | 'PENDING'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'FAILED';

export interface EscalationRecord {
  escalationId: string;
  category: EscalationCategory;
  priority: EscalationPriority;
  status: EscalationStatus;
  recipient: string;
  prospectName?: string;
  prospectEmail?: string;
  prospectPhone?: string;
  company?: string;
  issueSummary: string;
  conversationSummary?: string;
  actionsTaken?: string[];
  recommendedAction?: string;
  sessionId: string;
  createdAt: string;
  sentAt?: string;
  error?: string;
}

export interface EscalateToHumanInput {
  category: EscalationCategory;
  priority?: EscalationPriority;
  prospect?: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
  issueSummary: string;
  conversationSummary?: string;
  requestedAction?: string;
  sessionId: string;
  actionsTaken?: string[];
  context?: Record<string, unknown>;
}

export interface EscalateToHumanResult {
  success: boolean;
  escalationId?: string;
  recipient?: string;
  category?: EscalationCategory;
  priority?: EscalationPriority;
  status?: EscalationStatus;
  idempotent?: boolean;
  speechDirective: string;
  error?: string;
}
