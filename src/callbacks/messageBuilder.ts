import { Composer, InlineKeyboard } from "grammy";
import type { MyContext, SessionData, BuilderStep } from "../types/index.js";
import { createDefaultSession } from "../types/index.js";
import { buildPreviewText, getStepInstruction } from "../services/preview.js";
import { getGroupsForUser, getVerifiedGroupsForUser } from "../services/groups.js";
import { sendComposedMessage } from "../services/sender.js";
import {
  startKeyboard,
  addImageKeyboard,
  imageAttachedKeyboard,
  imagePositionKeyboard,
  buttonGridKeyboard,
  buttonActionKeyboard,
  editButtonKeyboard,
  reviewKeyboard,
  groupSelectionKeyboard,
  confirmSendKeyboard,
} from "../keyboards/messageBuilder.js";
import { requireEnv } from "../utils/env.js";

export const messageBuilderCallbacks = new Composer<MyContext>();

/** Escape HTML special chars for Telegram HTML parse mode */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ═══════════════════════════════════════════════════════════════
//  Utility: send/edit bot message
// ═══════════════════════════════════════════════════════════════

/**
 * Sends or edits the bot message. Handles switching between text and photo.
 * Tracks lastBotMessageId in session for future edits.
 */
async function showStep(
  ctx: MyContext,
  session: SessionData,
  text: string,
  keyboard: ReturnType<typeof startKeyboard>,
  options?: { showPhoto?: boolean },
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const showPhoto = options?.showPhoto && session.message.imageFileId;

  // Try to delete previous message if switching type or if it exists
  if (session.lastBotMessageId) {
    try {
      await ctx.api.deleteMessage(chatId, session.lastBotMessageId);
    } catch {
      // Message might already be deleted, ignore
    }
    session.lastBotMessageId = undefined;
    session.lastBotMessageIsPhoto = undefined;
  }

  let sentMsg;
  if (showPhoto && session.message.imageFileId) {
    sentMsg = await ctx.api.sendPhoto(chatId, session.message.imageFileId, {
      caption: text,
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    session.lastBotMessageIsPhoto = true;
  } else {
    sentMsg = await ctx.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
    session.lastBotMessageIsPhoto = false;
  }
  session.lastBotMessageId = sentMsg.message_id;
}

/**
 * Builds the combined preview + instruction text for a step.
 */
function stepText(session: SessionData, step: BuilderStep): string {
  const parts: string[] = [];
  // Show preview if message has any content
  if (session.message.text || session.message.imageFileId || session.message.buttons.length > 0) {
    parts.push(buildPreviewText(session.message));
    parts.push("");
    parts.push("─────────────────");
    parts.push("");
  }
  parts.push(getStepInstruction(step));
  return parts.join("\n");
}

// ═══════════════════════════════════════════════════════════════
//  Step 0: Create Message (from /start)
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("create_message", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;

  // Reset to fresh message
  Object.assign(session, createDefaultSession());
  session.step = "write_text";

  await showStep(
    ctx,
    session,
    getStepInstruction("write_text"),
    new InlineKeyboard().text("❌ Отмена", "cancel"),
  );
});

// ═══════════════════════════════════════════════════════════════
//  Step 1 → 2: Text written → Add Image?
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("img_yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "send_image";


  await showStep(ctx, session, stepText(session, "send_image"), new InlineKeyboard().text("⬅️ Назад", "back_to_image"));
});

messageBuilderCallbacks.callbackQuery("img_no", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  // Skip image, go to buttons
  session.message.imageFileId = undefined;
  session.message.imagePosition = undefined;
  session.step = "edit_buttons";

  await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
});

messageBuilderCallbacks.callbackQuery("img_replace", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "send_image";


  await showStep(ctx, session, stepText(session, "send_image"), new InlineKeyboard().text("⬅️ Назад", "back_to_image"));
});

messageBuilderCallbacks.callbackQuery("img_remove", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.message.imageFileId = undefined;
  session.message.imagePosition = undefined;
  session.step = "add_image";

  await showStep(ctx, session, stepText(session, "add_image"), addImageKeyboard());
});

