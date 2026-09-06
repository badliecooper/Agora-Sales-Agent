import { NextRequest, NextResponse } from 'next/server';
import { streamText, tool, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { randomUUID } from 'crypto';
import { processSalesBrain } from '@/lib/sales/brain';
import { ChatMessage } from '@/lib/sales/types';
import { logSalesStateUpdate } from '@/lib/sales/tracker';
import {
  checkCalendarAvailability,
  createCalendarMeeting,
  sendMeetingConfirmationEmail,
} from '@/lib/calendar/tools';

type ChatBody = {
  messages?: Array<{ role: string; content: unknown }>;
  model?: string;
  stream?: boolean;
  companyId?: string;
  sessionId?: string;
  [key: string]: unknown;
};

type ChatCompletionsDeps = {
  createOpenAIClient: typeof createOpenAI;
  streamTextImpl: typeof streamText;
};

/**
 * OpenAI-compatible Chat Completions endpoint backed by Vercel AI SDK and the Sales Brain.
 *
 * Agora's Conversational AI Engine calls this as its "custom LLM" — sending
 * standard OpenAI chat completion requests and expecting OpenAI SSE chunks back.
 *
 * Grounded in the Pinecone Knowledge Base with live Sales State tracking:
 * 1. Tracks customer needs, objections, competitors, BANT state, and lead score.
 * 2. Dynamically queries Pinecone for relevant documents/chunks.
 * 3. Enforces voice brevity and anti-hallucination guardrails.
 */
export function createChatCompletionsHandler({
  createOpenAIClient,
  streamTextImpl,
}: ChatCompletionsDeps) {
  return async function POST(request: NextRequest) {
    // ── Config ────────────────────────────────────────────────────────────────
    const apiKey = process.env.NEXT_LLM_API_KEY;
    const llmUrl = process.env.NEXT_LLM_URL;
    // Model is pinned here — change this to switch models without other config changes.
    // Never use body.model; that would allow callers to route to arbitrary models.
    const modelId = 'gpt-4o';

    if (!apiKey || !llmUrl) {
      return NextResponse.json(
        { error: 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set' },
        { status: 500 },
      );
    }

    // @ai-sdk/openai needs a base URL, not the full /chat/completions path
    const baseURL = llmUrl.replace(/\/chat\/completions\/?$/, '');

    let body: ChatBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const messagesList: ChatMessage[] = (body.messages ?? []).map((m) => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
    }));

    // ── Sales Brain: State Tracking & Pinecone Knowledge Retrieval ───────────
    const companyId = (body.companyId as string) || 'default-company';
    const sessionId = (body.sessionId as string) || (body.channel as string) || 'default-session';

    const { salesState, retrievedChunks: _retrievedChunks, systemPrompt } = await processSalesBrain({
      companyId,
      sessionId,
      messages: messagesList,
    });

    // ── Server-Side Debug Logging (Section 23) ─────────────────────────────────
    const latestUserMsg = messagesList.slice().reverse().find((m) => m.role === 'user');
    console.log('----------------------------------------------------');
    console.log('[Sales Brain] === INCOMING VOICE TURN ===');
    console.log(`[Sales Brain] User Message       : "${latestUserMsg?.content || ''}"`);
    console.log(`[Sales Brain] Detected Stage     : ${salesState.salesStage.toUpperCase()}`);
    console.log(`[Sales Brain] Buying Intent      : ${salesState.buyingIntent.toUpperCase()} (Lead Score: ${salesState.leadScore})`);
    logSalesStateUpdate(salesState);
    console.log('----------------------------------------------------');

    const openai = createOpenAIClient({ apiKey, baseURL });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const tools: Record<string, any> = {
      checkCalendarAvailability: tool({
        description: 'Check Google Calendar availability for a proposed meeting time window.',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            startTime: { type: 'string', description: 'Start time in HH:mm 24-hour format' },
            endTime: { type: 'string', description: 'End time in HH:mm 24-hour format' },
            timezone: { type: 'string', description: 'Timezone e.g. Asia/Kolkata' },
          },
          required: ['date', 'startTime', 'endTime'],
        }),
        execute: async (args: unknown) => {
          const { date, startTime, endTime, timezone } = args as {
            date: string;
            startTime: string;
            endTime: string;
            timezone?: string;
          };
          return await checkCalendarAvailability({
            date,
            startTime,
            endTime,
            timezone: timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
          });
        },
      } as any),
      createCalendarMeeting: tool({
        description: 'Create a calendar meeting event on Google Calendar and generate a Google Meet link.',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title of the meeting' },
            start: { type: 'string', description: 'Start ISO timestamp' },
            end: { type: 'string', description: 'End ISO timestamp' },
            timezone: { type: 'string', description: 'Timezone e.g. Asia/Kolkata' },
            customerName: { type: 'string', description: 'Customer full name' },
            customerEmail: { type: 'string', description: 'Customer email' },
            company: { type: 'string', description: 'Customer company name' },
            meetingPurpose: { type: 'string', description: 'Purpose or agenda of the meeting' },
          },
          required: ['start', 'end'],
        }),
        execute: async (params: unknown) => {
          const p = params as Parameters<typeof createCalendarMeeting>[0];
          return await createCalendarMeeting({
            ...p,
            timezone: p.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
            conversationId: sessionId,
          });
        },
      } as any),
      sendMeetingConfirmationEmail: tool({
        description: 'Send a meeting confirmation email via Gmail with meeting details and Google Meet link.',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            customerName: { type: 'string', description: 'Customer full name' },
            customerEmail: { type: 'string', description: 'Customer email' },
            company: { type: 'string', description: 'Customer company' },
            meetingTitle: { type: 'string', description: 'Meeting title' },
            start: { type: 'string', description: 'Start ISO string' },
            end: { type: 'string', description: 'End ISO string' },
            timezone: { type: 'string', description: 'Timezone e.g. Asia/Kolkata' },
            meetingUrl: { type: 'string', description: 'Google Meet link' },
            calendarEventId: { type: 'string', description: 'Google Calendar event ID' },
          },
          required: ['customerName', 'customerEmail', 'start', 'end', 'calendarEventId'],
        }),
        execute: async (params: unknown) => {
          const p = params as Parameters<typeof sendMeetingConfirmationEmail>[0];
          return await sendMeetingConfirmationEmail({
            ...p,
            timezone: p.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
            conversationId: sessionId,
          });
        },
      } as any),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const result = streamTextImpl({
      // modelId is always sourced from the environment — body.model is ignored
      model: openai(modelId),
      system: systemPrompt,
      messages: (body.messages ?? []) as NonNullable<
        Parameters<typeof streamText>[0]['messages']
      >,
      tools,
    });

    const encoder = new TextEncoder();
    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model ?? modelId;

    const sseChunk = (
      delta: Record<string, unknown>,
      finishReason: string | null = null,
    ) =>
      encoder.encode(
        `data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`,
      );

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Role-only first chunk (OpenAI convention)
          controller.enqueue(sseChunk({ role: 'assistant', content: '' }));

          let generatedResponseText = '';
          for await (const chunk of result.textStream) {
            generatedResponseText += chunk;
            controller.enqueue(sseChunk({ content: chunk }));
          }

          console.log(`[Sales Brain] Generated Response : "${generatedResponseText.trim()}"\n`);

          controller.enqueue(sseChunk({}, 'stop'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('[Sales Brain] Stream error:', err);
          controller.error(err);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  };
}

export const POST = createChatCompletionsHandler({
  createOpenAIClient: createOpenAI,
  streamTextImpl: streamText,
});
