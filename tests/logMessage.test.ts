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

describe("formatLogMessage", () => {
  test("renders only the bold info line, without the code in the text", () => {
    const { markdownV2 } = formatLogMessage(entry, numbers);
    expect(markdownV2).toBe("*ID \\| WA 6281•••••2345 \\#EN*");
  });

  test("bolds the info line in the legacy markdown fallback too", () => {
    const { legacyMarkdown } = formatLogMessage(entry, numbers);
    expect(legacyMarkdown).toBe("*ID | WA 6281•••••2345 #EN*");
  });

  test("never leaks the code into the visible text", () => {
    const { markdownV2, legacyMarkdown } = formatLogMessage(entry, numbers);
    expect(markdownV2).not.toContain("9472999");
    expect(legacyMarkdown).not.toContain("9472999");
  });

  test("masks the number and keeps no blockquote or code fence", () => {
    const { markdownV2 } = formatLogMessage(entry, numbers);
    expect(markdownV2).toContain("6281•••••2345");
    expect(markdownV2).not.toContain("6281255512345");
    expect(markdownV2).not.toContain(">");
    expect(markdownV2).not.toContain("```");
  });

  test("renders the red otp button full width above two channel buttons side by side", () => {
    const { replyMarkup } = formatLogMessage(entry, numbers);
    expect(replyMarkup.inline_keyboard).toEqual([
      [{ text: "9472999", copy_text: { text: "9472999" }, style: "danger" }],
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
    expect(markdownV2).toBe("*ID \\| WA 6281•••••2345 \\#EN*");
    expect(replyMarkup.inline_keyboard).toEqual([
      [
        { text: "Leads A", url: "https://t.me/leads_a", style: "primary" },
        { text: "Leads B", url: "https://t.me/leads_b", style: "primary" },
      ],
    ]);
  });

  test("keeps the otp button but drops channels when no numbers channel is configured", () => {
    const { markdownV2, replyMarkup } = formatLogMessage(entry, []);
    expect(markdownV2).toBe("*ID \\| WA 6281•••••2345 \\#EN*");
    expect(replyMarkup.inline_keyboard).toEqual([
      [{ text: "9472999", copy_text: { text: "9472999" }, style: "danger" }],
    ]);
  });
});