messageBuilderCallbacks.callbackQuery("img_done", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  // Image is set, go to position selection
  session.step = "image_position";

  await showStep(ctx, session, stepText(session, "image_position"), imagePositionKeyboard());
});

// ═══════════════════════════════════════════════════════════════
//  Step 3: Image Position
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("imgpos_above", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.message.imagePosition = "above";
  session.step = "edit_buttons";

  await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
});

messageBuilderCallbacks.callbackQuery("imgpos_below", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.message.imagePosition = "below";
  session.step = "edit_buttons";

  await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
});

// ═══════════════════════════════════════════════════════════════
//  Step 4: Button Grid — Add / Edit / Delete
// ═══════════════════════════════════════════════════════════════

// Add row: +r:R
messageBuilderCallbacks.callbackQuery(/^\+r:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!);

  // Insert empty row and start button creation
  session.message.buttons.splice(rowIdx, 0, []);
  session.editingButton = { row: rowIdx, col: 0, isNew: true };
  session.step = "btn_text";


  await showStep(ctx, session, stepText(session, "btn_text"), new InlineKeyboard().text("⬅️ Назад", "back_to_buttons"));
});

// Add column: +c:R:C
messageBuilderCallbacks.callbackQuery(/^\+c:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!);
  const colIdx = parseInt(ctx.match[2]!);

  session.editingButton = { row: rowIdx, col: colIdx, isNew: true };
  session.step = "btn_text";


  await showStep(ctx, session, stepText(session, "btn_text"), new InlineKeyboard().text("⬅️ Назад", "back_to_buttons"));
});

// Edit existing button: eb:R:C
messageBuilderCallbacks.callbackQuery(/^eb:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!);
  const colIdx = parseInt(ctx.match[2]!);
  const btn = session.message.buttons[rowIdx]?.[colIdx];

  if (!btn) {
    await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
    return;
  }

  const actionLabel = btn.action === "url" ? "🔗 Ссылка" : "💬 Уведомление";
  const info = [
    `✏️ <b>Редактирование кнопки:</b>`,
    ``,
    `<b>Текст:</b> ${btn.text}`,
    `<b>Действие:</b> ${actionLabel}`,
    `<b>Значение:</b> ${btn.value}`,
  ].join("\n");

  await showStep(ctx, session, info, editButtonKeyboard(rowIdx, colIdx));
});

// Start editing existing button
messageBuilderCallbacks.callbackQuery(/^btn_edit:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!);
  const colIdx = parseInt(ctx.match[2]!);

  session.editingButton = { row: rowIdx, col: colIdx, isNew: false };
  session.step = "btn_text";


  await showStep(ctx, session, stepText(session, "btn_text"), new InlineKeyboard().text("⬅️ Назад", "back_to_buttons"));
});

// Delete button
messageBuilderCallbacks.callbackQuery(/^btn_del:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const rowIdx = parseInt(ctx.match[1]!);
  const colIdx = parseInt(ctx.match[2]!);

  const row = session.message.buttons[rowIdx];
  if (row) {
    row.splice(colIdx, 1);
    // Remove empty rows
    if (row.length === 0) {
      session.message.buttons.splice(rowIdx, 1);
    }
  }

  session.step = "edit_buttons";
  await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
});

// Noop for empty placeholder buttons
messageBuilderCallbacks.callbackQuery("noop", async (ctx) => {
  await ctx.answerCallbackQuery();
});

// Skip buttons
messageBuilderCallbacks.callbackQuery("skip_buttons", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "review";

  await showStep(ctx, session, stepText(session, "review"), reviewKeyboard());
});

// Buttons done
messageBuilderCallbacks.callbackQuery("buttons_done", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "review";

  await showStep(ctx, session, stepText(session, "review"), reviewKeyboard());
});

// ═══════════════════════════════════════════════════════════════
//  Step 5-7: Button Action & Value
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("btnact_url", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "btn_value";
  session.pendingButtonAction = "url";


  await showStep(
    ctx,
    session,
    "🔗 Введите URL для кнопки (например, https://example.com):",
    new InlineKeyboard().text("⬅️ Назад", "back_to_btn_action"),
  );
});

