import {
  EscalateToHumanInput,
  EscalateToHumanResult,
  EscalationRecord,
} from './types';
import { resolveEscalationRecipient } from './router';
import { getActiveSessionEscalation, saveSessionEscalation } from './state';
import { buildEscalationTemplate } from './templates';
import { sendEmail } from '../email/send';

/**
 * Canonical human escalation service.
 * Stops normal sales flow, routes deterministically, dispatches internal notification email,
 * records escalation state, and returns truthful customer directives.
 */
export async function escalateToHuman(
  input: EscalateToHumanInput,
): Promise<EscalateToHumanResult> {
  const {
    category,
    priority: explicitPriority,
    prospect,
    issueSummary,
    conversationSummary,
    requestedAction,
    sessionId,
    actionsTaken = [],
  } = input;

  console.log(`[Escalation Service] Triggered for session "${sessionId}" (Category: ${category})`);

  // 1. Check for existing active escalation in this session (Duplicate Prevention)
  const existingEscalation = getActiveSessionEscalation(sessionId);
  if (
    existingEscalation &&
    (existingEscalation.status === 'SENT' || existingEscalation.status === 'PENDING')
  ) {
    console.log(`[Escalation Service] Duplicate prevention: Active escalation "${existingEscalation.escalationId}" already exists for session "${sessionId}"`);

    let directive = "I have already escalated this to our team with your details, and they are reviewing it to follow up with you.";
    if (category === 'PAYMENT_BILLING' || category === 'REFUND_REQUEST') {
      directive = "Our team has already received your billing escalation and is looking into your account directly.";
    }

    return {
      success: true,
      escalationId: existingEscalation.escalationId,
      recipient: existingEscalation.recipient,
      category: existingEscalation.category,
      priority: existingEscalation.priority,
      status: existingEscalation.status,
      idempotent: true,
      speechDirective: directive,
    };
  }

  // 2. Deterministic routing
  const route = resolveEscalationRecipient(category);
  const priority = explicitPriority || route.defaultPriority;
  const recipient = route.recipient;

  const escalationId = `esc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const record: EscalationRecord = {
    escalationId,
    category,
    priority,
    status: 'PENDING',
    recipient,
    prospectName: prospect?.name,
    prospectEmail: prospect?.email,
    prospectPhone: prospect?.phone,
    company: prospect?.company,
    issueSummary,
    conversationSummary,
    actionsTaken,
    recommendedAction:
      requestedAction ||
      (category === 'PAYMENT_BILLING' || category === 'REFUND_REQUEST'
        ? 'Review payment gateway transaction and reach out to the customer.'
        : 'Contact the prospect directly to address their inquiry.'),
    sessionId,
    createdAt: now,
  };

  // 3. Build scannable internal email template
  const { subject, html, text } = buildEscalationTemplate({
    category,
    priority,
    prospectName: prospect?.name,
    prospectEmail: prospect?.email,
    prospectPhone: prospect?.phone,
    company: prospect?.company,
    issueDescription: issueSummary,
    conversationSummary,
    actionsTaken,
    recommendedAction: record.recommendedAction!,
    sessionId,
    timestamp: now,
  });

  // 4. Dispatch escalation email via canonical email client
  const emailRes = await sendEmail({
    to: recipient,
    toName: 'Agora Support & Escalations',
    subject,
    bodyText: text,
    bodyHtml: html,
    idempotencyKey: `esc:${escalationId}:${recipient}`,
  });

  if (!emailRes.success) {
    console.error(`[Escalation Service] Email dispatch failed for escalation "${escalationId}":`, emailRes.error);
    record.status = 'FAILED';
    record.error = emailRes.error;
    saveSessionEscalation(sessionId, record);

    const fallbackDirective = prospect?.email || prospect?.phone
      ? "I wasn't able to reach our team automatically right now, but I have noted your details and our team will follow up with you."
      : "I wasn't able to reach our team automatically right now. Let me capture your details so we can follow up.";

    return {
      success: false,
      escalationId,
      recipient,
      category,
      priority,
      status: 'FAILED',
      speechDirective: fallbackDirective,
      error: emailRes.error,
    };
  }

  // 5. Success
  record.status = 'SENT';
  record.sentAt = new Date().toISOString();
  saveSessionEscalation(sessionId, record);
  console.log(`[Escalation Service] Successfully dispatched escalation "${escalationId}" to ${recipient}`);

  // Reassuring speech directives matching exact specifications
  let speechDirective: string;
  if (category === 'PAYMENT_BILLING' || category === 'REFUND_REQUEST') {
    speechDirective = "I can't access or resolve billing issues directly, so I've escalated this to our team. They'll review it and follow up with you.";
  } else {
    speechDirective = "I've passed this to our team with the relevant details. They'll follow up with you directly.";
  }

  return {
    success: true,
    escalationId,
    recipient,
    category,
    priority,
    status: 'SENT',
    speechDirective,
  };
}
