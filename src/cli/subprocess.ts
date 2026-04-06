import { spawn, type ChildProcess } from 'child_process';
import { StreamParser } from './stream-parser';
import { StreamJsonEvent } from './types';
import { SessionManager } from './session';
import { Config } from '../types';

export interface SubprocessOptions {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinking?: { type: string; budget_tokens?: number };
  timeout?: number;
  userId?: string;
}

export type EventEmitter = (event: StreamJsonEvent) => void;

export class CLISubprocess {
  private process: ChildProcess | null = null;
  private sessionManager: SessionManager;
  private config: Config;
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(config: Config, sessionManager: SessionManager) {
    this.config = config;
    this.sessionManager = sessionManager;
  }

  async run(options: SubprocessOptions, onEvent: EventEmitter): Promise<void> {
    const sessionKey = this.sessionManager.getSessionKey(options.userId);
    const timeout = options.timeout || this.config.requestTimeoutMs;

    // Build CLI arguments
    const args = ['--output-format', 'stream-json', '--session-key', sessionKey];

    args.push('--model', options.model);

    if (options.maxTokens) {
      args.push('--max-tokens', String(options.maxTokens));
    }

    if (options.temperature !== undefined) {
      args.push('--temperature', String(options.temperature));
    }

    if (options.topP !== undefined) {
      args.push('--top-p', String(options.topP));
    }

    if (options.topK !== undefined) {
      args.push('--top-k', String(options.topK));
    }

    if (options.stopSequences && options.stopSequences.length > 0) {
      options.stopSequences.forEach((seq) => {
        args.push('--stop-sequence', seq);
      });
    }

    if (options.thinking) {
      args.push('--thinking', 'enabled');
      if (options.thinking.budget_tokens) {
        args.push(
          '--thinking-budget-tokens',
          String(options.thinking.budget_tokens)
        );
      }
    }

    // Build full prompt with system message
    let fullPrompt = options.prompt;
    if (options.system) {
      fullPrompt = `<system>\n${options.system}\n</system>\n\n${fullPrompt}`;
    }

    // Spawn process
    this.process = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parser = new StreamParser(onEvent);
    let completed = false;

    // Set timeout
    this.timeoutHandle = setTimeout(() => {
      if (!completed && this.process) {
        this.process.kill();
        onEvent({
          type: 'timeout',
          message: `Request timed out after ${timeout}ms`,
        });
        completed = true;
      }
    }, timeout);

    // Write prompt to stdin
    if (this.process.stdin) {
      this.process.stdin.write(fullPrompt);
      this.process.stdin.end();
    }

    // Process stdout
    if (this.process.stdout) {
      this.process.stdout.on('data', (chunk: Buffer) => {
        const str = chunk.toString('utf-8');
        parser.processChunk(str);
      });
    }

    // Collect stderr
    let stderr = '';
    if (this.process.stderr) {
      this.process.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });
    }

    // Wait for process to exit
    return new Promise<void>((resolve) => {
      this.process!.on('exit', (exitCode) => {
        parser.flush();

        if (!completed) {
          clearTimeout(this.timeoutHandle!);
          this.timeoutHandle = null;
          completed = true;
        }

        if (exitCode !== 0 && exitCode !== 143 && exitCode !== 15) {
          // 143 = SIGTERM, 15 = SIGTERM (normal kill)
          onEvent({
            type: 'error',
            error: {
              message: `Claude CLI exited with code ${exitCode}`,
              details: stderr.trim(),
            },
          });
        }

        this.process = null;
        resolve();
      });
    });
  }

  kill(): void {
    if (this.process) {
      this.process.kill();
    }
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}