messageBuilderCallbacks.callbackQuery("btnact_alert", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "btn_value";
  session.pendingButtonAction = "alert";


  await showStep(
    ctx,
    session,
    "💬 Введите текст всплывающего уведомления:",
    new InlineKeyboard().text("⬅️ Назад", "back_to_btn_action"),
  );
});

// ═══════════════════════════════════════════════════════════════
//  Step 8: Review
// ═══════════════════════════════════════════════════════════════

// Edit text from review
messageBuilderCallbacks.callbackQuery("edit_text", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "write_text";


  await showStep(ctx, session, stepText(session, "write_text"), new InlineKeyboard().text("⬅️ Назад", "back_to_review_direct"));
});

// Edit image from review
messageBuilderCallbacks.callbackQuery("edit_image", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "add_image";

  if (session.message.imageFileId) {
    await showStep(ctx, session, stepText(session, "add_image"), imageAttachedKeyboard(), { showPhoto: true });
  } else {
    await showStep(ctx, session, stepText(session, "add_image"), addImageKeyboard());
  }
});

// Edit buttons from review
messageBuilderCallbacks.callbackQuery("edit_buttons_review", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "edit_buttons";

  await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
});

// ═══════════════════════════════════════════════════════════════
//  Step 9: Group Selection
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("goto_select_group", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "select_group";

  const userId = ctx.from?.id;
  if (!userId) return;

  const botId = Number(requireEnv("BOT_ID"));
  const groups = await getVerifiedGroupsForUser(userId, ctx.api, botId);
  const botUsername = requireEnv("BOT_USERNAME");

  if (groups.length === 0) {
    await showStep(
      ctx,
      session,
      "📢 У вас пока нет групп или каналов, куда добавлен бот.\n\nДобавьте бота в группу или канал как администратора, затем нажмите «Обновить список».",
      groupSelectionKeyboard([], botUsername),
    );
  } else {
    await showStep(ctx, session, stepText(session, "select_group"), groupSelectionKeyboard(groups, botUsername));
  }
});

// Refresh groups list
messageBuilderCallbacks.callbackQuery("refresh_groups", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Список обновлён" });
  const session = await ctx.session;

  const userId = ctx.from?.id;
  if (!userId) return;

  const botId = Number(requireEnv("BOT_ID"));
  const groups = await getVerifiedGroupsForUser(userId, ctx.api, botId);
  const botUsername = requireEnv("BOT_USERNAME");

  await showStep(
    ctx,
    session,
    groups.length === 0
      ? "📢 У вас пока нет групп или каналов. Добавьте бота и нажмите «Обновить»."
      : stepText(session, "select_group"),
    groupSelectionKeyboard(groups, botUsername),
  );
});

// Select a group: grp:CHATID
messageBuilderCallbacks.callbackQuery(/^grp:(-?\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  const chatId = parseInt(ctx.match[1]!);

  session.targetGroupId = chatId;
  session.step = "confirm_send";

  // Get group title
  const userId = ctx.from?.id;
  if (!userId) return;

  const groups = await getGroupsForUser(userId);
  const group = groups.find((g) => g.chatId === chatId);
  const title = group?.title ?? `Чат ${chatId}`;

  await showStep(ctx, session, stepText(session, "confirm_send"), confirmSendKeyboard(title));
});

// ═══════════════════════════════════════════════════════════════
//  Step 10: Confirm & Send
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("confirm_send", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;

  if (!session.targetGroupId) {
    await showStep(ctx, session, "❌ Группа или канал не выбраны.", reviewKeyboard());
    return;
  }

  if (!session.message.text && !session.message.imageFileId) {
    await showStep(
      ctx,
      session,
      "❌ Сообщение пустое. Добавьте текст или изображение перед отправкой.",
      reviewKeyboard(),
    );
    return;
  }

  try {
    await sendComposedMessage(ctx.api, session.targetGroupId, session.message);

    // Reset session
    Object.assign(session, createDefaultSession());

    await showStep(ctx, session, "✅ Сообщение успешно отправлено!", startKeyboard());
  } catch (error) {
    console.error("Failed to send message:", error);

    // Show the actual Telegram error to help debugging
    const errMsg = error instanceof Error ? error.message : String(error);
    await showStep(
      ctx,
      session,
      `❌ Не удалось отправить сообщение.\n\n<code>${escapeHtml(errMsg)}</code>`,
      reviewKeyboard(),
    );
  }
});

