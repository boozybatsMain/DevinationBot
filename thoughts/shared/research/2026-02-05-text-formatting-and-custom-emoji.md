---
date: 2026-02-05T12:00:00-08:00
researcher: AI Agent
git_commit: fa6a2dcc813464db1a2c7b953d3e07814761b517
branch: main
repository: boozybatsMain/DevinationBot
topic: "Text formatting options and custom emoji for the message builder"
tags: [research, formatting, custom-emoji, entities, parse-mode, grammy, message-builder]
status: complete
last_updated: 2026-02-05
last_updated_by: AI Agent
last_updated_note: "Added 'Attach Buttons to Existing Message' feature — workaround for custom emoji"
---

# Research: Text Formatting & Custom Emoji in the Message Builder

**Date**: 2026-02-05
**Git Commit**: fa6a2dcc813464db1a2c7b953d3e07814761b517
**Branch**: main
**Repository**: boozybatsMain/DevinationBot

## Research Question

How can users format message text as they want (bold, italic, links, etc.) in the message builder? How can users use custom emoji in text?

## Summary

The current message builder stores user text as a plain string (`ctx.message.text`) and sends everything with `parse_mode: "HTML"`. This means **all user formatting is lost** — bold, italic, links, custom emoji, and other entities are discarded at capture time. The best approach is to store both `text` and `entities` (the `MessageEntity[]` array from Telegram) and send the final message using the `entities` parameter instead of `parse_mode`. This preserves all formatting with zero escaping complexity.

Custom emoji are a Premium feature — bots can **receive** them from any user but can only **send** them if the bot has a Fragment-purchased username (~5,000 TON). 

**Best workaround discovered**: Use `editMessageReplyMarkup` to add buttons to messages that humans already posted. The bot never sends the message content (with custom emoji) — it only adds buttons to an existing post. This completely bypasses the Fragment username requirement.

---

## Recommended Solution: "Attach Buttons to Existing Message" Feature

This is the **recommended approach** for supporting custom emoji without purchasing a Fragment username.

### Concept

