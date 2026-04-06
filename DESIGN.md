# claude-max-api-proxy Rewrite — Design Specification

**Date:** 2026-04-06  
**Status:** Design approved, ready for implementation  
**Tech Stack:** Bun + Hono + TypeScript  
**Purpose:** Expose Anthropic API and OpenAI-compatible API that proxies to Claude Code CLI, enabling any SDK to use Claude Max subscription without API keys.

---

## Overview

`claude-max-api-proxy` is a local HTTP server that:

1. Listens on `http://localhost:3456` (configurable)
2. Accepts requests in **Anthropic Messages API** format (`POST /v1/messages`)
3. Also accepts **OpenAI Chat Completions API** format (`POST /v1/chat/completions`)
4. Spawns `claude` CLI processes with `--output-format stream-json` for each request
5. Manages multi-turn conversation state via CLI session persistence
6. Queues requests sequentially (one CLI process at a time)
7. Streams responses back in either format (Anthropic or OpenAI)
8. Supports full feature set: text, images, tool use, extended thinking, streaming

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Client (Anthropic SDK / OpenAI SDK / curl)    │
└────────────────────┬────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
      POST /v1/messages    POST /v1/chat/completions
    (Anthropic format)     (OpenAI format)
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼─────────────┐
         │  Hono HTTP Server       │
         │  (Bun runtime)          │
         │                         │
         │  • CORS enabled         │
         │  • Request routing      │
         │  • Error handling       │
         └───────────┬─────────────┘
                     │
         ┌───────────▼──────────────────┐
         │  Request Queue (FIFO)        │
         │  Serialize HTTP requests     │
         │  one at a time               │
         └───────────┬──────────────────┘
                     │
         ┌───────────▼──────────────────┐
         │  Format Adapters             │
         │                              │
         │  • Anthropic → CLI prompt    │
         │  • OpenAI → CLI prompt       │
         │  • CLI output → Anthropic    │
         │  • CLI output → OpenAI       │
         └───────────┬──────────────────┘
                     │
         ┌───────────▼──────────────────┐
         │  CLI Subprocess Manager      │
         │                              │
         │  • Spawn `claude` process    │
         │  • Pipe stdin (prompt)       │
         │  • Parse stdout (stream-json)│
         │  • Session persistence       │
         │  • Timeout management        │
         │  • Process cleanup           │
         └───────────┬──────────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │  Claude Code CLI         │
         │  (/opt/homebrew/bin/claude or system PATH) │
         │                          │
         │  --output-format stream-json  │
         │  --session-key <key>     │
         │  --model <model>         │
         │  --[options]             │
         └──────────────────────────┘
```

**Key design decision:** Sequential request queue ensures one CLI process at a time, avoiding subprocess overhead for single-user sequential usage. If multiple requests arrive, they queue (not error).

---

## API Surfaces

### Anthropic Messages API

**Endpoint:** `POST /v1/messages`

**Request body** (standard Anthropic format):
```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "system": "You are a helpful assistant",
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"},
    {"role": "user", "content": "How are you?"}
  ],
  "tools": [
    {
      "name": "calculator",
      "description": "...",
      "input_schema": {...}
    }
  ],
  "tool_choice": "auto",
  "temperature": 0.7,
  "top_p": 1.0,
  "top_k": 40,
  "stop_sequences": ["\n\n"],
  "thinking": {
    "type": "enabled",
    "budget_tokens": 5000
  },
  "stream": true
}
```

**Response (streaming):**
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","model":"claude-opus-4-6",...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"output_tokens":5}}

event: message_stop
data: {}
```

**Non-streaming response:**
```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "model": "claude-opus-4-6",
  "content": [
    {"type": "text", "text": "Response text"},
    {"type": "tool_use", "id": "tool_...", "name": "calculator", "input": {...}}
  ],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 15}
}
```

### OpenAI Chat Completions API

**Endpoint:** `POST /v1/chat/completions`

**Request body** (standard OpenAI format):
```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "messages": [
    {"role": "system", "content": "You are helpful"},
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi!"},
    {"role": "user", "content": "How are you?"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "calculator",
        "description": "...",
        "parameters": {...}
      }
    }
  ],
  "tool_choice": "auto",
  "temperature": 0.7,
  "top_p": 1.0,
  "stream": true
}
```

