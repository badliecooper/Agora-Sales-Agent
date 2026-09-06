'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type AgentVisualizerState =
  | 'not-joined'
  | 'joining'
  | 'ambient'
  | 'listening'
  | 'analyzing'
  | 'talking'
  | 'disconnected';

export interface AgentVisualizerProps extends React.HTMLAttributes<HTMLDivElement> {
  state: AgentVisualizerState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const stateToText: Record<AgentVisualizerState, string> = {
  'not-joined': 'Not Joined',
  joining: 'Connecting...',
  ambient: 'Ready',
  listening: 'Listening...',
  analyzing: 'Thinking...',
  talking: 'Speaking...',
  disconnected: 'Disconnected',
};

const sizeClasses = {
  sm: {
    container: 'w-24 h-24',
    orb: 'w-16 h-16',
    text: 'text-xs',
  },
  md: {
    container: 'w-36 h-36',
    orb: 'w-24 h-24',
    text: 'text-sm',
  },
  lg: {
    container: 'w-48 h-48 sm:w-56 sm:h-56',
    orb: 'w-32 h-32 sm:w-36 sm:h-36',
    text: 'text-base',
  },
};

export const AgentVisualizer = React.forwardRef<HTMLDivElement, AgentVisualizerProps>(
  ({ state, size = 'md', className, ...props }, ref) => {
    const displayText = stateToText[state] || state;
    const sizeConfig = sizeClasses[size] || sizeClasses.md;

    // Visual theme based on agent state
    const isTalking = state === 'talking';
    const isListening = state === 'listening';
    const isAnalyzing = state === 'analyzing';
    const isConnected = state !== 'disconnected' && state !== 'not-joined';

    return (
      <div
        ref={ref}
        className={cn('flex flex-col items-center justify-center gap-3', className)}
        {...props}
      >
        <div
          className={cn(
            'relative flex items-center justify-center',
            sizeConfig.container
          )}
        >
          {/* Outer Pulsing Rings */}
          {isConnected && (
            <>
              <div
                className={cn(
                  'absolute inset-0 rounded-full transition-all duration-700',
                  isTalking && 'animate-ping bg-indigo-500/20 duration-1000',
                  isListening && 'animate-pulse bg-emerald-500/20 duration-700',
                  isAnalyzing && 'animate-spin bg-gradient-to-tr from-purple-500/20 to-transparent duration-3000',
                  !isTalking && !isListening && !isAnalyzing && 'bg-primary/10 animate-pulse duration-2000'
                )}
              />
              <div
                className={cn(
                  'absolute -inset-2 rounded-full border border-primary/20 transition-all duration-500',
                  isTalking && 'scale-110 border-indigo-400/40 animate-pulse',
                  isListening && 'scale-105 border-emerald-400/40 animate-pulse',
                  isAnalyzing && 'rotate-180 border-purple-400/40'
                )}
              />
            </>
          )}

          {/* Core Orb */}
          <div
            className={cn(
              'relative flex items-center justify-center rounded-full shadow-2xl transition-all duration-500',
              sizeConfig.orb,
              isTalking &&
                'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-indigo-500/50 scale-105',
              isListening &&
                'bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 shadow-emerald-500/50 scale-100',
              isAnalyzing &&
                'bg-gradient-to-tr from-violet-700 via-indigo-600 to-purple-800 shadow-purple-500/50 animate-pulse',
              !isTalking &&
                !isListening &&
                !isAnalyzing &&
                isConnected &&
                'bg-gradient-to-tr from-blue-600 to-indigo-700 shadow-blue-500/30 opacity-90',
              !isConnected && 'bg-zinc-800 border border-zinc-700 shadow-none opacity-60'
            )}
          >
            {/* Animated Audio Waveform inside the orb */}
            {isConnected ? (
              <div className="flex items-center justify-center gap-1.5 px-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-block w-1.5 rounded-full bg-white/90 transition-all',
                      isTalking &&
                        'animate-[bounce_0.6s_ease-in-out_infinite] [animation-delay:' +
                          i * 120 +
                          'ms] h-8 sm:h-10',
                      isListening &&
                        'animate-[pulse_1s_ease-in-out_infinite] [animation-delay:' +
                          i * 150 +
                          'ms] h-5 sm:h-6',
                      isAnalyzing &&
                        'animate-[pulse_0.8s_ease-in-out_infinite] [animation-delay:' +
                          i * 200 +
                          'ms] h-4 sm:h-5',
                      !isTalking &&
                        !isListening &&
                        !isAnalyzing &&
                        'h-2.5 sm:h-3 opacity-60'
                    )}
                  />
                ))}
              </div>
            ) : (
              <div className="h-3 w-3 rounded-full bg-zinc-600" />
            )}
          </div>
        </div>

        {/* State Label */}
        {displayText && (
          <p
            className={cn(
              'text-center font-medium tracking-wide transition-colors duration-300',
              sizeConfig.text,
              isTalking && 'text-indigo-300 font-semibold',
              isListening && 'text-emerald-300 font-semibold',
              isAnalyzing && 'text-purple-300 font-semibold',
              !isTalking && !isListening && !isAnalyzing && 'text-muted-foreground'
            )}
          >
            {displayText}
          </p>
        )}
      </div>
    );
  }
);

AgentVisualizer.displayName = 'AgentVisualizer';
