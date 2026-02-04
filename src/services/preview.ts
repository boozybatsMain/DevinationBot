import type { ComposedMessage } from "../types/index.js";

/**
 * Builds a human-readable preview string for the message being composed.
 * Used in the step-by-step builder to show current state.
 */
export function buildPreviewText(msg: ComposedMessage): string {
  const lines: string[] = [];

  lines.push("📋 <b>Предпросмотр сообщения:</b>");
  lines.push("");

  if (msg.text) {
    lines.push(`<b>Текст:</b>`);
    lines.push(msg.text);
  } else {
    lines.push("<i>Текст не задан</i>");
  }

  if (msg.imageFileId) {
    lines.push("");
    lines.push(`🖼 <b>Изображение:</b> прикреплено`);
  }

  if (msg.buttons.length > 0) {
    lines.push("");
    lines.push("<b>Кнопки:</b>");
    for (let r = 0; r < msg.buttons.length; r++) {
      const row = msg.buttons[r]!;
      const rowText = row
        .map((btn) => {
          const icon = btn.action === "url" ? "🔗" : "💬";
          return `[${icon} ${btn.text}]`;
        })
        .join(" ");
      lines.push(rowText);
    }
  }

  return lines.join("\n");
}

/**
 * Builds the instruction text for a given step.
 */
export function getStepInstruction(step: string): string {
  switch (step) {
    case "write_text":
      return "✏️ Напишите текст для сообщения:";
    case "add_image":
      return "🖼 Хотите добавить изображение?";
    case "send_image":
      return "📷 Отправьте мне изображение:";
    case "edit_buttons":
      return "🔘 Настройте кнопки сообщения:";
    case "btn_text":
      return "✏️ Напишите текст для кнопки:";
    case "btn_action":
      return "⚡ Что делать при нажатии на кнопку?";
    case "btn_value":
      return "📝 Введите значение для кнопки:";
    case "review":
      return "👀 Проверьте сообщение перед отправкой:";
    case "select_group":
      return "📢 Выберите группу или канал для отправки:";
    case "confirm_send":
      return "✅ Подтвердите отправку:";
    default:
      return "";
  }
}
