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
