import { availableParallelism } from "node:os";

export const DEFAULT_INDEX_CONCURRENCY = Math.min(8, Math.max(2, availableParallelism()));

export function normalizeConcurrency(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_INDEX_CONCURRENCY;
  return Math.min(64, Math.max(1, Math.floor(value)));
}

/** Run independent work with a fixed number of workers while preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, normalizeConcurrency(concurrency));

  async function run(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => run()));
  return results;
}

/** Limit filesystem or other shared-resource operations across nested workers. */
export class AsyncLimiter {
  private active = 0;
  private readonly pending: (() => void)[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = normalizeConcurrency(limit);
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.pending.shift()?.();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.pending.push(resolve));
    this.active += 1;
  }
}
