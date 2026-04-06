import { QueuedRequest } from './types';
import { v4 as uuidv4 } from 'uuid';

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private processor: ((req: QueuedRequest) => Promise<void>) | null = null;

  setProcessor(
    handler: (req: QueuedRequest) => Promise<void>
  ) {
    this.processor = handler;
  }

  async enqueue(
    format: 'anthropic' | 'openai',
    data: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: uuidv4(),
        format,
        data,
        timestamp: Date.now(),
        resolve,
        reject,
      };

      this.queue.push(request);
      this.processNext();
    });
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0 || !this.processor) {
      return;
    }

    this.processing = true;
    const request = this.queue.shift();

    if (!request) {
      this.processing = false;
      return;
    }

    try {
      await this.processor(request);
    } catch (error) {
      request.reject(error);
    }

    this.processing = false;
    if (this.queue.length > 0) {
      this.processNext();
    }
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}