// ═══════════════════════════════════════════════════════════════
//  Navigation: Back Buttons
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("back_to_text", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "write_text";


  await showStep(ctx, session, stepText(session, "write_text"), new InlineKeyboard().text("❌ Отмена", "cancel"));
});

messageBuilderCallbacks.callbackQuery("back_to_image", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "add_image";

  if (session.message.imageFileId) {
    await showStep(ctx, session, stepText(session, "add_image"), imageAttachedKeyboard(), { showPhoto: true });
  } else {
    await showStep(ctx, session, stepText(session, "add_image"), addImageKeyboard());
  }
});

messageBuilderCallbacks.callbackQuery("back_to_image_or_pos", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;

  if (session.message.imageFileId) {
    // Has image — go back to position choice
    session.step = "image_position";
    await showStep(ctx, session, stepText(session, "image_position"), imagePositionKeyboard());
  } else {
    // No image — go back to add image
    session.step = "add_image";
    await showStep(ctx, session, stepText(session, "add_image"), addImageKeyboard());
  }
});

messageBuilderCallbacks.callbackQuery("back_to_buttons", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;

  // If we were adding a new button to an empty row, clean up
  if (session.editingButton?.isNew) {
    const row = session.message.buttons[session.editingButton.row];
    if (row && row.length === 0) {
      session.message.buttons.splice(session.editingButton.row, 1);
    }
  }
  session.editingButton = undefined;
  session.pendingButtonText = undefined;
  session.pendingButtonAction = undefined;

  session.step = "edit_buttons";
  await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
});

messageBuilderCallbacks.callbackQuery("back_to_btn_action", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "btn_action";

  await showStep(ctx, session, stepText(session, "btn_action"), buttonActionKeyboard());
});

messageBuilderCallbacks.callbackQuery("back_to_review", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "review";

  await showStep(ctx, session, stepText(session, "review"), reviewKeyboard());
});

// Back to review directly (from editing in review mode)
messageBuilderCallbacks.callbackQuery("back_to_review_direct", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "review";

  await showStep(ctx, session, stepText(session, "review"), reviewKeyboard());
});

messageBuilderCallbacks.callbackQuery("back_to_groups", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  session.step = "select_group";

  const userId = ctx.from?.id;
  if (!userId) return;

  const groups = await getGroupsForUser(userId);
  const botUsername = requireEnv("BOT_USERNAME");

  await showStep(ctx, session, stepText(session, "select_group"), groupSelectionKeyboard(groups, botUsername));
});

// ═══════════════════════════════════════════════════════════════
//  Cancel
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery("cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = await ctx.session;
  Object.assign(session, createDefaultSession());

  await showStep(ctx, session, "👋 Создание сообщения отменено.", startKeyboard());
});

// ═══════════════════════════════════════════════════════════════
//  Alert callback for sent messages (when users click alert buttons)
// ═══════════════════════════════════════════════════════════════

messageBuilderCallbacks.callbackQuery(/^alert:(.+)$/, async (ctx) => {
  const alertText = ctx.match[1]!;
  await ctx.answerCallbackQuery({ text: alertText, show_alert: true });
});

// Short-key alert: text stored in Redis (for alerts exceeding 64-byte callback limit)
messageBuilderCallbacks.callbackQuery(/^alrt:(.+)$/, async (ctx) => {
  const shortId = ctx.match[1]!;
  const { redis } = await import("../storage/redis.js");
  const text = await redis.get<string>(`alert:${shortId}`);
  await ctx.answerCallbackQuery({
    text: text ?? "⚠️ Уведомление устарело",
    show_alert: true,
  });
});
