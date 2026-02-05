import { InlineKeyboard } from "grammy";
import type { GroupInfo, MessageButton } from "../types/index.js";

// ─── Start / Main ───

/** Main menu keyboard shown on /start */
export function startKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Создать сообщение", "create_message")
    .row()
    .text("🔘 Добавить кнопки к посту", "attach_buttons_start");
}

// ─── Step: Add Image ───

export function addImageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🖼 Добавить изображение", "img_yes")
    .row()
    .text("⏭ Пропустить", "img_no")
    .row()
    .text("⬅️ Назад", "back_to_text");
}

/** Keyboard shown when image is already attached — allows change or remove */
export function imageAttachedKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Заменить изображение", "img_replace")
    .text("🗑 Удалить", "img_remove")
    .row()
    .text("➡️ Далее", "img_done")
    .row()
    .text("⬅️ Назад", "back_to_text");
}

// ─── Step: Button Grid ───

/**
 * Builds the button editing keyboard.
 * Shows existing buttons (clickable for edit) surrounded by "+" buttons
 * for adding new buttons in any direction.
 *
 * Layout concept for a single button at (0,0):
 *   [    ] [+ ↑] [    ]
 *   [+ ←] [ Btn ] [+ →]
 *   [    ] [+ ↓] [    ]
 *
 * For multiple buttons, + buttons appear between and around them.
 */
export function buttonGridKeyboard(buttons: MessageButton[][]): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (buttons.length === 0) {
    // No buttons yet — show single "add" button
    kb.text("➕ Добавить кнопку", "+r:0");
    kb.row();
    kb.text("⏭ Пропустить", "skip_buttons");
    kb.row();
    kb.text("⬅️ Назад", "back_to_image_or_pos");
    return kb;
  }

  for (let r = 0; r < buttons.length; r++) {
    const row = buttons[r]!;

    // Row of + buttons above current row (add new row above)
    kb.text(`   `, `noop`);
    for (let c = 0; c < row.length; c++) {
      kb.text("➕ ↑", `+r:${r}`);
      if (c < row.length - 1) {
        kb.text(`   `, `noop`);
      }
    }
    kb.text(`   `, `noop`);
    kb.row();

    // The actual button row: [+ ←] [Btn1] [Btn2] ... [+ →]
    kb.text("➕ ←", `+c:${r}:0`);
    for (let c = 0; c < row.length; c++) {
      const btn = row[c]!;
      const icon = btn.action === "url" ? "🔗" : "💬";
      kb.text(`${icon} ${truncate(btn.text, 12)}`, `eb:${r}:${c}`);
      if (c < row.length - 1) {
        // Insert between buttons
        kb.text("➕", `+c:${r}:${c + 1}`);
      }
    }
    kb.text("➕ →", `+c:${r}:${row.length}`);
    kb.row();
  }

  // Bottom row of + buttons (add new row below last)
  const lastRow = buttons[buttons.length - 1]!;
  kb.text(`   `, `noop`);
  for (let c = 0; c < lastRow.length; c++) {
    kb.text("➕ ↓", `+r:${buttons.length}`);
    if (c < lastRow.length - 1) {
      kb.text(`   `, `noop`);
    }
  }
  kb.text(`   `, `noop`);
  kb.row();

  // Navigation
  kb.text("✅ Готово", "buttons_done");
  kb.row();
  kb.text("⬅️ Назад", "back_to_image_or_pos");

  return kb;
}

// ─── Step: Button Action ───

export function buttonActionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔗 Ссылка (URL)", "btnact_url")
    .row()
    .text("💬 Всплывающее уведомление", "btnact_alert")
    .row()
    .text("⬅️ Назад", "back_to_buttons");
}

// ─── Step: Edit Existing Button ───

export function editButtonKeyboard(row: number, col: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Изменить", `btn_edit:${row}:${col}`)
    .text("🗑 Удалить", `btn_del:${row}:${col}`)
    .row()
    .text("⬅️ Назад", "back_to_buttons");
}

// ─── Step: Review ───

export function reviewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📢 Выбрать группу / канал", "goto_select_group")
    .row()
    .text("✏️ Редактировать текст", "edit_text")
    .text("🖼 Редактировать фото", "edit_image")
    .row()
    .text("🔘 Редактировать кнопки", "edit_buttons_review")
    .row()
    .text("⬅️ Назад", "back_to_buttons");
}

// ─── Step: Group Selection ───

export function groupSelectionKeyboard(groups: GroupInfo[], botUsername: string): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const g of groups) {
    kb.text(`📢 ${g.title}`, `grp:${g.chatId}`);
    kb.row();
  }

  // Deep link to add bot to a new group with admin rights
  const addGroupUrl = `https://t.me/${botUsername}?startgroup=botstart&admin=post_messages+delete_messages+edit_messages`;
  kb.url("➕ Добавить в группу", addGroupUrl);
  kb.row();

  // Deep link to add bot to a channel as admin
  const addChannelUrl = `https://t.me/${botUsername}?startchannel=botstart&admin=post_messages+delete_messages+edit_messages`;
  kb.url("➕ Добавить в канал", addChannelUrl);
  kb.row();

  kb.text("🔄 Обновить список", "refresh_groups");
  kb.row();
  kb.text("⬅️ Назад", "back_to_review");

  return kb;
}

// ─── Step: Confirm Send ───

export function confirmSendKeyboard(groupTitle: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(`✅ Отправить в «${truncate(groupTitle, 25)}»`, "confirm_send")
    .row()
    .text("⬅️ Назад", "back_to_groups");
}

// ─── Helpers ───

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

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
