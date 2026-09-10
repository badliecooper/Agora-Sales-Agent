# Comprehensive Integration Audit: Google Calendar, Gmail & Escalation

**Date:** September 10, 2026  
**Repository:** Agora-Sales-Agent  
**Live Application:** https://agorasalesagent.vercel.app  
**Phase:** Phase 1 — Audit, Cleanup & Integration Architecture  

---

## 1. Why Google Calendar Currently Fails

### Root Causes
1. **Divergent & Competing Execution Paths:**
   - There are currently three separate code paths attempting to handle booking:
     - **Voice Turn Processing Path:** In `lib/sales/brain.ts` line 132 calling `executeLiveVoiceBookingFlow()` located in `lib/sales/calendar-helper.ts` (1518 lines).
     - **Booking Service Path:** In `lib/sales/booking-service.ts` with `bookMeeting()`, which performs separate validation, availability checks, and CRM sync.
     - **AI SDK Route Tools Path:** In `app/api/chat/completions/route.ts` line 98 registering `checkCalendarAvailability`, `createCalendarMeeting`, and `sendMeetingConfirmationEmail` directly on the OpenAI completion stream.
   - When multiple components manage appointment status asynchronously, race conditions and inconsistent state updates occur between `SalesState.appointment` and the LLM's streaming response.

2. **Hardcoded Dates & Slot Assumptions:**
   - In `lib/calendar/google.ts` (`findAvailableSlots`, lines 457–463), hardcoded dates exist:
     ```ts
     } else if (baseDateStr.toLowerCase().includes('friday')) {
       baseDateStr = '2026-09-11';
     } else if (baseDateStr.toLowerCase().includes('thursday')) {
       baseDateStr = '2026-09-10';
     } else if (baseDateStr.toLowerCase().includes('tuesday')) {
       baseDateStr = '2026-09-08';
     }
     ```
   - Fallback days on line 521 are also hardcoded:
     ```ts
     const fallbackDays = ['2026-09-08', '2026-09-09', '2026-09-10'];
     ```
   - Additionally, `mockEvents` in `lib/calendar/google.ts` lines 49–67 contains static busy slot fixtures seeded with dates in September 2026 (`2026-09-11T11:00:00-04:00`). When availability checks run without a live token or in fallback mode, these static dates interfere with real availability.

3. **Timezone Offset Handling Gaps:**
   - `getTimezoneOffsetString()` in `lib/calendar/google.ts` line 135 uses a static regex lookup (`/ist|india|kolkata/` -> `+05:30`, `/pst|pdt/` -> `-07:00`, `/est|edt/` -> `-04:00`).
   - This causes subtle discrepancies for locations observing Daylight Saving Time (e.g. EST is `-05:00` while EDT is `-04:00`). Using `Intl.DateTimeFormat` dynamically across all dates prevents time-shift booking bugs.

4. **False Confirmations in Edge Cases:**
   - When Google Calendar API calls fail or timeout, certain fallback mechanisms historically caught errors and synthesized mock responses (`mock_evt_...`) if `CALENDAR_MOCK_MODE` was inadvertently evaluated as truthy, leading the AI to falsely confirm bookings that were never created in the user's primary calendar.

---

## 2. Why Gmail / Email Currently Fails

### Root Causes
1. **Lack of a Canonical Generic Email Client:**
   - In `lib/email/gmail.ts`, only one function exists: `sendMeetingConfirmationEmail()`.
   - There is NO generic `sendEmail({ to, subject, html, text })` function. Any attempt to send emails for escalation, notifications, or follow-ups has no implementation to call.

2. **Bland, Unbranded & Technical Email Template:**
   - The current confirmation email in `lib/email/gmail.ts` (lines 251–298) is a plain HTML card that prints technical diagnostic fields (e.g. `Calendar Event ID: ...`) and lacks Agora brand styling, email-safe responsiveness, mobile layout optimizations, and personalized sales agenda context.

3. **OAuth Scope Constraints on Profile Inspection:**
   - The refresh token configured in `.env.local` possesses the scope:
     `https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send`
   - While `https://www.googleapis.com/auth/gmail.send` is sufficient for `POST /gmail/v1/users/me/messages/send`, scripts attempting to inspect `GET /gmail/v1/users/me/profile` receive `HTTP 403 PERMISSION_DENIED` because profile reading requires `gmail.readonly` or userinfo scopes. The codebase must exclusively invoke `messages/send`.