Instead of the bot sending the full message (text + image + buttons), the user:
1. Posts the message to the channel themselves (using Telegram's native UI, with all custom emoji and formatting they want)
2. Uses the bot to create buttons only
3. Provides the message URL/link to the bot
4. Bot attaches the buttons to that existing message via `editMessageReplyMarkup`

### Why This Works

- **Human posts message** → can use Premium features (custom emoji, any formatting)
- **Bot only edits reply_markup** → doesn't touch message content, no Fragment username needed
- The `editMessageReplyMarkup` API only modifies the inline keyboard, leaving text/media/entities untouched

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Menu                                                       │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │ 📝 Создать сообщение    │  │ 🔘 Добавить кнопки к посту  │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Create Buttons                                          │
│  (reuse existing button grid workflow)                           │
│                                                                   │
│  [🔗 Button 1]  [💬 Button 2]                                    │
│  [➕ Add row]                                                     │
│                                                                   │
│  [✅ Готово]  [❌ Отмена]                                        │
└─────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Provide Message Link                                    │
│                                                                   │
│  📎 Отправьте ссылку на сообщение в канале или группе.          │
│                                                                   │
│  Как получить ссылку:                                            │
│  1. Откройте сообщение в канале/группе                          │
│  2. Нажмите на сообщение → "Копировать ссылку"                  │
│                                                                   │
│  Пример: https://t.me/channel_name/123                          │
│                                                                   │
│  [⬅️ Назад]  [❌ Отмена]                                        │
└─────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Confirmation & Result                                   │
│                                                                   │
│  ✅ Кнопки успешно добавлены к сообщению!                       │
│                                                                   │
│  OR error scenarios:                                             │
│  ❌ Бот не является администратором в этом канале/группе        │
│  ❌ Сообщение не найдено или ссылка недействительна             │
│  ❌ Нет прав на редактирование сообщений                        │
│  ❌ Неверный формат ссылки                                       │
└─────────────────────────────────────────────────────────────────┘
```

### API: `editMessageReplyMarkup`

```typescript
await ctx.api.editMessageReplyMarkup(chatId, messageId, {
  reply_markup: inlineKeyboard
});
```

**Parameters:**
- `chat_id` — Channel/group ID (extracted from message URL)
- `message_id` — Message ID (extracted from message URL)
- `reply_markup` — The inline keyboard to attach

**Requirements:**
- Bot must be an admin in the channel/group
- Bot must have `can_edit_messages` permission (for channels) or be able to edit messages (for groups where bot is admin)

### Parsing Message URLs

Telegram message URLs have these formats:

```
Public channel/group:
https://t.me/channel_username/12345
https://t.me/c/1234567890/12345  (private channel, numeric ID)

With comment thread:
https://t.me/channel_username/12345?comment=67890
```

**Parsing logic:**

```typescript
interface ParsedMessageLink {
  chatId: number | string;  // numeric ID or @username
  messageId: number;
  isPrivate: boolean;
}

function parseMessageLink(url: string): ParsedMessageLink | null {
  // Pattern 1: https://t.me/username/123
  const publicMatch = url.match(/t\.me\/([a-zA-Z_][a-zA-Z0-9_]{3,})\/(\d+)/);
  if (publicMatch) {
    return {
      chatId: `@${publicMatch[1]}`,
      messageId: parseInt(publicMatch[2]),
      isPrivate: false,
    };
  }

  // Pattern 2: https://t.me/c/1234567890/123 (private channel)
  const privateMatch = url.match(/t\.me\/c\/(\d+)\/(\d+)/);
  if (privateMatch) {
    // Private channel IDs need -100 prefix
    return {
      chatId: -100 * parseInt(privateMatch[1]) - parseInt(privateMatch[1]),
      // Actually: chatId = -1001234567890 for channel ID 1234567890
      messageId: parseInt(privateMatch[2]),
      isPrivate: true,
    };
  }

  return null;
}

// Corrected private channel ID calculation:
// For t.me/c/1234567890/123, the actual chat_id is -1001234567890
function parsePrivateChannelId(idFromUrl: string): number {
  return parseInt(`-100${idFromUrl}`);
}
```

### Error Handling

| Error | Telegram API Error | User-Friendly Message (RU) |
|-------|-------------------|---------------------------|
| Bot not admin | `Bad Request: not enough rights` | ❌ Бот не является администратором в этом канале/группе. Добавьте бота как администратора с правом редактирования сообщений. |
| Message not found | `Bad Request: message to edit not found` | ❌ Сообщение не найдено. Возможно, оно было удалено или ссылка неверна. |
| No edit permission | `Bad Request: message can't be edited` | ❌ Это сообщение нельзя редактировать. Бот может добавлять кнопки только к сообщениям в каналах/группах, где он администратор. |
| Chat not found | `Bad Request: chat not found` | ❌ Канал или группа не найдены. Проверьте ссылку и убедитесь, что бот добавлен в этот чат. |
| Invalid URL format | (validation error) | ❌ Неверный формат ссылки. Отправьте ссылку вида https://t.me/channel/123 |
| Message already has max buttons | `Bad Request: BUTTON_DATA_INVALID` or similar | ❌ Достигнут лимит кнопок. Telegram ограничивает количество кнопок в сообщении. |

### Session State for This Flow

```typescript
// New steps for the "attach buttons" flow
type AttachButtonsStep =
  | "attach_idle"
  | "attach_edit_buttons"    // creating buttons
  | "attach_awaiting_url"    // waiting for message URL
  | "attach_confirming";     // showing result

// Session additions
interface SessionData {
  // ... existing fields ...
  
  // For "attach buttons to existing message" flow
  attachFlow?: {
    buttons: MessageButton[][];
    // No text/image needed — we're only attaching buttons
  };
}
```

### Implementation Considerations

1. **Reuse existing button grid UI** — The button creation workflow (`edit_buttons`, `btn_text`, `btn_action`, `btn_value` steps) can be reused. Just skip text/image steps.

2. **Separate Composer** — Create a new `attachButtonsCallbacks` composer to keep the code organized.

3. **Validation before edit** — Before calling `editMessageReplyMarkup`, optionally use `getChat` to verify bot has access, or just try and catch errors.

4. **No preview of the target message** — The bot can't easily show the target message content (would need `getChat` + store). Just show the buttons being attached and the URL.

### Advantages of This Approach

| Aspect | Full Message Builder | Attach Buttons Only |
|--------|---------------------|---------------------|
| Custom emoji | ❌ Stripped (unless Fragment username) | ✅ Preserved (human posted) |
| Complex formatting | ⚠️ Requires entity passthrough | ✅ Preserved (human posted) |
| Image + text layout | ✅ Bot controls | ✅ Human controls (more flexible) |
| Scheduling | ❌ Not implemented | ✅ Human can schedule post, then bot adds buttons |
| Edit after posting | ❌ Would need to re-send | ✅ Human edits post, buttons remain |
| Multiple button sets | ❌ One per message | ✅ Can update buttons anytime |

### When to Use Each Approach

- **Full Message Builder**: Quick posts without custom emoji, when user doesn't need Premium features
- **Attach Buttons**: Posts with custom emoji, complex formatting, or when human wants full control over content

---

## Detailed Findings

### 1. Current Codebase: How Text Flows Today

**Text capture** — `src/callbacks/messageInput.ts:88-90`:
```typescript
case "write_text": {
  session.message.text = ctx.message.text;  // ← plain text only, entities lost
  session.step = "add_image";
```

**Text storage** — `src/types/index.ts:12-17`:
```typescript
interface ComposedMessage {
  text: string;           // plain text, no formatting info
  imageFileId?: string;
  buttons: MessageButton[][];
}
```

**Text sending** — `src/services/sender.ts:24-28`:
```typescript
await api.sendMessage(chatId, msg.text, {
  parse_mode: "HTML",     // treats raw user text as HTML → can break
  reply_markup: replyMarkup,
});
```

**Preview** — `src/services/preview.ts:13-16`: embeds raw `msg.text` directly into HTML-formatted preview without escaping, which means `<`, `>`, `&` in user text could break the preview.

### 2. Telegram Bot API Formatting Options

#### Three Parse Modes

| Mode | Recommended? | Escaping Complexity |
|------|-------------|-------------------|
| HTML | Yes (for bot UI) | Low — only `<`, `>`, `&` |
| MarkdownV2 | Sometimes | High — 18+ special chars |
| Markdown (legacy) | No | Deprecated, limited features |

#### Entities-Based Approach (No Parse Mode)

Instead of formatting text with HTML/Markdown tags and using `parse_mode`, you can pass a plain text string along with an `entities` parameter — an array of `MessageEntity` objects. Each entity specifies a `type`, `offset`, and `length` (in UTF-16 code units).

**All 19 entity types**: `mention`, `hashtag`, `cashtag`, `bot_command`, `url`, `email`, `phone_number`, `bold`, `italic`, `underline`, `strikethrough`, `spoiler`, `blockquote`, `expandable_blockquote`, `code`, `pre`, `text_link`, `text_mention`, `custom_emoji`

### 3. Ideas for Letting Users Format Text

#### Idea A: Entity Passthrough (Recommended — Best UX)

Users write text in their Telegram client using the **native formatting toolbar** (bold, italic, strikethrough, spoiler, etc. — available on all Telegram platforms). The bot captures both `ctx.message.text` AND `ctx.message.entities`, stores them, and sends using the `entities` parameter.

**Pros:**
- Zero learning curve — users already know how to format in Telegram
- Preserves ALL formatting perfectly: bold, italic, underline, strikethrough, spoiler, code, links, mentions, blockquotes, custom emoji
- No escaping needed — plain text + entities array
- JavaScript's string indexing matches UTF-16 offsets natively
- Entities serialize to JSON trivially (for Redis storage)

**Cons:**
- Users may not know about Telegram's native formatting (need instruction text)
- Custom emoji sending requires Fragment username for the bot

**Implementation sketch:**
```typescript
// types/index.ts
import type { MessageEntity } from "grammy/types";

interface ComposedMessage {
  text: string;
  textEntities?: MessageEntity[];  // ← new
  imageFileId?: string;
  buttons: MessageButton[][];
}

// messageInput.ts — write_text
session.message.text = ctx.message.text;
session.message.textEntities = ctx.message.entities ?? [];

// sender.ts — sendComposedMessage
await api.sendMessage(chatId, msg.text, {
  entities: msg.textEntities,  // no parse_mode
  reply_markup: replyMarkup,
});
```

#### Idea B: Teach Users HTML Syntax

Let users type HTML directly: `<b>bold</b>`, `<i>italic</i>`, `<a href="...">link</a>`.

**Pros:**
- Full control over formatting
- Works with current `parse_mode: "HTML"` approach

**Cons:**
- Terrible UX — most users don't know HTML
- Error-prone — unclosed tags break the message
- Must escape `<`, `>`, `&` in non-tag text
- Users can't easily do this on mobile

#### Idea C: Custom Markdown Syntax

Define a simpler markup: `*bold*`, `_italic_`, `~strike~`, etc. Bot parses it and converts to entities or HTML before sending.

**Pros:**
- Simpler than HTML for users
- Familiar from WhatsApp/Slack

**Cons:**
- Must build a parser
- Ambiguity with special chars in normal text
- Users still need to learn the syntax
- Can't support all features (custom emoji, block quotes)

#### Idea D: Interactive Formatting Menu

Add inline keyboard buttons during text input: [B], [I], [U], [S], [Link], etc. When user taps one, bot wraps selected text or toggles a mode.

**Pros:**
- Visual and intuitive
- No syntax to learn

**Cons:**
- Complex to implement — bots can't select text in user's input
- Would require a multi-step flow: type text → select region → apply format
- Can't really work well in Telegram's bot interaction model

#### Idea E: Web App (Mini App) for Rich Text Editing

Use Telegram's Web App feature to open a rich text editor (like a mini TinyMCE or Quill) inside Telegram. User formats text visually, then the Web App sends the result back to the bot.

**Pros:**
- Best UX — full WYSIWYG editor
- Can support everything: formatting, links, emoji pickers
- Works on all platforms

**Cons:**
- Requires hosting a web app (additional infrastructure)
- Significant development effort
- Adds latency (open web view → edit → send back)

#### Recommendation

**Idea A (Entity Passthrough)** is the clear winner for your use case. It requires minimal code changes, provides the best UX, and leverages what Telegram already does. Most Telegram users know how to format text (select text → formatting menu appears on all platforms). You can add a brief instruction in the `write_text` step to remind users.

### 4. Custom Emoji — Complete Reference

#### What Are Custom Emoji?

Custom emoji are sticker-based emoji that render **inline within message text** (unlike regular stickers which are standalone messages). They come from dedicated "custom emoji sticker packs" and can be animated or static. They're identified by a `custom_emoji_id` (a string-encoded document ID).

#### How Users Add Custom Emoji

Users tap the emoji button, switch to the "Custom Emoji" tab, and insert them into text. They appear inline. In the Bot API, they show up as entities with `type: "custom_emoji"` and a `custom_emoji_id` field.

#### Receiving Custom Emoji (Any Bot Can Do This)

```typescript
bot.on("message:text", async (ctx) => {
  const entities = ctx.message.entities ?? [];
  const customEmoji = entities.filter(e => e.type === "custom_emoji");
  
  for (const e of customEmoji) {
    console.log("Custom emoji ID:", e.custom_emoji_id);
    // The text at this position is a placeholder (fallback) emoji
    const fallback = ctx.message.text.substring(e.offset, e.offset + e.length);
  }
  
  // Optionally get full sticker metadata
  if (customEmoji.length > 0) {
    const ids = customEmoji.map(e => e.custom_emoji_id!);
    const stickers = await ctx.api.getCustomEmojiStickers(ids);
    // stickers[].emoji, stickers[].set_name, stickers[].is_animated, etc.
  }
});
```

#### Sending Custom Emoji (Restricted!)

**Requirement**: The bot must have a **collectible username purchased on [Fragment](https://fragment.com)** (starting at ~5,000 TON ≈ several thousand USD).

Without a Fragment username, a bot **cannot** send custom emoji. The entities will be silently stripped.

**Sending via HTML parse mode:**
```html
<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>
```

**Sending via MarkdownV2:**
```
![👍](tg://emoji?id=5368324170671202286)
```

**Sending via entities:**
```typescript
await api.sendMessage(chatId, "👍 Hello!", {
  entities: [{
    type: "custom_emoji",
    offset: 0,
    length: 2,  // UTF-16 code units for the fallback emoji
    custom_emoji_id: "5368324170671202286"
  }]
});
```

#### Where Custom Emoji Work

| Context | Supported? |
|---------|-----------|
| Message text | Yes |
| Photo/video captions | Yes |
| Poll questions/options | Yes (only custom_emoji entities) |
| Inline keyboard button text | **No** |
| Forum topic icons | Yes (via `icon_custom_emoji_id`) |
| Chat emoji status | Yes (via `emoji_status_custom_emoji_id`) |

#### Practical Impact on DevinationBot

If you use **Entity Passthrough (Idea A)**:
- Custom emoji entities will be stored in the `textEntities` array automatically
- When sending to a group with `sendMessage` + `entities` parameter, custom emoji will be **stripped** unless the bot has a Fragment username
- **Workaround**: The fallback emoji text remains in the message (it's a real Unicode emoji), so the message still makes sense — just without the custom artwork
- If you need custom emoji to appear exactly, you'd need to use `copyMessage` (which preserves them server-side) or invest in a Fragment username

### 5. grammY Parse-Mode Plugin & `fmt` Function

The `@grammyjs/parse-mode` plugin provides:

1. **`fmt` tagged template literal** — builds `{ text, entities }` objects programmatically:
   ```typescript
   import { fmt, bold, italic, code, link } from "@grammyjs/parse-mode";
   
   const msg = fmt`${bold("Status:")} ${italic("ready")} — ${code("v1.2.3")}`;
   await ctx.reply(msg.text, { entities: msg.entities });
   ```

2. **`FormattedString` class** — can wrap existing text+entities from a user message:
   ```typescript
   import { FormattedString, fmt, bold } from "@grammyjs/parse-mode";
   
   const userContent = new FormattedString(ctx.msg.text, ctx.msg.entities ?? []);
   const preview = fmt`📋 ${bold("Preview:")}\n\n${userContent}`;
   // Offsets are recalculated automatically!
   ```

3. **`hydrateReply` middleware** — adds `ctx.replyFmt()` convenience method.

**Key benefit for preview**: You can combine bot-formatted text (using `bold()`, `italic()`, etc.) with user-authored content (wrapped in `FormattedString`) and send with `entities` — all offsets are handled automatically. This solves the preview HTML-escaping problem cleanly.

### 6. Entity Storage & Serialization

`MessageEntity[]` is plain JSON — it survives `JSON.stringify()`/`JSON.parse()` perfectly. Your Upstash Redis session adapter already serializes session data as JSON, so storing entities in the session requires zero extra work. The `textEntities` field would be automatically serialized/deserialized.

UTF-16 offset note: JavaScript strings use UTF-16 internally, so `String.prototype.length`, `String.prototype.slice()`, and `String.prototype.substring()` all count UTF-16 code units — matching Telegram's offset/length semantics exactly.

### 7. Alternative: `copyMessage` for Zero-Effort Formatting

If the original user message still exists, `copyMessage` copies it to another chat without the "Forwarded from" header, preserving **everything** (text, entities, custom emoji, media). No entity handling needed.

**Limitation**: Not suitable for the message builder flow because:
- The user's original message might be deleted (bot cleans up chat)
- The builder allows editing text after initial input
- The builder combines text with image and buttons

However, `copyMessage` could be offered as a **quick send** shortcut: "Forward this message directly to a group without the builder flow."

---

## Code References

- `src/callbacks/messageInput.ts:88-90` — Text capture (currently drops entities)
- `src/types/index.ts:12-17` — ComposedMessage type (no entities field)
- `src/services/sender.ts:22-28` — Message sending (uses parse_mode: "HTML")
- `src/services/preview.ts:7-41` — Preview builder (embeds raw text in HTML)
- `src/callbacks/messageBuilder.ts:23-25` — escapeHtml helper (exists but not used for user text in preview)

## Architecture Documentation

Current flow:
```
User types text → messageInput.ts captures ctx.message.text (plain) → stored in session.message.text
                                                                      → preview shows raw text in HTML (unsafe)
                                                                      → sender.ts sends with parse_mode: "HTML" (treats raw text as HTML)
```

Proposed flow:
```
User types formatted text → messageInput.ts captures ctx.message.text + ctx.message.entities
                          → stored in session.message.text + session.message.textEntities
                          → preview uses FormattedString to combine bot UI + user content
                          → sender.ts sends with entities parameter (no parse_mode)
```

## Relevant Links

- [Telegram Bot API — Formatting Options](https://core.telegram.org/bots/api#formatting-options)
- [Telegram Bot API — MessageEntity](https://core.telegram.org/bots/api#messageentity)
- [Telegram Bot API — editMessageReplyMarkup](https://core.telegram.org/bots/api#editmessagereplymarkup) — **Key API for attaching buttons**
- [Telegram Bot API — copyMessage](https://core.telegram.org/bots/api#copymessage) — Supports `reply_markup` parameter
- [Telegram Styled Text Entities (UTF-16 details)](https://core.telegram.org/api/entities)
- [Telegram Custom Emoji](https://core.telegram.org/api/custom-emoji)
- [Telegram Bot API — getCustomEmojiStickers](https://core.telegram.org/bots/api#getcustomemojistickers)
- [grammY Parse-Mode Plugin](https://grammy.dev/plugins/parse-mode)
- [grammY Entity Parser Plugin](https://grammy.dev/plugins/entity-parser)
- [grammY `fmt` Reference](https://grammy.dev/ref/parse-mode/fmt)
- [grammY `FormattedString` Reference](https://grammy.dev/ref/parse-mode/formattedstring)
- [npm: @grammyjs/parse-mode](https://www.npmjs.com/package/@grammyjs/parse-mode)
- [Fragment Collectible Usernames](https://fragment.com)
- [SO: How to send custom emoji from bot](https://stackoverflow.com/questions/78314430)
- [SO: Add button to forward message from channel](https://stackoverflow.com/questions/70937238)

## Open Questions

1. ~~**Fragment username cost-benefit**~~: **Resolved** — The "Attach Buttons to Existing Message" feature provides a workaround. Users post with custom emoji themselves, bot only adds buttons.
2. **Preview fidelity**: Should the preview render user formatting (using `FormattedString` + entities), or show it as plain text with a note that formatting will be preserved? The `FormattedString` approach is cleaner but requires installing `@grammyjs/parse-mode`.
3. **Caption entity limit**: Photo captions are limited to 1024 characters. Should the builder warn users when their formatted text (which may have entity overhead) approaches this limit?
4. **Web App editor**: For the most polished UX, a Telegram Mini App with a WYSIWYG editor could be explored as a future enhancement — but Entity Passthrough covers 95% of needs with minimal effort.
5. **Attach Buttons — button limits**: Telegram has limits on inline keyboards (max 8 buttons per row, some total limit). Should the bot validate this before attempting to attach?
6. **Attach Buttons — permission check**: Should the bot proactively check if it's an admin in the target chat before showing success, or just attempt and handle errors?
