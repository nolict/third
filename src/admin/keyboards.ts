import { InlineKeyboard } from "grammy";
import type { ReplyKeyboardMarkup } from "grammy/types";

import { pageSize } from "../config/env.ts";
import type { ApiKeyRecord } from "../db/apiKeys.ts";
import { maxNumberChannels, type ChannelRecord } from "../db/channels.ts";

export const menu = {
  apiKeys: "API Keys",
  logChannels: "Log Channels",
  numbers: "Set Channel",
  home: "Home",
} as const;

export type MenuButton = (typeof menu)[keyof typeof menu];

export function isMenuButton(text: string): text is MenuButton {
  return Object.values(menu).includes(text as MenuButton);
}

export const adminReplyKeyboard: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: menu.home, style: "primary" }],
    [{ text: menu.apiKeys }, { text: menu.logChannels }, { text: menu.numbers }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Pilih menu",
};

export function homeKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Tutup", "m:close").style("danger");
}

export function channelDisplayName(channel: ChannelRecord): string {
  return "label" in channel && typeof channel.label === "string" && channel.label.length > 0
    ? channel.label
    : channel.title;
}

export function channelsKeyboard(kind: "log" | "number", channels: ChannelRecord[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  channels.forEach((channel, index) => {
    const name = channelDisplayName(channel);
    const text =
      kind === "number" ? `${index + 1}. ${name}` : `${name} · ${channel.isActive ? "ON" : "OFF"}`;
    keyboard.text(text, `${kind}:view:${channel.id}`).row();
  });

  keyboard.text("Tambah", `${kind}:add`).row();
  if (kind === "number" && channels.length === maxNumberChannels) {
    keyboard.text("Tukar posisi", `${kind}:swap`).row();
  }
  if (channels.length > 0) {
    if (kind === "log") {
      keyboard.text("Test kirim", `${kind}:test`).row();
    } else {
      keyboard.text("Cek tombol", `${kind}:preview`).row();
    }
  }
  return keyboard.text("Kembali", "m:home");
}

export function channelDetailKeyboard(kind: "log" | "number", channel: ChannelRecord): InlineKeyboard {
  if (kind === "number") {
    return new InlineKeyboard()
      .text("Hapus", `${kind}:delete:${channel.id}`).style("danger")
      .row()
      .text("Kembali", `m:${kind}`);
  }
  const toggle = channel.isActive ? "Matikan" : "Aktifkan";
  return new InlineKeyboard()
    .text(toggle, `${kind}:toggle:${channel.id}`).style("primary")
    .row()
    .text("Hapus", `${kind}:delete:${channel.id}`).style("danger")
    .row()
    .text("Kembali", `m:${kind}`);
}

export function confirmDeleteChannelKeyboard(kind: "log" | "number", id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Ya, hapus", `${kind}:delete:${id}:yes`).style("danger")
    .row()
    .text("Batal", `${kind}:view:${id}`);
}

export function keysKeyboard(keys: ApiKeyRecord[], page: number): InlineKeyboard {
  const pageCount = Math.max(1, Math.ceil(keys.length / pageSize));
  const keyboard = new InlineKeyboard();

  for (const key of keys.slice(page * pageSize, page * pageSize + pageSize)) {
    keyboard.text(key.label, `k:view:${key.id}`).row();
  }

  return keyboard
    .text("‹", `k:page:${page - 1}`)
    .text(`${page + 1}/${pageCount}`, "k:noop")
    .text("›", `k:page:${page + 1}`)
    .row()
    .text("Tambah", "k:add")
    .row()
    .text("Kembali", "m:home");
}

export function keyDetailKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Hapus", `k:delete:${id}`).style("danger")
    .row()
    .text("Kembali", "m:keys");
}

export function confirmDeleteKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Ya, hapus", `k:delete:${id}:yes`).style("danger")
    .row()
    .text("Batal", `k:view:${id}`);
}

export function cancelKeyboard(screen: "keys" | "log" | "number"): InlineKeyboard {
  return new InlineKeyboard().text("Batal", `m:${screen}`).style("danger");
}
