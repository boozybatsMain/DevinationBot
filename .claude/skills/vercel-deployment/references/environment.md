# Vercel Environment & Debugging Reference

## Environment Variables

### Setting Up

1. **Vercel Dashboard**: Project Settings > Environment Variables
2. **Local**: Create `.env.local` (never commit)
3. **Sync**: Run `vercel env pull` to sync locally

### Environment Scopes

| Scope       | When Used                          |
|-------------|-----------------------------------|
| Production  | `vercel --prod` deployments       |
| Preview     | Branch/PR deployments             |
| Development | `vercel dev` local server         |

### Common Pattern: Env Validation

```typescript
// src/utils/env.ts
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// Validate all required env vars at module load time
export const config = {
  myApiKey: requireEnv("MY_API_KEY"),
  nodeEnv: optionalEnv("NODE_ENV", "development"),
} as const;
```

### Generating Secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Debugging

### View Function Logs

```bash
# Stream logs in real-time
vercel logs --follow

# View logs for a specific deployment
vercel logs https://your-app.vercel.app
```

### Test Locally with ngrok

```bash
# Terminal 1: Start ngrok
ngrok http 3000

# Terminal 2: Run Vercel dev server
vercel dev
```

### Common Issues

| Issue               | Cause                           | Fix                                     |
|---------------------|--------------------------------|----------------------------------------|
| 500 errors          | Missing env vars               | Check Vercel dashboard                 |
| Function timeout    | Exceeding plan limit           | Optimize or upgrade plan               |
| Cold start slow     | Heavy module-level imports     | Minimize top-level imports, lazy init  |
| CORS errors         | Missing headers                | Add CORS headers in `vercel.json`      |
| Module not found    | Missing dependency             | Check `package.json`, commit lockfile  |
| Rate limited        | Too many deployments/requests  | Use caching, reduce deploy frequency   |

## Upstash Redis Integration

### Via Vercel Marketplace (Recommended)

1. Go to Vercel Dashboard > Storage > Create Database
2. Select Upstash Redis
3. Environment variables are automatically added

### Manual Setup

1. Create database at upstash.com
2. Copy REST URL and token
3. Add to Vercel environment variables:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### Usage Pattern

```typescript
import { Redis } from "@upstash/redis";

// Module-level: reused across warm invocations
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: Request) {
  await redis.set("key", "value", { ex: 3600 });
  const value = await redis.get("key");
  return Response.json({ value });
}
```
