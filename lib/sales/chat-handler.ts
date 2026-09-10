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

export type ChatBody = {
  messages?: Array<{ role: string; content: unknown }>;
  model?: string;
  stream?: boolean;
  companyId?: string;
  sessionId?: string;
  [key: string]: unknown;
};

export type ChatCompletionsDeps = {
  createOpenAIClient: typeof createOpenAI;
  streamTextImpl: typeof streamText;
};

/**
 * OpenAI-compatible Chat Completions endpoint logic backed by Vercel AI SDK and the Sales Brain.
 * Separated from route.ts to strictly satisfy Next.js 16 App Router route export contracts.
 */
export function createChatCompletionsHandler({
  createOpenAIClient,
  streamTextImpl,
}: ChatCompletionsDeps) {
  return async function POST(request: NextRequest) {
    // ── Config ────────────────────────────────────────────────────────────────
    const apiKey = process.env.NEXT_LLM_API_KEY;
    const llmUrl = process.env.NEXT_LLM_URL;
    const modelId = 'gpt-4o';

    if (!apiKey || !llmUrl) {
      return NextResponse.json(
        { error: 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set' },
        { status: 500 },
      );
    }

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

    // ── Server-Side Debug Logging ─────────────────────────────────────────────
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
      escalateToHuman: tool({
        description: 'Escalate an issue to a human team member for billing problems, refund requests, or explicit human assistance requests.',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['PAYMENT_BILLING', 'REFUND_REQUEST', 'HUMAN_REQUEST', 'UNRESOLVED_SUPPORT', 'ACCOUNT_ISSUE'],
              description: 'The escalation category',
            },
            issueSummary: { type: 'string', description: 'Summary of the issue reported by the prospect' },
            customerName: { type: 'string', description: 'Customer full name' },
            customerEmail: { type: 'string', description: 'Customer email' },
            customerPhone: { type: 'string', description: 'Customer phone' },
            company: { type: 'string', description: 'Customer company' },
          },
          required: ['category', 'issueSummary'],
        }),
        execute: async (params: unknown) => {
          const { escalateToHuman } = await import('@/lib/escalation/service');
          const p = params as {
            category: 'PAYMENT_BILLING' | 'REFUND_REQUEST' | 'HUMAN_REQUEST' | 'UNRESOLVED_SUPPORT' | 'ACCOUNT_ISSUE';
            issueSummary: string;
            customerName?: string;
            customerEmail?: string;
            customerPhone?: string;
            company?: string;
          };
          return await escalateToHuman({
            category: p.category,
            issueSummary: p.issueSummary,
            sessionId,
            prospect: {
              name: p.customerName,
              email: p.customerEmail,
              phone: p.customerPhone,
              company: p.company,
            },
          });
        },
      } as any),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const result = streamTextImpl({
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
          controller.enqueue(sseChunk({ role: 'assistant', content: '' }));

          let generatedResponseText = '';
          for await (const chunk of result.textStream) {
            generatedResponseText += chunk;
            controller.enqueue(sseChunk({ content: chunk }));
          }

          console.log(`[Sales Brain] Generated Response : "${generatedResponseText.trim()}"\n`);

          const { validateResponse } = await import('@/lib/sales/validator');
          const valResult = validateResponse(generatedResponseText, salesState);
          if (!valResult.isValid) {
            console.warn(
              '[Sales Brain Validator] Response validation issues detected:',
              valResult.issues.map((i) => `[${i.ruleId}] ${i.message}`),
            );
          }

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
