import { APIRequest } from '../types';

export interface CliPromptInput {
  systemMessage?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export function openaiToCli(request: any): CliPromptInput {
  let systemMessage = '';

  // Extract system message from messages
  let conversationPrompt = '';

  for (const msg of request.messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content;
    } else if (msg.role === 'user') {
      conversationPrompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      conversationPrompt += `Assistant: ${msg.content}\n\n`;
    } else if (msg.role === 'tool') {
      // Tool result
      conversationPrompt += `Tool Result: ${msg.content}\n\n`;
    }
  }

  // Get the last user message
  let lastUserMessage = '';
  for (let i = request.messages.length - 1; i >= 0; i--) {
    if (request.messages[i].role === 'user') {
      lastUserMessage = request.messages[i].content;
      break;
    }
  }

  const prompt = conversationPrompt + (lastUserMessage || 'Continue.');

  return {
    systemMessage,
    prompt,
    temperature: request.temperature,
    maxTokens: request.max_tokens,
    topP: request.top_p,
    stopSequences: request.stop,
  };
}
