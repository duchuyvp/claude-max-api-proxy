import { APIRequest } from '../types';

export interface CliPromptInput {
  systemMessage?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

// Extract text content from OpenAI message content (can be string or array of content blocks)
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

export function openaiToCli(request: any): CliPromptInput {
  let systemMessage = '';

  // Extract system message from messages
  let conversationPrompt = '';

  for (const msg of request.messages) {
    const content = extractTextContent(msg.content);

    if (msg.role === 'system') {
      systemMessage = content;
    } else if (msg.role === 'user') {
      conversationPrompt += `User: ${content}\n\n`;
    } else if (msg.role === 'assistant') {
      conversationPrompt += `Assistant: ${content}\n\n`;
    } else if (msg.role === 'tool') {
      // Tool result
      conversationPrompt += `Tool Result: ${content}\n\n`;
    }
  }

  // Get the last user message
  let lastUserMessage = '';
  for (let i = request.messages.length - 1; i >= 0; i--) {
    if (request.messages[i].role === 'user') {
      lastUserMessage = extractTextContent(request.messages[i].content);
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
