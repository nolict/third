import type { InlineKeyboardButton } from "grammy/types";

import { countryEmojiId, countryFromNumber, countryFromRange, maskNumber, serviceEmojiId, serviceLabel } from "./labels.ts";
import { detectLanguage, extractOtp } from "./otp.ts";

export interface LogEntry {
  receivedAt: Date;
  senderId: string;
  rangeName: string;
  number: string;
  sms: string;
}

export interface NumberButton {
  label: string;
  url: string;
}

export interface LogMessage {
  markdownV2: string;
  legacyMarkdown: string;
  replyMarkup: { inline_keyboard: InlineKeyboardButton[][] };
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function escapeLegacyMarkdown(text: string): string {
  return text.replace(/[_*`[]/g, "\\$&");
}

function customEmoji(emojiId: string, fallback: string): string {
  return `![${fallback}](tg://emoji?id=${emojiId})`;
}

function summary(entry: LogEntry): {
  iso: string;
  appEmojiId: string;
  label: string;
  maskedNumber: string;
  lang: string;
  code: string | null;
} {
  const iso = countryFromRange(entry.rangeName, "") || countryFromNumber(entry.number) || "??";
  const appEmojiId = serviceEmojiId(entry.senderId);
  const label = serviceLabel(entry.senderId);
  const maskedNumber = maskNumber(entry.number);
  const lang = detectLanguage(entry.sms);
  return { iso, appEmojiId, label, maskedNumber, lang, code: extractOtp(entry.sms) };
}

function spacedCode(code: string): string {
  if (code.length < 4) {
    return code;
  }
  if (code.length === 4) {
    return `${code.slice(0, 2)}-${code.slice(2)}`;
  }
  return code.match(/.{1,3}/g)?.join("-") ?? code;
}

function keyboard(code: string | null, numbers: NumberButton[]): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  if (numbers.length === 0 && code === null) {
    return rows;
  }
  if (code !== null) {
    rows.push([{ text: spacedCode(code), copy_text: { text: code }, style: "danger" }]);
  }
  if (numbers.length > 0) {
    rows.push(numbers.map((number) => ({ text: number.label, url: number.url, style: "primary" })));
  }
  return rows;
}

export function formatLogMessage(entry: LogEntry, numbers: NumberButton[]): LogMessage {
  const { iso, appEmojiId, label, maskedNumber, lang, code } = summary(entry);

  const flagId = countryEmojiId(iso);
  const flagPart = flagId !== null ? `${customEmoji(flagId, "🏳")} ` : "";
  const appEmoji = customEmoji(appEmojiId, "📱");

  const markdownV2Head = `${flagPart}${escapeMarkdownV2(iso)} ${appEmoji} • ${escapeMarkdownV2(maskedNumber)} \\#${escapeMarkdownV2(lang)}`;
  const legacyHead = `${iso} ${label} ${maskedNumber} #${lang}`;

  return {
    markdownV2: `*${markdownV2Head}*\n`,
    legacyMarkdown: `*${escapeLegacyMarkdown(legacyHead)}*\n`,
    replyMarkup: { inline_keyboard: keyboard(code, numbers) },
  };
}
