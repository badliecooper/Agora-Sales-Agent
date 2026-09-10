import { EscalationCategory, EscalationPriority } from './types';
import { getEnvLocalValues } from '../calendar/oauth-helper';

export interface RouteResolution {
  recipient: string;
  defaultPriority: EscalationPriority;
}

/**
 * Deterministically routes an escalation category to the designated recipient.
 * Payment and billing issues route directly to yadhurajsp@gmail.com (configurable via ESCALATION_EMAIL).
 * Category -> recipient mapping is strictly controlled by backend configuration, never chosen by the LLM.
 */
export function resolveEscalationRecipient(category: EscalationCategory): RouteResolution {
  const envLocal = getEnvLocalValues();
  const configuredEscalationEmail = (
    process.env.ESCALATION_EMAIL ||
    envLocal.ESCALATION_EMAIL ||
    process.env.SALES_TEAM_EMAIL ||
    envLocal.SALES_TEAM_EMAIL ||
    'yadhurajsp@gmail.com'
  ).trim();

  switch (category) {
    case 'PAYMENT_BILLING':
      return {
        recipient: configuredEscalationEmail,
        defaultPriority: 'HIGH',
      };

    case 'REFUND_REQUEST':
      return {
        recipient: configuredEscalationEmail,
        defaultPriority: 'HIGH',
      };

    case 'ACCOUNT_ISSUE':
      return {
        recipient: configuredEscalationEmail,
        defaultPriority: 'HIGH',
      };

    case 'UNRESOLVED_SUPPORT':
      return {
        recipient: configuredEscalationEmail,
        defaultPriority: 'HIGH',
      };

    case 'HUMAN_REQUEST':
    default:
      return {
        recipient: configuredEscalationEmail,
        defaultPriority: 'MEDIUM',
      };
  }
}
