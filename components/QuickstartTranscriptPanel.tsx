'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type TranscriptMessage = {
  turn_id?: string | number;
  uid: number;
  text?: string;
  createdAt?: number;
};

type QuickstartTranscriptPanelProps = {
  messageList: TranscriptMessage[];
  currentInProgressMessage: TranscriptMessage | null;
  agentUID: string;
  onSendMessage?: (text: string) => void;
};

function formatMessageTime(createdAt?: number) {
  if (!createdAt) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

export function QuickstartTranscriptPanel({
  messageList,
  currentInProgressMessage,
  agentUID,
  onSendMessage,
}: QuickstartTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState('');
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const messages = useMemo(
    () =>
      currentInProgressMessage
        ? [...messageList, currentInProgressMessage]
        : messageList,
    [currentInProgressMessage, messageList],
  );

  // Clear isWaitingForAgent as soon as an agent message arrives
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const rawText = lastMsg.text?.trim() || '';
      const isAgent =
        String(lastMsg.uid) === agentUID ||
        rawText.startsWith('[DIRECTIVE]') ||
        rawText.startsWith('[CONFIRMED');
      if (isAgent) {
        setIsWaitingForAgent(false);
      }
    }
  }, [messages, agentUID]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, isWaitingForAgent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const textToSend = inputText.trim();
    setInputText('');
    setIsWaitingForAgent(true);
    onSendMessage?.(textToSend);

    // Guard timeout to clear waiting indicator after 6 seconds if no speech response arrives
    setTimeout(() => {
      setIsWaitingForAgent(false);
    }, 6000);
  };

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card/20"
      aria-label="Transcription panel"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Transcript</h2>
          <p className="text-xs text-muted-foreground">Live voice turns</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Start speaking or type to see the live transcript here.
          </div>
        ) : (
          messages.map((message, index) => {
            const rawText = message.text?.trim() || '';
            const isAgent =
              String(message.uid) === agentUID ||
              rawText.startsWith('[DIRECTIVE]') ||
              rawText.startsWith('[CONFIRMED') ||
              rawText.includes('What date and time would you like to schedule the meeting?') ||
              rawText.includes('What time would you like for the meeting') ||
              rawText.includes('What date would you like for the meeting') ||
              rawText.includes("That time isn't available because you already have another event scheduled") ||
              rawText.includes('I have scheduled your demo for');
            const label = isAgent ? 'AI Agent' : 'Customer';
            const text = rawText.replace(/^\[DIRECTIVE\]:\s*/i, '');
            const time = formatMessageTime(message.createdAt);

            return (
              <article
                key={`${message.turn_id ?? message.uid}-${index}`}
                className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
              >
                <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold">
                  <span className={isAgent ? 'text-purple-400' : 'text-blue-400'}>{label}</span>
                  {time && <span className="font-normal text-muted-foreground">{time}</span>}
                </div>
                <div
                  className={`max-w-full whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-6 ${
                    isAgent
                      ? 'border-[#2f2f2f] bg-[#212121] text-[#e7e7e7]'
                      : 'border-[#d7d7d7] bg-[#fdfcfb] text-black'
                  }`}
                >
                  {text || '...'}
                </div>
              </article>
            );
          })
        )}
        {isWaitingForAgent && (
          <article className="flex flex-col items-start animate-fade-in">
            <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold text-purple-400">
              <span>AI Agent</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-[#2f2f2f] bg-[#212121] px-3.5 py-2 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.3s]"></span>
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400 [animation-delay:-0.15s]"></span>
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400"></span>
              <span className="ml-1 text-[11px] text-zinc-400">Responding...</span>
            </div>
          </article>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-border bg-card/40 p-2.5"
      >
        <input
          id="voice-turn-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Speak or type to the voice agent..."
          className="flex-1 rounded-xl border border-input bg-background/80 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          id="voice-turn-send-btn"
          type="submit"
          disabled={!inputText.trim()}
          className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-opacity cursor-pointer"
        >
          Send
        </button>
      </form>
    </section>
  );
}
