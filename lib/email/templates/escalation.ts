export interface EscalationTemplateData {
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  prospectName?: string;
  prospectEmail?: string;
  prospectPhone?: string;
  company?: string;
  issueDescription: string;
  conversationSummary?: string;
  actionsTaken?: string[];
  recommendedAction: string;
  sessionId: string;
  timestamp?: string;
}

/**
 * Generates an email-safe internal escalation alert.
 * Formatted for immediate 5-second scanning by human sales and billing operators.
 * 100% table-based, inline styled, compatible with Outlook, Apple Mail, and Gmail.
 */
export function buildEscalationTemplate(data: EscalationTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const name = data.prospectName && data.prospectName !== 'Unknown' && data.prospectName.trim()
    ? data.prospectName.trim()
    : 'Customer';
  const company = data.company && data.company !== 'Unknown' && data.company !== 'N/A' && data.company.trim()
    ? data.company.trim()
    : 'Unspecified Company';
  const email = data.prospectEmail || 'Not provided';
  const phone = data.prospectPhone || 'Not provided';
  const priority = data.priority || 'HIGH';
  const category = data.category || 'HUMAN_REQUEST';
  const timestamp = data.timestamp || new Date().toISOString();

  // Priority color accents
  let priorityBg = '#e11d48'; // Red for CRITICAL / HIGH
  let priorityBorder = '#f43f5e';
  if (priority === 'MEDIUM') {
    priorityBg = '#d97706';
    priorityBorder = '#f59e0b';
  } else if (priority === 'LOW') {
    priorityBg = '#2563eb';
    priorityBorder = '#3b82f6';
  }

  // Scannable subject line: [Agora Urgent] Billing Escalation — Manish / Test Corp
  const subject = `[Agora Escalation] ${category} (${priority}) — ${name} / ${company}`;

  // Plaintext alternative
  const text = [
    `====================================================`,
    `AGORA INTERNAL ESCALATION ALERT [${priority} PRIORITY]`,
    `====================================================`,
    `Category:          ${category}`,
    `Priority:          ${priority}`,
    `Timestamp:         ${timestamp}`,
    `Session ID:        ${data.sessionId}`,
    ``,
    `PROSPECT DETAILS:`,
    `-----------------`,
    `Name:              ${name}`,
    `Email:             ${email}`,
    `Phone:             ${phone}`,
    `Company:           ${company}`,
    ``,
    `REPORTED ISSUE:`,
    `---------------`,
    data.issueDescription,
    ``,
    data.conversationSummary
      ? `CONVERSATION CONTEXT:\n--------------------\n${data.conversationSummary}\n`
      : null,
    data.actionsTaken && data.actionsTaken.length > 0
      ? `ACTIONS ALREADY TAKEN:\n---------------------\n${data.actionsTaken.map((a) => `• ${a}`).join('\n')}\n`
      : null,
    `RECOMMENDED NEXT ACTION:`,
    `------------------------`,
    data.recommendedAction,
    `====================================================`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  // Email-safe HTML (table-based, zero flexbox)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body, table, td, p, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #090d16;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
          
          <!-- Top Accent Bar -->
          <tr>
            <td height="4" style="background-color: ${priorityBg}; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 24px 28px 18px 28px; border-bottom: 1px solid #1e293b;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <span style="display: inline-block; background-color: ${priorityBg}; border: 1px solid ${priorityBorder}; color: #ffffff; font-weight: 800; font-size: 11px; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; letter-spacing: 0.5px; margin-bottom: 6px;">
                      ${priority} PRIORITY
                    </span>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #f8fafc; line-height: 1.3;">
                      ${category.replace(/_/g, ' ')}
                    </h1>
                  </td>
                  <td valign="middle" align="right" style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                    Agora Sales Agent
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 28px;">
              
              <!-- Prospect Details Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #111e33; border: 1px solid #1e3a5f; border-radius: 8px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #38bdf8; letter-spacing: 0.6px; margin-bottom: 10px;">
                      Prospect Profile
                    </div>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px;">
                      <tr>
                        <td width="100" style="padding: 4px 0; color: #64748b; font-weight: 500;">Name:</td>
                        <td style="padding: 4px 0; color: #f8fafc; font-weight: 600;">${name}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Company:</td>
                        <td style="padding: 4px 0; color: #f8fafc;">${company}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Email:</td>
                        <td style="padding: 4px 0; color: #38bdf8;">
                          ${email !== 'Not provided' ? `<a href="mailto:${email}" style="color: #38bdf8; text-decoration: underline;">${email}</a>` : 'Not provided'}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Phone:</td>
                        <td style="padding: 4px 0; color: #f8fafc;">${phone}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Reported Issue Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: rgba(225, 29, 72, 0.08); border-left: 4px solid ${priorityBg}; border-radius: 4px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; font-weight: 700; color: #f43f5e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                      Reported Issue
                    </div>
                    <div style="font-size: 15px; color: #f8fafc; line-height: 1.5;">
                      ${data.issueDescription}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Conversation Context (if present) -->
              ${
                data.conversationSummary
                  ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #111e33; border: 1px solid #1e293b; border-radius: 8px; margin-bottom: 20px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                            Recent Conversation Context
                          </div>
                          <div style="font-size: 13px; color: #cbd5e1; line-height: 1.6; white-space: pre-wrap;">
                            ${data.conversationSummary}
                          </div>
                        </td>
                      </tr>
                    </table>`
                  : ''
              }

              <!-- Recommended Action Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; border: 1px solid #38bdf8; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                      Recommended Next Action
                    </div>
                    <div style="font-size: 14px; font-weight: 600; color: #f8fafc; line-height: 1.5;">
                      ${data.recommendedAction}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Action Link -->
              ${
                email !== 'Not provided'
                  ? `<div style="text-align: center; margin-bottom: 24px;">
                      <a href="mailto:${email}?subject=Re:%20Agora%20Support%20Follow-up%20(${encodeURIComponent(category)})" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 6px;">
                        Reply to Prospect (${email}) &rarr;
                      </a>
                    </div>`
                  : ''
              }

              <!-- Session Details -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #1e293b; padding-top: 16px; font-size: 11px; color: #64748b;">
                <tr>
                  <td>Session ID: <code style="color: #94a3b8;">${data.sessionId}</code></td>
                  <td align="right">Logged: ${timestamp}</td>
                </tr>
              </table>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
