import { EscalationCategory, EscalationPriority } from './types';

export interface EscalationDetectionResult {
  shouldEscalate: boolean;
  category?: EscalationCategory;
  priority?: EscalationPriority;
  reason?: string;
}

/**
 * Deterministically analyzes user utterance to detect if escalation is required.
 * Distinguishes normal questions (handled by AI) from billing / human escalation.
 */
export function detectEscalation(text: string): EscalationDetectionResult {
  const clean = text.trim();
  // Normalize smart quotes and unicode apostrophes
  const lower = clean
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

  // 1. Payment / Billing issues (CRITICAL / HIGH priority)
  const isDoubleCharge = /charged\s+(?:twice|two\s+times|double)|double\s+charg/i.test(lower);
  const isPaymentFailure =
    /payment\s+failed|card\s+(?:failed|declined|not\s+working)|billing\s+(?:issue|problem|error)|invoice\s+(?:issue|error|problem)|charged\s+(?:wrong\s+amount|without\s+access|but\s+didn'?t\s+get\s+access|and\s+no\s+access)|subscription\s+payment\s+failed/i.test(
      lower,
    );

  if (isDoubleCharge || isPaymentFailure) {
    return {
      shouldEscalate: true,
      category: 'PAYMENT_BILLING',
      priority: isDoubleCharge ? 'CRITICAL' : 'HIGH',
      reason: isDoubleCharge ? 'Customer reports double charge' : 'Customer reports payment or billing failure',
    };
  }

  // 2. Refund requests (HIGH priority)
  if (/(?:need|want|demand|give\s+me|request)\s+(?:a\s+)?refund|money\s+back|reverse\s+(?:the\s+)?charge|chargeback/i.test(lower)) {
    return {
      shouldEscalate: true,
      category: 'REFUND_REQUEST',
      priority: 'HIGH',
      reason: 'Customer requested refund or chargeback',
    };
  }

  // 3. Explicit Human Assistance Requests (HIGH / MEDIUM priority)
  if (
    /(?:talk|speak)\s+to\s+(?:a\s+)?(?:human|person|rep|representative|agent|manager|someone\s+else|sales\s+team)|need\s+(?:a\s+)?(?:human|real\s+person)|connect\s+me\s+with\s+(?:someone|a\s+person)|transfer\s+me\s+to/i.test(
      lower,
    )
  ) {
    return {
      shouldEscalate: true,
      category: 'HUMAN_REQUEST',
      priority: 'HIGH',
      reason: 'Prospect explicitly requested human intervention',
    };
  }

  // 4. Unresolved Technical Support / Account Issues (HIGH priority)
  if (
    /account\s+(?:is\s+|got\s+|was\s+)?(?:locked|hacked|compromised|suspended|disabled|inaccessible)|locked\s+out\s+of\s+(?:my\s+)?account|can'?t\s+(?:log\s*in|sign\s*in|access\s+my\s+account)|unable\s+to\s+(?:log\s*in|sign\s*in|access)|this\s+(?:is\s+not|isn'?t)\s+working(?:\s+at\s+all)?|critical\s+system\s+error|unauthorized\s+access/i.test(
      lower,
    )
  ) {
    return {
      shouldEscalate: true,
      category: 'UNRESOLVED_SUPPORT',
      priority: 'HIGH',
      reason: 'Critical account access or severe system issue reported',
    };
  }

  return { shouldEscalate: false };
}
