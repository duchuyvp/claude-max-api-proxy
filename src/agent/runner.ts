import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunOptions, AgentEvent } from './types';
import {
  createPassthroughMcpServer,
  stripMcpPrefix,
  PASSTHROUGH_MCP_NAME,
} from './passthroughTools';

interface CapturedToolUse {
  id: string;
  name: string;
  input: any;
}

export class AgentRunner {
  async *run(options: AgentRunOptions): AsyncGenerator<AgentEvent> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const abortController = new AbortController();

    if (options.timeout) {
      timeoutHandle = setTimeout(() => abortController.abort(), options.timeout);
    }

    try {
      const fullPrompt = options.system
        ? `${options.system}\n\n${options.prompt}`
        : options.prompt;

      const passthrough = options.tools && options.tools.length > 0;
      const capturedToolUses: CapturedToolUse[] = [];

      // Build SDK options
      const sdkOptions: any = {
        model: options.model,
        cwd: process.env.HOME + '/.openclaw/workspace',
        systemPrompt: '.',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        abortController,
      };

      if (passthrough) {
        // Register client tools as no-op MCP servers
        const passthroughMcp = createPassthroughMcpServer(options.tools!);

        // maxTurns: 2 required for passthrough mode
        // Turn 1: model generates tool_use blocks (captured by PreToolUse hook)
        // Turn 2: SDK processes the blocked-tool handoff before generator returns
        sdkOptions.maxTurns = 2;
        sdkOptions.allowedTools = passthroughMcp.toolNames;
        sdkOptions.mcpServers = { [PASSTHROUGH_MCP_NAME]: passthroughMcp.server };

        // PreToolUse hook: block execution, capture tool_use blocks
        sdkOptions.hooks = {
          PreToolUse: [{
            matcher: '',
            hooks: [async (input: any) => {
              capturedToolUses.push({
                id: input.tool_use_id,
                name: stripMcpPrefix(input.tool_name),
                input: input.tool_input,
              });
              return { decision: 'block' as const, reason: 'Forwarding to client' };
            }],
          }],
        };
      }

      const q = query({ prompt: fullPrompt, options: sdkOptions });

      let fullText = '';
      let messageId = '';
      let stopReason = '';
      let usage = { input_tokens: 0, output_tokens: 0 };
      let assistantCount = 0;

      for await (const message of q) {
        if (message.type === 'assistant') {
          assistantCount++;
          const assistantMsg = message as any;
          const content = assistantMsg.message?.content;
          messageId = assistantMsg.message?.id || 'msg_' + Date.now();

          if (assistantMsg.message?.usage) {
            usage = {
              input_tokens: assistantMsg.message.usage.input_tokens || 0,
              output_tokens: assistantMsg.message.usage.output_tokens || 0,
            };
          }

          // In passthrough mode, skip Turn 2 content (SDK artefact)
          if (passthrough && assistantCount > 1) {
            continue;
          }

          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
                yield { type: 'text', text: block.text };
              }
              // Forward tool_use blocks to client (with MCP prefix stripped)
              if (block.type === 'tool_use') {
                yield {
                  type: 'tool_use',
                  id: block.id,
                  name: stripMcpPrefix(block.name || ''),
                  input: block.input || {},
                };
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

      // Emit any tool_use blocks captured by PreToolUse hook but not in content
      for (const tu of capturedToolUses) {
        const alreadyYielded = false; // Hook captures may duplicate content blocks
        if (!alreadyYielded) {
          // Check if already yielded via content blocks above
          // (dedupe handled by adapter via tool IDs)
          yield { type: 'tool_use', id: tu.id, name: tu.name, input: tu.input };
        }
      }

      yield {
        type: 'done',
        messageId,
        model: options.model,
        stopReason: capturedToolUses.length > 0 ? 'tool_use' : stopReason,
        usage,
        fullText,
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
