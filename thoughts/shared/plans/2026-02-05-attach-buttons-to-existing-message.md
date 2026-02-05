# Attach Buttons to Existing Message — Implementation Plan

## Overview

Add a new feature that allows users to attach inline keyboard buttons to messages that already exist in a channel or group. The user posts the message themselves (with any formatting, custom emoji, etc.), then uses the bot to create buttons and attach them via the message URL.

## Current State Analysis

- The bot has a message builder flow (`BuilderStep` union type) for creating full messages (text + image + buttons)
- The main menu (`startKeyboard()`) only has one option: "📝 Создать сообщение"
- Button creation workflow exists and can be reused (`edit_buttons`, `btn_text`, `btn_action`, `btn_value` steps)
- No support for attaching buttons to existing messages

### Key Discoveries:
- `src/keyboards/messageBuilder.ts:7-9` — `startKeyboard()` needs a second button
- `src/callbacks/messageBuilder.ts:48-75` — `buildInlineKeyboard()` in sender.ts builds the keyboard from `MessageButton[][]`
- `src/types/index.ts:39-50` — `BuilderStep` union type controls the flow

## Desired End State

Users can:
1. Click "🔘 Добавить кнопки к посту" from the main menu
2. Create buttons using the existing button grid UI
3. Provide a Telegram message URL (e.g., `https://t.me/channel_name/123`)
4. Bot attaches the buttons to that message via `editMessageReplyMarkup`

### Verification:
- Bot shows two options in main menu: "Создать сообщение" and "Добавить кнопки к посту"
- User can complete the attach buttons flow end-to-end
- Buttons appear on an existing channel/group message
- Error messages are clear and actionable (bot not admin, message not found, etc.)

## What We're NOT Doing

- Entity passthrough / text formatting preservation (separate feature)
- Editing or removing buttons from messages (only adding)
- Validating bot admin status proactively (just attempt and handle errors)
- Supporting message threads/comments (only top-level messages)

## Implementation Approach

Create a parallel flow alongside the existing message builder. The attach buttons flow reuses the button grid UI but skips text/image steps entirely. New session fields track the attach flow state separately.

---

## Phase 1: Types & Session Structure

### Overview
Add new types and session fields to support the attach buttons flow.

### Changes Required:

#### 1. Types Definition
**File**: `src/types/index.ts`
**Changes**: Add `AttachStep` type and `attachFlow` session field

```typescript
// Add after line 50 (after BuilderStep type)

/**
 * Steps in the "attach buttons to existing message" flow.
 * - attach_idle: not in attach flow
 * - attach_edit_buttons: creating/editing buttons
 * - attach_awaiting_url: waiting for message URL
 */
export type AttachStep =
  | "attach_idle"
  | "attach_edit_buttons"
  | "attach_awaiting_url";

/**
 * Data for the "attach buttons" flow.
 * Kept separate from main message builder to allow independent operation.
 */
export interface AttachFlowData {
  step: AttachStep;
  buttons: MessageButton[][];
  /** Currently editing button position */
  editingButton?: { row: number; col: number; isNew: boolean };
  /** Temp storage for button text */
  pendingButtonText?: string;
  /** Temp storage for button action type */
  pendingButtonAction?: "url" | "alert";
}
```

```typescript
// Modify SessionData interface (around line 52-75)
// Add after line 71 (after lastBotMessageIsPhoto):

  /** Data for "attach buttons to existing message" flow */
  attachFlow: AttachFlowData;
```

```typescript
// Modify createDefaultSession function (around line 79-88)
// Add attachFlow initialization:

export function createDefaultSession(): SessionData {
  return {
    step: "idle",
    message: {
      text: "",
      buttons: [],
    },
    attachFlow: {
      step: "attach_idle",
      buttons: [],
    },
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npx tsc --noEmit`
- [x] No lint errors: `npm run lint`

#### Manual Verification:
- [x] N/A for this phase (types only)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Message Link Parser Utility

### Overview
Create a utility function to parse Telegram message URLs and extract chat ID + message ID.

### Changes Required:

#### 1. New Utility File
**File**: `src/utils/messageLink.ts`
**Changes**: Create new file with URL parsing logic

