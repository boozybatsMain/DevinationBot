import { Composer, InlineKeyboard } from "grammy";
import type { MyContext, SessionData, BuilderStep } from "../types/index.js";
import { buildPreviewText, getStepInstruction } from "../services/preview.js";
import {
  addImageKeyboard,
  imageAttachedKeyboard,
  buttonGridKeyboard,
  buttonActionKeyboard,
  attachButtonGridKeyboard,
  attachButtonActionKeyboard,
  attachAwaitingUrlKeyboard,
  startKeyboard,
} from "../keyboards/messageBuilder.js";
import { parseMessageLink } from "../utils/messageLink.js";
import { buildAttachInlineKeyboard } from "../services/sender.js";

export const messageInputHandlers = new Composer<MyContext>();

// ═══════════════════════════════════════════════════════════════
//  Utility: show step (same as in callbacks but for message ctx)
// ═══════════════════════════════════════════════════════════════

async function showStep(
  ctx: MyContext,
  session: SessionData,
  text: string,
  keyboard: InlineKeyboard,
  options?: { showPhoto?: boolean },
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const showPhoto = options?.showPhoto && session.message.imageFileId;

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

  // Delete the user's input message for cleaner UI
  if (ctx.message?.message_id) {
    try {
      await ctx.api.deleteMessage(chatId, ctx.message.message_id);
    } catch {
      // Bot may not have delete permission in DMs — that's fine
    }
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

function stepText(session: SessionData, step: BuilderStep): string {
  const parts: string[] = [];
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
//  Handle text messages based on current step
// ═══════════════════════════════════════════════════════════════

messageInputHandlers.on("message:text", async (ctx, next) => {
  const session = await ctx.session;

  switch (session.step) {
    case "write_text": {
      session.message.text = ctx.message.text;
      session.step = "add_image";

      if (session.message.imageFileId) {
        await showStep(ctx, session, stepText(session, "add_image"), imageAttachedKeyboard(), { showPhoto: true });
      } else {
        await showStep(ctx, session, stepText(session, "add_image"), addImageKeyboard());
      }
      return;
    }

    case "btn_text": {
      session.pendingButtonText = ctx.message.text;
      session.step = "btn_action";

      await showStep(ctx, session, stepText(session, "btn_action"), buttonActionKeyboard());
      return;
    }

    case "btn_value": {
      const value = ctx.message.text;
      const editing = session.editingButton;
      const btnText = session.pendingButtonText ?? "Кнопка";

      if (!editing) {
        // Shouldn't happen, go back to buttons
        session.step = "edit_buttons";
        await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
        return;
      }

      const action = session.pendingButtonAction ?? "alert";
      const newButton = { text: btnText, action, value };

      if (editing.isNew) {
        // Ensure row exists
        if (!session.message.buttons[editing.row]) {
          session.message.buttons[editing.row] = [];
        }
        session.message.buttons[editing.row]!.splice(editing.col, 0, newButton);
      } else {
        // Update existing
        if (session.message.buttons[editing.row]) {
          session.message.buttons[editing.row]![editing.col] = newButton;
        }
      }

      // Clean up and return to grid
      session.editingButton = undefined;
      session.pendingButtonText = undefined;
      session.pendingButtonAction = undefined;
      session.step = "edit_buttons";

      await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
      return;
    }

    default:
      // Not in an input step — pass to next handler
      return next();
  }
});

// ═══════════════════════════════════════════════════════════════
//  Handle photo messages (for image upload step)
// ═══════════════════════════════════════════════════════════════

messageInputHandlers.on("message:photo", async (ctx, next) => {
  const session = await ctx.session;

  if (session.step !== "send_image") {
    return next();
  }

  // Get the highest resolution photo
  const photos = ctx.message.photo;
  const bestPhoto = photos[photos.length - 1];
  if (!bestPhoto) return;

  session.message.imageFileId = bestPhoto.file_id;

  // Image received, show it attached and let user proceed
  session.step = "add_image";
  await showStep(ctx, session, stepText(session, "add_image"), imageAttachedKeyboard(), { showPhoto: true });
});

// ═══════════════════════════════════════════════════════════════
//  Handle text messages for ATTACH BUTTONS flow
// ═══════════════════════════════════════════════════════════════

messageInputHandlers.on("message:text", async (ctx, next) => {
  const session = await ctx.session;

  // Initialize attachFlow if missing (for sessions created before this feature)
  if (!session.attachFlow) {
    session.attachFlow = { step: "attach_idle", buttons: [] };
  }

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
        userMessage = "❌ Бот не является администратором в этом канале/группе.\n\nДобавьте бота как администратора с правом <b>редактирования сообщений</b>.";
      } else if (errMsg.includes("message to edit not found") || errMsg.includes("MESSAGE_ID_INVALID")) {
        userMessage = "❌ Сообщение не найдено.\n\nВозможно, оно было удалено или ссылка неверна.";
      } else if (errMsg.includes("message can't be edited")) {
        userMessage = "❌ Бот не может редактировать это сообщение.\n\nУбедитесь, что у бота есть право <b>«Изменение чужих сообщений»</b> (Edit messages) в настройках администратора канала/группы.";
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
