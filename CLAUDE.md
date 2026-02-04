# CLAUDE.md - AI Agent Guidelines for DevinationBot

## Repository Overview

A **Telegram bot** built with grammY (TypeScript), deployed on Vercel serverless functions. The bot uses webhooks (not long polling) for production and leverages Upstash Redis for session/state management.

```
DevinationBot/
├── api/
│   └── bot.ts              # Webhook endpoint (Vercel serverless function)
├── src/
│   ├── bot.ts              # Bot instance, plugins, middleware setup
│   ├── commands/            # Command handlers (/start, /help, etc.)
│   ├── callbacks/           # Callback query handlers (inline keyboards)
│   ├── middleware/           # Custom middleware (auth, rate-limit, logging)
│   ├── keyboards/           # Reusable inline keyboard builders
│   ├── services/            # External API integrations, business logic
│   ├── storage/             # Session storage adapters (Redis, etc.)
│   ├── types/               # Shared TypeScript types and context flavors
│   └── utils/               # Helper functions, env validation
├── scripts/
│   └── set-webhook.ts       # One-time webhook registration script
├── .claude/
│   ├── agents/              # Specialized sub-agents
│   ├── commands/            # Slash commands for workflow
│   └── skills/              # Domain-specific knowledge (telegram-bot)
├── thoughts/                # AI workflow: research, plans, tickets
│   └── shared/
│       ├── research/
│       ├── plans/
│       └── tickets/
├── .env.local               # Local environment variables (never commit)
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

## Development Commands

```bash
# Setup
npm install

# Local development (use ngrok or similar for webhook testing)
npx tsx scripts/set-webhook.ts   # Register webhook with Telegram

# Deploy
vercel                           # Preview deployment
vercel --prod                    # Production deployment

# Quality
npm run type-check               # TypeScript validation
npm run lint                     # ESLint
npm run lint:fix                 # Auto-fix lint issues
npm run test                     # Run tests
npm run format                   # Prettier formatting
```

## Architecture Patterns

### Webhook Flow

```
Telegram Update → Vercel /api/bot → grammY webhookCallback → Middleware → Handler → Response
                       ↓
               Secret token verified
               Bot instance (module-level, reused across warm invocations)
               Session loaded from Upstash Redis (lazy)
```

### Key Principles

1. **Module-level bot initialization** - The bot instance is created at module scope and reused across warm invocations. No async initialization at module level.

2. **Pre-cached botInfo** - Always pass `botInfo` to the Bot constructor to skip the `getMe` API call on cold starts.

3. **Webhook-only** - No long polling. Vercel serverless functions handle webhook POST requests.

4. **Session-based state machines** - Use session middleware with Redis storage for conversation state. The `@grammyjs/conversations` plugin does NOT work on serverless.

5. **Always return 200** - Use `onTimeout: "return"` in `webhookCallback` to prevent Telegram from re-sending updates on timeout.

6. **Always answer callback queries** - Every callback query must be answered to dismiss the loading spinner.

## Code Style Guidelines

### TypeScript

- **Strict mode** enabled
- Use explicit types for function parameters and returns
- Prefer `unknown` over `any`
- Use grammY's Context flavors for type-safe session access
- Use discriminated unions for conversation state

```typescript
// Good - typed context with session flavor
import { Context, SessionFlavor } from "grammy";

interface SessionData {
  step: "idle" | "awaiting_name" | "confirming";
  name?: string;
}

type MyContext = Context & SessionFlavor<SessionData>;
```

### File Organization

- One command handler per file in `src/commands/`
- One callback group per file in `src/callbacks/`
- Middleware in `src/middleware/` with clear single responsibility
- Reusable keyboards in `src/keyboards/`
- External API calls in `src/services/`

```typescript
// Good - command handler in its own file
// src/commands/start.ts
import { CommandContext } from "grammy";
import type { MyContext } from "../types";

export async function handleStart(ctx: CommandContext<MyContext>): Promise<void> {
  await ctx.reply("Welcome!");
}
```

### Error Handling

- Use `bot.catch()` for global error handling
- Use `autoRetry` plugin for Telegram API rate limits
- Log errors with context (update_id, user_id)
- Never throw in callback query handlers - always answer first

### JSDoc Requirements

Document exported functions:

```typescript
/**
 * Handles the /start command. Sends a welcome message with the main menu keyboard.
 * @param ctx - The command context with session flavor
 */
export async function handleStart(ctx: CommandContext<MyContext>): Promise<void> {
  // ...
}
```

## TODO Priority System

| Level | Meaning | Example |
|-------|---------|---------|
| `TODO(0)` | Critical - blocks deploy | `// TODO(0): Fix webhook verification` |
| `TODO(1)` | High - architectural issue | `// TODO(1): Move to Redis sessions` |
| `TODO(2)` | Medium - minor bug | `// TODO(2): Handle empty callback data` |
| `TODO(3)` | Low - polish | `// TODO(3): Add JSDoc` |
| `TODO(4)` | Question/investigation | `// TODO(4): Why does this timeout?` |

## Environment Variables

Required in `.env.local`:

```env
BOT_TOKEN=123456:ABC-DEF...          # Telegram bot token from @BotFather
WEBHOOK_SECRET=random-64-char-hex    # Secret for webhook verification
BOT_ID=123456789                     # Bot user ID (for pre-cached botInfo)
BOT_USERNAME=my_bot                  # Bot username (for pre-cached botInfo)

# Upstash Redis (for sessions)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=AX...
```

## Vercel Constraints

- **Hobby plan**: 10s max execution time, 1024MB memory
- **Pro plan**: up to 300s (800s with Fluid compute)
- Set `timeoutMilliseconds` in `webhookCallback` to 1s less than Vercel limit
- No persistent connections - use HTTP-based clients (Upstash Redis, not ioredis)
- Module-level code runs once per cold start and persists across warm invocations

## AI Workflow: Research → Plan → Implement

### Subagent Usage

| Task | Subagent | Why |
|------|----------|-----|
| Find files/patterns | `codebase-locator` | Returns paths, not file contents |
| Understand component | `codebase-analyzer` | Deep dive without polluting context |
| Find similar code | `codebase-pattern-finder` | Returns code examples |
| Research web info | `web-search-researcher` | Fetches external docs |
| Simplify code | `code-simplifier` | Refine for clarity |

## Key Files Reference

- `api/bot.ts` - Webhook entry point (Vercel serverless function)
- `src/bot.ts` - Bot instance creation, plugin registration, handler composition
- `src/types/index.ts` - Context types, session data interfaces
- `src/commands/` - Individual command handlers
- `src/callbacks/` - Callback query handlers
- `src/middleware/` - Custom middleware
- `src/storage/` - Session storage adapters
- `scripts/set-webhook.ts` - Webhook registration utility

## What NOT to Do

1. **Don't use long polling** - Vercel functions are stateless, webhooks only
2. **Don't use `@grammyjs/conversations`** - Doesn't work on serverless
3. **Don't use ioredis/redis** - Use `@upstash/redis` (HTTP-based) for serverless
4. **Don't do async initialization at module level** - Pre-cache `botInfo` instead
5. **Don't forget to answer callback queries** - Always call `ctx.answerCallbackQuery()`
6. **Don't over-engineer** - Only add what's needed for the current task
7. **Don't create new files unnecessarily** - Edit existing files when possible