4. **Hardcoded Test Email Addresses:**
   - Test scripts had `manishrevathi2008@gmail.com` hardcoded directly in test files instead of reading dynamically from `process.env.TEST_EMAIL`.

5. **Tight Coupling with Calendar:**
   - In some paths, failure to send an email caused the system to report an overall failure, even when the calendar event was successfully booked on Google Calendar. Calendar event success and email delivery must be decoupled so that a confirmed event is never marked failed just because email dispatch encountered a network timeout.

---

## 3. Why Escalation Currently Fails

### Root Causes & 12 Key Answers
1. **How does the agent decide something should escalate?**
   - Currently, only a basic regex in `lib/sales/tracker.ts:3249` checks for human requests:
     `/(?:speak|talk)\s+to\s+(?:a\s+)?(?:human|person|rep|sales\s+person|someone\s+else)|real\s+person|human\s+rep|enterprise\s+team/i.test(lowerQuery)`
   - It only injects a string prompt directive: `"Politely acknowledge their request to speak with a human specialist..."`.
2. **What categories currently trigger escalation?**
   - Only generic requests for a human. Payment, billing, duplicate charges, refund requests, and card failures DO NOT trigger escalation.
3. **Where is escalation state stored?**
   - Nowhere. `SalesState` in `lib/sales/types.ts` has no escalation fields, timestamps, or deduplication IDs.
4. **Does escalation actually send an email?**
   - No. Zero emails are sent when escalation triggers.
5. **Who receives the escalation?**
   - Nobody receives an email. While `.env.local` contains `SALES_TEAM_EMAIL=yadhurajsp@gmail.com`, no code reads or uses it to deliver escalations.
6. **What information is included?**
   - None. No escalation payload is constructed.
7. **Does the prospect receive confirmation that escalation occurred?**
   - Only unstructured, non-deterministic responses hallucinated by the LLM from the prompt directive.
8. **Can the AI continue selling after escalation when it should stop?**
   - Yes. The sales stage remains in `discovery`, `pitch`, or `objection_handling`, and the AI continues asking qualifying BANT questions and pushing for demos even when a user has reported a broken account or billing charge.
9. **Can escalation happen more than once for the same issue?**
   - Yes. Without state tracking, if a user mentions human/billing again on consecutive turns, the prompt repeats without tracking deduplication.
10. **Is escalation asynchronous or blocking?**
    - Neither, because no underlying asynchronous action is executed.
11. **What happens if the escalation email fails?**
    - Currently unhandled because no email is dispatched.
12. **Is there any mock/demo escalation logic?**
    - None exists.

---

## 4. Current Active Code Paths

### Production Path: Voice Booking
```
User Utterance
      ↓
Agora RTM / Voice Webhook
      ↓
app/api/chat/completions/route.ts (or direct socket)
      ↓
lib/sales/brain.ts: processSalesBrain()
      ↓
lib/sales/tracker.ts: analyzeAndUpdateSalesState()
      ↓
lib/sales/calendar-helper.ts: executeLiveVoiceBookingFlow()
      ↓
lib/calendar/google.ts: checkCalendarAvailability()
      ↓
lib/calendar/google.ts: createCalendarMeeting()
      ↓
lib/email/gmail.ts: sendMeetingConfirmationEmail()
      ↓
LLM Context / Directive & Response Stream
```

### Production Path: OAuth Flow
```
GET /api/auth/google/login
      ↓
lib/calendar/oauth-helper.ts: getGoogleAuthUrl()
      ↓
Google OAuth 2.0 Consent Screen
      ↓
GET /api/auth/google/callback
      ↓
lib/calendar/oauth-helper.ts: exchangeAuthCodeForTokens()
      ↓
lib/calendar/oauth-helper.ts: saveRefreshTokenToEnvLocal()
```

---

## 5. Dead / Duplicate Integration Code Identified

| File | Component / Function | Status / Issue |
|---|---|---|
| `lib/sales/booking-service.ts` | `bookMeeting()`, `rescheduleMeeting()`, `cancelMeeting()` | Duplicate of logic in `calendar-helper.ts` and `calendar/google.ts` |
| `lib/calendar/tools.ts` | Passthrough re-exports of `google.ts` and `gmail.ts` | Redundant wrapper layer adding no business logic |
| `lib/calendar/google.ts` | `mockEvents`, hardcoded dates in `findAvailableSlots` | Dead/brittle test fixtures inside production file |
| `app/api/chat/completions/route.ts` | `export function createChatCompletionsHandler` | Invalid route export violating Next.js 16 App Router type contract |
| `lib/sales/calendar-helper.ts` | `executeLiveVoiceBookingFlow` (lines 1037–1518) | Monolithic 480-line function mixing date parsing, calendar calls, and email calls |

