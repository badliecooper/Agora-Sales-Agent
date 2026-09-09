'use client';

import { Loader2, Sparkles, Calendar, Zap, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

type QuickstartPreCallCardProps = {
  isLoading: boolean;
  error: string | null;
  onStartConversation: () => void;
};

export function QuickstartPreCallCard({
  isLoading,
  error,
  onStartConversation,
}: QuickstartPreCallCardProps) {
  return (
    <div
      className="mx-auto flex w-[min(94vw,30rem)] animate-fade-up flex-col items-center rounded-[24px] border border-border/70 bg-card/60 p-8 sm:p-10 text-center shadow-2xl backdrop-blur-xl"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.12) 0%, rgba(0, 0, 0, 0) 70%), linear-gradient(180deg, rgba(28, 28, 30, 0.8) 0%, rgba(14, 14, 16, 0.95) 100%)',
      }}
    >
      {/* Status pill badge */}
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Agora AI Sales Specialist</span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
        Meet Your AI Sales Agent
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Real-time consultative voice AI powered by Agora&apos;s Conversational AI Engine. Featuring live deal intelligence, objection handling, Google Calendar scheduling, and HubSpot CRM sync.
      </p>

      {/* Value prop chips */}
      <div className="mt-6 grid grid-cols-2 gap-2 w-full text-left">
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-xs text-foreground/90">
          <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="truncate">&lt;500ms Voice Pipeline</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-xs text-foreground/90">
          <Sparkles className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="truncate">Next Best Action Brain</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-xs text-foreground/90">
          <Calendar className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Google Calendar &amp; Meet</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 text-xs text-foreground/90">
          <ShieldCheck className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="truncate">Pre-TTS Truth Guardrails</span>
        </div>
      </div>

      <Button
        onClick={onStartConversation}
        disabled={isLoading}
        className="mt-8 h-11 w-full rounded-xl border border-primary bg-primary text-sm font-semibold text-black hover:bg-primary/90 hover:scale-[1.01] transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
        aria-label={
          isLoading
            ? 'Connecting with AI Sales Agent'
            : 'Start call with AI Sales Agent'
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Connecting with Sales Agent...</span>
          </div>
        ) : (
          'Connect with Sales Agent'
        )}
      </Button>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
