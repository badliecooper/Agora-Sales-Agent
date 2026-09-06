import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionSalesState,
  updateSessionSalesState,
  submitCustomerDetails,
  dismissCustomerDetails,
  requestCustomerDetails,
  updateCustomerDetailsManually,
} from '@/lib/sales/tracker';
import { processSalesBrain } from '@/lib/sales/brain';
import { ChatMessage, CustomerActionType, PendingDetailsRequest } from '@/lib/sales/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId || !sessionId.trim()) {
      return NextResponse.json(
        { error: 'sessionId query parameter is required' },
        { status: 400 },
      );
    }

    const state = getSessionSalesState(sessionId.trim());
    return NextResponse.json({ success: true, salesState: state });
  } catch (error) {
    console.error('[API /api/sales/state GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve sales state' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: {
      sessionId?: string;
      companyId?: string;
      messages?: ChatMessage[];
      isNewUserTurn?: boolean;
      submitCustomerDetails?: {
        fullName?: string;
        email?: string;
        company?: string;
        phone?: string;
        [key: string]: unknown;
      };
      updateCustomerDetails?: {
        fullName: string;
        email: string;
        company?: string;
        phone?: string;
        jobTitle?: string;
        [key: string]: unknown;
      };
      dismissCustomerDetails?: boolean;
      requestCustomerDetails?: {
        actionType: CustomerActionType;
        options?: Partial<PendingDetailsRequest>;
      };
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawBody = body as Record<string, unknown>;
    const rawSessionId = body.sessionId || rawBody.channel;
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;
    const companyId = (typeof body.companyId === 'string' ? body.companyId : undefined) || 'default-company';
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!sessionId || !sessionId.trim()) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 },
      );
    }

    const cleanSessionId = sessionId.trim();
    const currentState = getSessionSalesState(cleanSessionId);

    // 1. Handle Manual Customer Details Update from Dashboard
    const manualEdit =
      body.updateCustomerDetails ||
      (rawBody.action === 'updateCustomerDetails'
        ? (rawBody.details as typeof body.updateCustomerDetails)
        : undefined);

    // Helper to synchronize updated SalesState directly into the live Agora AgentSession
    const syncWithLiveVoiceAgent = async (state: typeof currentState) => {
      try {
        const globalObj = globalThis as unknown as {
          activeAgentSessions?: Map<string, {
            status?: string;
            update?: (config: unknown) => Promise<void>;
            think?: (text: string) => Promise<unknown>;
          }>;
        };
        const activeSession = globalObj.activeAgentSessions?.get(cleanSessionId);
        if (activeSession) {
          const custName = state.customerName || state.customer?.fullName || '';
          const custEmail = state.customerEmail || state.customer?.email || '';
          const custCompany = state.company || state.customer?.company || '';
          const custPhone = state.phone || state.customer?.phone || '';

          const { buildSalesAgentPrompt } = await import('@/lib/knowledge/agent-context');
          const updatedPrompt = buildSalesAgentPrompt({ companyId, sessionId: cleanSessionId });

          if (typeof activeSession.update === 'function') {
            await activeSession.update({
              llm: {
                system_messages: [{ role: 'system', content: updatedPrompt }],
              },
            }).catch((err) => console.warn('[SalesState] activeSession.update warning:', err));
          }

          if (typeof activeSession.think === 'function') {
            await activeSession.think(
              `[CONFIRMED CUSTOMER DETAILS SAVED]: The caller has entered and saved their details in the Customer Details form: Name: "${custName}", Email: "${custEmail}", Company: "${custCompany}", Phone: "${custPhone}". You now have direct access to these details. They are saved in the system. If the caller asks: "I've updated my details. Can you see them?", "Can you see my details?", or similar, confirm immediately: "Yes, I see your details! You're ${custName} from ${custCompany}, and your email is ${custEmail}." DO NOT ask for name, email, company, or phone again under any circumstances!`
            ).catch((err) => console.warn('[SalesState] activeSession.think warning:', err));
          }
        }
      } catch (syncErr) {
        console.warn('[SalesState] syncWithLiveVoiceAgent warning:', syncErr);
      }
    };

    if (manualEdit) {
      try {
        const updatedState = updateCustomerDetailsManually(currentState, manualEdit);
        updateSessionSalesState(cleanSessionId, updatedState);
        await syncWithLiveVoiceAgent(updatedState);
        return NextResponse.json({
          success: true,
          salesState: updatedState,
        });
      } catch (valErr: unknown) {
        return NextResponse.json(
          { error: valErr instanceof Error ? valErr.message : 'Invalid customer details' },
          { status: 400 },
        );
      }
    }

    // 2. Handle Customer Details Modal Submission
    const detailsSubmission =
      body.submitCustomerDetails ||
      (rawBody.action === 'submitCustomerDetails' ? (rawBody.details as typeof body.submitCustomerDetails) : undefined);

    if (detailsSubmission) {
      const { state: updatedState, resumedResult } = await submitCustomerDetails(
        currentState,
        detailsSubmission,
      );
      updateSessionSalesState(cleanSessionId, updatedState);
      await syncWithLiveVoiceAgent(updatedState);
      return NextResponse.json({
        success: true,
        salesState: updatedState,
        resumedResult,
      });
    }

    // 2. Handle Customer Details Modal Dismissal
    if (body.dismissCustomerDetails || rawBody.action === 'dismissCustomerDetails') {
      const updatedState = dismissCustomerDetails(currentState);
      return NextResponse.json({
        success: true,
        salesState: updatedState,
      });
    }

    // 3. Handle Explicit Customer Details Request
    const requestDetailsPayload =
      body.requestCustomerDetails ||
      (rawBody.action === 'requestCustomerDetails'
        ? {
            actionType: rawBody.actionType as CustomerActionType,
            options: rawBody.options as Partial<PendingDetailsRequest>,
          }
        : undefined);

    if (requestDetailsPayload) {
      const updatedState = requestCustomerDetails(
        currentState,
        requestDetailsPayload.actionType,
        requestDetailsPayload.options,
      );
      return NextResponse.json({
        success: true,
        salesState: updatedState,
      });
    }

    // 4. Handle Conversation Messages
    if (Array.isArray(messages) && messages.length > 0) {
      const result = await processSalesBrain({
        companyId,
        sessionId: cleanSessionId,
        messages,
      });

      // Synchronize active Agora voice agent session with updated system prompt and booking directives
      try {
        const globalObj = globalThis as unknown as {
          activeAgentSessions?: Map<string, {
            status?: string;
            update?: (config: unknown) => Promise<void>;
            think?: (text: string) => Promise<unknown>;
            say?: (text: string) => Promise<void>;
          }>;
        };
        const activeSession = globalObj.activeAgentSessions?.get(cleanSessionId);
        if (activeSession) {
          const userMessages = messages.filter(
            (m: { role?: string; content?: unknown }) => m.role === 'user',
          );
          const latestUserMsg = userMessages[userMessages.length - 1];
          const latestUserText =
            typeof latestUserMsg?.content === 'string'
              ? latestUserMsg.content.trim()
              : '';

          // Run agent sync asynchronously so the HTTP chat response returns instantaneously (<100ms)
          (async () => {
            try {
              if (typeof activeSession.update === 'function') {
                await activeSession
                  .update({
                    llm: {
                      system_messages: [
                        { role: 'system', content: result.systemPrompt },
                      ],
                    },
                  })
                  .catch((err) =>
                    console.warn(
                      '[SalesState] activeSession.update on turn warning:',
                      err,
                    ),
                  );
              }

              const isNewUserTurn = Boolean(body.isNewUserTurn);

              if (isNewUserTurn) {
                const globalTurns = globalObj as unknown as {
                  sessionProcessedTurns?: Map<string, string>;
                };
                if (!globalTurns.sessionProcessedTurns) {
                  globalTurns.sessionProcessedTurns = new Map();
                }
                const lastTurn = globalTurns.sessionProcessedTurns.get(cleanSessionId);

                if (result.bookingDirective) {
                  const cleanDirective = result.bookingDirective
                    .replace(/^\[DIRECTIVE\]:\s*/i, '')
                    .trim();
                  if (lastTurn !== cleanDirective) {
                    globalTurns.sessionProcessedTurns.set(
                      cleanSessionId,
                      cleanDirective,
                    );
                    if (typeof activeSession.say === 'function') {
                      await activeSession.say(cleanDirective).catch((sayErr) => {
                        console.warn(
                          '[SalesState] activeSession.say warning, falling back to think:',
                          sayErr,
                        );
                        if (typeof activeSession.think === 'function') {
                          return activeSession.think(
                            `Please say exactly: "${cleanDirective}"`,
                          );
                        }
                      });
                    } else if (typeof activeSession.think === 'function') {
                      await activeSession
                        .think(`Please say exactly: "${cleanDirective}"`)
                        .catch((err) =>
                          console.warn(
                            '[SalesState] activeSession.think on turn warning:',
                            err,
                          ),
                        );
                    }
                  }
                } else if (
                  latestUserText &&
                  typeof activeSession.think === 'function'
                ) {
                  if (lastTurn !== latestUserText) {
                    globalTurns.sessionProcessedTurns.set(
                      cleanSessionId,
                      latestUserText,
                    );
                    await activeSession.think(latestUserText).catch((err) =>
                      console.warn(
                        '[SalesState] activeSession.think general chat warning:',
                        err,
                      ),
                    );
                  }
                }
              }
            } catch (agentErr) {
              console.warn('[SalesState] Background agent sync warning:', agentErr);
            }
          })();
        }
      } catch (syncErr) {
        console.warn('[SalesState] Turn sync warning:', syncErr);
      }

      return NextResponse.json({
        success: true,
        salesState: result.salesState,
        bookingDirective: result.bookingDirective,
      });
    }

    return NextResponse.json({ success: true, salesState: currentState });
  } catch (error) {
    console.error('[API /api/sales/state POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update sales state' },
      { status: 500 },
    );
  }
}
