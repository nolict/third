import type { InlineKeyboardButton } from "grammy/types";

import { countryFromNumber, countryFromRange, maskNumber, serviceLabel } from "./labels.ts";
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

const missing = "??";

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function escapeLegacyMarkdown(text: string): string {
  return text.replace(/[_*`[]/g, "\\$&");
}

function summary(entry: LogEntry): { info: string; code: string | null } {
  const country = countryFromRange(entry.rangeName, "") || countryFromNumber(entry.number) || missing;
  const info = `${country} | ${serviceLabel(entry.senderId)} ${maskNumber(entry.number)} #${detectLanguage(entry.sms)}`;
  return { info, code: extractOtp(entry.sms) };
}

function keyboard(code: string | null, numbers: NumberButton[]): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  if (numbers.length === 0 && code === null) {
    return rows;
  }
  if (code !== null) {
    rows.push([{ text: code, copy_text: { text: code }, style: "danger" }]);
  }
  if (numbers.length > 0) {
    rows.push(numbers.map((number) => ({ text: number.label, url: number.url, style: "primary" })));
  }
  return rows;
}

export function formatLogMessage(entry: LogEntry, numbers: NumberButton[]): LogMessage {
  const { info, code } = summary(entry);
  const escapedInfo = escapeMarkdownV2(info);

  return {
    markdownV2: `*${escapedInfo}*`,
    legacyMarkdown: `*${escapeLegacyMarkdown(info)}*`,
    replyMarkup: { inline_keyboard: keyboard(code, numbers) },
  };
}
