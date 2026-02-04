import { Composer, InlineKeyboard } from "grammy";
import type { MyContext, SessionData, BuilderStep } from "../types/index.js";
import { buildPreviewText, getStepInstruction } from "../services/preview.js";
import {
  addImageKeyboard,
  imageAttachedKeyboard,
  buttonGridKeyboard,
  buttonActionKeyboard,
  reviewKeyboard,
} from "../keyboards/messageBuilder.js";

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

  // If no position set yet, ask for position
  if (!session.message.imagePosition) {
    session.step = "image_position";
    await showStep(
      ctx,
      session,
      stepText(session, "image_position"),
      (await import("../keyboards/messageBuilder.js")).imagePositionKeyboard(),
      { showPhoto: true },
    );
  } else {
    // Position already chosen (replacing image), go to buttons
    session.step = "edit_buttons";
    await showStep(ctx, session, stepText(session, "edit_buttons"), buttonGridKeyboard(session.message.buttons));
  }
});
