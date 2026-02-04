import type { Context, SessionFlavor, LazySessionFlavor } from "grammy";

/** A single inline button in the message builder grid */
export interface MessageButton {
  text: string;
  action: "url" | "alert";
  /** URL for "url" action, alert text for "alert" action */
  value: string;
}

/** The composed message ready to be sent */
export interface ComposedMessage {
  text: string;
  imageFileId?: string;
  /** 2D array: rows of buttons */
  buttons: MessageButton[][];
}

/** Info about a group or channel the bot has been added to */
export interface GroupInfo {
  chatId: number;
  title: string;
}

/**
 * Steps in the message builder flow.
 * - idle: no active flow
 * - write_text: user is writing message text
 * - add_image: asking if user wants to add an image
 * - send_image: waiting for user to send an image
 * - edit_buttons: showing button grid with add/edit controls
 * - btn_text: writing text for a button
 * - btn_action: choosing button action type (url/alert)
 * - btn_value: writing url or alert text for a button
 * - review: final preview before sending
 * - select_group: choosing target group
 * - confirm_send: confirming send to selected group
 */
export type BuilderStep =
  | "idle"
  | "write_text"
  | "add_image"
  | "send_image"
  | "edit_buttons"
  | "btn_text"
  | "btn_action"
  | "btn_value"
  | "review"
  | "select_group"
  | "confirm_send";

export interface SessionData {
  step: BuilderStep;

  /** The message being composed */
  message: ComposedMessage;

  /** Currently editing button position [row, col], or new button insert position */
  editingButton?: { row: number; col: number; isNew: boolean };

  /** Temp storage for button text while choosing action */
  pendingButtonText?: string;

  /** Temp storage for button action type while entering value */
  pendingButtonAction?: "url" | "alert";

  /** Selected target group chat ID */
  targetGroupId?: number;

  /** ID of the last bot message (for editing/deleting) */
  lastBotMessageId?: number;

  /** Whether the last bot message is a photo (vs text) */
  lastBotMessageIsPhoto?: boolean;
}

export type MyContext = Context & LazySessionFlavor<SessionData>;

/** Creates a fresh default session */
export function createDefaultSession(): SessionData {
  return {
    step: "idle",
    message: {
      text: "",
      buttons: [],
    },
  };
}