```typescript
/**
 * Parsed result from a Telegram message link.
 */
export interface ParsedMessageLink {
  /** Chat ID: numeric for private channels, @username for public */
  chatId: number | string;
  /** Message ID within the chat */
  messageId: number;
}

/**
 * Parses a Telegram message URL and extracts chat ID and message ID.
 *
 * Supported formats:
 * - https://t.me/channel_username/12345 (public channel/group)
 * - https://t.me/c/1234567890/12345 (private channel, numeric ID)
 *
 * @param url - The message URL to parse
 * @returns Parsed link data, or null if URL format is invalid
 */
export function parseMessageLink(url: string): ParsedMessageLink | null {
  // Normalize: trim whitespace, handle both http and https
  const trimmed = url.trim();

  // Pattern 1: Public channel/group — https://t.me/username/123
  // Username rules: starts with letter/underscore, 5+ chars, alphanumeric + underscore
  const publicMatch = trimmed.match(
    /(?:https?:\/\/)?t\.me\/([a-zA-Z_][a-zA-Z0-9_]{4,})\/(\d+)/
  );
  if (publicMatch) {
    return {
      chatId: `@${publicMatch[1]}`,
      messageId: parseInt(publicMatch[2]!, 10),
    };
  }

  // Pattern 2: Private channel — https://t.me/c/1234567890/123
  // The URL contains the channel ID without the -100 prefix
  const privateMatch = trimmed.match(
    /(?:https?:\/\/)?t\.me\/c\/(\d+)\/(\d+)/
  );
  if (privateMatch) {
    // Private channel IDs in the API need -100 prefix
    // e.g., URL has 1234567890, API needs -1001234567890
    const rawId = privateMatch[1]!;
    const chatId = parseInt(`-100${rawId}`, 10);
    return {
      chatId,
      messageId: parseInt(privateMatch[2]!, 10),
    };
  }

  return null;
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npx tsc --noEmit`
- [x] No lint errors: `npm run lint`

#### Manual Verification:
- [x] N/A for this phase (utility only, tested via integration)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Keyboards for Attach Flow

### Overview
Add keyboard builders for the attach buttons flow.

### Changes Required:

#### 1. Start Keyboard Update
**File**: `src/keyboards/messageBuilder.ts`
**Changes**: Add second button to `startKeyboard()`

```typescript
// Modify startKeyboard function (lines 7-9)

/** Main menu keyboard shown on /start */
export function startKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Создать сообщение", "create_message")
    .row()
    .text("🔘 Добавить кнопки к посту", "attach_buttons_start");
}
```

#### 2. New Keyboards for Attach Flow
**File**: `src/keyboards/messageBuilder.ts`
**Changes**: Add new keyboard functions at end of file

```typescript
// ─── Attach Buttons Flow ───

/**
 * Button grid for attach flow (similar to main builder but different callbacks).
 * Uses "ab_" prefix for all callback data to distinguish from main flow.
 */
export function attachButtonGridKeyboard(buttons: MessageButton[][]): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (buttons.length === 0) {
    kb.text("➕ Добавить кнопку", "ab_+r:0");
    kb.row();
    kb.text("❌ Отмена", "ab_cancel");
    return kb;
  }

  for (let r = 0; r < buttons.length; r++) {
    const row = buttons[r]!;

    // Row of + buttons above
    kb.text("   ", "noop");
    for (let c = 0; c < row.length; c++) {
      kb.text("➕ ↑", `ab_+r:${r}`);
      if (c < row.length - 1) {
        kb.text("   ", "noop");
      }
    }
    kb.text("   ", "noop");
    kb.row();

    // The actual button row
    kb.text("➕ ←", `ab_+c:${r}:0`);
    for (let c = 0; c < row.length; c++) {
      const btn = row[c]!;
      const icon = btn.action === "url" ? "🔗" : "💬";
      kb.text(`${icon} ${truncate(btn.text, 12)}`, `ab_eb:${r}:${c}`);
      if (c < row.length - 1) {
        kb.text("➕", `ab_+c:${r}:${c + 1}`);
      }
    }
    kb.text("➕ →", `ab_+c:${r}:${row.length}`);
    kb.row();
  }

  // Bottom + row
  const lastRow = buttons[buttons.length - 1]!;
  kb.text("   ", "noop");
  for (let c = 0; c < lastRow.length; c++) {
    kb.text("➕ ↓", `ab_+r:${buttons.length}`);
    if (c < lastRow.length - 1) {
      kb.text("   ", "noop");
    }
  }
  kb.text("   ", "noop");
  kb.row();

  // Navigation
  kb.text("✅ Готово — ввести ссылку", "ab_buttons_done");
  kb.row();
  kb.text("❌ Отмена", "ab_cancel");

  return kb;
}

/** Button action choice for attach flow */
export function attachButtonActionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔗 Ссылка (URL)", "ab_btnact_url")
    .row()
    .text("💬 Всплывающее уведомление", "ab_btnact_alert")
    .row()
    .text("⬅️ Назад", "ab_back_to_buttons");
}

/** Edit existing button menu for attach flow */
export function attachEditButtonKeyboard(row: number, col: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Изменить", `ab_btn_edit:${row}:${col}`)
    .text("🗑 Удалить", `ab_btn_del:${row}:${col}`)
    .row()
    .text("⬅️ Назад", "ab_back_to_buttons");
}

/** Awaiting URL keyboard */
export function attachAwaitingUrlKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ Назад к кнопкам", "ab_back_to_buttons")
    .row()
    .text("❌ Отмена", "ab_cancel");
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npx tsc --noEmit`
- [x] No lint errors: `npm run lint`

