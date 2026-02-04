# Node.js Code Patterns Reference

## HTTP Fetch with Retry

```typescript
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      if (attempt === maxRetries) return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
    // Exponential backoff: 1s, 2s, 4s
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw new Error("Unreachable");
}
```

## Typed Environment Validation

```typescript
// src/config.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
```

## Graceful Shutdown

```typescript
const server = app.listen(config.port);

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

## Rate Limiter (In-Memory)

```typescript
class RateLimiter {
  private requests = new Map<string, number[]>();

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) ?? [];
    const valid = timestamps.filter((t) => now - t < this.windowMs);

    if (valid.length >= this.maxRequests) return false;

    valid.push(now);
    this.requests.set(key, valid);
    return true;
  }
}

const limiter = new RateLimiter(100, 60_000); // 100 req/min
```

## Stream Processing

```typescript
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

async function processLargeFile(path: string): Promise<number> {
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  for await (const line of rl) {
    // Process each line without loading entire file
    lineCount++;
  }
  return lineCount;
}
```

## Worker Thread for CPU Work

```typescript
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

if (isMainThread) {
  async function runHeavyTask(data: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: data });
      worker.on("message", resolve);
      worker.on("error", reject);
    });
  }
} else {
  // Worker thread
  const result = heavyComputation(workerData);
  parentPort!.postMessage(result);
}
```

## Debounce / Throttle

```typescript
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limitMs: number,
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastRun >= limitMs) {
      lastRun = now;
      fn(...args);
    }
  };
}
```

## Cache with TTL

```typescript
class TTLCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();

  constructor(private defaultTtlMs: number) {}

  set(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }
}
```

## Safe JSON Parse

```typescript
function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// With schema validation (zod)
function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = JSON.parse(text);
    return schema.parse(raw);
  } catch {
    return null;
  }
}
```

## Async Queue (Sequential Processing)

```typescript
class AsyncQueue {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;

  async add(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await task();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    this.processing = false;
  }
}
```

## Dependency-Free UUID v4

```typescript
import { randomUUID } from "node:crypto";

const id = randomUUID(); // Built-in since Node 19+
```

## Timing Utility

```typescript
function withTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  return fn().finally(() => {
    const ms = (performance.now() - start).toFixed(1);
    console.log(`[timing] ${label}: ${ms}ms`);
  });
}

// Usage
const users = await withTiming("fetchUsers", () => fetchUsers());
```