---

## 6. Code Removal & Refactoring Plan

1. **Move `createChatCompletionsHandler`**:
   - Move from `app/api/chat/completions/route.ts` into `lib/sales/chat-handler.ts`.
   - `route.ts` will strictly export `export const POST = ...`.
2. **Remove Hardcoded Dates & Slots in `lib/calendar/google.ts`**:
   - Replace static dates (`2026-09-11`, etc.) with dynamic date calculations based on user timezone and current date.
3. **Consolidate Calendar Logic**:
   - Create unified `lib/calendar/` modules (`client.ts`, `availability.ts`, `booking.ts`, `reschedule.ts`, `cancellation.ts`, `types.ts`, `index.ts`).
   - Deprecate redundant passthrough file `lib/calendar/tools.ts` in favor of `lib/calendar/index.ts`.
4. **Consolidate Email Logic**:
   - Move from monolithic `lib/email/gmail.ts` into `lib/email/` (`client.ts`, `send.ts`, `templates/`, `types.ts`, `index.ts`).
5. **Establish Escalation Module**:
   - Create authoritative `lib/escalation/` (`detector.ts`, `router.ts`, `service.ts`, `state.ts`, `templates.ts`, `types.ts`, `index.ts`).

---

## 7. Required Environment Variables

| Variable | Required In | Purpose | Default / Fallback |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Production & Dev | Google Cloud OAuth 2.0 Web Client ID | Required |
| `GOOGLE_CLIENT_SECRET` | Production & Dev | Google Cloud OAuth 2.0 Client Secret | Required |
| `GOOGLE_REFRESH_TOKEN` | Production & Dev | OAuth2 Refresh token with Calendar & Gmail scopes | Required |
| `GOOGLE_CALENDAR_ID` | Production & Dev | Google Calendar identifier | `primary` |
| `DEFAULT_TIMEZONE` | Production & Dev | Default timezone for schedule parsing | `Asia/Kolkata` |
| `ESCALATION_EMAIL` | Production & Dev | Primary escalation recipient for human & billing issues | `yadhurajsp@gmail.com` (also checks `SALES_TEAM_EMAIL`) |
| `TEST_EMAIL` | Development & Test | Designated test recipient for meeting emails | `manishrevathi2008@gmail.com` |

---

## 8. Required Google Configuration & Scopes

- **Google Cloud Console Configuration:**
  - Application Type: **Web application**
  - Authorized Redirect URI: `http://localhost:3000/api/auth/google/callback` and `https://agorasalesagent.vercel.app/api/auth/google/callback`
- **OAuth Scopes Required:**
  1. `https://www.googleapis.com/auth/calendar` (or `https://www.googleapis.com/auth/calendar.events`): Check FreeBusy availability, insert events with Google Meet conference data, update/reschedule, and delete/cancel events.
  2. `https://www.googleapis.com/auth/gmail.send`: Dispatch RFC 2822 MIME emails directly via `POST /gmail/v1/users/me/messages/send`.

---

## 9. Escalation Categories & Keywords

| Category | Priority | Trigger Keywords / Patterns | Description |
|---|---|---|---|
| `PAYMENT_BILLING` | `HIGH` | `payment failed`, `charged twice`, `double charged`, `charged but no access`, `card declined`, `card not working`, `billing problem`, `invoice issue`, `wrong amount` | Payment, credit card, invoice, or subscription failure. AI must NEVER diagnose or invent refund policies. |
| `REFUND_REQUEST` | `HIGH` | `need a refund`, `want my money back`, `cancel payment`, `reverse charge`, `chargeback`, `refund policy` | Explicit refund or transaction reversal request. |
| `HUMAN_REQUEST` | `MEDIUM` / `HIGH` | `talk to someone`, `speak to a human`, `need a person`, `talk to a rep`, `sales team`, `manager`, `real person` | Prospect explicitly requests human sales assistance. |
| `UNRESOLVED_SUPPORT` | `HIGH` | `this isn't working`, `account locked`, `cannot log in`, `system error`, `bug in the software`, `broken integration` | Technical failure or account problem exceeding AI capability. |
| `ACCOUNT_ISSUE` | `HIGH` | `look into my account`, `security issue`, `unauthorized access`, `change account details` | Account-specific security or data management request. |

