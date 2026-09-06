'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AgoraRTC, {
  AgoraRTCProvider,
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  MessageSalStatus,
  TranscriptHelperMode,
  TurnStatus,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from 'agora-agent-client-toolkit';
import { AgentVisualizer } from 'agora-agent-uikit';
import { MicButtonWithVisualizer } from 'agora-agent-uikit/rtc';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import {
  getCurrentInProgressMessage,
  getMessageList,
  mapAgentVisualizerState,
  normalizeTimestampMs,
  normalizeTranscript,
} from '@/lib/conversation';
import { MicrophoneSelector } from './MicrophoneSelector';
import {
  getConversationIssueSeverity,
  type ConnectionIssue,
} from './ConversationErrorCard';
import { ConnectionStatusPanel } from './ConnectionStatusPanel';
import { QuickstartConversationLayout } from './QuickstartConversationLayout';
import {
  QuickstartPipelineMetrics,
  type QuickstartAgentMetric,
} from './QuickstartPipelineMetrics';
import { QuickstartTranscriptPanel } from './QuickstartTranscriptPanel';
import { SalesIntelligenceDashboard } from './SalesIntelligenceDashboard';
import { CustomerDetailsModal } from './CustomerDetailsModal';
import { createInitialSalesState } from '@/lib/sales/tracker';
import type { SalesState } from '@/lib/sales/types';
import type { ConversationComponentProps } from '@/types/conversation';

// Cap the displayed issues list to avoid overwhelming the UI during a cascade of errors.
const MAX_CONNECTION_ISSUES = 6;

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

// Payload shape for signaling-level errors forwarded by the agent over RTM.
// The `module` field identifies which backend subsystem (LLM / ASR / TTS) raised the error.
type RtmMessageErrorPayload = {
  object: 'message.error';
  module?: string;
  code?: number;
  message?: string;
  send_ts?: number;
};

// Payload shape for SAL (Session Abstraction Layer) registration status messages.
// VP_REGISTER_FAIL and VP_REGISTER_DUPLICATE indicate RTM channel subscription problems.
type RtmSalStatusPayload = {
  object: 'message.sal_status';
  status?: string;
  timestamp?: number;
};

// Type guard for RTM signaling-level error payloads (object: 'message.error').
function isRtmMessageErrorPayload(
  value: unknown,
): value is RtmMessageErrorPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.error'
  );
}

// Type guard for RTM SAL status payloads (object: 'message.sal_status').
function isRtmSalStatusPayload(value: unknown): value is RtmSalStatusPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.sal_status'
  );
}

