import {
  BottleneckReport,
  PipelineStage,
  StageLatencyMetric,
  TurnLatencyRecord,
} from './types';

/**
 * Pipeline Latency & Bottleneck Tracker.
 *
 * Tracks granular per-stage latency across conversational turns:
 * - STT (Speech-to-Text / ASR)
 * - LLM (Language Model prompt processing and time-to-first-token)
 * - Tool (Calendar FreeBusy/Event creation, CRM sync, Gmail dispatch)
 * - TTS (Text-to-Speech synthesis and time-to-first-audio)
 *
 * Analyzes latency distributions to pinpoint the true bottleneck before optimization.
 */

// In-memory store for session latency metrics
const sessionLatencyStore = new Map<string, StageLatencyMetric[]>();
const sessionTurnRecords = new Map<string, TurnLatencyRecord[]>();

/**
 * Records latency duration for a specific pipeline stage in a session.
 */
export function recordStageLatency(
  sessionId: string,
  stage: PipelineStage,
  durationMs: number,
  metadata?: Record<string, unknown>,
): StageLatencyMetric {
  if (!sessionLatencyStore.has(sessionId)) {
    sessionLatencyStore.set(sessionId, []);
  }

  const metric: StageLatencyMetric = {
    stage,
    durationMs: Math.round(durationMs),
    timestamp: Date.now(),
    metadata,
  };

  sessionLatencyStore.get(sessionId)!.push(metric);
  return metric;
}

/**
 * Helper to start a timer for a pipeline stage and return a stop callback that records duration.
 */
export function startStageTimer(
  sessionId: string,
  stage: PipelineStage,
  metadata?: Record<string, unknown>,
): () => number {
  const start = performance.now();
  return () => {
    const elapsed = Math.round(performance.now() - start);
    recordStageLatency(sessionId, stage, elapsed, metadata);
    return elapsed;
  };
}

/**
 * Records a consolidated turn latency breakdown and identifies the primary bottleneck.
 */
export function recordTurnLatency(
  sessionId: string,
  turnIndex: number,
  stages: Record<PipelineStage, number>,
): TurnLatencyRecord {
  if (!sessionTurnRecords.has(sessionId)) {
    sessionTurnRecords.set(sessionId, []);
  }

  const totalDurationMs = Object.values(stages).reduce((sum, d) => sum + d, 0);

  // Identify bottleneck stage (stage consuming the greatest absolute latency)
  let bottleneck: PipelineStage = 'llm';
  let maxDuration = -1;
  for (const [stg, dur] of Object.entries(stages) as [PipelineStage, number][]) {
    if (dur > maxDuration) {
      maxDuration = dur;
      bottleneck = stg;
    }
  }

  const record: TurnLatencyRecord = {
    turnIndex,
    timestamp: Date.now(),
    stages,
    totalDurationMs,
    bottleneck,
  };

  sessionTurnRecords.get(sessionId)!.push(record);
  return record;
}

/**
 * Retrieves all turn latency records for a session.
 */
export function getSessionTurnRecords(sessionId: string): TurnLatencyRecord[] {
  return sessionTurnRecords.get(sessionId) || [];
}

/**
 * Analyzes session latency metrics and produces a comprehensive bottleneck report with recommendations.
 */
export function analyzeBottlenecks(sessionId: string): BottleneckReport {
  const turns = sessionTurnRecords.get(sessionId) || [];
  const metrics = sessionLatencyStore.get(sessionId) || [];

  if (turns.length === 0 && metrics.length === 0) {
    return {
      primaryBottleneck: 'llm',
      averageLatencies: { stt: 0, llm: 0, tool: 0, tts: 0 },
      totalTurnAverageMs: 0,
      recommendations: ['No latency measurements recorded yet for this session.'],
    };
  }

  // Calculate stage averages from turns if available, else from raw metrics
  const sums: Record<PipelineStage, { total: number; count: number }> = {
    stt: { total: 0, count: 0 },
    llm: { total: 0, count: 0 },
    tool: { total: 0, count: 0 },
    tts: { total: 0, count: 0 },
  };

  if (turns.length > 0) {
    for (const t of turns) {
      for (const [stg, dur] of Object.entries(t.stages) as [PipelineStage, number][]) {
        sums[stg].total += dur;
        sums[stg].count += 1;
      }
    }
  } else {
    for (const m of metrics) {
      sums[m.stage].total += m.durationMs;
      sums[m.stage].count += 1;
    }
  }

  const averageLatencies: Record<PipelineStage, number> = {
    stt: sums.stt.count > 0 ? Math.round(sums.stt.total / sums.stt.count) : 0,
    llm: sums.llm.count > 0 ? Math.round(sums.llm.total / sums.llm.count) : 0,
    tool: sums.tool.count > 0 ? Math.round(sums.tool.total / sums.tool.count) : 0,
    tts: sums.tts.count > 0 ? Math.round(sums.tts.total / sums.tts.count) : 0,
  };

  const totalTurnAverageMs = Object.values(averageLatencies).reduce((a, b) => a + b, 0);

  // Identify stage with highest average
  let primaryBottleneck: PipelineStage = 'llm';
  let highestAverage = -1;
  for (const [stg, avg] of Object.entries(averageLatencies) as [PipelineStage, number][]) {
    if (avg > highestAverage) {
      highestAverage = avg;
      primaryBottleneck = stg;
    }
  }

  const recommendations: string[] = [];

  // Stage-specific recommendations
  if (primaryBottleneck === 'llm' && averageLatencies.llm > 500) {
    recommendations.push(
      `LLM stage is the primary bottleneck (${averageLatencies.llm}ms avg). Stream completions with early first-token delivery and slim system prompt tokens.`,
    );
  } else if (primaryBottleneck === 'tool' && averageLatencies.tool > 400) {
    recommendations.push(
      `Tool execution is the primary bottleneck (${averageLatencies.tool}ms avg). Cache FreeBusy calendar responses and execute non-blocking CRM/email dispatches asynchronously.`,
    );
  } else if (primaryBottleneck === 'stt' && averageLatencies.stt > 300) {
    recommendations.push(
      `STT transcription is the primary bottleneck (${averageLatencies.stt}ms avg). Tune VAD end-of-speech silence window (current 800ms) or enable interim streaming transcript chunking.`,
    );
  } else if (primaryBottleneck === 'tts' && averageLatencies.tts > 350) {
    recommendations.push(
      `TTS synthesis is the primary bottleneck (${averageLatencies.tts}ms avg). Use MiniMax speech_2_6_turbo with 24kHz stream chunking.`,
    );
  } else {
    recommendations.push(
      `Pipeline performing within sub-second target (${totalTurnAverageMs}ms total avg). Maintain current balanced pipeline allocations.`,
    );
  }

  return {
    primaryBottleneck,
    averageLatencies,
    totalTurnAverageMs,
    recommendations,
  };
}

/**
 * Resets latency store for testing.
 */
export function resetLatencyStore(sessionId?: string): void {
  if (sessionId) {
    sessionLatencyStore.delete(sessionId);
    sessionTurnRecords.delete(sessionId);
  } else {
    sessionLatencyStore.clear();
    sessionTurnRecords.clear();
  }
}
