# Vercel Configuration Reference

## vercel.json

```json
{
  "functions": {
    "api/bot.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

- `maxDuration`: Set to your plan's max (10 for Hobby, up to 300 for Pro)
- `memory`: 1024MB is usually sufficient for lightweight functions

### Region Configuration

Deploy functions near your data source:

```json
{
  "functions": {
    "api/*.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "regions": ["iad1"]
}
```

### Rewrites and Headers

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    }
  ]
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "rootDir": ".",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["api/**/*.ts", "src/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## package.json

```json
{
  "name": "my-vercel-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext .ts",
    "lint:fix": "eslint . --ext .ts --fix",
    "test": "vitest run",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@vercel/node": "^3.0.0",
    "typescript": "^5.5.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "vitest": "^2.0.0"
  }
}
```

## Plan Constraints

| Constraint         | Hobby   | Pro                |
|--------------------|---------|-------------------|
| Max execution time | 10s     | 300s (800s Fluid) |
| Memory             | 1024MB  | 3008MB            |
| Payload size       | 4.5MB   | 4.5MB             |
| Cold start         | 1-5s    | ~0 with Fluid     |
| Bundle size        | 250MB   | 250MB             |

## Cold Start Optimization

1. **Pre-cache expensive setup** at module level (reused across warm invocations)
2. **Minimize top-level imports** — only import what's needed
3. **Use lazy initialization** — defer work until actually needed
4. **Vercel Fluid Compute** (Pro) — near-zero cold starts, concurrent execution within instances

## Deployment Commands

```bash
# Preview deployment (creates unique URL)
vercel

# Production deployment
vercel --prod

# View logs
vercel logs https://your-app.vercel.app

# View environment variables
vercel env ls

# Pull env vars to local .env.local
vercel env pull
```
