import { SalesState, ValidationIssue, ResponseValidationResult, ValidatorOptions } from './types';

/**
 * Pre-TTS Response Validation Layer.
 *
 * Runs every AI-generated response through strict validation checks before
 * it can be spoken to the user via TTS:
 * 1. Sentence count (≤ 2 sentences normally)
 * 2. Question count (≤ 1 question per turn)
 * 3. No repeated known questions (never ask for data already in SalesState)
 * 4. No unsupported claims (no hallucinated products like Chorus/Harmony, no fake pricing)
 * 5. No fake booking confirmations (requires confirmed meetingStatus & calendarEventId)
 * 6. No excessive boilerplate filler ("That's great!", "Perfect!", "Absolutely!")
 * 7. No contradiction with stored conversation state
 */

// Canned conversational filler phrases prohibited from opening responses
const BANNED_FILLERS: RegExp[] = [
  /^that's great(?: to hear)?(?:!|\.|\s|,)/i,
  /^that is great(?: to hear)?(?:!|\.|\s|,)/i,
  /^perfect(?:!|\.|\s|,)/i,
  /^absolutely(?:!|\.|\s|,)/i,
  /^awesome(?:!|\.|\s|,)/i,
  /^sounds great(?:!|\.|\s|,)/i,
  /^that sounds (?:great|interesting|smart|fascinating)(?:!|\.|\s|,)/i,
  /^that's a smart (?:approach|idea|strategy)(?:!|\.|\s|,)/i,
  /^i completely understand(?:!|\.|\s|,)/i,
  /^wonderful(?:!|\.|\s|,)/i,
  /^fantastic(?:!|\.|\s|,)/i,
];

// Hallucinated product names and unsupported capabilities
const HALLUCINATED_PRODUCTS: RegExp[] = [
  /\b(?:chorus|harmony)\b/i,
  /\b(?:agora\s+voicebox|agora\s+omni)\b/i,
  /\b(?:holographic\s+(?:projection|avatar|streaming))\b/i,
  /\b(?:native\s+cobol|mainframe\s+integration)\b/i,
];

// Fake or fabricated pricing claims
const FAKE_PRICING_CLAIMS: RegExp[] = [
  /\$(?:0\.0[1-4]|0\.00[0-9])(?:\/|\s+per\s+)min/i, // Fabricating $0.01 - $0.04/min
  /\bfree\s+unlimited\s+minutes\b/i,
  /\b50%\s+discount\b/i, // Agora discount ceiling is 20%
];