---

## 10. Escalation Routing Rules

```
Escalation Detected
         ↓
Is Category PAYMENT_BILLING or REFUND_REQUEST?
    ├── YES ──→ Route to yadhurajsp@gmail.com (Configured via ESCALATION_EMAIL)
    └── NO  ──→ Route to Configured Escalation Recipient (ESCALATION_EMAIL / SALES_TEAM_EMAIL)
```

### Deterministic Routing Table
1. **`PAYMENT_BILLING` / `REFUND_REQUEST`**:
   - Destination: `process.env.ESCALATION_EMAIL || 'yadhurajsp@gmail.com'`
   - Priority: `HIGH`
   - AI Behavior:
     - Halt normal sales qualifying/pitching immediately.
     - Dispatch escalation email containing prospect name, email, company, exact problem, and conversation session ID.
     - Record `escalationState = 'SENT'`.
     - Speech Directive: *"I can't access or resolve billing issues directly, so I've escalated this to our team. They'll review it and follow up with you."*
     - Under NO circumstance promise refunds, invent refund policies, or claim payment was reversed.

2. **`HUMAN_REQUEST` / `UNRESOLVED_SUPPORT` / `ACCOUNT_ISSUE`**:
   - Destination: `process.env.ESCALATION_EMAIL || process.env.SALES_TEAM_EMAIL || 'yadhurajsp@gmail.com'`
   - Priority: `MEDIUM` (or `HIGH` if account locked)
   - AI Behavior:
     - Halt sales qualifying/pitching.
     - Dispatch escalation email.
     - Record `escalationState = 'SENT'`.
     - Speech Directive: *"I've passed this to our team with the relevant details. They'll follow up with you directly."*

3. **Anti-Duplication Protection**:
   - If the prospect repeats their complaint in subsequent turns within the same session and an escalation is already `PENDING` or `SENT`:
     - Do NOT send duplicate emails.
     - Simply reaffirm to the customer: *"Our team has already received this escalation with your details and is looking into it."*

---

## 11. Final Authoritative Architecture

```
lib/
├── calendar/
│   ├── client.ts          # Google OAuth token management & Calendar REST client
│   ├── availability.ts    # checkAvailability(): queries real FreeBusy & events
│   ├── booking.ts         # bookMeeting(): parse, tz, avail, create event, meet link
│   ├── reschedule.ts      # rescheduleMeeting(): update event start/end
│   ├── cancellation.ts    # cancelMeeting(): delete event
│   ├── types.ts           # Calendar inputs, slot types, results
│   └── index.ts           # Canonical entry point for all calendar operations
│
├── email/
│   ├── client.ts          # Gmail REST client (users/me/messages/send)
│   ├── send.ts            # Canonical sendEmail() & sendMeetingConfirmation()
│   ├── templates/
│   │   ├── index.ts       # Template exports
│   │   ├── meeting-confirmation.ts # Responsive HTML + plaintext sales confirmation
│   │   └── escalation.ts  # Scannable internal human handoff email template
│   ├── types.ts           # Email inputs, records, options
│   └── index.ts           # Canonical entry point for all email operations
│
└── escalation/
    ├── detector.ts        # Intent & keyword detector for billing, refund, human
    ├── router.ts          # Deterministic routing logic
    ├── state.ts           # State machine (NOT_REQUIRED -> SENT -> RESOLVED)
    ├── service.ts         # escalateToHuman(): orchestrates deduplication, send, state
    ├── templates.ts       # Escalation email formatting wrapper
    ├── types.ts           # Categories, priorities, payloads
    └── index.ts           # Canonical entry point for all escalation operations
```

---

## 12. Remaining Manual Configuration

1. **Google Cloud Console Redirect URIs**:
   - Ensure the OAuth 2.0 Web Client includes:
     - `http://localhost:3000/api/auth/google/callback`
     - `https://agorasalesagent.vercel.app/api/auth/google/callback`
2. **Environment Variables on Vercel**:
   - Ensure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `ESCALATION_EMAIL`, and `TEST_EMAIL` are configured in Vercel Project Settings for production deployment.
