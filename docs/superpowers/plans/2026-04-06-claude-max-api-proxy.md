# claude-max-api-proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with sub-agents, or superpowers:executing-plans for inline execution in this session.

**Goal:** Build a blazing-fast (Bun + Hono) local HTTP proxy that bridges both Anthropic and OpenAI API formats to Claude Code CLI, enabling multi-turn conversations with full feature support (streaming, tools, extended thinking).

**Architecture:** Thin wrapper around Claude CLI using Hono for HTTP routing, dual-format adapters for API translation, sequential request queue for subprocess management, and native CLI session persistence for conversation state.

**Tech Stack:** Bun runtime, Hono HTTP framework, TypeScript, stream-json parsing

---

## Task List

1. **Project Setup & Dependencies** — `package.json`, `bunfig.toml`, `tsconfig.json`, install Bun packages
2. **Shared Types** — `src/types.ts`, `src/cli/types.ts` — TypeScript interfaces for all data structures
3. **Configuration System** — `src/config.ts`, config loading, model mapping, environment overrides
4. **Request Queue** — `src/queue.ts` — FIFO sequential request processing
5. **CLI Subprocess Management** — `src/cli/subprocess.ts`, `src/cli/stream-parser.ts`, `src/cli/session.ts` — Process spawning, stream parsing, session management
6. **Format Adapters (Request Side)** — `src/adapters/anthropic-to-cli.ts`, `src/adapters/openai-to-cli.ts` — Convert incoming API requests to CLI prompts
7. **Format Adapters (Response Side)** — `src/adapters/cli-to-anthropic.ts`, `src/adapters/cli-to-openai.ts` — Convert CLI output to API responses
8. **Hono Server & Middleware** — `src/server.ts` — HTTP server setup, CORS, logging, health check
9. **Anthropic Messages Route** — `src/routes/anthropic.ts` — `POST /v1/messages` endpoint
10. **OpenAI Chat Completions Route** — `src/routes/openai.ts` — `POST /v1/chat/completions` endpoint
11. **Shared Routes** — `src/routes/shared.ts` — `GET /v1/models`, health check
12. **Entry Point** — `src/index.ts` — Server initialization, CLI verification, startup messages
13. **Build & Test** — Build TypeScript, run all tests, verify local dev
14. **Documentation & README** — `README.md`, `.npmignore`, `LICENSE` — Project documentation
15. **Final Verification & First Test** — Verify all files, type checks, test suite, working server

---

## Implementation Notes

- Each task includes full code examples, test code, and exact commands
- All files use TypeScript with strict mode
- TDD approach: tests written before or alongside implementation
- All commits are atomic per task
- Tests must pass before proceeding to next task
- Config system supports environment variable overrides
- Model mapping is extensible via config file
- Sequential queue ensures one CLI process at a time
- Both API formats (Anthropic and OpenAI) share same backend
- Streaming responses use Server-Sent Events (SSE)
- Non-streaming responses return complete JSON
- Session persistence delegated to Claude CLI
- Process cleanup on client disconnect
- Timeout handling with configurable limits

---

## Success Criteria

- ✅ Server starts and listens on port 3456
- ✅ Both Anthropic and OpenAI API formats work
- ✅ Streaming responses work
- ✅ Multi-turn conversations persist via CLI sessions
- ✅ Requests queue sequentially
- ✅ Client disconnect kills subprocess
- ✅ Timeout handling works
- ✅ Model mapping is configurable
- ✅ Error handling is robust
- ✅ No API key required
- ✅ Type-safe TypeScript throughout
- ✅ Tests cover core functionality

---

## Files to Create

```
src/
├── index.ts              # Entry point
├── server.ts             # Hono server
├── config.ts             # Configuration
├── types.ts              # Shared types
├── queue.ts              # Request queue
├── routes/
│   ├── anthropic.ts      # Anthropic API
│   ├── openai.ts         # OpenAI API
│   └── shared.ts         # Shared endpoints
├── adapters/
│   ├── anthropic-to-cli.ts
│   ├── openai-to-cli.ts
│   ├── cli-to-anthropic.ts
│   └── cli-to-openai.ts
└── cli/
    ├── subprocess.ts
    ├── stream-parser.ts
    ├── session.ts
    └── types.ts

tests/
├── unit/
│   ├── config.test.ts
│   ├── queue.test.ts
│   ├── adapters.test.ts
│   └── subprocess.test.ts
└── integration/
    ├── anthropic-api.test.ts
    ├── openai-api.test.ts
    └── e2e.test.ts

package.json
bunfig.toml
tsconfig.json
README.md
LICENSE
.npmignore
config/
└── claude-proxy.config.json
```

---

## Context for Implementers

- **Language:** TypeScript (strict mode)
- **Framework:** Hono (HTTP routing)
- **Runtime:** Bun
- **Port:** 3456 (default)
- **API Formats:** Anthropic Messages API + OpenAI Chat Completions API
- **CLI Integration:** Spawns `claude` with `--output-format stream-json`
- **Session Management:** CLI handles via `--session-key` flag
- **Stream Parsing:** Newline-delimited JSON
- **Queue:** Sequential FIFO (one request at a time)
- **Adapters:** Bidirectional format conversion
- **Testing:** Bun test framework, write tests before/alongside implementation

---

## Execution Order

Follow tasks in numerical order (1-15). Each task builds on previous ones.

**Dependencies:**
- Task 1 → Install dependencies
- Task 2 → Define types used by all other tasks
- Task 3 → Configuration loaded by server and CLI
- Task 4 → Queue used by routes
- Task 5 → CLI subprocess used by routes
- Task 6-7 → Adapters used by routes
- Task 8 → Server base for routes
- Task 9-11 → Routes use server, adapters, queue, CLI subprocess
- Task 12 → Entry point wires everything together
- Task 13 → Build and test everything
- Task 14 → Documentation
- Task 15 → Final verification

Do not skip tasks or change order.