#### Manual Verification:
- [x] N/A for this phase

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 4.

---

## Phase 4: Attach Buttons Callback Handlers

### Overview
Create callback handlers for the attach buttons flow.

### Changes Required:

#### 1. New Callbacks File
**File**: `src/callbacks/attachButtons.ts`
**Changes**: Create new file with all attach flow handlers

```typescript
import { Composer, InlineKeyboard } from "grammy";
import type { MyContext, SessionData, AttachFlowData } from "../types/index.js";
import { createDefaultSession } from "../types/index.js";
import {
  startKeyboard,
  attachButtonGridKeyboard,
  attachButtonActionKeyboard,
  attachEditButtonKeyboard,
  attachAwaitingUrlKeyboard,
} from "../keyboards/messageBuilder.js";
import { parseMessageLink } from "../utils/messageLink.js";
import { buildAttachInlineKeyboard } from "../services/sender.js";

export const attachButtonsCallbacks = new Composer<MyContext>();

// ═══════════════════════════════════════════════════════════════
//  Utility: Show step (reusable pattern)
// ═══════════════════════════════════════════════════════════════

async function showStep(
  ctx: MyContext,
  session: SessionData,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Delete previous bot message
  if (session.lastBotMessageId) {
    try {
      await ctx.api.deleteMessage(chatId, session.lastBotMessageId);
    } catch {
      // ignore
    }
    session.lastBotMessageId = undefined;
    session.lastBotMessageIsPhoto = undefined;
  }

  const sentMsg = await ctx.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  });
  session.lastBotMessageId = sentMsg.message_id;
  session.lastBotMessageIsPhoto = false;
}

/** Build preview text showing current buttons */
function buildButtonsPreview(buttons: AttachFlowData["buttons"]): string {
  if (buttons.length === 0) {
    return "<i>Кнопки пока не добавлены</i>";
  }

  const lines = ["<b>Кнопки:</b>"];
  for (const row of buttons) {
    const rowText = row
      .map((btn) => {
        const icon = btn.action === "url" ? "🔗" : "💬";
        return `[${icon} ${btn.text}]`;
      })
      .join(" ");
    lines.push(rowText);
  }
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
//  Start Flow: "Добавить кнопки к посту"
// ═══════════════════════════════════════════════════════════════

attachButtonsCallbacks.callbackQuery("attach_buttons_start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;

  // Reset attach flow
  session.attachFlow = {
    step: "attach_edit_buttons",
    buttons: [],
  };

  const text = [
    "🔘 <b>Добавление кнопок к посту</b>",
    "",
    "Создайте кнопки, которые будут добавлены к существующему сообщению в канале или группе.",
    "",
    buildButtonsPreview(session.attachFlow.buttons),
    "",
    "─────────────────",
    "",
    "🔘 Настройте кнопки:",
  ].join("\n");

  await showStep(ctx, session, text, attachButtonGridKeyboard(session.attachFlow.buttons));
});

// ═══════════════════════════════════════════════════════════════
//  Button Grid: Add / Edit / Delete (ab_ prefix)
// ═══════════════════════════════════════════════════════════════

// Add row: ab_+r:R
attachButtonsCallbacks.callbackQuery(/^ab_\+r:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!, 10);
  const af = session.attachFlow;

  // Insert empty row and start button creation
  af.buttons.splice(rowIdx, 0, []);
  af.editingButton = { row: rowIdx, col: 0, isNew: true };
  af.step = "attach_edit_buttons";
  af.pendingButtonText = undefined;
  af.pendingButtonAction = undefined;

  await showStep(
    ctx,
    session,
    "✏️ Напишите текст для кнопки:",
    new InlineKeyboard().text("⬅️ Назад", "ab_back_to_buttons"),
  );
});

// Add column: ab_+c:R:C
attachButtonsCallbacks.callbackQuery(/^ab_\+c:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!, 10);
  const colIdx = parseInt(ctx.match[2]!, 10);
  const af = session.attachFlow;

  af.editingButton = { row: rowIdx, col: colIdx, isNew: true };
  af.pendingButtonText = undefined;
  af.pendingButtonAction = undefined;

  await showStep(
    ctx,
    session,
    "✏️ Напишите текст для кнопки:",
    new InlineKeyboard().text("⬅️ Назад", "ab_back_to_buttons"),
  );
});

// Edit existing button: ab_eb:R:C
attachButtonsCallbacks.callbackQuery(/^ab_eb:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!, 10);
  const colIdx = parseInt(ctx.match[2]!, 10);
  const af = session.attachFlow;
  const btn = af.buttons[rowIdx]?.[colIdx];

  if (!btn) {
    await showStep(
      ctx,
      session,
      buildStepText(af),
      attachButtonGridKeyboard(af.buttons),
    );
    return;
  }

  const actionLabel = btn.action === "url" ? "🔗 Ссылка" : "💬 Уведомление";
  const info = [
    "✏️ <b>Редактирование кнопки:</b>",
    "",
    `<b>Текст:</b> ${btn.text}`,
    `<b>Действие:</b> ${actionLabel}`,
    `<b>Значение:</b> ${btn.value}`,
  ].join("\n");

  await showStep(ctx, session, info, attachEditButtonKeyboard(rowIdx, colIdx));
});

// Start editing existing button: ab_btn_edit:R:C
attachButtonsCallbacks.callbackQuery(/^ab_btn_edit:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!, 10);
  const colIdx = parseInt(ctx.match[2]!, 10);
  const af = session.attachFlow;

  af.editingButton = { row: rowIdx, col: colIdx, isNew: false };
  af.pendingButtonText = undefined;
  af.pendingButtonAction = undefined;

  await showStep(
    ctx,
    session,
    "✏️ Напишите текст для кнопки:",
    new InlineKeyboard().text("⬅️ Назад", "ab_back_to_buttons"),
  );
});

// Delete button: ab_btn_del:R:C
attachButtonsCallbacks.callbackQuery(/^ab_btn_del:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!, 10);
  const colIdx = parseInt(ctx.match[2]!, 10);
  const af = session.attachFlow;

  const row = af.buttons[rowIdx];
  if (row) {
    row.splice(colIdx, 1);
    if (row.length === 0) {
      af.buttons.splice(rowIdx, 1);
    }
  }

  await showStep(ctx, session, buildStepText(af), attachButtonGridKeyboard(af.buttons));
});

// Buttons done → awaiting URL
attachButtonsCallbacks.callbackQuery("ab_buttons_done", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const af = session.attachFlow;

  if (af.buttons.length === 0) {
    await ctx.answerCallbackQuery({ text: "Добавьте хотя бы одну кнопку", show_alert: true });
    return;
  }

  af.step = "attach_awaiting_url";

  const text = [
    "🔘 <b>Добавление кнопок к посту</b>",
    "",
    buildButtonsPreview(af.buttons),
    "",
    "─────────────────",
    "",
    "📎 <b>Отправьте ссылку на сообщение</b> в канале или группе.",
    "",
    "Как получить ссылку:",
    "1. Откройте сообщение в канале/группе",
    "2. Нажмите на сообщение → «Копировать ссылку»",
    "",
    "Пример: <code>https://t.me/channel_name/123</code>",
  ].join("\n");

  await showStep(ctx, session, text, attachAwaitingUrlKeyboard());
});

// ═══════════════════════════════════════════════════════════════
//  Button Action Selection (ab_ prefix)
// ═══════════════════════════════════════════════════════════════

attachButtonsCallbacks.callbackQuery("ab_btnact_url", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.attachFlow.pendingButtonAction = "url";

  await showStep(
    ctx,
    session,
    "🔗 Введите URL для кнопки (например, https://example.com):",
    new InlineKeyboard().text("⬅️ Назад", "ab_back_to_btn_action"),
  );
});

attachButtonsCallbacks.callbackQuery("ab_btnact_alert", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.attachFlow.pendingButtonAction = "alert";

  await showStep(
    ctx,
    session,
    "💬 Введите текст всплывающего уведомления:",
    new InlineKeyboard().text("⬅️ Назад", "ab_back_to_btn_action"),
  );
});

// ═══════════════════════════════════════════════════════════════
//  Navigation: Back Buttons
// ═══════════════════════════════════════════════════════════════

attachButtonsCallbacks.callbackQuery("ab_back_to_buttons", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const af = session.attachFlow;

  // Clean up if we were adding a new button to an empty row
  if (af.editingButton?.isNew) {
    const row = af.buttons[af.editingButton.row];
    if (row && row.length === 0) {
      af.buttons.splice(af.editingButton.row, 1);
    }
  }
  af.editingButton = undefined;
  af.pendingButtonText = undefined;
  af.pendingButtonAction = undefined;
  af.step = "attach_edit_buttons";

  await showStep(ctx, session, buildStepText(af), attachButtonGridKeyboard(af.buttons));
});

attachButtonsCallbacks.callbackQuery("ab_back_to_btn_action", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;

  await showStep(ctx, session, "⚡ Что делать при нажатии на кнопку?", attachButtonActionKeyboard());
});

// ═══════════════════════════════════════════════════════════════
//  Cancel
// ═══════════════════════════════════════════════════════════════

attachButtonsCallbacks.callbackQuery("ab_cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;

  // Reset attach flow
  session.attachFlow = {
    step: "attach_idle",
    buttons: [],
  };

  await showStep(ctx, session, "👋 Добавление кнопок отменено.", startKeyboard());
});

// ═══════════════════════════════════════════════════════════════
//  Helper: Build step text
// ═══════════════════════════════════════════════════════════════

function buildStepText(af: AttachFlowData): string {
  return [
    "🔘 <b>Добавление кнопок к посту</b>",
    "",
    buildButtonsPreview(af.buttons),
    "",
    "─────────────────",
    "",
    "🔘 Настройте кнопки:",
  ].join("\n");
}
```