**Response (streaming):**
```
data: {"id":"chatcmpl_...","object":"text_completion.chunk","created":1712419823,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl_...","object":"text_completion.chunk","created":1712419823,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" there"},"finish_reason":null}]}

data: [DONE]
```

**Non-streaming response:**
```json
{
  "id": "chatcmpl_...",
  "object": "chat.completion",
  "created": 1712419823,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Response text"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {"prompt_tokens": 10, "completion_tokens": 15, "total_tokens": 25}
}
```

### Shared Endpoints

**GET `/v1/models`**
- Returns list of available models
- Format (Anthropic or OpenAI) detected from `Accept` header or `?format=anthropic|openai` query param

**GET `/health`**
- Returns `{ status: "ok", version, uptime, queued_requests }`

---

## Model Mapping (Configurable)

Default model aliases:

| Input | CLI `--model` |
|---|---|
| `claude-opus-4`, `claude-opus-4-6`, `opus` | `claude-opus-4-6` |
| `claude-sonnet-4`, `claude-sonnet-4-6`, `sonnet` | `claude-sonnet-4-6` |
| `claude-haiku-4`, `claude-haiku-4-5-20251001`, `haiku` | `claude-haiku-4-5-20251001` |
| Unknown / not specified | `claude-opus-4-6` (default) |

**Custom mappings** via `claude-proxy.config.json`:
```json
{
  "models": {
    "opus": "claude-opus-4-6",
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
    "my-custom-model": "claude-custom-model-id"
  },
  "defaultModel": "claude-opus-4-6",
  "port": 3456,
  "host": "127.0.0.1",
  "requestTimeoutMs": 300000,
  "logLevel": "info"
}
```

---

## Session Management

**Session Key Strategy:**

- **Single-user mode (default):** All requests use a default session key (e.g., `"default"`). Multi-turn conversations persist automatically.
- **Multi-user mode (optional future):** Derive session key from `x-user-id` header or Anthropic's `metadata.user_id` field.

**Session Persistence:**
- The CLI flag `--session-key <key>` automatically manages conversation history in `~/.cache/claude-code-cli/sessions/<key>.json`
- Each request with the same session key continues the previous conversation
- Sessions auto-expire after 24 hours of inactivity

**Implications:**
- No need for client to manage conversation state — proxy + CLI handle it
- Subsequent messages in the same session only need the latest user message, not full history
- Tool results automatically integrated into session context

---

## Request Flow (Detailed)

### 1. HTTP Request Arrives

Client sends `POST /v1/messages` or `POST /v1/chat/completions` with headers & body.

### 2. Queue Enqueue

Request is added to the FIFO queue. If queue is empty, immediately process. Otherwise, wait.

### 3. Format Detection & Parsing

- Detect format (Anthropic vs OpenAI) from URL path
- Parse request body, extract: `messages`, `system`, `tools`, `tool_choice`, `stream`, `model`, `temperature`, `max_tokens`, etc.
- Resolve model name to CLI `--model` value

### 4. Format Adapter (API → CLI)

**Anthropic → CLI:**
- Flatten `messages` array into a single prompt string
- System message wrapped in `<system>` tags
- Previous assistant messages wrapped in `<previous_response>` tags
- Current user message passed as the active prompt
- Tool results from `messages` array integrated into context

**OpenAI → CLI:**
- Similar flattening, but parse OpenAI role semantics
- Map `assistant` → previous response, `function` / `tool` → tool result, etc.

### 5. CLI Subprocess Spawn

```bash
claude \
  --model claude-opus-4-6 \
  --output-format stream-json \
  --session-key "default" \
  --temperature 0.7 \
  [other flags] \
  < PROMPT_STDIN
```

- Prompt passed via stdin to avoid OS argument length limits
- stdout captured and parsed as `stream-json`
- stderr logged for debugging

### 6. Stream Parsing

As CLI writes JSON to stdout:
- Parse newline-delimited JSON
- Emit typed events: `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `tool_use_start`, `tool_use_delta`, `message_stop`, etc.

### 7. Response Adapter (CLI → API Format)

**CLI → Anthropic:**
- Accumulate deltas into content blocks
- Emit SSE events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`
- On client close, kill subprocess

