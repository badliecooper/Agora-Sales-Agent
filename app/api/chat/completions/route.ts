import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { createChatCompletionsHandler } from '@/lib/sales/chat-handler';

export const POST = createChatCompletionsHandler({
  createOpenAIClient: createOpenAI,
  streamTextImpl: streamText,
});