#### 2. Register Callbacks
**File**: `src/callbacks/index.ts`
**Changes**: Import and use the new callbacks composer

```typescript
import { Composer } from "grammy";
import type { MyContext } from "../types/index.js";
import { messageBuilderCallbacks } from "./messageBuilder.js";
import { messageInputHandlers } from "./messageInput.js";
import { attachButtonsCallbacks } from "./attachButtons.js";

export const callbacksComposer = new Composer<MyContext>();

// Callback query handlers (inline keyboard button clicks)
callbacksComposer.use(messageBuilderCallbacks);
callbacksComposer.use(attachButtonsCallbacks);

// Text and photo message handlers (for step-based input)
callbacksComposer.use(messageInputHandlers);
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npx tsc --noEmit`
- [x] No lint errors: `npm run lint`

#### Manual Verification:
- [x] N/A for this phase (will test in Phase 6)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 5.

---

## Phase 5: Text Input Handlers for Attach Flow

### Overview
Handle text message inputs during the attach flow (button text, button value, message URL).

### Changes Required:

#### 1. Update Message Input Handlers
**File**: `src/callbacks/messageInput.ts`
**Changes**: Add handlers for attach flow text inputs

Add these imports at the top:

```typescript
import {
  attachButtonGridKeyboard,
  attachButtonActionKeyboard,
  attachAwaitingUrlKeyboard,
  startKeyboard,
} from "../keyboards/messageBuilder.js";
import { parseMessageLink } from "../utils/messageLink.js";
import { buildAttachInlineKeyboard } from "../services/sender.js";
```