// Meeting confirmation patterns
const BOOKING_CONFIRMATION_PATTERNS: RegExp[] = [
  /\byou(?:'re| are) (?:all )?booked\b/i,
  /\bi(?:'ve| have) scheduled your (?:demo|meeting|call)\b/i,
  /\bi(?:'ve| have) booked your (?:demo|meeting|call)\b/i,
  /\bmeeting is (?:confirmed|scheduled|set for)\b/i,
  /\bcalendar invite (?:has been|was|is) sent\b/i,
  /\binvite sent to\b/i,
];

/**
 * Splits text into individual sentences accurately without breaking on abbreviations or numbers.
 */
export function splitSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  // Protect common abbreviations and numbers with periods: e.g., i.e., vs., Dr., $0.10
  const normalized = text
    .replace(/\b([a-z])\.([a-z])\./gi, '$1_DOT_$2_DOT_')
    .replace(/(\d+)\.(\d+)/g, '$1_DECIMAL_$2')
    .replace(/\b(vs|dr|mr|mrs|ms|prof|inc|ltd|corp|co|approx)\./gi, '$1_ABBR_');

  // Split on sentence terminals (. ! ?) followed by whitespace or end of string
  const rawSentences = normalized.split(/(?<=[.!?])\s+(?=[A-Z0-9"']|$)/);

  return rawSentences
    .map((s) =>
      s
        .replace(/_DOT_/g, '.')
        .replace(/_DECIMAL_/g, '.')
        .replace(/_ABBR_/g, '.')
        .trim(),
    )
    .filter((s) => s.length > 0);
}

/**
 * Extracts question strings from text.
 */
export function extractQuestions(text: string): string[] {
  if (!text || !text.trim()) return [];

  const sentences = splitSentences(text);
  const questions: string[] = [];

  for (const s of sentences) {
    if (s.includes('?')) {
      // May contain multiple questions in one sentence separated by ?
      const parts = s.split('?').map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        questions.push(p + '?');
      }
    }
  }

  return questions;
}

/**
 * Checks if a question is asking for an attribute that is already known in the SalesState.
 */
function isAskingForKnownAttribute(
  question: string,
  state: SalesState,
): { isRepeated: boolean; field?: string } {
  const q = question.toLowerCase();

  // Name check
  if (
    Boolean(state.customerName || state.customer?.fullName || state.conversationStateSummary?.known?.Name) &&
    /\b(?:what(?:'s| is) your name|who am i speaking with|what should i call you)\b/i.test(q)
  ) {
    return { isRepeated: true, field: 'name' };
  }

  // Company check
  if (
    Boolean(state.company || state.customer?.company || state.conversationStateSummary?.known?.Company) &&
    /\b(?:which company|what company|company are you with|what's your company)\b/i.test(q)
  ) {
    return { isRepeated: true, field: 'company' };
  }

  // Email check
  const hasEmail = Boolean(
    state.customerEmail ||
      state.email ||
      state.customer?.email ||
      state.conversationStateSummary?.known?.Email,
  );
  if (
    hasEmail &&
    /\b(?:what(?:'s| is) your email|best email address|where should i send (?:the )?invite)\b/i.test(q)
  ) {
    return { isRepeated: true, field: 'email' };
  }

  // Budget check
  if (
    Boolean(state.budget || state.profile?.qualification?.budget || state.conversationStateSummary?.known?.Budget) &&
    /\b(?:what(?:'s| is) your budget|how much (?:are you looking|can you) spend|what's your monthly budget)\b/i.test(q)
  ) {
    return { isRepeated: true, field: 'budget' };
  }

  // Volume check
  if (
    Boolean(state.volume || state.profile?.qualification?.volume || state.conversationStateSummary?.known?.Volume) &&
    /\b(?:how many (?:minutes|calls|users)|what(?:'s| is) your (?:expected )?call volume)\b/i.test(q)
  ) {
    return { isRepeated: true, field: 'volume' };
  }

  // Use case check
  if (
    Boolean(state.useCase || state.profile?.qualification?.useCase || state.conversationStateSummary?.known?.['Use Case']) &&
    /\b(?:what (?:kind of |type of )?(?:app|platform|product) are you building|what is your use case)\b/i.test(q)
  ) {
    return { isRepeated: true, field: 'useCase' };
  }

  return { isRepeated: false };
}

/**
 * Validates an AI generated response against all 7 voice quality and truthfulness rules.
 */
export function validateResponse(
  response: string,
  state: SalesState,
  options: ValidatorOptions = {},
): ResponseValidationResult {
  const issues: ValidationIssue[] = [];
  const text = response.trim();

  if (!text) {
    return {
      isValid: true,
      issues: [],
      originalResponse: response,
      correctedResponse: response,
      wasCorrected: false,
    };
  }

  // 1. Sentence Count Validation (≤ 2 sentences normally)
  const maxSentences = options.maxSentences ?? (options.allowPricingBreakdown ? 3 : 2);
  const sentences = splitSentences(text);
  if (sentences.length > maxSentences) {
    issues.push({
      ruleId: 'sentence_count',
      severity: 'warning',
      message: `Response exceeds voice brevity limit: ${sentences.length} sentences (target ≤ ${maxSentences}).`,
      offendingText: text,
    });
  }

  // 2. Question Count Validation (≤ 1 question per turn)
  const maxQuestions = options.maxQuestions ?? 1;
  const questions = extractQuestions(text);
  if (questions.length > maxQuestions) {
    issues.push({
      ruleId: 'question_count',
      severity: 'error',
      message: `Response stacks multiple questions (${questions.length} detected). Only 1 question allowed per voice turn.`,
      offendingText: questions.join(' | '),
    });
  }

  // 3. Repeated Known Question Validation
  for (const q of questions) {
    const check = isAskingForKnownAttribute(q, state);
    if (check.isRepeated) {
      issues.push({
        ruleId: 'repeated_question',
        severity: 'error',
        message: `Response asks for prospect's ${check.field}, which is already known in conversation state.`,
        offendingText: q,
      });
    }
  }

  // 4. Unsupported Claims & Hallucinations
  for (const pat of HALLUCINATED_PRODUCTS) {
    const match = text.match(pat);
    if (match) {
      issues.push({
        ruleId: 'unsupported_claim',
        severity: 'error',
        message: `Response references hallucinated product or unsupported capability: "${match[0]}".`,
        offendingText: match[0],
      });
    }
  }

  for (const pat of FAKE_PRICING_CLAIMS) {
    const match = text.match(pat);
    if (match) {
      issues.push({
        ruleId: 'unsupported_claim',
        severity: 'error',
        message: `Response quotes unverified or fabricated pricing: "${match[0]}".`,
        offendingText: match[0],
      });
    }
  }

  // 5. Fake Booking Confirmation Validation
  const hasBookingConfirmation = BOOKING_CONFIRMATION_PATTERNS.some((pat) => pat.test(text));
  if (hasBookingConfirmation) {
    const isActuallyConfirmed =
      state.appointment?.meetingStatus === 'confirmed' ||
      state.meetingStatus === 'confirmed' ||
      state.appointmentStatus === 'confirmed';
    const hasEventId = Boolean(state.appointment?.calendarEventId || state.calendarEventId);

    if (!isActuallyConfirmed || !hasEventId) {
      issues.push({
        ruleId: 'fake_booking',
        severity: 'error',
        message: 'Response claims a meeting is booked, but backend calendar tool has not confirmed an event ID.',
        offendingText: text,
      });
    }
  }

  // 6. Excessive Boilerplate Filler Validation
  for (const fillerPat of BANNED_FILLERS) {
    const match = text.match(fillerPat);
    if (match) {
      issues.push({
        ruleId: 'excessive_filler',
        severity: 'warning',
        message: `Response starts with prohibited conversational filler: "${match[0].trim()}".`,
        offendingText: match[0].trim(),
      });
      break;
    }
  }

  // 7. Contradiction with Stored State
  const lowerText = text.toLowerCase();
  if (
    Boolean(state.budget || state.profile?.qualification?.budget) &&
    /\b(?:since you don't have a budget|without a budget|if you have no budget)\b/i.test(lowerText)
  ) {
    issues.push({
      ruleId: 'contradiction',
      severity: 'error',
      message: 'Response contradicts stored budget state (claims user has no budget when one was provided).',
      offendingText: text,
    });
  }

  if (
    Boolean(state.volume || state.profile?.qualification?.volume) &&
    /\b(?:since you don't know your volume|without knowing your call volume)\b/i.test(lowerText)
  ) {
    issues.push({
      ruleId: 'contradiction',
      severity: 'error',
      message: 'Response contradicts stored volume state (claims volume is unknown when volume was provided).',
      offendingText: text,
    });
  }

  const isValid = issues.filter((i) => i.severity === 'error').length === 0 && issues.length === 0;
  const correctedResponse = sanitizeAndCorrectResponse(text, state, issues);
  const wasCorrected = correctedResponse !== text;

  return {
    isValid,
    issues,
    originalResponse: response,
    correctedResponse,
    wasCorrected,
  };
}

/**
 * Sanitizes and repairs a response that failed validation so TTS speaks a clean, truthful utterance.
 */
export function sanitizeAndCorrectResponse(
  text: string,
  state: SalesState,
  issues: ValidationIssue[],
): string {
  if (!issues || issues.length === 0) return text;

  let corrected = text;

  // 1. Strip Banned Fillers (supports multiple consecutive/chained fillers)
  let hadMatch = true;
  let iterations = 0;
  while (hadMatch && iterations < 5) {
    hadMatch = false;
    iterations++;
    for (const fillerPat of BANNED_FILLERS) {
      if (fillerPat.test(corrected)) {
        corrected = corrected.replace(fillerPat, '').trim();
        hadMatch = true;
      }
    }
  }
  corrected = corrected.trim();
  // Capitalize first letter if needed
  if (corrected.length > 0) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  }

  // 2. Fix Hallucinated Products
  corrected = corrected
    .replace(/\b(?:Chorus|Harmony)\b/gi, 'Agora Conversational AI Engine')
    .replace(/\bAgora VoiceBox\b/gi, 'Agora Conversational AI')
    .replace(/\b(?:holographic\s+(?:projection|avatar|streaming))\b/gi, 'real-time voice streaming')
    .replace(/\b(?:native\s+cobol|mainframe\s+integration)\b/gi, 'modern cloud and on-prem REST integrations');

  // 3. Fix Fake Booking Confirmations
  const hasFakeBooking = issues.some((i) => i.ruleId === 'fake_booking');
  if (hasFakeBooking) {
    const isConfirmed =
      (state.appointment?.meetingStatus === 'confirmed' || state.meetingStatus === 'confirmed') &&
      Boolean(state.appointment?.calendarEventId || state.calendarEventId);

    if (!isConfirmed) {
      // Replace optimistic confirmation with honest next step
      const hasDateTime = Boolean(state.appointment?.preferredDate && state.appointment?.preferredTime);
      const hasEmail = Boolean(
        state.customerEmail || state.email || state.customer?.email,
      );

      if (hasDateTime && !hasEmail) {
        corrected = "I've noted that time. What's the best email address to send the calendar invite to so we can confirm it?";
      } else if (hasDateTime && hasEmail) {
        corrected = "I'm checking our calendar system to confirm that slot for you right now.";
      } else {
        corrected = "I'd be glad to schedule a demo for you. What date and time works best on your calendar?";
      }
    }
  }

  // 4. Fix Multiple Questions & Repeated Known Questions
  const questions = extractQuestions(corrected);
  if (questions.length > 1 || issues.some((i) => i.ruleId === 'repeated_question')) {
    const sentences = splitSentences(corrected);
    const nonRepeatedSentences: string[] = [];
    let keptQuestionCount = 0;

    for (const s of sentences) {
      const isQuestion = s.includes('?');
      if (isQuestion) {
        const check = isAskingForKnownAttribute(s, state);
        if (check.isRepeated) {
          // Drop repeated question
          continue;
        }
        if (keptQuestionCount >= 1) {
          // Drop stacked secondary question
          continue;
        }
        nonRepeatedSentences.push(s);
        keptQuestionCount++;
      } else {
        nonRepeatedSentences.push(s);
      }
    }

    if (nonRepeatedSentences.length > 0) {
      corrected = nonRepeatedSentences.join(' ');
    }
  }

  // 5. Trim to ≤ 2 Sentences if exceeded
  const sentences = splitSentences(corrected);
  if (sentences.length > 2) {
    // Keep first 2 sentences
    corrected = sentences.slice(0, 2).join(' ');
  }

  return corrected.trim();
}
