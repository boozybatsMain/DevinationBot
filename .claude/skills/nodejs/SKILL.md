# Node.js Best Practices

Best practices for building Node.js applications with TypeScript. Covers project structure, async patterns, error handling, performance, and module design.

## When to Use This Skill

Use when:
- Setting up a new Node.js project or service
- Writing async code (Promises, streams, event loop)
- Handling errors and building resilient services
- Optimizing Node.js performance
- Structuring a TypeScript project
- Working with environment variables and configuration
- Building HTTP services, CLI tools, or background workers

## Runtime: Node.js 22 LTS

Node.js 22 is the current LTS (supported until April 2027). Key features:
- Stable `fetch` API (no need for `node-fetch`)
- Native WebSocket support
- ES module support via `require()` (experimental)
- Improved `AbortSignal` performance
- Built-in test runner (`node:test`)

## Key Principles

### 1. TypeScript Strict Mode

Always use strict TypeScript configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

Prefer `unknown` over `any`. Use explicit return types on exported functions.

### 2. Project Structure

```
src/
├── commands/      # CLI commands or bot commands
├── services/      # Business logic, external API integrations
├── middleware/     # Request/event middleware
├── types/         # Shared TypeScript types and interfaces
├── utils/         # Pure helper functions
├── storage/       # Database/cache adapters
└── config.ts      # Environment validation, app configuration
```

- One responsibility per file
- Separate business logic from transport (HTTP, CLI, bot)
- Group by feature, not by technical layer, as the app grows

### 3. Async Patterns

**Always use async/await** — never raw callbacks:

```typescript
// CORRECT
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new Error(`User ${id} not found`);
  return response.json() as Promise<User>;
}

// WRONG: callback hell
function fetchUser(id, callback) {
  http.get(`/api/users/${id}`, (res) => {
    // ...
  });
}
```

**Concurrent operations** — use `Promise.all` or `Promise.allSettled`:

```typescript
// Parallel fetches
const [users, posts] = await Promise.all([
  fetchUsers(),
  fetchPosts(),
]);

// When some failures are acceptable
const results = await Promise.allSettled([
  sendEmail(user1),
  sendEmail(user2),
]);
const failures = results.filter((r) => r.status === "rejected");
```

**AbortController for cancellation**:

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5_000);

try {
  const response = await fetch(url, { signal: controller.signal });
  return await response.json();
} finally {
  clearTimeout(timeout);
}
```

### 4. Error Handling

**Custom error classes** for domain errors:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}
```

**Catch at boundaries, not everywhere**:

```typescript
// CORRECT: Catch at the handler/boundary level
export default async function handler(req: Request) {
  try {
    const result = await userService.create(req.body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Unhandled error:", error);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

// WRONG: try/catch in every function
async function getUser(id: string) {
  try { /* ... */ } catch (e) { /* swallow */ }
}
```

**Unhandled rejection safety net**:

```typescript
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
```

### 5. Environment & Configuration

Validate environment at startup, fail fast:

```typescript
// src/config.ts
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  apiKey: requireEnv("API_KEY"),
  redisUrl: requireEnv("UPSTASH_REDIS_REST_URL"),
} as const;
```

### 6. Don't Block the Event Loop

- **Never** use synchronous `fs`, `crypto`, or `zlib` methods in request handlers
- Use `setImmediate()` or worker threads for CPU-intensive tasks
- Keep individual async operations under 100ms when possible

```typescript
// CORRECT: async file read
import { readFile } from "node:fs/promises";
const data = await readFile("config.json", "utf-8");

// WRONG: blocks event loop
import { readFileSync } from "node:fs";
const data = readFileSync("config.json", "utf-8"); // OK only at startup
```

### 7. Logging

Use structured logging (JSON) in production:

```typescript
function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...meta }));
}

log("info", "Request handled", { userId: "123", duration: 45 });
// {"level":"info","message":"Request handled","timestamp":"...","userId":"123","duration":45}
```

### 8. Module Design

- Use named exports (not default exports) for better refactoring
- Export types separately from implementations
- Keep modules focused — if a file exceeds ~200 lines, split it

```typescript
// src/services/user.ts — CORRECT
export async function createUser(data: CreateUserInput): Promise<User> { /* ... */ }
export async function getUser(id: string): Promise<User | null> { /* ... */ }

// WRONG: God module with everything
export default class EverythingService { /* 500 lines */ }
```

## Reference Files

- See `references/patterns.md` for common code patterns and recipes
