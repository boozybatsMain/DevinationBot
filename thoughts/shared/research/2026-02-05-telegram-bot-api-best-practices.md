# Telegram Bot API — Best Practices, Pros & Cons for Vercel Deployment

## Summary

Research on building a Telegram bot with the HTTP Bot API (via grammY framework) deployed on Vercel serverless functions. Covers architecture decisions, limitations, and best practices for a message builder bot with inline keyboards.

## Telegram Bot API: Pros & Cons

### Pros
- **Simple HTTP interface** — RESTful, easy to integrate from any language/platform
- **Webhook support** — perfect for serverless (Vercel, AWS Lambda, Cloudflare Workers)
- **Rich UI** — inline keyboards, reply keyboards, menus, media groups, polls
- **Official & stable** — maintained by Telegram, well-documented at core.telegram.org/bots/api
- **grammY ecosystem** — TypeScript-first framework with plugins (auto-retry, sessions, menus)
- **No persistent connections needed** — works over HTTP, ideal for Vercel's stateless functions
- **Free** — no API costs, no rate limits for reasonable usage (30 msg/sec to different chats)

### Cons
- **No method to list bot's chats** — Bot API cannot enumerate groups where the bot is admin. Must track via `my_chat_member` updates in own storage.
- **One webhook per bot** — only one endpoint can receive updates at a time
- **10s timeout on Vercel Hobby** — long operations (file processing, multiple API calls) can hit limits
- **No conversations plugin on serverless** — `@grammyjs/conversations` requires persistent process; must use session-based state machines instead
- **Message editing limitations** — cannot switch message type (text ↔ photo) via edit; must delete and resend
- **Inline keyboard limits** — max 8 buttons per row, callback_data max 64 bytes
- **Photo + caption** — photo always appears above caption; for "text above, photo below" need two separate messages
- **Cold starts** — Vercel functions have ~200-500ms cold start; pre-cache `botInfo` to avoid additional `getMe` call

### Alternative: MTProto (Telethon/GramJS)
- Direct protocol access, can list all chats, no webhook requirement
- Much more complex, requires persistent connection, not serverless-friendly
- **Verdict**: Overkill for this use case. HTTP Bot API is the right choice.

## Key Architectural Decisions

### 1. Session Storage: Upstash Redis
- In-memory sessions don't persist across serverless invocations
- `@grammyjs/storage-redis` with `@upstash/redis` (HTTP-based) is the right choice
- Use lazy sessions to avoid unnecessary Redis reads
- Set TTL (e.g., 1 hour) to auto-cleanup abandoned sessions

### 2. State Machine Pattern (not Conversations)
Since `@grammyjs/conversations` doesn't work on serverless, use session-based state machines:
- Store current `step` in session
- Route text/photo messages based on step
- Each callback transitions to the next step

### 3. Group Tracking via `my_chat_member`
- Listen for `my_chat_member` updates to detect when bot is added/removed from groups
- Store `{userId → [{chatId, title}]}` mapping in Redis
- Verify bot's admin status before sending with `getChatMember`

### 4. Message Preview Strategy
- Steps that add/change content show a preview above the instruction
- For text-only: single message with preview + instructions
- For photo: send photo with caption, then instruction message below
- Track `lastMessageId` in session to edit/delete as needed

### 5. Button Grid UI
Telegram's inline keyboard supports rows of buttons. For the "add button" grid:
- Show existing buttons as clickable (edit on click)
- Show `+` buttons in cardinal directions around existing buttons
- Use compact callback_data: `+r:R` (add row), `+c:R:C` (add column), `eb:R:C` (edit button)

## Key Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Expanded SessionData with message builder state |
| `src/storage/redis.ts` | Redis client singleton + session adapter |
| `src/services/groups.ts` | Track/retrieve user's groups from Redis |
| `src/services/preview.ts` | Build preview text for message builder |
| `src/services/sender.ts` | Send composed message to target group |
| `src/keyboards/messageBuilder.ts` | Dynamic keyboards for each step |
| `src/callbacks/messageBuilder.ts` | All callback handlers for the flow |
| `src/commands/start.ts` | Updated /start with "Создать сообщение" button |
| `src/bot.ts` | Redis session, new composers, `my_chat_member` handler |
| `scripts/set-webhook.ts` | Add `my_chat_member` to allowed_updates |

## Telegram API Methods Used

| Method | Purpose |
|--------|---------|
| `sendMessage` | Text messages, instructions |
| `sendPhoto` | Photo with caption |
| `editMessageText` | Update text messages |
| `editMessageCaption` | Update photo captions |
| `editMessageReplyMarkup` | Update keyboards |
| `deleteMessage` | Remove messages when switching type |
| `answerCallbackQuery` | Dismiss callback loading spinner |
| `getChatMember` | Verify bot is admin in target group |

## Considerations

- All bot text must be in Russian
- Vercel Hobby plan: 10s timeout, 1024MB memory — sufficient for this bot
- Button callback_data must be ≤64 bytes — use compact encoding
- Photo `file_id` persists across messages — store in session for reuse
- Handle edge cases: user sends text when photo expected, back button from first step
