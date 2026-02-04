import type { CommandContext } from "grammy";
import type { MyContext } from "../types/index.js";
import { createDefaultSession } from "../types/index.js";
import { startKeyboard } from "../keyboards/messageBuilder.js";

/**
 * Handles the /start command. Resets session and shows main menu with
 * "Создать сообщение" button. Only works in private chats.
 */
export async function handleStart(ctx: CommandContext<MyContext>): Promise<void> {
  // Ignore /start in groups — bot should only interact in private DMs
  if (ctx.chat.type !== "private") return;

  const session = await ctx.session;
  Object.assign(session, createDefaultSession());

  await ctx.reply(
    "👋 Добро пожаловать в <b>DevinationBot</b>!\n\n" +
    "Я помогу вам создать красивое сообщение с кнопками и отправить его в вашу группу.",
    {
      parse_mode: "HTML",
      reply_markup: startKeyboard(),
    },
  );
}
