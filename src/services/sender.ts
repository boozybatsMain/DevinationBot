import { InlineKeyboard, type Api } from "grammy";
import type { ComposedMessage } from "../types/index.js";

/**
 * Sends the composed message to a target group chat.
 * Handles text-only, photo-above-text, and photo-below-text layouts.
 * Returns true on success.
 */
export async function sendComposedMessage(
  api: Api,
  chatId: number,
  msg: ComposedMessage,
): Promise<boolean> {
  const keyboard = buildInlineKeyboard(msg.buttons);

  if (!msg.imageFileId) {
    // Text-only message
    await api.sendMessage(chatId, msg.text, {
      parse_mode: "HTML",
      reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined,
    });
    return true;
  }

  if (msg.imagePosition === "below") {
    // Text first, then photo below
    await api.sendMessage(chatId, msg.text, {
      parse_mode: "HTML",
      reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined,
    });
    await api.sendPhoto(chatId, msg.imageFileId);
    return true;
  }

  // Default: photo above text (photo with caption)
  await api.sendPhoto(chatId, msg.imageFileId, {
    caption: msg.text,
    parse_mode: "HTML",
    reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined,
  });
  return true;
}

/**
 * Builds a Telegram InlineKeyboard from the 2D buttons array.
 */
function buildInlineKeyboard(
  buttons: ComposedMessage["buttons"],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const row of buttons) {
    for (const btn of row) {
      if (btn.action === "url") {
        keyboard.url(btn.text, btn.value);
      } else {
        keyboard.text(btn.text, `alert:${btn.value}`);
      }
    }
    keyboard.row();
  }
  return keyboard;
}
