# Vercel Serverless Deployment

Best practices for deploying Node.js/TypeScript applications on Vercel serverless functions.

## When to Use This Skill

Use when:
- Deploying or configuring Vercel serverless functions
- Setting up `vercel.json` or project configuration
- Configuring environment variables on Vercel
- Optimizing cold starts and function performance
- Debugging Vercel function issues (timeouts, memory, logs)
- Setting up webhooks or API routes on Vercel
- Working with Upstash Redis or other HTTP-based services on serverless

## Architecture Overview

```
Client Request → Vercel Edge Network → Serverless Function (/api/*)
                                              ↓
                                    Module-level code (cached across warm invocations)
                                              ↓
                                    Handler function executes
                                              ↓
                                    Response → Client
```

## Key Principles

### 1. Module-Level Initialization

Code at module scope runs once per cold start and persists across warm invocations. Use this for expensive setup (clients, configs).

```typescript
// api/endpoint.ts — CORRECT
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL! });

export default async function handler(req: Request) {
  // redis client is reused across warm invocations
  const data = await redis.get("key");
  return Response.json({ data });
}
```

```typescript
// WRONG: Re-created every request
export default async function handler(req: Request) {
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL! });
}
```

### 2. HTTP-Based Clients Only

Vercel functions are stateless — no persistent TCP connections. Use HTTP-based clients:

| Use                  | Don't Use       |
|----------------------|-----------------|
| `@upstash/redis`     | `ioredis`, `redis` |
| `fetch` / `undici`   | Long-lived WebSocket clients |
| Planetscale HTTP     | Direct MySQL/Postgres pools |

### 3. Timeout Handling

Always handle timeouts gracefully. Set function timeout to 1s less than your plan limit.

```typescript
// Return partial response before Vercel kills the function
export default webhookCallback(bot, "https", {
  timeoutMilliseconds: 9_000, // Hobby plan: 10s limit
  onTimeout: "return",
});
```

### 4. Function Routing

Place serverless functions in the `api/` directory. Each file becomes an endpoint:

```
api/
├── bot.ts        → POST /api/bot
├── health.ts     → GET  /api/health
└── webhooks/
    └── stripe.ts → POST /api/webhooks/stripe
```

### 5. Web Standard API (Recommended)

Use the `fetch` Web Standard export for new functions:

```typescript
// api/hello.ts
export async function GET(request: Request) {
  return Response.json({ message: "Hello" });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ received: body });
}
```

Or use the default export for webhook-style handlers:

```typescript
// api/webhook.ts
export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  // handle webhook
  return new Response("OK", { status: 200 });
}
```

## Reference Files

- See `references/configuration.md` for `vercel.json`, `tsconfig.json`, and `package.json` patterns
- See `references/environment.md` for environment variable setup and debugging
