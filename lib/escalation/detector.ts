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
export function detectEscalation(
  text: string,
  lastAssistantMessage?: string,
): EscalationDetectionResult {
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

  // 3. Explicit Human Assistance / Sales Team Requests (HIGH priority)
  const HUMAN_NOUNS =
    '(?:human|person|rep|representative|agent|manager|executive|supervisor|lead|specialist|consultant|engineer|sales\\s*rep|sales\\s*team|support\\s*team|team|someone|someone\\s+else)';
  const ARTICLES = '(?:a\\s+|an\\s+|the\\s+|your\\s+|some\\s+)?';

  const talkSpeakMatch = new RegExp(
    `(?:talk|speak|chat)\\s+(?:to|with)\\s+${ARTICLES}${HUMAN_NOUNS}`,
    'i',
  ).test(lower);

  const realLiveMatch = new RegExp(
    `(?:real|live)\\s+(?:person|human|agent|rep|representative|executive|someone)`,
    'i',
  ).test(lower);

  const wantNeedMatch = new RegExp(
    `(?:want|wanna|need|get|request)(?:\\s+to\\s+(?:talk|speak|chat)\\s+(?:to|with))?\\s+${ARTICLES}(?:human|real\\s+person|live\\s+person|live\\s+agent|real\\s+agent|rep|representative|executive|manager|supervisor|sales\\s*team)`,
    'i',
  ).test(lower);

  const connectTransferMatch = new RegExp(
    `(?:connect|transfer|pass)\\s+(?:me\\s+)?(?:to|with)\\s+${ARTICLES}${HUMAN_NOUNS}`,
    'i',
  ).test(lower);

  const sendEmailMatch = new RegExp(
    `(?:send|forward|dispatch|shoot|pass)\\s+(?:an?\\s+)?(?:email|mail|message|details?|info(?:rmation)?)\\s+to\\s+${ARTICLES}${HUMAN_NOUNS}`,
    'i',
  ).test(lower);

  const emailTeamDirectMatch = new RegExp(
    `(?:email|mail|contact|reach\\s+out\\s+to)\\s+${ARTICLES}(?:sales\\s*team|support\\s*team|team|executive|representative|rep)`,
    'i',
  ).test(lower);

  const haveTeamContactMatch = new RegExp(
    `(?:have|ask|get)\\s+${ARTICLES}(?:sales\\s*team|support\\s*team|team|rep|representative|executive|someone|agent)\\s+(?:to\\s+)?(?:contact|email|mail|call|reach\\s+out(?:\\s+to)?)\\s+(?:me|us)`,
    'i',
  ).test(lower);

  const humanPleaseMatch = /\b(?:human|executive|representative|live\s+agent)\s+please\b/i.test(lower);

  // User confirmed an assistant offer to escalate or contact sales team
  const isAffirmation = /^(?:yes|yeah|yep|sure|please|please\s+do|go\s+ahead|do\s+it|confirm|okay|ok|sounds\s+good|definitely)\b/i.test(lower);
  const assistantOfferedEscalation = Boolean(
    lastAssistantMessage &&
      /(?:send|forward|pass|escalate|contact|email).*(?:sales\\s*team|team|support|representative|executive|specialist)|(?:reach\\s+out\\s+to\\s+you|follow\\s+up\\s+with\\s+you)/i.test(
        lastAssistantMessage,
      ),
  );

  const isHumanRequest =
    talkSpeakMatch ||
    realLiveMatch ||
    wantNeedMatch ||
    connectTransferMatch ||
    sendEmailMatch ||
    emailTeamDirectMatch ||
    haveTeamContactMatch ||
    humanPleaseMatch ||
    (isAffirmation && assistantOfferedEscalation);

  if (isHumanRequest) {
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