Add new handler after the existing `message:text` handler (after line 149):

```typescript
// ═══════════════════════════════════════════════════════════════
//  Handle text messages for ATTACH BUTTONS flow
// ═══════════════════════════════════════════════════════════════

messageInputHandlers.on("message:text", async (ctx, next) => {
  const session = await ctx.session;
  const af = session.attachFlow;

  // Only handle if we're in attach flow and expecting input
  if (af.step === "attach_idle") {
    return next();
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  // Helper to show step
  const show = async (text: string, keyboard: InlineKeyboard) => {
    // Delete previous bot message
    if (session.lastBotMessageId) {
      try {
        await ctx.api.deleteMessage(chatId, session.lastBotMessageId);
      } catch {
        // ignore
      }
      session.lastBotMessageId = undefined;
    }
    // Delete user's message
    if (ctx.message?.message_id) {
      try {
        await ctx.api.deleteMessage(chatId, ctx.message.message_id);
      } catch {
        // ignore
      }
    }
    const sentMsg = await ctx.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
    session.lastBotMessageId = sentMsg.message_id;
  };

  // Build preview text
  const buildPreview = () => {
    if (af.buttons.length === 0) return "<i>Кнопки пока не добавлены</i>";
    const lines = ["<b>Кнопки:</b>"];
    for (const row of af.buttons) {
      const rowText = row
        .map((btn) => `[${btn.action === "url" ? "🔗" : "💬"} ${btn.text}]`)
        .join(" ");
      lines.push(rowText);
    }
    return lines.join("\n");
  };

  const buildStepText = () => [
    "🔘 <b>Добавление кнопок к посту</b>",
    "",
    buildPreview(),
    "",
    "─────────────────",
    "",
    "🔘 Настройте кнопки:",
  ].join("\n");

  // Handle button text input (when editingButton is set but no pendingButtonText yet)
  if (af.editingButton && !af.pendingButtonText && !af.pendingButtonAction) {
    af.pendingButtonText = ctx.message.text;
    await show("⚡ Что делать при нажатии на кнопку?", attachButtonActionKeyboard());
    return;
  }

  // Handle button value input (when pendingButtonAction is set)
  if (af.editingButton && af.pendingButtonText && af.pendingButtonAction) {
    const value = ctx.message.text;
    const editing = af.editingButton;
    const btnText = af.pendingButtonText;
    const action = af.pendingButtonAction;

    const newButton = { text: btnText, action, value };

    if (editing.isNew) {
      if (!af.buttons[editing.row]) {
        af.buttons[editing.row] = [];
      }
      af.buttons[editing.row]!.splice(editing.col, 0, newButton);
    } else {
      if (af.buttons[editing.row]) {
        af.buttons[editing.row]![editing.col] = newButton;
      }
    }

    // Clean up
    af.editingButton = undefined;
    af.pendingButtonText = undefined;
    af.pendingButtonAction = undefined;

    await show(buildStepText(), attachButtonGridKeyboard(af.buttons));
    return;
  }

  // Handle message URL input
  if (af.step === "attach_awaiting_url") {
    const url = ctx.message.text;
    const parsed = parseMessageLink(url);

    if (!parsed) {
      await show(
        [
          "❌ <b>Неверный формат ссылки</b>",
          "",
          "Отправьте ссылку вида:",
          "• <code>https://t.me/channel_name/123</code>",
          "• <code>https://t.me/c/1234567890/123</code>",
        ].join("\n"),
        attachAwaitingUrlKeyboard(),
      );
      return;
    }

    // Try to attach buttons
    try {
      const keyboard = await buildAttachInlineKeyboard(af.buttons);
      await ctx.api.editMessageReplyMarkup(parsed.chatId, parsed.messageId, {
        reply_markup: keyboard,
      });

      // Success! Reset flow
      session.attachFlow = { step: "attach_idle", buttons: [] };
      await show("✅ Кнопки успешно добавлены к сообщению!", startKeyboard());
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      let userMessage: string;

      if (errMsg.includes("not enough rights") || errMsg.includes("CHAT_ADMIN_REQUIRED")) {
        userMessage = "❌ Бот не является администратором в этом канале/группе.\n\nДобавьте бота как администратора с правом редактирования сообщений.";
      } else if (errMsg.includes("message to edit not found") || errMsg.includes("MESSAGE_ID_INVALID")) {
        userMessage = "❌ Сообщение не найдено.\n\nВозможно, оно было удалено или ссылка неверна.";
      } else if (errMsg.includes("message can't be edited")) {
        userMessage = "❌ Это сообщение нельзя редактировать.\n\nБот может добавлять кнопки только к сообщениям в каналах/группах, где он администратор.";
      } else if (errMsg.includes("chat not found") || errMsg.includes("CHAT_NOT_FOUND")) {
        userMessage = "❌ Канал или группа не найдены.\n\nПроверьте ссылку и убедитесь, что бот добавлен в этот чат.";
      } else {
        userMessage = `❌ Не удалось добавить кнопки.\n\n<code>${escapeHtml(errMsg)}</code>`;
      }

      await show(userMessage, attachAwaitingUrlKeyboard());
    }
    return;
  }

  return next();
});

// Helper for escaping HTML
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npx tsc --noEmit`
- [x] No lint errors: `npm run lint`

