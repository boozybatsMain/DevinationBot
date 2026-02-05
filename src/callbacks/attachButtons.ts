import { Composer, InlineKeyboard } from "grammy";
import type { MyContext, SessionData, AttachFlowData } from "../types/index.js";
import {
  startKeyboard,
  attachButtonGridKeyboard,
  attachButtonActionKeyboard,
  attachEditButtonKeyboard,
  attachAwaitingUrlKeyboard,
} from "../keyboards/messageBuilder.js";

export const attachButtonsCallbacks = new Composer<MyContext>();

// ═══════════════════════════════════════════════════════════════
//  Utility: Ensure attachFlow exists (for sessions created before this feature)
// ═══════════════════════════════════════════════════════════════

function ensureAttachFlow(session: SessionData): SessionData["attachFlow"] {
  if (!session.attachFlow) {
    session.attachFlow = { step: "attach_idle", buttons: [] };
  }
  return session.attachFlow;
}

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
  const af = ensureAttachFlow(session);

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
  const af = ensureAttachFlow(session);

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
  const af = ensureAttachFlow(session);
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
  const af = ensureAttachFlow(session);

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
  const af = ensureAttachFlow(session);

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
  const session = await ctx.session;
  const af = ensureAttachFlow(session);

  if (af.buttons.length === 0) {
    await ctx.answerCallbackQuery({ text: "Добавьте хотя бы одну кнопку", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
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
  const af = ensureAttachFlow(session);

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
