'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

type QuickstartConversationLayoutProps = {
  statusPanel: ReactNode;
  pipelineMetrics: ReactNode;
  transcriptPanel: ReactNode;
  visualizer: ReactNode;
  controls: ReactNode;
  salesDashboard?: ReactNode;
  isCallEnded?: boolean;
  onEndConversation: () => void;
};

export function QuickstartConversationLayout({
  statusPanel,
  pipelineMetrics,
  transcriptPanel,
  visualizer,
  controls,
  salesDashboard,
  isCallEnded,
  onEndConversation,
}: QuickstartConversationLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col text-left">
      {/* Top Header with "LIVE SALES CALL" Banner */}
      <header className="flex shrink-0 flex-col gap-4 border-b border-border px-4 py-3 md:h-[72px] md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/agora-logo-mark.svg"
            alt="Agora"
            width={38}
            height={38}
            className="h-9 w-9 shrink-0 object-contain"
          />
          <div className="flex min-w-0 flex-col justify-center gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-bold leading-none tracking-tight text-foreground">
                LIVE SALES CALL
              </span>
              <span className="hidden sm:inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                {isCallEnded ? 'Call Concluded' : 'Agora Intelligence'}
              </span>
            </div>
            {pipelineMetrics}
          </div>
        </div>

        <div className="flex items-center gap-2 md:pr-1">
          {statusPanel}
          <Button
            variant={isCallEnded ? 'outline' : 'destructive'}
            size="sm"
            className={`h-8 rounded-md px-3 text-xs font-medium ${
              isCallEnded
                ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                : 'border border-destructive bg-transparent text-destructive hover:bg-destructive/10'
            }`}
            onClick={onEndConversation}
            aria-label={isCallEnded ? 'Exit call session' : 'End conversation with AI agent'}
            title={isCallEnded ? 'Exit call session' : 'End conversation'}
          >
            {isCallEnded ? 'Exit Call' : 'End Conversation'}
          </Button>
        </div>
      </header>

      {/* Main 2-Column Responsive Body */}
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 pb-4 pt-3 md:px-6 lg:flex-row lg:gap-6 overflow-hidden">
        {/* Left Column: Visualizer + Controls & Full-height Live Transcript */}
        <aside className="flex min-h-0 flex-col gap-3 lg:h-full lg:w-[44%] xl:w-[42%] shrink-0">
          {/* Compact visualizer + mic host */}
          <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/30 p-2.5 backdrop-blur-md">
            <div className="flex-1 flex items-center justify-center min-h-[6.5rem] max-h-[8rem] w-full overflow-hidden">
              {visualizer}
            </div>
            <div className="shrink-0 pb-1 sm:pb-0 sm:pr-2">{controls}</div>
          </div>

          {/* Transcript Panel */}
          <div className="flex-1 min-h-[20rem] lg:min-h-0 overflow-hidden">
            {transcriptPanel}
          </div>
        </aside>

        {/* Right Column: Live Sales Intelligence Dashboard */}
        <main className="flex min-h-0 flex-1 flex-col lg:h-full lg:border-l lg:border-border/80 lg:pl-6 overflow-hidden">
          {salesDashboard}
        </main>
      </div>
    </div>
  );
}