function ConversationInner({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
}: ConversationComponentProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false);

  // Tracks granular RTC connection state for the status dot.
  // Agora states: DISCONNECTED | CONNECTING | CONNECTED | DISCONNECTING | RECONNECTING
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const agentUID = String(DEFAULT_AGENT_UID);
  const [joinedUID, setJoinedUID] = useState<UID>(0);

  // Canonical SalesState driving the Live Sales Intelligence Dashboard
  const [salesState, setSalesState] = useState<SalesState>(() =>
    createInitialSalesState(agoraData.channel),
  );
  const [isCallEnded, setIsCallEnded] = useState(false);

  // Transcript + agent state — managed with AgoraVoiceAI (see effect below).
  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [agentMetrics, setAgentMetrics] = useState<QuickstartAgentMetric[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>(
    [],
  );
  const addConnectionIssue = useCallback((issue: ConnectionIssue) => {
    setConnectionIssues((prev) => {
      const isDuplicate = prev.some(
        (x) =>
          x.agentUserId === issue.agentUserId &&
          x.code === issue.code &&
          x.message === issue.message &&
          Math.abs(x.timestamp - issue.timestamp) < 1500,
      );
      if (isDuplicate) return prev;
      return [issue, ...prev].slice(0, MAX_CONNECTION_ISSUES);
    });
  }, []);

  // Auto-open details panel as soon as a new issue is recorded.
  useEffect(() => {
    if (connectionIssues.length > 0) {
      setIsConnectionDetailsOpen(true);
    }
  }, [connectionIssues.length]);

  // StrictMode guard: delay `useJoin`'s ready flag until after the fake-unmount
  // cycle completes. React StrictMode fires cleanup synchronously before any
  // setTimeout callback, so the first (fake) mount's timeout is always cancelled.
  // Only the real second mount's timeout fires, meaning useJoin joins exactly once.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const { isConnected: joinSuccess, error: joinError } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10),
    },
    isReady,
  );

  useEffect(() => {
    if (joinError) {
      console.error('[Agora RTC] useJoin failed:', joinError);
    } else if (joinSuccess) {
      console.log('[Agora RTC] useJoin connected successfully, channel:', agoraData.channel);
    }
  }, [joinSuccess, joinError, agoraData.channel]);

  // Create mic track only after the StrictMode fake-unmount cycle completes (isReady).
  // Passing `true` here creates two tracks in StrictMode — the first publishes, then
  // StrictMode cleanup closes it and the second takes over, causing a ~3s audio gap.
  // isReady uses the same setTimeout(fn,0) pattern as useJoin: StrictMode cleanup fires
  // synchronously before the timeout, so only the real second mount's timer fires.
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string | undefined>(undefined);
  const [useRawAudio, setUseRawAudio] = useState(false);

  const audioTrackConfig = useMemo(() => {
    return {
      ...(selectedMicrophoneId ? { microphoneId: selectedMicrophoneId } : {}),
      ...(useRawAudio ? { AEC: false, ANS: false, AGC: false } : {}),
    };
  }, [selectedMicrophoneId, useRawAudio]);

  const { localMicrophoneTrack, error: micError } = useLocalMicrophoneTrack(isReady, audioTrackConfig);

  useEffect(() => {
    if (micError) {
      console.error('[Microphone] Initialization error:', micError);
    } else if (localMicrophoneTrack) {
      console.log('[Microphone] Initialized track successfully, label:', localMicrophoneTrack.getTrackLabel());
    }
  }, [micError, localMicrophoneTrack]);

  // If standard capture fails with NOT_READABLE, auto-retry with raw audio (disabling AEC/ANS which conflicts with Nahimic/Realtek drivers)
  useEffect(() => {
    if (micError && !useRawAudio) {
      console.warn('[Microphone] Audio track failed with processing, trying raw audio fallback...');
      setUseRawAudio(true);
    }
  }, [micError, useRawAudio]);

  useEffect(() => {
    if (micError && useRawAudio) {
      addConnectionIssue({
        id: `mic-${Date.now()}`,
        source: 'agent',
        agentUserId: 'local-mic',
        code: 'MIC_NOT_READABLE',
        message: `Microphone error: ${micError.message || 'Could not start audio source'}. If using a Lenovo laptop, check the Fn+F4 mic mute key or Lenovo Vantage Microphone Privacy setting.`,
        timestamp: Date.now(),
      });
    }
  }, [micError, useRawAudio, addConnectionIssue]);

  // ENABLE_AUDIO_PTS is a module-level SDK parameter (not on the client instance).
  // It must be set before publishing audio for transcript timing to be accurate.
  useEffect(() => {
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'ENABLE_AUDIO_PTS',
        true,
      );
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  // Track the auto-assigned RTC UID for token renewal and agent invite.
  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      if (uid !== null && uid !== undefined) {
        setJoinedUID(uid);
      }
    }
  }, [joinSuccess, client]);

  // Initialize AgoraVoiceAI once the channel is joined.
  //
  // Gating on `isReady && joinSuccess` is critical for StrictMode safety:
  //   - `isReady` ensures we are past the initial fake-unmount cycle, so this
  //     effect only runs on the real mount (not the discarded fake one).
  //   - Once `isReady` is true, React does NOT double-invoke this effect for
  //     subsequent state changes (`joinSuccess` becoming true). That means
  //     AgoraVoiceAI.init() is called exactly once.
  useEffect(() => {
    if (!isReady || !joinSuccess) return;

    let cancelled = false;

    (async () => {
      try {
        console.log('[AgoraVoiceAI] Initializing toolkit for channel:', agoraData.channel);
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmConfig: rtmClient ? { rtmEngine: rtmClient } : undefined,
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        });
        console.log('[AgoraVoiceAI] Toolkit initialized successfully');

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              // Tear down only the instance created by this effect run.
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {}
          return;
        }

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setRawTranscript((prev) => {
            // Keep local typed messages that Agora audio hasn't transcribed
            const localOnlyTurns = prev.filter(
              (p) =>
                String(p.uid) !== String(agentUID) &&
                !t.some(
                  (item) =>
                    item.turn_id === p.turn_id ||
                    (item.text?.trim() === p.text?.trim() &&
                      Math.abs((item._time || 0) - (p._time || 0)) < 4000),
                ),
            );
            // Deduplicate local turns so identical user messages are not repeated
            const uniqueLocalTurns = localOnlyTurns.filter(
              (turn, idx, arr) =>
                idx === arr.findIndex((x) => x.text?.trim() === turn.text?.trim()),
            );
            return [...uniqueLocalTurns, ...t].sort(
              (a, b) => (a._time || 0) - (b._time || 0),
            );
          });
        });
        // Agent state drives the visualizer, independent of RTC audio presence.
        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
          setAgentState(event.state),
        );
        ai.on(AgoraVoiceAIEvents.AGENT_METRICS, (_, metrics) => {
          setAgentMetrics((prev) => [...prev, metrics].slice(-8));
        });
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-message-error-${error.code}`,
            source: 'rtm',
            agentUserId,
            code: error.code,
            message: error.message,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });
        // SAL status: capture raw RTM messages so message.sal_status surfaces even if higher-level events don't.
        ai.on(
          AgoraVoiceAIEvents.MESSAGE_SAL_STATUS,
          (agentUserId, salStatus) => {
            if (
              salStatus.status === MessageSalStatus.VP_REGISTER_FAIL ||
              salStatus.status === MessageSalStatus.VP_REGISTER_DUPLICATE
            ) {
              addConnectionIssue({
                id: `${Date.now()}-${agentUserId}-sal-${salStatus.status}`,
                source: 'rtm',
                agentUserId,
                code: salStatus.status,
                message: `SAL status: ${salStatus.status}`,
                timestamp: normalizeTimestampMs(salStatus.timestamp),
              });
            }
          },
        );
        // Agent error: capture raw RTM messages so message.error surfaces even if higher-level events don't.
        ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-agent-error-${error.code}`,
            source: 'agent',
            agentUserId,
            code: error.code,
            message: `${error.type}: ${error.message}`,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });
        // subscribeMessage binds the toolkit to both RTC stream messages and RTM payloads.
        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) {
          console.error('[AgoraVoiceAI] init failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, joinSuccess]);

  // Raw RTM parsing is kept as a fallback for signaling-level errors and SAL status.
  useEffect(() => {
    if (!rtmClient) return;
    const handleRtmMessage = (event: {
      message: string | Uint8Array;
      publisher: string;
    }) => {
      const payloadText =
        typeof event.message === 'string'
          ? event.message
          : new TextDecoder().decode(event.message);

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        return;
      }

      if (isRtmMessageErrorPayload(parsed)) {
        const p = parsed;
        addConnectionIssue({
          id: `${Date.now()}-${event.publisher}-rtm-msg-error-${p.code ?? 'unknown'}`,
          source: 'rtm-signaling',
          agentUserId: event.publisher,
          code: p.code ?? 'unknown',
          message: `${p.module ?? 'unknown'}: ${p.message ?? 'Unknown signaling error'}`,
          timestamp: normalizeTimestampMs(p.send_ts ?? Date.now()),
        });
        return;
      }

      if (isRtmSalStatusPayload(parsed)) {
        const p = parsed;
        if (
          p.status === 'VP_REGISTER_FAIL' ||
          p.status === 'VP_REGISTER_DUPLICATE'
        ) {
          addConnectionIssue({
            id: `${Date.now()}-${event.publisher}-rtm-sal-${p.status}`,
            source: 'rtm-signaling',
            agentUserId: event.publisher,
            code: p.status,
            message: `SAL status: ${p.status}`,
            timestamp: normalizeTimestampMs(p.timestamp ?? Date.now()),
          });
        }
      }
    };

    rtmClient.addEventListener('message', handleRtmMessage);
    return () => {
      rtmClient.removeEventListener('message', handleRtmMessage);
    };
  }, [rtmClient, addConnectionIssue]);

  // The toolkit uses uid="0" for local user speech — remap to actual RTC UID
  // so the transcript panel renders user messages on the correct side.
  // Also normalize punctuation spacing for display when upstream text arrives compacted.
  const transcript = useMemo(() => {
    return normalizeTranscript(rawTranscript, String(client.uid));
  }, [rawTranscript, client.uid]);

  // Completed (END + INTERRUPTED) messages shown as history.
  // INTERRUPTED must be included — if the agent's first turn is cut off,
  // messageList stays empty and the first interrupted turn is never shown.
  const messageList = useMemo(() => getMessageList(transcript), [transcript]);

  const currentInProgressMessage = useMemo(() => {
    // The live partial turn renders separately from the completed history list.
    return getCurrentInProgressMessage(transcript);
  }, [transcript]);

  // Publish local mic once the track exists; usePublish waits for RTC connection.
  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });

  // Sync isAgentConnected with remoteUsers (covers cases where user-joined/left are missed)
  useEffect(() => {
    const isAgentInRemoteUsers = remoteUsers.some(
      (user) => user.uid.toString() === agentUID,
    );
    setIsAgentConnected(isAgentInRemoteUsers);
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState);
  });

  const connectionSeverity = useMemo<'normal' | 'warning' | 'error'>(() => {
    // RTC transport problems take precedence; otherwise derive severity from captured issues.
    if (
      connectionState === 'DISCONNECTED' ||
      connectionState === 'DISCONNECTING'
    ) {
      return 'error';
    }
    if (
      connectionState === 'CONNECTING' ||
      connectionState === 'RECONNECTING'
    ) {
      return 'warning';
    }
    if (connectionIssues.length === 0) {
      return 'normal';
    }
    return connectionIssues.some(
      (issue) => getConversationIssueSeverity(issue) === 'error',
    )
      ? 'error'
      : 'warning';
  }, [connectionState, connectionIssues]);

  const visualizerState = useMemo(
    () =>
      mapAgentVisualizerState(agentState, isAgentConnected, connectionState),
    [agentState, isAgentConnected, connectionState],
  );

  /**
   * Mute/unmute via track.setEnabled() only — usePublish owns publish state.
   * If we also unpublish in the toggle, usePublish and the button fight each other
   * and break the MicButtonWithVisualizer Web Audio graph.
   */
  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled;
    const track = localMicrophoneTrack;
    if (!track) {
      setIsEnabled(next);
      return;
    }
    try {
      await track.setEnabled(next);
      setIsEnabled(next);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  }, [isEnabled, localMicrophoneTrack]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      // RTC and RTM renew independently, but the quickstart fetches both in one request.
      const { rtcToken, rtmToken } = await onTokenWillExpire(
        joinedUID.toString(),
      );
      await client?.renewToken(rtcToken);
      if (rtmClient) {
        await rtmClient.renewToken(rtmToken);
      }
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const currentMessages = useMemo(() => {
    const items = [...messageList];
    if (currentInProgressMessage && currentInProgressMessage.text?.trim()) {
      items.push(currentInProgressMessage);
    }
    return items
      .filter((item) => item.text && item.text.trim())
      .map((item) => {
        const text = item.text!.trim();
        const isAgent =
          String(item.uid) === agentUID ||
          text.startsWith('[DIRECTIVE]') ||
          text.startsWith('[CONFIRMED') ||
          text.includes('What date and time would you like to schedule the meeting?') ||
          text.includes('What time would you like for the meeting') ||
          text.includes('What date would you like for the meeting') ||
          text.includes("What's the best email address to send your calendar invite") ||
          text.includes('best email address to send your calendar invite') ||
          text.includes('best email address to send') ||
          text.includes('calendar invite and confirmation to?') ||
          text.includes('Sure, you can enter your details in the form') ||
          text.includes('Please enter your details in the form') ||
          text.includes("That time isn't available because you already have another event scheduled") ||
          text.includes('I have scheduled your demo for') ||
          text.includes("The meeting is scheduled, but I couldn't send the confirmation email") ||
          text.includes("I wasn't able to schedule the meeting due to a calendar error");
        return {
          role: isAgent ? 'assistant' : 'user',
          content: text.replace(/^\[DIRECTIVE\]:\s*/i, ''),
        };
      });
  }, [messageList, currentInProgressMessage, agentUID]);

  const latestMessagesRef = useRef<Array<{ role: string; content: string }>>([]);
  useEffect(() => {
    latestMessagesRef.current = currentMessages;
  }, [currentMessages]);

  // Synchronize canonical SalesState in real-time from server with sequence protection
  const channel = agoraData.channel;
  const syncSeqRef = useRef<number>(0);
  const isHandlingTurnRef = useRef<boolean>(false);

  useEffect(() => {
    if (!channel || currentMessages.length === 0) return;
    if (isHandlingTurnRef.current) return;

    const seq = ++syncSeqRef.current;
    const abortController = new AbortController();

    const timer = setTimeout(async () => {
      if (isHandlingTurnRef.current) return;
      try {
        const res = await fetch('/api/sales/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: channel,
            messages: currentMessages,
            isNewUserTurn: false,
          }),
          signal: abortController.signal,
        });
        if (res.ok && seq === syncSeqRef.current) {
          const data = await res.json();
          if (data.salesState) {
            setSalesState((prev) => ({
              ...data.salesState,
              // Preserve client-side CRM sync status if already completed, in progress, or failed
              crm: prev.crm?.synced || prev.crm?.syncInProgress || prev.crm?.syncFailed
                ? prev.crm
                : data.salesState.crm,
            }));
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          console.warn('[ConversationComponent] SalesState sync warning:', err);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [currentMessages, channel]);

  // Manage customer details modal visibility & submission
  const [isManualDetailsOpen, setIsManualDetailsOpen] = useState(false);

  const isDetailsModalOpen = useMemo(() => {
    if (isManualDetailsOpen) return true;

    // Do NOT open if details have already been saved or dismissed
    if (salesState.pendingDetailsRequest?.status === 'submitted') return false;
    if (salesState.pendingDetailsRequest?.status === 'dismissed') return false;

    // Do NOT open if all core customer details already exist
    const hasName = Boolean((salesState.customer?.fullName || salesState.customerName || '').trim());
    const hasEmail = Boolean((salesState.customer?.email || salesState.customerEmail || salesState.email || '').trim());
    const hasCompany = Boolean((salesState.customer?.company || salesState.company || '').trim());
    if (hasName && hasEmail && hasCompany) {
      return false;
    }

    return salesState.pendingDetailsRequest?.status === 'pending';
  }, [
    isManualDetailsOpen,
    salesState.pendingDetailsRequest?.status,
    salesState.customer?.fullName,
    salesState.customerName,
    salesState.customer?.email,
    salesState.customerEmail,
    salesState.email,
    salesState.customer?.company,
    salesState.company,
  ]);

  const handleDetailsSubmit = useCallback(
    async (details: {
      fullName: string;
      email: string;
      company?: string;
      phone?: string;
      jobTitle?: string;
      [key: string]: unknown;
    }) => {
      try {
        const res = await fetch('/api/sales/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: channel,
            submitCustomerDetails: details,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.salesState) {
            setSalesState((prev) => ({
              ...data.salesState,
              crm: prev.crm?.synced || prev.crm?.syncInProgress || prev.crm?.syncFailed
                ? prev.crm
                : data.salesState.crm,
            }));
          }
        }
      } catch (err) {
        console.error('[ConversationComponent] Error submitting customer details:', err);
        throw err;
      } finally {
        setIsManualDetailsOpen(false);
      }
    },
    [channel],
  );

  const handleSaveCustomerDetails = useCallback(
    async (details: {
      fullName: string;
      email: string;
      company?: string;
      phone?: string;
      jobTitle?: string;
    }) => {
      try {
        const res = await fetch('/api/sales/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: channel,
            updateCustomerDetails: details,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.salesState) {
            setSalesState((prev) => ({
              ...data.salesState,
              crm: prev.crm?.synced || prev.crm?.syncInProgress || prev.crm?.syncFailed
                ? prev.crm
                : data.salesState.crm,
            }));
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Failed to update customer details');
        }
      } catch (err) {
        console.error('[ConversationComponent] Error saving customer details:', err);
        throw err;
      } finally {
        setIsManualDetailsOpen(false);
      }
    },
    [channel],
  );

  const handleSendVoiceTurn = useCallback(
    async (text: string) => {
      const userItem = {
        turn_id: Date.now(),
        uid: String(client?.uid ?? '0'),
        text: text,
        status: TurnStatus.END,
        _time: Date.now(),
      } as unknown as TranscriptHelperItem<Partial<UserTranscription>>;

      setRawTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (
          last &&
          String(last.uid) === String(client?.uid ?? '0') &&
          last.text?.trim() === text.trim() &&
          Math.abs((last._time || 0) - userItem._time) < 3000
        ) {
          return prev;
        }
        return [...prev, userItem];
      });

      const updatedMessages = [
        ...latestMessagesRef.current,
        { role: 'user', content: text },
      ];

      isHandlingTurnRef.current = true;
      try {
        const res = await fetch('/api/sales/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: channel,
            messages: updatedMessages,
            isNewUserTurn: true,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.salesState) {
            setSalesState((prev) => ({
              ...data.salesState,
              crm: prev.crm?.synced || prev.crm?.syncInProgress || prev.crm?.syncFailed
                ? prev.crm
                : data.salesState.crm,
            }));
          }

          if (data.bookingDirective) {
            const cleanText = data.bookingDirective.replace(/^\[DIRECTIVE\]:\s*/i, '').trim();
            const now = Date.now() + 1;
            const agentItem = {
              turn_id: now,
              uid: String(agentUID),
              text: cleanText,
              status: TurnStatus.END,
              _time: now,
            } as unknown as TranscriptHelperItem<Partial<AgentTranscription>>;
            setRawTranscript((prev) => {
              const alreadyHas = prev.some(
                (x) =>
                  String(x.uid) === String(agentUID) &&
                  x.text?.trim() === cleanText &&
                  Math.abs((x._time || 0) - now) < 4000,
              );
              return alreadyHas ? prev : [...prev, agentItem];
            });
          }
        }
      } catch (err) {
        console.error('[ConversationComponent] Error sending voice turn:', err);
      } finally {
        setTimeout(() => {
          isHandlingTurnRef.current = false;
        }, 500);
      }
    },
    [client, channel, agentUID],
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      w.__simulateVoiceTurn = handleSendVoiceTurn;
      w.__salesState = salesState;
      w.__openDetailsModal = () => setIsManualDetailsOpen(true);
    }
  }, [handleSendVoiceTurn, salesState]);

  const handleDetailsClose = useCallback(async () => {
    setIsManualDetailsOpen(false);
    if (salesState.pendingDetailsRequest?.status === 'pending') {
      try {
        await fetch('/api/sales/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: channel,
            dismissCustomerDetails: true,
          }),
        });
        setSalesState((prev) => ({
          ...prev,
          pendingDetailsRequest: prev.pendingDetailsRequest
            ? { ...prev.pendingDetailsRequest, status: 'dismissed' }
            : null,
        }));
      } catch (err) {
        console.warn('[ConversationComponent] Error dismissing details request:', err);
      }
    }
  }, [channel, salesState.pendingDetailsRequest]);

  const handleEndConversation = useCallback(async () => {
    if (!isCallEnded) {
      setIsCallEnded(true);
      // Mute microphone
      if (localMicrophoneTrack) {
        try {
          await localMicrophoneTrack.setEnabled(false);
        } catch {}
      }
      setIsEnabled(false);

      // Perform final CRM sync so HubSpot status and IDs immediately update on dashboard
      setSalesState((prev) => ({
        ...prev,
        crm: {
          ...prev.crm,
          syncInProgress: true,
        },
      }));

      try {
        console.log('[ConversationComponent] Finalizing call & syncing to HubSpot...');
        const res = await fetch('/api/crm/sync-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: channel,
            companyId: 'default-company',
            transcript: latestMessagesRef.current,
            salesState,
          }),
        });

        if (res.ok) {
          const result = await res.json();
          setSalesState((prev) => ({
            ...prev,
            crm: {
              synced: true,
              syncInProgress: false,
              syncFailed: false,
              hubspotContactId: result.contactId || result.contact?.id,
              hubspotCompanyId: result.companyId || result.company?.id,
              hubspotDealId: result.dealId || result.deal?.id,
              hubspotNoteId: result.noteId || result.note?.id,
              syncCompletedAt: new Date().toISOString(),
            },
          }));
        } else {
          const errData = await res.json().catch(() => ({}));
          setSalesState((prev) => ({
            ...prev,
            crm: {
              ...prev.crm,
              synced: false,
              syncInProgress: false,
              syncFailed: true,
              syncError: errData?.details || errData?.error || 'HubSpot synchronization failed',
            },
          }));
        }
      } catch (crmErr) {
        console.error('[ConversationComponent] CRM sync failed:', crmErr);
        setSalesState((prev) => ({
          ...prev,
          crm: {
            ...prev.crm,
            synced: false,
            syncInProgress: false,
            syncFailed: true,
            syncError: crmErr instanceof Error ? crmErr.message : 'HubSpot synchronization failed',
          },
        }));
      }
      return;
    }

    // Secondary click completes exit to LandingPage
    onEndConversation(latestMessagesRef.current);
  }, [isCallEnded, localMicrophoneTrack, channel, salesState, onEndConversation]);

  return (
    <>
      <QuickstartConversationLayout
        statusPanel={
          <ConnectionStatusPanel
            connectionState={connectionState}
            connectionSeverity={connectionSeverity}
            connectionIssues={connectionIssues}
            isOpen={isConnectionDetailsOpen}
            onToggle={() => setIsConnectionDetailsOpen((open) => !open)}
          />
        }
        pipelineMetrics={<QuickstartPipelineMetrics metrics={agentMetrics} />}
        transcriptPanel={
          <QuickstartTranscriptPanel
            messageList={messageList}
            currentInProgressMessage={currentInProgressMessage}
            agentUID={agentUID}
            onSendMessage={handleSendVoiceTurn}
          />
        }
        visualizer={
          <div
            className="relative flex h-full min-h-[20rem] w-full max-w-4xl items-center justify-center"
            role="region"
            aria-label="AI agent status visualization"
          >
            <AgentVisualizer state={visualizerState} size="lg" />
            {remoteUsers.map((user) => (
              <div key={user.uid} className="hidden">
                <RemoteUser user={user} />
              </div>
            ))}
          </div>
        }
        controls={
          <div className="flex flex-col items-center gap-2">
            {micError && (
              <div className="rounded-md bg-destructive/15 px-3 py-1.5 text-center text-xs font-medium text-destructive">
                ⚠️ Microphone unavailable: {micError.message || 'Could not start audio source'}. Another app may be using it, or select another mic from the list.
              </div>
            )}
            <div
              className="mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 backdrop-blur-md"
              role="group"
              aria-label="Audio controls"
            >
              <div className="conversation-mic-host flex items-center justify-center">
                <MicButtonWithVisualizer
                  isEnabled={isEnabled}
                  setIsEnabled={setIsEnabled}
                  track={localMicrophoneTrack}
                  onToggle={handleMicToggle}
                  className="overflow-visible"
                  aria-label={isEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  enabledColor="hsl(var(--primary))"
                  disabledColor="hsl(var(--destructive))"
                />
              </div>
              <MicrophoneSelector
                localMicrophoneTrack={localMicrophoneTrack}
                onDeviceSelect={setSelectedMicrophoneId}
              />
            </div>
          </div>
        }
        salesDashboard={
          <SalesIntelligenceDashboard
            salesState={salesState}
            className="h-full"
            onOpenDetailsModal={() => setIsManualDetailsOpen(true)}
            onSaveCustomerDetails={handleSaveCustomerDetails}
          />
        }
        isCallEnded={isCallEnded}
        onEndConversation={handleEndConversation}
      />
      <CustomerDetailsModal
        isOpen={isDetailsModalOpen}
        request={salesState.pendingDetailsRequest || null}
        currentCustomer={{
          fullName: salesState.customer?.fullName || salesState.customerName,
          email: salesState.customer?.email || salesState.email,
          company: salesState.customer?.company || salesState.company,
          phone: salesState.customer?.phone || salesState.phone,
        }}
        onSubmit={handleDetailsSubmit}
        onClose={handleDetailsClose}
      />
    </>
  );
}

export default function ConversationComponent(props: ConversationComponentProps) {
  const [rtcClient] = useState(() => {
    console.log('[ConversationComponent] Initializing AgoraRTC client instance (mode: rtc, codec: vp8)');
    return AgoraRTC.createClient({
      mode: 'rtc',
      codec: 'vp8',
    });
  });

  return (
    <AgoraRTCProvider client={rtcClient}>
      <ConversationInner {...props} />
    </AgoraRTCProvider>
  );
}

