import { maxNumberChannels, type ChannelRecord } from "../db/channels.ts";
import { channelDisplayName } from "./keyboards.ts";
import { escapeHtml } from "../lib/format.ts";

const kindTitle = {
  log: "Log Channels",
  number: "Set Channel",
} as const;

export function homeView(adminCount: number, keyCount: number, logCount: number, numberCount: number): string {
  return [
    "<b>OTP Logger</b>",
    "",
    `Admin: ${adminCount}`,
    `API key: ${keyCount}`,
    `Log channel: ${logCount}`,
    `Set Channel: ${numberCount}`,
    "",
    "Pilih menu di bawah.",
  ].join("\n");
}

function channelLine(kind: "log" | "number", channel: ChannelRecord, index: number): string {
  const topic = channel.threadId === null ? "channel utama" : `topic ${channel.threadId}`;
  const side = index === 0 ? "kiri" : "kanan";
  if (kind === "number") {
    return [
      `<b>${index + 1}. ${escapeHtml(channelDisplayName(channel))}</b> · tombol ${side}`,
      `${escapeHtml(channel.chatId)} · ${topic}`,
    ].join("\n");
  }
  const state = channel.isActive ? "ON" : "OFF";
  return [
    `<b>${escapeHtml(channelDisplayName(channel))}</b> · ${state}`,
    `${escapeHtml(channel.chatId)} · ${topic}`,
  ].join("\n");
}

export function channelsView(kind: "log" | "number", channels: ChannelRecord[]): string {
  const header = `<b>${kindTitle[kind]}</b>`;
  if (kind === "number") {
    return [
      header,
      "",
      "Channel ini hanya jadi tombol di pesan OTP. OTP tidak dikirim ke sini.",
      `Maksimal ${maxNumberChannels}, tampil kiri dan kanan.`,
      "",
      channels.length === 0
        ? "Belum ada channel, tombol tidak tampil di pesan OTP."
        : channels.map((channel, index) => channelLine(kind, channel, index)).join("\n\n"),
    ].join("\n");
  }
  if (channels.length === 0) {
    return [header, "", "Belum ada channel. Log tidak akan dikirim.", "", "Tambahkan minimal satu channel."].join(
      "\n",
    );
  }
  const active = channels.filter((channel) => channel.isActive).length;
  return [
    header,
    "",
    `${channels.length} channel · ${active} aktif`,
    "Log dikirim ke semua channel yang aktif.",
    "",
    channels.map((channel, index) => channelLine(kind, channel, index)).join("\n\n"),
  ].join("\n");
}

export function channelView(kind: "log" | "number", channel: ChannelRecord, index = 0): string {
  const topic = channel.threadId === null ? "channel utama" : `topic ${channel.threadId}`;
  if (kind === "number") {
    return [
      `<b>${escapeHtml(channelDisplayName(channel))}</b>`,
      "",
      `Chat: ${escapeHtml(channel.chatId)}`,
      `Tujuan: ${topic}`,
      `Tombol: ${index === 0 ? "kiri" : "kanan"}`,
      "",
      "Hanya dipakai sebagai tombol di pesan OTP. OTP tidak dikirim ke sini.",
    ].join("\n");
  }
  return [
    `<b>${escapeHtml(channelDisplayName(channel))}</b>`,
    "",
    `Chat: ${escapeHtml(channel.chatId)}`,
    `Tujuan: ${topic}`,
    `Status: ${channel.isActive ? "ON" : "OFF"}`,
    "",
    "Nonaktifkan untuk berhenti menerima log di channel ini.",
  ].join("\n");
}

export function keysView(keyCount: number, page: number, pageCount: number): string {
  return [
    "<b>API Keys</b>",
    "",
    `${keyCount} key · halaman ${page + 1}/${Math.max(pageCount, 1)}`,
    "",
    keyCount === 0 ? "Belum ada key." : "Tekan key untuk melihat detail.",
  ].join("\n");
}

export function keyView(key: { id: number; label: string; token: string; createdAt: Date }): string {
  return [
    `<b>${escapeHtml(key.label)}</b>`,
    "",
    `ID: ${key.id}`,
    `Dibuat: ${key.createdAt.toISOString().slice(0, 10)}`,
    "",
    "API key:",
    `<code>${escapeHtml(key.token)}</code>`,
  ].join("\n");
}

export function channelPromptView(kind: "log" | "number"): string {
  const intro =
    kind === "number"
      ? "Channel ini hanya jadi tombol di pesan OTP, bukan tujuan log."
      : "Log OTP dikirim ke channel ini.";
  return [
    `<b>Tambah ${kindTitle[kind]}</b>`,
    "",
    intro,
    "",
    "Kirim salah satu:",
    "@username",
    "-1001234567890",
    "https://t.me/c/1234567890/183",
    "",
    "Angka terakhir pada link adalah topic ID.",
    "Bot harus admin chat tersebut.",
  ].join("\n");
}

export function keyPromptView(): string {
  return [
    "<b>Tambah API key</b>",
    "",
    "Kirim API key dari dashboard thirdwave.im.",
    "",
    "Key akan dicek langsung ke thirdwave sebelum disimpan.",
    "Key yang tidak valid ditolak.",
  ].join("\n");
}

export function keyLabelPromptView(): string {
  return [
    "<b>Beri label</b>",
    "",
    "Key valid. Sekarang kirim label untuk key ini.",
    "Contoh: Utama, Cadangan, Trial",
  ].join("\n");
}

export function labelPromptView(title: string): string {
  return [
    "<b>Label tombol</b>",
    "",
    `Channel: ${escapeHtml(title)}`,
    "",
    "Kirim label yang akan tampil pada tombol di pesan OTP.",
    "Contoh: Channel 1, Leads A, Stok",
  ].join("\n");
}
