import {
  ChatMessage,
  ConversationQualityReport,
  DimensionScore,
  QualityDimension,
  SalesState,
  TurnQualityScore,
} from './types';
import { splitSentences, extractQuestions } from './validator';

/**
 * Conversation Quality Evaluator.
 *
 * Evaluates individual conversational turns and full multi-turn dialogues
 * across 7 core quality dimensions:
 * 1. Naturalness (conversational flow, no canned filler, no robotic phrasing)
 * 2. Context Retention (remembers facts across turns, no contradictions)
 * 3. Question Quality & Usefulness (consultative, ≤ 1 question, no repeat inquiries)
 * 4. Conciseness (voice-friendly length, target ≤ 2 sentences, 15-45 words)
 * 5. Objection Handling Quality (empathetic acknowledgment, verified facts, resolution check)
 * 6. Buying Signal Detection Accuracy (stops qualification on intent, moves to action)
 * 7. Action Correctness (did backend tools actually execute what AI claimed)
 */

export interface TurnEvaluationInput {
  turnIndex: number;
  userQuery: string;
  agentResponse: string;
  state: SalesState;
  previousTurns?: Array<{ role: string; content: string }>;
}

export function evaluateTurnQuality(input: TurnEvaluationInput): TurnQualityScore {
  const { turnIndex, userQuery, agentResponse, state } = input;
  const userText = (userQuery || '').trim();
  const respText = (agentResponse || '').trim();
  const issues: string[] = [];

  const sentences = splitSentences(respText);
  const questions = extractQuestions(respText);
  const wordCount = respText.split(/\s+/).filter(Boolean).length;

  // 1. Naturalness Dimension (Weight: 15)
  let naturalnessScore = 100;
  const hasBannedFiller = /^(?:that's great|perfect|absolutely|awesome|sounds great|wonderful|fantastic)(?:!|\.|\s|,)/i.test(
    respText,
  );
  if (hasBannedFiller) {
    naturalnessScore -= 30;
    issues.push('Opens with canned boilerplate filler phrase');
  }
  if (sentences.length > 3) {
    naturalnessScore -= 15;
    issues.push('Monologue structure feels unnatural in spoken voice dialogue');
  }
  if (/\b(?:as an ai|as a language model)\b/i.test(respText)) {
    naturalnessScore -= 50;
    issues.push('Breaks character with AI disclaimer');
  }
  naturalnessScore = Math.max(0, Math.min(100, naturalnessScore));

  const naturalnessDim: DimensionScore = {
    score: naturalnessScore,
    weight: 0.15,
    feedback: naturalnessScore >= 80 ? 'Natural, authentic voice delivery' : 'Contains canned or robotic phrasing',
    passed: naturalnessScore >= 75,
  };

  // 2. Context Retention Dimension (Weight: 20)
  let contextScore = 100;
  const lowerResp = respText.toLowerCase();

  // Check if agent re-asks known name
  if (
    Boolean(state.customerName || state.customer?.fullName) &&
    /\b(?:what(?:'s| is) your name|what should i call you)\b/i.test(lowerResp)
  ) {
    contextScore -= 40;
    issues.push("Re-asks for customer's name when already known");
  }
  // Check if agent re-asks known company
  if (
    Boolean(state.company || state.customer?.company) &&
    /\b(?:which company|what company|company are you with)\b/i.test(lowerResp)
  ) {
    contextScore -= 40;
    issues.push("Re-asks for customer's company when already known");
  }
  // Check if agent re-asks known email
  if (
    Boolean(state.customerEmail || state.email || state.customer?.email) &&
    /\b(?:what(?:'s| is) your email|best email address)\b/i.test(lowerResp)
  ) {
    contextScore -= 40;
    issues.push("Re-asks for customer's email when already known");
  }
  // Check if agent contradicts known budget
  if (
    Boolean(state.budget) &&
    /\b(?:since you don't have a budget|without a budget)\b/i.test(lowerResp)
  ) {
    contextScore -= 50;
    issues.push('Contradicts stated customer budget');
  }
  contextScore = Math.max(0, Math.min(100, contextScore));

  const contextDim: DimensionScore = {
    score: contextScore,
    weight: 0.2,
    feedback: contextScore >= 80 ? 'Maintains full conversational context and known facts' : 'Forgot or contradicted known facts',
    passed: contextScore >= 75,
  };

  // 3. Question Quality & Usefulness (Weight: 15)
  let questionScore = 100;
  if (questions.length > 1) {
    questionScore -= 40;
    issues.push(`Stacked ${questions.length} questions in a single voice turn`);
  }
  // If buying signal is strong, asking qualification questions is penalized
  const isBuyingSignalStrong = state.buyingIntent === 'high' || state.buyingSignalStrength === 'strong';
  if (isBuyingSignalStrong && questions.length > 0) {
    const isSchedulingQuestion = /\b(?:time|date|slot|calendar|email|tomorrow|tuesday|monday)\b/i.test(
      questions[0],
    );
    if (!isSchedulingQuestion) {
      questionScore -= 30;
      issues.push('Asked unnecessary qualification question after strong buying signal');
    }
  }
  questionScore = Math.max(0, Math.min(100, questionScore));

  const questionDim: DimensionScore = {
    score: questionScore,
    weight: 0.15,
    feedback: questionScore >= 80 ? 'Targeted, single consultative question' : 'Sub-optimal question cadence or stacking',
    passed: questionScore >= 75,
  };

  // 4. Conciseness (Weight: 15)
  let concisenessScore = 100;
  if (sentences.length > 2) {
    concisenessScore -= (sentences.length - 2) * 20;
    issues.push(`Turn has ${sentences.length} sentences (target ≤ 2)`);
  }
  if (wordCount > 55) {
    concisenessScore -= 20;
    issues.push(`Turn has ${wordCount} words (ideal voice turn is 15-45 words)`);
  } else if (wordCount < 5 && !/^(?:bye|goodbye|see you|take care)/i.test(respText)) {
    concisenessScore -= 10;
  }
  concisenessScore = Math.max(0, Math.min(100, concisenessScore));

  const concisenessDim: DimensionScore = {
    score: concisenessScore,
    weight: 0.15,
    feedback: concisenessScore >= 80 ? 'Concise and voice-optimized' : 'Too wordy or exceeded sentence budget',
    passed: concisenessScore >= 75,
  };

  // 5. Objection Handling Quality (Weight: 15)
  let objectionScore = 100;
  const userRaisedObjection =
    /expensive|cost|price|budget|competitor|twilio|retell|vapi|think about it|need approval|security|hipaa|soc 2/i.test(
      userText,
    );
  if (userRaisedObjection) {
    const acknowledgesConcern =
      /understand|hear you|makes sense|valid concern|fair point|security is crucial|pricing is important/i.test(
        lowerResp,
      );
    const providesFacts =
      /pay-as-you-go|\$0\.10|300 free|enterprise|hipaa|soc 2|encryption|network|sd-rtn|latency|annual commitment/i.test(
        lowerResp,
      );
    const checksResolution =
      /does that (?:help|address|make sense|work)|sound (?:fair|reasonable)|would you like/i.test(
        lowerResp,
      );

    if (!acknowledgesConcern) {
      objectionScore -= 25;
      issues.push('Did not acknowledge objection empathetically');
    }
    if (!providesFacts) {
      objectionScore -= 35;
      issues.push('Did not address objection with grounded Agora facts');
    }
    if (!checksResolution && questions.length > 0 && !checksResolution) {
      objectionScore -= 15;
    }
  }
  objectionScore = Math.max(0, Math.min(100, objectionScore));

  const objectionDim: DimensionScore = {
    score: objectionScore,
    weight: 0.15,
    feedback: objectionScore >= 80 ? 'Empathetic and fact-grounded objection handling' : 'Incomplete objection handling loop',
    passed: objectionScore >= 75,
  };

  // 6. Buying Signal Detection Accuracy (Weight: 10)
  let buyingSignalScore = 100;
  const userGaveBuyingSignal =
    /book (?:a )?demo|schedule (?:a )?call|let's meet|send (?:the )?contract|sign up|ready to buy|just book me/i.test(
      userText,
    );
  if (userGaveBuyingSignal) {
    const movedToAction =
      /schedule|book|calendar|date|time|tuesday|wednesday|thursday|friday|invite|email/i.test(
        lowerResp,
      );
    if (!movedToAction) {
      buyingSignalScore = 30;
      issues.push('Failed to advance toward booking after explicit buying signal');
    }
  }
  buyingSignalScore = Math.max(0, Math.min(100, buyingSignalScore));

  const buyingSignalDim: DimensionScore = {
    score: buyingSignalScore,
    weight: 0.1,
    feedback: buyingSignalScore >= 80 ? 'Accurately pivoted to action on buying signal' : 'Missed or hesitated on buying signal',
    passed: buyingSignalScore >= 75,
  };

  // 7. Action Correctness (Weight: 10)
  let actionScore = 100;
  const claimedBooking = /you(?:'re| are) (?:all )?booked|scheduled your demo|booked your meeting/i.test(
    respText,
  );
  if (claimedBooking) {
    const hasEventId = Boolean(state.appointment?.calendarEventId || state.calendarEventId);
    const isConfirmed = state.appointment?.meetingStatus === 'confirmed' || state.meetingStatus === 'confirmed';

    if (!hasEventId || !isConfirmed) {
      actionScore = 0;
      issues.push('Claimed booking confirmation without verified calendar event ID');
    }
  }
  actionScore = Math.max(0, Math.min(100, actionScore));

  const actionDim: DimensionScore = {
    score: actionScore,
    weight: 0.1,
    feedback: actionScore >= 80 ? 'Actions truthfully correspond to backend verification' : 'Fabricated or unverified action claim',
    passed: actionScore >= 75,
  };

  // Composite Score Calculation
  const dimensions: Record<QualityDimension, DimensionScore> = {
    naturalness: naturalnessDim,
    contextRetention: contextDim,
    questionQuality: questionDim,
    conciseness: concisenessDim,
    objectionHandling: objectionDim,
    buyingSignalAccuracy: buyingSignalDim,
    actionCorrectness: actionDim,
  };

  const compositeScore = Math.round(
    Object.values(dimensions).reduce((sum, dim) => sum + dim.score * dim.weight, 0),
  );

  return {
    turnIndex,
    userQuery,
    agentResponse,
    dimensions,
    compositeScore,
    issues,
  };
}

/**
 * Evaluates an entire multi-turn conversation dialogue and generates a composite report.
 */
export function evaluateConversationQuality(
  messages: ChatMessage[],
  finalState: SalesState,
): ConversationQualityReport {
  const turns: TurnEvaluationInput[] = [];

  // Pair user utterances with subsequent assistant responses
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      const userText = messages[i].content;
      let assistantText = '';
      if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
        assistantText = messages[i + 1].content;
      }

      turns.push({
        turnIndex: turns.length + 1,
        userQuery: userText,
        agentResponse: assistantText,
        state: finalState,
        previousTurns: messages.slice(0, i),
      });
    }
  }

  const turnScores: TurnQualityScore[] = turns.map((t) => evaluateTurnQuality(t));

  const totalTurns = turnScores.length;
  if (totalTurns === 0) {
    return {
      totalTurns: 0,
      averageCompositeScore: 100,
      dimensionAverages: {
        naturalness: 100,
        contextRetention: 100,
        questionQuality: 100,
        conciseness: 100,
        objectionHandling: 100,
        buyingSignalAccuracy: 100,
        actionCorrectness: 100,
      },
      passedBenchmark: true,
      summary: 'No conversation turns to evaluate.',
      turnScores: [],
    };
  }

  const dimSums: Record<QualityDimension, number> = {
    naturalness: 0,
    contextRetention: 0,
    questionQuality: 0,
    conciseness: 0,
    objectionHandling: 0,
    buyingSignalAccuracy: 0,
    actionCorrectness: 0,
  };

  let totalComposite = 0;
  for (const score of turnScores) {
    totalComposite += score.compositeScore;
    for (const [dimKey, dimVal] of Object.entries(score.dimensions)) {
      dimSums[dimKey as QualityDimension] += dimVal.score;
    }
  }

  const averageCompositeScore = Math.round(totalComposite / totalTurns);
  const dimensionAverages: Record<QualityDimension, number> = {
    naturalness: Math.round(dimSums.naturalness / totalTurns),
    contextRetention: Math.round(dimSums.contextRetention / totalTurns),
    questionQuality: Math.round(dimSums.questionQuality / totalTurns),
    conciseness: Math.round(dimSums.conciseness / totalTurns),
    objectionHandling: Math.round(dimSums.objectionHandling / totalTurns),
    buyingSignalAccuracy: Math.round(dimSums.buyingSignalAccuracy / totalTurns),
    actionCorrectness: Math.round(dimSums.actionCorrectness / totalTurns),
  };

  // Benchmark pass requires composite >= 85 and actionCorrectness >= 90
  const passedBenchmark = averageCompositeScore >= 85 && dimensionAverages.actionCorrectness >= 90;

  const summary = passedBenchmark
    ? `PASSED BENCHMARK: Composite Quality Score ${averageCompositeScore}/100 across ${totalTurns} turns with ${dimensionAverages.actionCorrectness}% action correctness.`
    : `BELOW BENCHMARK: Composite Quality Score ${averageCompositeScore}/100 (target ≥ 85). Action correctness: ${dimensionAverages.actionCorrectness}%.`;

  return {
    totalTurns,
    averageCompositeScore,
    dimensionAverages,
    passedBenchmark,
    summary,
    turnScores,
  };
}