**CLI → OpenAI:**
- Accumulate deltas into `delta` objects
- Emit SSE chunks in OpenAI format
- Emit `data: [DONE]` at end
- On client close, kill subprocess

### 8. HTTP Response

- Streaming: SSE headers set, chunks flushed immediately
- Non-streaming: Wait for `message_stop` event, return complete response object

### 9. Cleanup

- Subprocess exits naturally (or killed on client disconnect)
- Session state persisted by CLI
- Request dequeued, next queued request processed

---

## Error Handling

**CLI not found:** Return `500 { error: "Claude Code CLI not installed. Run: npm install -g @anthropic-ai/claude-code" }`

**CLI not authenticated:** Return `401 { error: "Claude Code CLI not authenticated. Run: claude auth login" }`

**CLI error / non-zero exit:** Parse stderr, return `400`/`500` with error details

**Invalid request:** Return `400` with validation error

**Client disconnect:** Kill subprocess immediately, no response

**Timeout (5 min default):** Kill subprocess, return `504 Gateway Timeout`

**Malformed JSON from CLI:** Log error, return `500 Internal Server Error`

---

## Project Structure

```
src/
├── server.ts              # Hono app setup, middleware, main server
├── routes/
│   ├── anthropic.ts       # POST /v1/messages
│   ├── openai.ts          # POST /v1/chat/completions
│   └── shared.ts          # GET /v1/models, GET /health
├── adapters/
│   ├── anthropic-to-cli.ts   # Anthropic request → CLI prompt
│   ├── openai-to-cli.ts      # OpenAI request → CLI prompt
│   ├── cli-to-anthropic.ts   # CLI stream → Anthropic SSE
│   └── cli-to-openai.ts      # CLI stream → OpenAI SSE
├── cli/
│   ├── subprocess.ts      # Spawn & manage CLI process, stream parsing
│   ├── types.ts           # Types for stream-json events
│   └── session.ts         # Session key management
├── queue.ts               # Request queue (FIFO, sequential)
├── config.ts              # Load config file, defaults
├── types.ts               # Shared TypeScript types
└── index.ts               # Entry point, CLI startup
config/
└── claude-proxy.config.json  # Default config (optional, runtime override)
```

---

## Configuration

**Default values:**
```json
{
  "models": {
    "opus": "claude-opus-4-6",
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001"
  },
  "defaultModel": "claude-opus-4-6",
  "port": 3456,
  "host": "127.0.0.1",
  "requestTimeoutMs": 300000,
  "logLevel": "info"
}
```

**Override via environment variables:**
- `CLAUDE_PROXY_PORT=4000`
- `CLAUDE_PROXY_HOST=0.0.0.0`
- `CLAUDE_PROXY_CONFIG=/path/to/config.json`

**Override via CLI arguments:**
```bash
bun run src/index.ts --port 4000 --host 0.0.0.0 --config ./config.json
```

---

## Dependencies

**Runtime:**
- `hono` — HTTP framework
- `uuid` — session key generation

**Dev:**
- TypeScript
- Bun (runtime & test)

**Peer (optional):**
- `@anthropic-ai/sdk` — for TypeScript types if building against Anthropic SDK

---

## Testing

**Manual testing:**
```bash
# Start server
bun run src/index.ts

# Test Anthropic API
curl -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Test OpenAI API
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Test streaming
curl -N -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-6","max_tokens":100,"messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

---

## Non-Goals / Out of Scope

- Vision API support initially (can be added once Claude CLI supports it natively)
- Batches API
- Files API
- Multi-user authentication / authorization (can be added as future enhancement)
- Database persistence (sessions are CLI-managed, not proxy-managed)
- Caching of responses
- Rate limiting (can be added via middleware)
- Request logging (basic logging only)

---

## Success Criteria

- ✅ Server starts and listens on port 3456
- ✅ Both Anthropic and OpenAI API formats work
- ✅ Streaming responses work
- ✅ Multi-turn conversations persist via CLI sessions
- ✅ Tool use / function calling works
- ✅ Tool results are properly integrated
- ✅ Extended thinking works
- ✅ Requests queue sequentially
- ✅ Client disconnect kills subprocess
- ✅ Timeout handling works
- ✅ Model mapping is configurable
- ✅ Error handling is robust
- ✅ No API key required (auth header ignored)

