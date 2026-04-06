import { APIRequest } from '../types';

export interface CliPromptInput {
  systemMessage?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinking?: { type: string; budget_tokens?: number };
}

export function anthropicToCli(request: APIRequest): CliPromptInput {
  let systemMessage = request.system;

  // Build conversation prompt from messages
  let conversationPrompt = '';

  for (const msg of request.messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content as string;
    } else if (msg.role === 'user') {
      conversationPrompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        conversationPrompt += `Assistant: ${msg.content}\n\n`;
      } else {
        // Handle content blocks
        conversationPrompt += 'Assistant: ';
        for (const block of msg.content) {
          if (block.type === 'text') {
            conversationPrompt += block.text;
          } else if (block.type === 'tool_use') {
            conversationPrompt += `[Tool use: ${block.name}]\n`;
          }
        }
        conversationPrompt += '\n\n';
      }
    }
  }

  // Get the last user message as the active prompt
  let lastUserMessage = '';
  for (let i = request.messages.length - 1; i >= 0; i--) {
    if (request.messages[i].role === 'user') {
      lastUserMessage = request.messages[i].content as string;
      break;
    }
  }

  // Build the final prompt: history + current message
  const prompt = conversationPrompt + (lastUserMessage || 'Continue the conversation.');

  return {
    systemMessage,
    prompt,
    temperature: request.temperature,
    maxTokens: request.max_tokens,
    topP: request.top_p,
    topK: request.top_k,
    stopSequences: request.stop_sequences,
    thinking: request.thinking,
  };
}
