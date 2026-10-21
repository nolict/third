import { describe, expect, test } from "bun:test";

import { formatLogMessage, type LogEntry, type NumberButton } from "../src/domain/logMessage.ts";

const entry: LogEntry = {
  receivedAt: new Date("2026-10-06T00:20:00Z"),
  senderId: "WhatsApp",
  rangeName: "Indonesia Telkomsel",
  number: "6281255512345",
  sms: "Your WhatsApp code is 947-2999. Do not share it with anyone.",
};

const numbers: NumberButton[] = [
  { label: "Leads A", url: "https://t.me/leads_a" },
  { label: "Leads B", url: "https://t.me/leads_b" },
];

const waAppEmoji = "![📱](tg://emoji?id=5334998226636390258)";
const fallbackAppEmoji = "![📱](tg://emoji?id=5334998226636390258)";
const usFlagEmoji = "![🏳](tg://emoji?id=5294244076533600593)";
const s = "![⬛](tg://emoji?id=5438496463044752972)";
const masked = (prefix: string, count: number, tail: string) => `${prefix}${s.repeat(count)}${tail}`;

describe("formatLogMessage", () => {
  test("renders the bold info line with custom emoji in markdownV2", () => {
    const { markdownV2 } = formatLogMessage(entry, numbers);
    expect(markdownV2).toBe(`*ID ${waAppEmoji} • ${masked("6281", 5, "2345")} \\#EN*\n`);
  });

  test("legacy markdown fallback uses plain text without custom emoji", () => {
    const { legacyMarkdown } = formatLogMessage(entry, numbers);
    expect(legacyMarkdown).toBe("*ID WA 6281•••••2345 #EN*\n");
  });

  test("groups the button text with dashes but copies the plain digits", () => {
    const { replyMarkup } = formatLogMessage(entry, numbers);
    const button = replyMarkup.inline_keyboard[0]?.[0];
    expect(button?.text).toBe("947-299-9");
    expect(button?.copy_text).toEqual({ text: "9472999" });
  });

  test("splits a four digit code in half", () => {
    const { replyMarkup } = formatLogMessage({ ...entry, sms: "Kode OTP kamu: 9876" }, numbers);
    expect(replyMarkup.inline_keyboard[0]?.[0]).toEqual({
      text: "98-76",
      copy_text: { text: "9876" },
      style: "danger",
    });
  });

  test("leaves codes shorter than four digits undashed", () => {
    const { replyMarkup } = formatLogMessage({ ...entry, sms: "PIN 482" }, numbers);
    expect(replyMarkup.inline_keyboard[0]?.[0]).toEqual({
      text: "482",
      copy_text: { text: "482" },
      style: "danger",
    });
  });

  test("groups a six digit code as three and three", () => {
    const { replyMarkup } = formatLogMessage(
      { ...entry, sms: "Your Facebook code is 482 913." },
      numbers,
    );
    expect(replyMarkup.inline_keyboard[0]?.[0]).toEqual({
      text: "482-913",
      copy_text: { text: "482913" },
      style: "danger",
    });
  });

  test("never leaks the code into the visible text", () => {
    const { markdownV2, legacyMarkdown } = formatLogMessage(entry, numbers);
    expect(markdownV2).not.toContain("9472999");
    expect(legacyMarkdown).not.toContain("9472999");
  });

  test("masks the number and keeps no blockquote or code fence", () => {
    const { markdownV2 } = formatLogMessage(entry, numbers);
    expect(markdownV2).toContain("6281");
    expect(markdownV2).toContain("2345");
    expect(markdownV2).not.toContain("6281255512345");
    expect(markdownV2).not.toContain(">");
    expect(markdownV2).not.toContain("```");
    expect(markdownV2).not.toContain("➖");
  });

  test("separates the text from the buttons with a trailing newline", () => {
    const { markdownV2, legacyMarkdown } = formatLogMessage(entry, numbers);
    expect(markdownV2.endsWith("\n")).toBe(true);
    expect(legacyMarkdown.endsWith("\n")).toBe(true);
  });

  test("renders the red otp button full width above two channel buttons side by side", () => {
    const { replyMarkup } = formatLogMessage(entry, numbers);
    expect(replyMarkup.inline_keyboard).toEqual([
      [{ text: "947-299-9", copy_text: { text: "9472999" }, style: "danger" }],
      [
        { text: "Leads A", url: "https://t.me/leads_a", style: "primary" },
        { text: "Leads B", url: "https://t.me/leads_b", style: "primary" },
      ],
    ]);
  });

  test("keeps a single channel button alone in its row", () => {
    const { replyMarkup } = formatLogMessage(entry, [numbers[0]!]);
    expect(replyMarkup.inline_keyboard[1]).toHaveLength(1);
  });

  test("follows the configured order so position decides left and right", () => {
    const { replyMarkup } = formatLogMessage(entry, [numbers[1]!, numbers[0]!]);
    expect(replyMarkup.inline_keyboard[1]?.map((button) => button.text)).toEqual([
      "Leads B",
      "Leads A",
    ]);
  });

  test("omits the otp button but keeps channels when no code was extracted", () => {
    const { markdownV2, replyMarkup } = formatLogMessage(
      { ...entry, sms: "Your account email has been changed." },
      numbers,
    );
    expect(markdownV2).toBe(`*ID ${waAppEmoji} • ${masked("6281", 5, "2345")} \\#EN*\n`);
    expect(replyMarkup.inline_keyboard).toEqual([
      [
        { text: "Leads A", url: "https://t.me/leads_a", style: "primary" },
        { text: "Leads B", url: "https://t.me/leads_b", style: "primary" },
      ],
    ]);
  });

  test("keeps the otp button but drops channels when no numbers channel is configured", () => {
    const { markdownV2, replyMarkup } = formatLogMessage(entry, []);
    expect(markdownV2).toBe(`*ID ${waAppEmoji} • ${masked("6281", 5, "2345")} \\#EN*\n`);
    expect(replyMarkup.inline_keyboard).toEqual([
      [{ text: "947-299-9", copy_text: { text: "9472999" }, style: "danger" }],
    ]);
  });

  test("unknown country falls back to ?? without flag emoji", () => {
    const { markdownV2 } = formatLogMessage(
      { ...entry, rangeName: "Unknown Range XYZ", number: "00000000000" },
      [],
    );
    expect(markdownV2).toBe(`*?? ${waAppEmoji} • ${masked("0000", 3, "0000")} \\#EN*\n`);
  });

  test("unknown service uses fallback app emoji", () => {
    const { markdownV2 } = formatLogMessage(
      { ...entry, senderId: "SomeRandomService" },
      [],
    );
    expect(markdownV2).toContain(fallbackAppEmoji);
  });

  test("known country shows flag emoji before iso code", () => {
    const { markdownV2 } = formatLogMessage(
      { ...entry, rangeName: "United States Verizon", number: "14155552671" },
      [],
    );
    expect(markdownV2).toBe(`*${usFlagEmoji} US ${waAppEmoji} • ${masked("1415", 3, "2671")} \\#EN*\n`);
  });
});
