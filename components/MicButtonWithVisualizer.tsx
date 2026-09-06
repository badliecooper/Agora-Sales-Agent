'use client';

import { useEffect, useRef, useState } from 'react';
import type { IMicrophoneAudioTrack } from 'agora-rtc-react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MicButtonWithVisualizerProps {
  isEnabled: boolean;
  setIsEnabled: (enabled: boolean) => void;
  track: IMicrophoneAudioTrack | MediaStream | null;
  enabledColor?: string;
  disabledColor?: string;
  onToggle?: () => void | Promise<void>;
  className?: string;
  'aria-label'?: string;
  localMicrophoneTrack?: IMicrophoneAudioTrack | null;
}

export function MicButtonWithVisualizer({
  isEnabled,
  setIsEnabled,
  track,
  enabledColor = 'hsl(var(--primary))',
  disabledColor = 'hsl(var(--destructive))',
  onToggle,
  className = '',
  localMicrophoneTrack,
  'aria-label': ariaLabel,
}: MicButtonWithVisualizerProps) {
  const [audioData, setAudioData] = useState<Array<{ height: number }>>(
    Array(5).fill({ height: 8 }),
  );
  const audioTrack = track || localMicrophoneTrack;
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const updateAudioData = () => {
      if (!analyserRef.current) return;
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);

      const segmentSize = Math.max(1, Math.floor(dataArray.length / 5));
      const newAudioData = Array(5)
        .fill(0)
        .map((_, index) => {
          const start = index * segmentSize;
          const end = Math.min(dataArray.length, start + segmentSize);
          const segment = dataArray.slice(start, end);
          const avg = segment.length > 0 ? segment.reduce((a, b) => a + b, 0) / segment.length : 0;
          const scaledHeight = Math.min(100, (avg / 255) * 100 * 1.5);
          const height = Math.max(8, Math.pow(scaledHeight / 100, 0.7) * 100);
          return { height };
        });

      setAudioData(newAudioData);
      animationFrameRef.current = requestAnimationFrame(updateAudioData);
    };

    const cleanupAudioAnalyser = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch {}
        audioContextRef.current = null;
      }
      setAudioData(Array(5).fill({ height: 8 }));
    };

    const setupAudioAnalyser = async () => {
      if (!audioTrack || !isEnabled) {
        cleanupAudioAnalyser();
        return;
      }

      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        audioContextRef.current = new AudioCtx();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 64;
        analyserRef.current.smoothingTimeConstant = 0.5;

        let mediaStream: MediaStream;
        if (audioTrack instanceof MediaStream) {
          mediaStream = audioTrack;
        } else if (typeof audioTrack.getMediaStreamTrack === 'function') {
          const rawTrack = audioTrack.getMediaStreamTrack();
          if (!rawTrack) return;
          mediaStream = new MediaStream([rawTrack]);
        } else {
          return;
        }

        const source = audioContextRef.current.createMediaStreamSource(mediaStream);
        source.connect(analyserRef.current);
        updateAudioData();
      } catch (error) {
        console.warn('[MicButtonWithVisualizer] Web Audio analyzer initialization warning:', error);
      }
    };

    if (audioTrack && isEnabled) {
      setupAudioAnalyser();
    } else {
      cleanupAudioAnalyser();
    }

    return () => cleanupAudioAnalyser();
  }, [audioTrack, isEnabled]);

  const handleToggle = async () => {
    if (onToggle) {
      await onToggle();
      return;
    }

    const nextState = !isEnabled;
    if (audioTrack && typeof (audioTrack as IMicrophoneAudioTrack).setEnabled === 'function') {
      try {
        await (audioTrack as IMicrophoneAudioTrack).setEnabled(nextState);
        setIsEnabled(nextState);
      } catch (err) {
        console.error('[MicButtonWithVisualizer] Error toggling mic track:', err);
      }
    } else {
      setIsEnabled(nextState);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        'group relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer shadow-lg',
        isEnabled
          ? 'border-primary/80 bg-primary/10 hover:bg-primary/20'
          : 'border-destructive/80 bg-destructive/10 hover:bg-destructive/20',
        className
      )}
      aria-label={ariaLabel || (isEnabled ? 'Mute microphone' : 'Unmute microphone')}
      title={isEnabled ? 'Mute microphone' : 'Unmute microphone'}
    >
      {/* Live frequency waveform bars overlay */}
      {isEnabled && (
        <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-80 pointer-events-none">
          {audioData.map((bar, idx) => (
            <div
              key={idx}
              className="w-1 rounded-full bg-primary transition-all duration-75"
              style={{
                height: `${Math.min(24, Math.max(6, (bar.height / 100) * 24))}px`,
                backgroundColor: enabledColor,
              }}
            />
          ))}
        </div>
      )}

      {/* Mic Icon */}
      <div className="relative z-10">
        {isEnabled ? (
          <Mic className="h-5 w-5 text-primary transition-colors" style={{ color: enabledColor }} />
        ) : (
          <MicOff className="h-5 w-5 text-destructive transition-colors" style={{ color: disabledColor }} />
        )}
      </div>
    </button>
  );
}
