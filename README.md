# claude-max-api-proxy

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A blazing-fast local HTTP proxy that exposes both **Anthropic Messages API** and **OpenAI-compatible API** for Claude Max subscriptions, powered by Bun + Hono.

Use your Claude Max subscription ($200/month) with **any client** — Continue.dev, Cursor, Cody, Python's `openai` library, or custom scripts — without needing an Anthropic API key.

## Features

- ✅ **Dual API Support**: Both Anthropic and OpenAI-compatible formats
- ✅ **Streaming**: Full SSE streaming support
- ✅ **Tool Use**: Function calling / tool use support
- ✅ **Extended Thinking**: Supported for compatible models
- ✅ **Multi-turn**: Native session persistence for conversations
- ✅ **Fast**: Built with Bun + Hono for zero-overhead performance
- ✅ **Sequential Queue**: Serialize requests to single CLI process
- ✅ **No API Key**: Leverage existing Claude Max auth via Claude Code CLI

## Prerequisites

- **Claude Code CLI** installed and authenticated
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude auth login
  ```
- **Bun** runtime (v1.0.0+)
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Claude Max subscription** ($200/month)

## Installation

```bash
npm install -g claude-max-api-proxy
```

Or run from source:

```bash
git clone https://github.com/huynguyen/claude-max-api-proxy.git
cd claude-max-api-proxy
bun install
bun run src/index.ts
```

## Quick Start

### Start the proxy:
```bash
claude-max-api
# or
bun run dev
```

Server listens on `http://127.0.0.1:3456` by default.

### Use with Anthropic SDK (Python):
```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://127.0.0.1:3456",
    api_key="unused"
)

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.content[0].text)
```

### Use with OpenAI SDK (Python):
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:3456/v1",
    api_key="unused"
)

response = client.chat.completions.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Streaming Example:
```python
with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Tell me a story"}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

## API Endpoints

### Anthropic Messages API
```
POST /v1/messages
Content-Type: application/json

{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}
```

### OpenAI Chat Completions API
```
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}
```

### Models Listing
```
GET /v1/models
```

### Health Check
```
GET /health
```

## Configuration

Create `claude-proxy.config.json`:

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

Or use environment variables:

```bash
CLAUDE_PROXY_PORT=4000 \
CLAUDE_PROXY_HOST=0.0.0.0 \
  claude-max-api
```

## Development

```bash
bun install
bun run type-check
bun test
bun run dev
bun run build
```

## License

MIT — see LICENSE

## Author

Huy Nguyen ([huynguyen](https://github.com/huynguyen))
