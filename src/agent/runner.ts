import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunOptions, AgentEvent } from './types';

export class AgentRunner {
  async *run(options: AgentRunOptions): AsyncGenerator<AgentEvent> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const abortController = new AbortController();

    if (options.timeout) {
      timeoutHandle = setTimeout(() => abortController.abort(), options.timeout);
    }

    try {
      // Override SDK's default system prompt with empty string and prepend
      // the client's system prompt to the user prompt. Using SDK's systemPrompt
      // with large prompts (>27K chars) triggers "out of extra usage" errors
      // due to combined token accounting with Claude Code's internal context.
      const fullPrompt = options.system
        ? `${options.system}\n\n${options.prompt}`
        : options.prompt;

      const q = query({
        prompt: fullPrompt,
        options: {
          model: options.model,
          cwd: process.cwd(),
          systemPrompt: '',
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          abortController,
        },
      });

      let fullText = '';
      let messageId = '';
      let stopReason = '';
      let usage = { input_tokens: 0, output_tokens: 0 };

      for await (const message of q) {
        if (message.type === 'assistant') {
          const assistantMsg = message as any;
          const content = assistantMsg.message?.content;
          messageId = assistantMsg.message?.id || 'msg_' + Date.now();

          if (assistantMsg.message?.usage) {
            usage = {
              input_tokens: assistantMsg.message.usage.input_tokens || 0,
              output_tokens: assistantMsg.message.usage.output_tokens || 0,
            };
          }

          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
                yield { type: 'text', text: block.text };
              }
            }
          }

          stopReason = assistantMsg.message?.stop_reason || 'end_turn';
        }

        if (message.type === 'result') {
          const result = message as any;
          if (result.usage) {
            usage = {
              input_tokens: result.usage.input_tokens || usage.input_tokens,
              output_tokens: result.usage.output_tokens || usage.output_tokens,
            };
          }
          break;
        }
      }

      yield {
        type: 'done',
        messageId,
        model: options.model,
        stopReason,
        usage,
        fullText,
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