#### Manual Verification:
- [x] N/A for this phase

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 6.

---

## Phase 6: Sender Service Update

### Overview
Export a function to build inline keyboards for the attach flow (similar to the existing `buildInlineKeyboard` but exported).

### Changes Required:

#### 1. Export Keyboard Builder
**File**: `src/services/sender.ts`
**Changes**: Export `buildAttachInlineKeyboard` function

Add at the end of the file:

```typescript
/**
 * Builds an InlineKeyboard for attaching to existing messages.
 * Exported for use by the attach buttons flow.
 * Alert texts that exceed callback_data limit are stored in Redis.
 */
export async function buildAttachInlineKeyboard(
  buttons: ComposedMessage["buttons"],
): Promise<InlineKeyboard> {
  return buildInlineKeyboard(buttons);
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npx tsc --noEmit`
- [x] No lint errors: `npm run lint`

#### Manual Verification:
- [ ] Bot shows two options in main menu
- [ ] "Добавить кнопки к посту" starts the attach flow
- [ ] User can add buttons using the grid UI
- [ ] User can enter a message URL
- [ ] Buttons are successfully attached to an existing message
- [ ] Error messages are shown for invalid URLs, missing permissions, etc.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the feature works end-to-end.

---

## Testing Strategy

### Manual Testing Steps:

