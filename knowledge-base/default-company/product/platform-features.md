# Platform Features & Technical Architecture

## Core Technology
Our conversational AI sales agent is built on top of Agora Real-Time Voice (RTC) and Real-Time Messaging (RTM), paired with ultra-responsive streaming LLMs and Pinecone vector retrieval.

## Real-Time Voice Capabilities
- **Sub-500ms End-to-End Latency**: From user speech termination to audio response playback.
- **Natural Voice Turn-Taking**: Real-time voice activity detection (VAD) handles interruptions gracefully. If the customer interrupts, the agent halts mid-sentence and listens attentively.
- **Human-like Tone & Emotion**: Adaptive pacing, professional tone, and intelligent pause handling.

## Multi-Tenant Knowledge RAG
- **Zero Cross-Tenant Leakage**: All customer vectors are partitioned with strict metadata isolation (`companyId`). Queries will never return or expose another organization's confidential sales collateral.
- **Vector Search Engine**: Pinecone serverless vector index with 1536-dimensional OpenAI embeddings (`text-embedding-3-small`) using cosine similarity.
- **Dynamic Context Injection**: Retrieved chunks (pricing, objections, product specs) are supplied into the LLM system prompt in real-time during voice conversations.

## CRM & Workflow Automation
- Automatic lead capture and transcription summary generation.
- HubSpot CRM two-way sync: Contact creation, Deal stage advancement, and Call summary notes logged instantly after call disconnect.
