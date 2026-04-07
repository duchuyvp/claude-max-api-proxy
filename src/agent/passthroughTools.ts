/**
 * Dynamic MCP tool registration for passthrough mode.
 *
 * In passthrough mode, client tools (e.g. from OpenClaw) are registered as
 * real MCP tools with no-op handlers. The PreToolUse hook blocks execution
 * and captures tool_use blocks to return to the client.
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const PASSTHROUGH_MCP_NAME = 'oc';
export const PASSTHROUGH_MCP_PREFIX = `mcp__${PASSTHROUGH_MCP_NAME}__`;

function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') return z.any();

  if (schema.type === 'string') {
    if (schema.enum) return z.enum(schema.enum as [string, ...string[]]);
    let s = z.string();
    if (schema.description) s = s.describe(schema.description);
    return s;
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    let n = z.number();
    if (schema.description) n = n.describe(schema.description);
    return n;
  }
  if (schema.type === 'boolean') return z.boolean();
  if (schema.type === 'array') {
    const items = schema.items ? jsonSchemaToZod(schema.items) : z.any();
    return z.array(items);
  }
  if (schema.type === 'object' && schema.properties) {
    const shape: Record<string, z.ZodTypeAny> = {};
    const required = new Set(schema.required || []);
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const zodProp = jsonSchemaToZod(propSchema as any);
      shape[key] = required.has(key) ? zodProp : zodProp.optional();
    }
    return z.object(shape);
  }

  return z.any();
}

export function createPassthroughMcpServer(
  tools: Array<{ name: string; description?: string; input_schema?: any }>
) {
  const server = createSdkMcpServer({ name: PASSTHROUGH_MCP_NAME });
  const toolNames: string[] = [];

  for (const tool of tools) {
    try {
      const zodSchema = tool.input_schema?.properties
        ? jsonSchemaToZod(tool.input_schema)
        : z.object({});

      const shape: Record<string, z.ZodTypeAny> =
        zodSchema instanceof z.ZodObject
          ? (zodSchema as any).shape
          : { input: z.any() };

      server.instance.tool(
        tool.name,
        tool.description || tool.name,
        shape,
        async () => ({ content: [{ type: 'text' as const, text: 'passthrough' }] })
      );
      toolNames.push(`${PASSTHROUGH_MCP_PREFIX}${tool.name}`);
    } catch {
      server.instance.tool(
        tool.name,
        tool.description || tool.name,
        { input: z.string().optional() },
        async () => ({ content: [{ type: 'text' as const, text: 'passthrough' }] })
      );
      toolNames.push(`${PASSTHROUGH_MCP_PREFIX}${tool.name}`);
    }
  }

  return { server, toolNames };
}

export function stripMcpPrefix(toolName: string): string {
  if (toolName.startsWith(PASSTHROUGH_MCP_PREFIX)) {
    return toolName.slice(PASSTHROUGH_MCP_PREFIX.length);
  }
  return toolName;
}
