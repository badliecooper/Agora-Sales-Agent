# Agora Conversational AI — Enterprise Sales Agent & Intelligence Platform

[![Build](https://img.shields.io/badge/Next.js-16.2.6-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-61dafb?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Agora Voice AI](https://img.shields.io/badge/Agora-Conversational_AI_Engine-099DFD?style=flat&logo=agora)](https://www.agora.io/)
[![HubSpot](https://img.shields.io/badge/HubSpot-CRM_Integration-ff7a59?style=flat&logo=hubspot)](https://www.hubspot.com/)
[![Google Calendar & Meet](https://img.shields.io/badge/Google-Calendar_%26_Meet-4285F4?style=flat&logo=google)](https://workspace.google.com/)
[![Gmail API](https://img.shields.io/badge/Gmail-Sales_Escalation-EA4335?style=flat&logo=gmail)](https://developers.google.com/gmail/api)
[![Pinecone](https://img.shields.io/badge/Pinecone-RAG_Vector_Search-000000?style=flat&logo=pinecone)](https://www.pinecone.io/)

An enterprise-grade, autonomous Conversational AI Voice Sales Agent and Real-Time Intelligence Platform built on Next.js 16, Agora Conversational AI Engine, Deepgram Nova-2, Cartesia TTS, Pinecone Vector RAG, HubSpot CRM, and Google Workspace (Calendar, Meet, Gmail).

The agent acts as an autonomous **AI Sales Development Representative (SDR)** and **Account Executive (AE)** capable of holding sub-second voice conversations, executing BANT sales qualification, handling objections, negotiating pricing within strict guardrails, searching product knowledge in real time, booking Google Meet appointments, syncing deals into HubSpot, and instantly escalating critical customer issues to human sales leadership via the Gmail API.

---

## Table of Contents

- [Key Architecture & Capabilities](#key-architecture--capabilities)
  - [1. Real-Time Conversational Voice Pipeline](#1-real-time-conversational-voice-pipeline)
  - [2. Autonomous Sales Brain & State Machine](#2-autonomous-sales-brain--state-machine)
  - [3. Real-Time Deal Intelligence Layer](#3-real-time-deal-intelligence-layer)
  - [4. Pinecone Vector RAG Knowledge Base](#4-pinecone-vector-rag-knowledge-base)
  - [5. Google Calendar & Google Meet Integration](#5-google-calendar--google-meet-integration)
  - [6. HubSpot CRM Bi-Directional Synchronization](#6-hubspot-crm-bi-directional-synchronization)
  - [7. Human Sales Escalation Engine (Gmail API)](#7-human-sales-escalation-engine-gmail-api)
  - [8. Live Sales Intelligence Dashboard & Customer Details Modal](#8-live-sales-intelligence-dashboard--customer-details-modal)
- [System Architecture](#system-architecture)
- [Directory Structure & Code Map](#directory-structure--code-map)
- [Prerequisites](#prerequisites)
- [Quick Start Guide](#quick-start-guide)
- [Environment Variables](#environment-variables)
- [Google Workspace OAuth Setup](#google-workspace-oauth-setup)
- [Testing & Verification Suite](#testing--verification-suite)
- [API Routes Reference](#api-routes-reference)
- [Voice & Audio Tuning](#voice--audio-tuning)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Key Architecture & Capabilities

### 1. Real-Time Conversational Voice Pipeline
- **Agora WebRTC Engine**: Ultra-low latency voice streaming using `agora-rtc-react` hooks and `agora-rtc-sdk-ng`.
- **Zero-Latency Transcripts**: WebRTC datastream and RTM data channels stream live speaker turns, transcripts, and agent status without polling.
- **Deepgram Nova-2 STT**: Configured with `smartFormat: true`, conversational VAD with low-latency speech detection (`speech_threshold: 0.25`, `prefix_padding_ms: 400`, `silence_duration_ms: 600`) for natural, non-laggy voice capture even with soft speech or quiet microphones.
- **Cartesia Sonic TTS**: Ultra-realistic voice synthesis providing human-like prosody and immediate speech turnaround.
- **Telemetry & Latency Tracking**: Real-time per-stage latency breakdown via `AGENT_METRICS` (STT, LLM TTFT, TTS, and network round-trip time).

### 2. Autonomous Sales Brain & State Machine
- **BANT Qualification**: Dynamically extracts and validates **B**udget, **A**uthority, **N**eed, and **T**imeline from unstructured conversational speech.
- **Stage Progression**: Automatically navigates through canonical sales stages:
  `Discovery` ➔ `Qualification` ➔ `Needs Analysis` ➔ `Pitch` ➔ `Recommendation` ➔ `Objection Handling` ➔ `Negotiation` ➔ `Closing` ➔ `Follow-Up`.
- **Dynamic Lead Scoring**: Calculates a real-time lead score (0 to 100) based on role seniority, budget size, timeline urgency, pain point depth, and buying intent.
- **Objection Handling**: Detects and addresses specific objection categories (`price_too_high`, `competitor_cheaper`, `implementation_risk`, `need_approval`, `missing_feature`, `security_concern`) with contextual value propositions.
- **Negotiation Guardrails**: Evaluates budget vs. product tiers, manages allowable discount thresholds, and enforces give/get concession balances.
- **Next Best Action (NBA)**: Computes the optimal next conversational step at every turn (e.g., `discover_pain_point`, `clarify_budget`, `handle_price_objection`, `propose_meeting_slot`).

### 3. Real-Time Deal Intelligence Layer
- **Deal Confidence Gauge**: Real-time 0–100% confidence score derived from qualification completeness, intent signals, and blocker resolution.
- **Negotiation Leverage**: Continuously classifies leverage (`Customer`, `Balanced`, `Agora (AI)`, `Unknown`).
- **Concessions Tracker**: Records concessions requested by customer vs. concessions offered by AI to prevent one-sided bargaining.
- **Strategy Insights**: Live explanations of why the AI selected a specific sales posture (e.g., Value-Driven Pitch, Accommodating Negotiation, Consultative Discovery).

### 4. Pinecone Vector RAG Knowledge Base
- Ingests and embeds product catalogs, pricing tiers, feature matrices, competitor battlecards, and case studies into Pinecone vector storage.
- Real-time semantic similarity retrieval injects high-relevance knowledge chunks directly into the Sales Brain prompt.
- Active citations and retrieved document snippets are visible live in the UI dashboard under **Knowledge Used**.

### 5. Google Calendar & Google Meet Integration
- **Conversational Booking**: Discovers open slots, suggests times, and books appointments directly during voice conversations.
- **Google Meet Auto-Generation**: Creates a calendar event with a unique Google Meet video link.
- **Timezone Awareness**: Handles natural date/time language across timezones (e.g., "tomorrow at 3 PM EST", "next Monday morning").
- **Branded Confirmation Email**: Automatically emails the customer an RFC 2822 MIME confirmation with calendar details, formatted dates, and join links.

### 6. HubSpot CRM Bi-Directional Synchronization
- **Automated CRM Sync**: Pushes customer identity, company info, BANT qualification, deal size, lead score, and sales stage to HubSpot.
- **Intelligent Deduplication**: Searches for existing contacts and companies by email and domain before creating new records.
- **Deals & Engagements**: Creates deals associated with companies and logs full call transcripts and Next Best Action notes.

### 7. Human Sales Escalation Engine (Gmail API)
- **High-Severity Trigger Detection**: Automatically recognizes urgent situations requiring human intervention:
  - Payment or billing issues (e.g., customer paid for a tier or key but has not received fulfillment).
  - Explicit customer requests to speak with human sales reps or account executives.
  - High-value custom enterprise deals exceeding automated discount guardrails.
- **Fixed Destination Routing**: All escalation briefings are routed to `yadhurajsp@gmail.com`.
- **Truth-Aligned AI Directives**: The voice agent only informs the customer that the team was notified *after* the email successfully dispatches; if Gmail fails, the agent truthfully reports the delay and provides alternative support instructions.
- **Session Idempotency**: Prevents duplicate notification emails if the user repeats their request in the same session.
- **Executive HTML Briefing**: Dispatches rich HTML & plaintext email containing customer details, transaction history, conversation transcript, severity level, and recommended sales rep action.

### 8. Live Sales Intelligence Dashboard & Customer Details Modal
- **Agent Visualizer & Audio Waveform**: Interactive visualizer showing agent listening, thinking, and speaking states.
- **BANT Checklist**: Live checkmarks and progress bars reflecting information collected.
- **Customer Details Modal**: Real-time modal allowing operator or customer to manually view and update name, email, company, and phone with voice-overwrite guards.
- **Live Transcript Rail**: Color-coded turn-by-turn speech transcript with millisecond timestamps and stage markers.

---

## System Architecture

```mermaid
flowchart TB
    subgraph ClientBrowser [Browser Client (Next.js 16 + React 19)]
        UI[Sales Intelligence Dashboard]
        Mic[Microphone Audio Stream]
        AEC[Native WebRTC AEC & Noise Suppression]
        RTC_Client[Agora RTC Client]
        RTM_Client[Agora RTM / Datastream Listener]
        Modal[Customer Details Modal]
    end

    subgraph AgoraCloud [Agora Conversational AI Cloud Engine]
        Channel[RTC Voice Channel]
        Deepgram[Deepgram Nova-2 STT]
        AgentEngine[Agora Agent Core]
        Cartesia[Cartesia Sonic TTS]
    end

    subgraph Backend [Next.js App Router Server]
        API_Token[/api/generate-agora-token]
        API_Invite[/api/invite-agent]
        API_Stop[/api/stop-conversation]
        API_Sales[/api/sales/state]
        API_CRM[/api/crm/sync-lead]
        SalesBrain[Sales Brain & State Machine]
        EscalationEngine[Escalation Engine]
        CalendarHelper[Google Calendar Helper]
    end

    subgraph ExternalServices [External Enterprise Services]
        Pinecone[(Pinecone Vector DB)]
        OpenAI[LLM Reasoning Engine]
        HubSpot[(HubSpot CRM API)]
        GoogleCal[(Google Calendar & Meet API)]
        GmailAPI[(Gmail API - Sales Escalation)]
    end

    Mic --> AEC --> RTC_Client
    RTC_Client <===>|WebRTC Audio| Channel
    Channel <--> Deepgram
    Deepgram --> AgentEngine
    AgentEngine --> Cartesia
    Cartesia --> Channel

    Channel -.->|Datastream Transcripts| RTM_Client
    RTM_Client --> UI

    UI --> API_Sales
    Modal --> API_Sales
    API_Invite --> Channel

    AgentEngine <===>|SSE Chat Stream| SalesBrain
    SalesBrain <--> Pinecone
    SalesBrain <--> OpenAI
    SalesBrain --> EscalationEngine
    SalesBrain --> CalendarHelper

    CalendarHelper --> GoogleCal
    CalendarHelper --> GmailAPI
    EscalationEngine -->|Escalate to yadhurajsp@gmail.com| GmailAPI
    API_CRM --> HubSpot
```

---

## Directory Structure & Code Map

```
Agora-Sales-Agent-main/
├── app/
│   ├── api/
│   │   ├── auth/google/          # Google OAuth login and callback routes
│   │   ├── chat/completions/     # OpenAI-compatible streaming proxy for Sales Brain
│   │   ├── crm/sync-lead/        # HubSpot contact, company, and deal sync route
│   │   ├── generate-agora-token/ # Issues combined RTC + RTM Agora access tokens
│   │   ├── invite-agent/         # Starts cloud voice agent, configures STT, TTS, and VAD
│   │   ├── knowledge/            # Pinecone RAG search endpoint
│   │   ├── sales/state/          # Canonical SalesState fetch and update handler
│   │   └── stop-conversation/    # Gracefully stops the voice agent and channel
│   ├── layout.tsx                # Root layout and metadata
│   └── page.tsx                  # Root application entry
├── components/
│   ├── AgentVisualizer.tsx       # Animated voice waveform and state visualizer
│   ├── ConnectionStatusPanel.tsx # RTC/RTM connection diagnostics and latency chips
│   ├── ConversationComponent.tsx # Main Agora voice session coordinator and audio tracks
│   ├── CustomerDetailsModal.tsx  # Customer details popover with manual override protections
│   ├── LandingPage.tsx           # Pre-call hero screen, audio setup, and launcher
│   ├── QuickstartTranscriptPanel.tsx # Live conversation transcript rail
│   └── SalesIntelligenceDashboard.tsx # Comprehensive enterprise sales dashboard
├── lib/
│   ├── agora.ts                  # Shared Agora configuration and agent UID constants
│   ├── conversation.ts           # Transcript normalization and speaker mapping
│   ├── calendar/
│   │   ├── google.ts             # Google Calendar API, Meet link generator, OAuth token refresh
│   │   └── tools.ts              # Agent tool definitions for calendar slot search & booking
│   ├── email/
│   │   ├── gmail.ts              # Gmail API sender, MIME builder, and idempotency store
│   │   └── index.ts              # Email module exports
│   ├── hubspot.ts                # HubSpot API client, contact deduplication, and deal sync
│   ├── knowledge/
│   │   ├── embeddings.ts         # OpenAI text-embedding-3-small integration
│   │   ├── pinecone.ts           # Pinecone vector index queries and upserts
│   │   └── service.ts            # High-level RAG retrieval service
│   └── sales/
│       ├── brain.ts              # Core Sales Brain reasoning, stage manager, and prompt builder
│       ├── calendar-helper.ts    # Conversational date/time slot interpreter and booking
│       ├── deal-intelligence.ts  # Deal confidence, negotiation leverage, and concessions
│       ├── escalation.ts         # Human sales escalation detector, router, and state manager
│       ├── tracker.ts            # Information collection checklist and entity extraction
│       └── types.ts              # Canonical TypeScript definitions for SalesState and CRM
├── scripts/
│   ├── auth-google.ts            # Interactive CLI script for Google OAuth 2.0 authorization
│   ├── ingest-knowledge-docs.ts  # Ingests markdown/txt knowledge files into Pinecone
│   ├── verify-api-contracts.ts   # Route and payload validation test suite
│   ├── verify-sales-brain.ts     # BANT qualification and stage progression test suite
│   ├── verify-sales-escalation.ts# 80/80 test suite for Human Sales Escalation via Gmail
│   ├── verify-hubspot-crm.ts     # HubSpot CRM lead creation & deduplication test suite
│   └── verify-calendar-booking.ts# Google Calendar & Meet booking test suite
└── env.local.example             # Template for required environment variables
```

---

## Prerequisites

- **Node.js**: `v22.0.0` or higher
- **Package Manager**: `pnpm` (`v9+` or `v12+`)
- **Agora Developer Account**: App ID and App Certificate with Conversational AI Engine enabled.
- **Google Cloud Platform Project** *(Optional for Calendar/Gmail)*: OAuth 2.0 Client ID and Secret with Calendar and Gmail scopes.
- **HubSpot Developer Account** *(Optional for CRM)*: Private App Access Token with `crm.objects.contacts`, `crm.objects.companies`, and `crm.objects.deals` scopes.
- **Pinecone Account** *(Optional for RAG)*: Pinecone API Key and Serverless Index.
- **OpenAI Account** *(Optional for embeddings and LLM reasoning)*: OpenAI API Key.

---

## Quick Start Guide

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/Agora-Sales-Agent.git
cd Agora-Sales-Agent
pnpm install
```

### 2. Configure Environment Variables

Copy the example environment configuration:

```bash
cp env.local.example .env.local
```

Open `.env.local` and enter your credentials (see [Environment Variables](#environment-variables) for descriptions):

```ini
NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
NEXT_AGORA_APP_CERTIFICATE=your_agora_app_certificate
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=agora-sales-knowledge
HUBSPOT_ACCESS_TOKEN=your_hubspot_token
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
```

### 3. Google Workspace OAuth (Calendar & Gmail)

To enable live Google Calendar booking, Google Meet generation, and Gmail sales escalation, authorize your Google account:

```bash
pnpm run auth:google
```

Follow the interactive terminal prompt to open the Google consent URL, authorize the app, and paste the resulting authorization code. The script will output your `GOOGLE_REFRESH_TOKEN` to add to `.env.local`.

### 4. Ingest Knowledge Base into Pinecone (Optional)

Embed and store product collateral, battlecards, and sales manuals into your Pinecone index:

```bash
pnpm run ingest:docs
```

### 5. Start the Development Server

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser, allow microphone permissions, and click **Start conversation** to speak with your voice sales agent.

---

## Environment Variables

| Variable | Required | Scope | Description |
| :--- | :---: | :---: | :--- |
| `NEXT_PUBLIC_AGORA_APP_ID` | ✅ Yes | Client & Server | Agora Console ➔ Project ➔ App ID |
| `NEXT_AGORA_APP_CERTIFICATE` | ✅ Yes | Server Only | Agora Console ➔ Project ➔ App Certificate |
| `OPENAI_API_KEY` | ⚡ Recommended | Server Only | OpenAI API key for Sales Brain reasoning and embeddings |
| `PINECONE_API_KEY` | ⚡ Recommended | Server Only | Pinecone vector database API key |
| `PINECONE_INDEX` | ⚡ Recommended | Server Only | Target Pinecone index name (e.g. `agora-sales-knowledge`) |
| `HUBSPOT_ACCESS_TOKEN` | ⚡ Recommended | Server Only | HubSpot Private App Access Token for CRM sync |
| `GOOGLE_CLIENT_ID` | ⚡ Recommended | Server Only | Google Cloud OAuth 2.0 Web Client ID |
| `GOOGLE_CLIENT_SECRET` | ⚡ Recommended | Server Only | Google Cloud OAuth 2.0 Client Secret |
| `GOOGLE_REFRESH_TOKEN` | ⚡ Recommended | Server Only | Long-lived Google OAuth 2.0 refresh token |
| `GOOGLE_CALENDAR_ID` | Optional | Server Only | Target Google Calendar ID (defaults to `'primary'`) |

> [!NOTE]
> All credentials except `NEXT_PUBLIC_AGORA_APP_ID` are strictly isolated to the server-side Next.js runtime and are never leaked to the browser.

---

## Google Workspace OAuth Setup

The agent interacts with Google Calendar (scheduling meetings) and Gmail (sending meeting invites and escalating urgent issues to human sales leadership).

### Required Google Cloud Scopes
1. `https://www.googleapis.com/auth/calendar.events` (Create and update calendar events and Google Meet links)
2. `https://www.googleapis.com/auth/gmail.send` (Send meeting confirmations and sales escalation emails)

### Steps to Generate Credentials
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project, then navigate to **APIs & Services ➔ Library**.
3. Enable both the **Google Calendar API** and the **Gmail API**.
4. Configure the **OAuth Consent Screen** (User Type: External, add your test email accounts).
5. Go to **Credentials ➔ Create Credentials ➔ OAuth client ID** (Application type: **Web application**).
6. Add Authorized Redirect URI: `http://localhost:3000/api/auth/google/callback`.
7. Copy the Client ID and Client Secret into `.env.local`.
8. Run `pnpm run auth:google` to generate the refresh token.

---

## Testing & Verification Suite

The repository includes a comprehensive automated test and verification suite:

```bash
# Verify TypeScript types
pnpm run typecheck

# Lint codebase
pnpm run lint

# Verify core API route contracts
pnpm run verify:api

# Verify Human Sales Escalation via Gmail (80 test scenarios)
node --import tsx scripts/verify-sales-escalation.ts

# Verify Sales Brain BANT qualification & stage progression
pnpm run test:sales

# Verify HubSpot CRM lead synchronization and deduplication
pnpm run test:crm

# Verify Google Calendar & Google Meet booking flows
pnpm run test:calendar

# Verify negotiation bounds and objection handling
pnpm run test:negotiation

# Verify Pinecone vector knowledge retrieval
pnpm run test:knowledge

# Full pre-ship verification (doctor + lint + typecheck + api + knowledge + build)
pnpm run verify
```

---

## API Routes Reference

### `POST /api/generate-agora-token`
Generates a dual RTC and RTM token using Agora's `RtcTokenBuilder.buildTokenWithRtm`.
- **Request Body**: `{ channelName: string, uid: number }`
- **Response**: `{ token: string, rtcToken: string, rtmToken: string, channelName: string, uid: number }`

### `POST /api/invite-agent`
Spawns an Agora cloud voice agent in the specified channel with Deepgram STT, Cartesia TTS, customized VAD thresholds, and Sales Brain streaming.
- **Request Body**: `{ channelName: string, uid: number }`
- **Response**: `{ success: boolean, agentSessionId: string }`

### `POST /api/stop-conversation`
Terminates the cloud voice agent session and releases channel resources.
- **Request Body**: `{ channelName: string }`
- **Response**: `{ success: boolean, message: string }`

### `POST /api/sales/state`
Reads or updates the canonical `SalesState` for the active conversation session, preserving manual customer overrides against automated voice overwrites.
- **Request Body**: `{ conversationId: string, updates?: Partial<SalesState> }`
- **Response**: `{ success: boolean, state: SalesState }`

### `POST /api/crm/sync-lead`
Validates collected customer information, deduplicates against HubSpot contacts/companies, creates or updates deals, and logs conversation transcripts.
- **Request Body**: `{ session_id: string, name?: string, email?: string, phone?: string, company?: string }`
- **Response**: `{ success: boolean, contactId: string, dealId?: string, synced: boolean }`

---

## Voice & Audio Tuning

The voice agent is pre-configured in `app/api/invite-agent/route.ts` with optimized Voice Activity Detection (VAD) and WebRTC audio processing settings:

```typescript
// Deepgram Nova-2 STT with smart formatting
stt: {
  provider: 'deepgram',
  config: {
    model: 'nova-2',
    language: 'en',
    smartFormat: true,
  }
}

// Conversational VAD for natural turn-taking
turnDetection: {
  type: 'server_vad',
  config: {
    speech_threshold: 0.25,    // Sensitive threshold to capture soft and natural speech
    prefix_padding_ms: 400,    // Pre-buffers 400ms of audio to prevent clipping first words
    silence_duration_ms: 600,  // Fast 600ms turnaround after user stops speaking
  }
}
```

In the browser client (`components/ConversationComponent.tsx`), the microphone track uses native browser Acoustic Echo Cancellation (`echoCancellation: true`) and Noise Suppression (`noiseSuppression: true`) without aggressive DSP constraints, ensuring crystal-clear audio capture.

---

## Troubleshooting

### Transcripts Not Appearing on UI
- Verify that `data_channel: 'datastream'` is configured in `app/api/invite-agent/route.ts`. The browser listens to WebRTC `stream-message` events for zero-latency peer delivery.
- Ensure the user UID remapping in `components/ConversationComponent.tsx` maps the Agora toolkit sentinel (`uid === "0"`) to the local client UID.

### Microphone Not Catching Speech
- Check that your browser has granted microphone permissions.
- In `app/api/invite-agent/route.ts`, confirm that `speech_threshold` is set to `0.25` rather than high thresholds (e.g. `0.5` or `0.7`) which can filter out normal speech.

### Gmail Escalation Shows "Authentication Required"
- Run `pnpm run auth:google` to authorize your Google account and verify that your `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` are populated in `.env.local`.
- Ensure the `https://www.googleapis.com/auth/gmail.send` scope was selected during authorization.

### HubSpot CRM Sync Skipped
- Confirm `HUBSPOT_ACCESS_TOKEN` is set in `.env.local`.
- Verify the token has the necessary scopes: `crm.objects.contacts.write`, `crm.objects.companies.write`, `crm.objects.deals.write`.

---

## License

This project is licensed under the [MIT License](LICENSE).
