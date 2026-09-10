export interface MeetingConfirmationTemplateData {
  customerName: string;
  customerEmail: string;
  company?: string;
  meetingTitle: string;
  dateStr: string;
  timeStr: string;
  timezone: string;
  durationMinutes?: number;
  meetingUrl?: string | null;
  calendarEventId: string;
  topicsDiscussed?: string[];
  context?: string;
}

/**
 * Generates an email-safe HTML and plaintext sales confirmation email.
 * Designed for high conversion, executive presentation, and compatibility across
 * Gmail, Apple Mail, Outlook (Windows & Mac), and mobile clients.
 * Zero unescaped undefined, null, NaN, or raw errors.
 */
export function buildMeetingConfirmationTemplate(data: MeetingConfirmationTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const name = data.customerName && data.customerName !== 'Unknown' && data.customerName.trim()
    ? data.customerName.trim()
    : 'there';
  const company = data.company && data.company !== 'Unknown' && data.company !== 'N/A' && data.company.trim()
    ? data.company.trim()
    : null;
  const companyDisplay = company ? ` (${company})` : '';
  const dateStr = data.dateStr || 'Upcoming';
  const timeStr = data.timeStr || '';
  const timezone = data.timezone || 'Asia/Kolkata';
  const duration = data.durationMinutes || 30;
  const meetUrl = data.meetingUrl && data.meetingUrl.startsWith('http') ? data.meetingUrl : null;
  const meetDisplayText = meetUrl || 'Video conference details attached in calendar invite';
  const title = data.meetingTitle || 'Agora Conversational AI Architecture Review & Demo';

  // Dynamic agenda tailoring
  const defaultAgenda = [
    'Agora Conversational AI real-time audio pipeline & sub-500ms voice response',
    'Voice turn-taking, intelligent interruption handling, and acoustic noise cancellation',
    'Custom telephony (SIP/PSTN), WebRTC SDK integration, and backend LLM orchestration',
    'Production sizing, concurrent channel pricing, and deployment roadmap',
  ];

  const customAgenda = (data.topicsDiscussed && data.topicsDiscussed.length > 0)
    ? data.topicsDiscussed.map((t) => `Deep dive: ${t}`)
    : defaultAgenda;

  // High-converting, professional subject line
  const subject = `Your Agora demo is confirmed — ${dateStr}`;

  // Plaintext alternative for text-only clients
  const textLines = [
    `Hi ${name},`,
    ``,
    `Your Agora Conversational AI architecture consultation and demo is confirmed!`,
    `We've reserved dedicated time with an Agora voice specialist to explore your real-time voice infrastructure.`,
    ``,
    `====================================================`,
    `MEETING DETAILS`,
    `====================================================`,
    `Session:      ${title}`,
    `Date:         ${dateStr}`,
    `Time:         ${timeStr} (${timezone})`,
    `Duration:     ${duration} minutes`,
    company ? `Company:      ${company}` : null,
    meetUrl ? `Google Meet:  ${meetUrl}` : `Google Meet:  ${meetDisplayText}`,
    `Reference:    ${data.calendarEventId}`,
    ``,
    `====================================================`,
    `WHAT WE'LL COVER`,
    `====================================================`,
    ...customAgenda.map((item) => `• ${item}`),
    ``,
    `====================================================`,
    `HOW TO PREPARE`,
    `====================================================`,
    `• Bring your target concurrent user/call volume expectations`,
    `• Current audio stack, latency targets, and preferred LLM / TTS models`,
    `• Any specific telephony, mobile, or web integration requirements`,
    ``,
    data.context ? `Additional Context:\n${data.context}\n` : null,
    `Need to adjust or reschedule? Simply reply directly to this email or update the invite in your Google Calendar.`,
    ``,
    `Best regards,`,
    `Agora Enterprise Solutions Team`,
    `https://agora.io`,
  ].filter((line): line is string => line !== null);

  const text = textLines.join('\n');

  // Bulletproof HTML layout: Table-based, inline CSS, high-contrast dark theme
  const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    @media only screen and (max-width: 620px) {
      .container-table {
        width: 100% !important;
        max-width: 100% !important;
      }
      .mobile-padding {
        padding: 24px 18px !important;
      }
      .mobile-stack {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        margin-bottom: 12px !important;
      }
      .btn-primary {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #070a12; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #070a12;">
    <tr>
      <td align="center" style="padding: 36px 16px;">
        
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);" class="container-table">
          
          <!-- Top Accent Bar -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #0ea5e9 0%, #2563eb 50%, #38bdf8 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header / Brand -->
          <tr>
            <td style="padding: 32px 36px 24px 36px;" class="mobile-padding">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase;">
                      AGORA
                    </div>
                    <div style="font-size: 13px; color: #38bdf8; font-weight: 600; letter-spacing: 0.5px; margin-top: 2px;">
                      Conversational AI &bull; Real-Time Voice
                    </div>
                  </td>
                  <td valign="middle" align="right">
                    <span style="display: inline-block; background-color: rgba(14, 165, 233, 0.15); border: 1px solid rgba(14, 165, 233, 0.4); color: #38bdf8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 6px 14px; border-radius: 9999px;">
                      ✓ Confirmed
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 36px;"><hr style="border: 0; border-top: 1px solid #1e293b; margin: 0;"></td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 36px;" class="mobile-padding">
              
              <!-- Greeting & Value Statement -->
              <h1 style="margin: 0 0 12px 0; font-size: 24px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                Your demo is confirmed
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #94a3b8;">
                Hi <strong style="color: #f1f5f9;">${name}</strong>${companyDisplay}, we look forward to meeting with you. We've reserved your slot for a dedicated technical consultation and live architecture demonstration.
              </p>

              <!-- Meeting Details Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #111e33; border: 1px solid #1e3a5f; border-radius: 12px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 22px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      
                      <!-- Topic -->
                      <tr>
                        <td style="padding-bottom: 18px;" colspan="2">
                          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; color: #64748b; margin-bottom: 4px;">Topic</div>
                          <div style="font-size: 16px; font-weight: 700; color: #38bdf8; line-height: 1.4;">${title}</div>
                        </td>
                      </tr>

                      <!-- Date & Time Grid -->
                      <tr>
                        <td width="50%" valign="top" style="padding-bottom: 14px;" class="mobile-stack">
                          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; color: #64748b; margin-bottom: 4px;">📅 Date</div>
                          <div style="font-size: 15px; font-weight: 600; color: #f8fafc;">${dateStr}</div>
                        </td>
                        <td width="50%" valign="top" style="padding-bottom: 14px;" class="mobile-stack">
                          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; color: #64748b; margin-bottom: 4px;">⏰ Time</div>
                          <div style="font-size: 15px; font-weight: 600; color: #f8fafc;">${timeStr}</div>
                        </td>
                      </tr>

                      <!-- Duration & Timezone -->
                      <tr>
                        <td width="50%" valign="top" class="mobile-stack">
                          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; color: #64748b; margin-bottom: 4px;">⏱ Duration</div>
                          <div style="font-size: 14px; font-weight: 500; color: #cbd5e1;">${duration} minutes</div>
                        </td>
                        <td width="50%" valign="top" class="mobile-stack">
                          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; color: #64748b; margin-bottom: 4px;">🌍 Timezone</div>
                          <div style="font-size: 14px; font-weight: 500; color: #cbd5e1;">${timezone}</div>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>

              <!-- Call to Action: Join Google Meet -->
              ${
                meetUrl
                  ? `<div style="text-align: center; margin-bottom: 32px;">
                      <a href="${meetUrl}" target="_blank" class="btn-primary" style="display: inline-block; background-color: #2563eb; background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 34px; border-radius: 8px; box-shadow: 0 4px 20px rgba(14, 165, 233, 0.35); letter-spacing: 0.3px;">
                        Join Google Meet &rarr;
                      </a>
                      <div style="margin-top: 10px; font-size: 12px; color: #64748b;">
                        Link: <a href="${meetUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline;">${meetUrl}</a>
                      </div>
                    </div>`
                  : `<div style="padding: 16px; background-color: #1e293b; border-radius: 8px; margin-bottom: 28px; font-size: 14px; color: #cbd5e1; text-align: center;">
                      <strong>Google Meet:</strong> ${meetDisplayText}
                    </div>`
              }

              <!-- Section: What We'll Cover -->
              <div style="margin-bottom: 28px;">
                <div style="font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
                  What We'll Cover
                </div>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  ${customAgenda
                    .map(
                      (item) => `<tr>
                    <td valign="top" style="padding-bottom: 8px; color: #0ea5e9; font-size: 16px; line-height: 1.4; width: 22px;">&bull;</td>
                    <td valign="top" style="padding-bottom: 8px; color: #cbd5e1; font-size: 14px; line-height: 1.6;">${item}</td>
                  </tr>`,
                    )
                    .join('')}
                </table>
              </div>

              <!-- Section: How to Prepare -->
              <div style="margin-bottom: 28px; background-color: rgba(30, 41, 59, 0.4); border-left: 3px solid #0ea5e9; padding: 16px 20px; border-radius: 4px;">
                <div style="font-size: 12px; font-weight: 700; color: #f1f5f9; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px;">
                  💡 How to Prepare
                </div>
                <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.6; color: #94a3b8;">
                  To make the most of our 30 minutes, feel free to bring:
                </p>
                <ul style="margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: #94a3b8;">
                  <li>Anticipated concurrent session volume or monthly voice minutes</li>
                  <li>Target response latencies & preferred LLM/TTS combinations</li>
                  <li>Architecture questions around SIP, WebRTC, or mobile SDKs</li>
                </ul>
              </div>

              <!-- Calendar Reschedule Note -->
              <div style="border-top: 1px solid #1e293b; padding-top: 20px;">
                <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #64748b;">
                  📅 An official Google Calendar invitation has been placed on your calendar. Need to adjust the time? Simply reply directly to this email or update the invite in your calendar.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #070a12; border-top: 1px solid #1e293b; text-align: center;" class="mobile-padding">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;">
                Sent by Agora Voice AI Sales Assistant &bull; Reference: ${data.calendarEventId}
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                &copy; 2026 Agora, Inc. All rights reserved. &bull; <a href="https://agora.io" target="_blank" style="color: #38bdf8; text-decoration: none;">agora.io</a>
              </p>
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
