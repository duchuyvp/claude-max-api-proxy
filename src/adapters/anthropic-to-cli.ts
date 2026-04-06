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

// Extract text content from message content (can be string or array of content blocks)
function extractTextContent(content: string | any[]): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text')
      .map((block) => block.text || '')
      .join('');
  }
  return '';
}

export function anthropicToCli(request: APIRequest): CliPromptInput {
  let systemMessage = request.system;

  // Build conversation prompt from messages
  let conversationPrompt = '';

  for (const msg of request.messages) {
    const content = extractTextContent(msg.content);

    if (msg.role === 'system') {
      systemMessage = content;
    } else if (msg.role === 'user') {
      conversationPrompt += `User: ${content}\n\n`;
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
      lastUserMessage = extractTextContent(request.messages[i].content);
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