1. **Start the bot** — Send `/start` and verify two buttons appear:
   - "📝 Создать сообщение"
   - "🔘 Добавить кнопки к посту"

2. **Create buttons**:
   - Click "🔘 Добавить кнопки к посту"
   - Add a URL button (e.g., "Google" → "https://google.com")
   - Add an alert button (e.g., "Click me" → "Hello!")
   - Verify button preview shows correctly

3. **Attach to message**:
   - Post a message to a channel where the bot is admin
   - Copy the message URL
   - Click "✅ Готово — ввести ссылку"
   - Paste the URL
   - Verify buttons appear on the original message

4. **Error handling**:
   - Test with invalid URL format → should show format error
   - Test with URL to chat where bot is not admin → should show permissions error
   - Test with URL to deleted message → should show not found error

### Edge Cases:

- Very long alert text (exceeds 64-byte callback limit) — should use Redis storage
- Multiple rows of buttons
- Cancel at any step
- Back navigation at every step

---

## References

- Research document: `thoughts/shared/research/2026-02-05-text-formatting-and-custom-emoji.md`
- Telegram Bot API — editMessageReplyMarkup: https://core.telegram.org/bots/api#editmessagereplymarkup
- Existing button grid implementation: `src/keyboards/messageBuilder.ts:47-107`
- Existing callback handlers: `src/callbacks/messageBuilder.ts`
