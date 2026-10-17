import { describe, expect, test } from "bun:test";

import { formatLogMessage } from "../src/domain/logMessage.ts";

const entry = {
  receivedAt: new Date("2026-10-06T00:20:00Z"),
  senderId: "WhatsApp",
  rangeName: "Indonesia Telkomsel",
  number: "6281255512345",
  sms: "Kode verifikasi Anda adalah 2438-2574.",
};

describe("numbers buttons are links only", () => {
  test("a numbers channel produces a url button, never a message target", () => {
    const { replyMarkup } = formatLogMessage(entry, [
      { label: "Numbers", url: "https://t.me/c/3068992613" },
      { label: "Discuss", url: "https://t.me/c/3054663368" },
    ]);

    const channelRow = replyMarkup.inline_keyboard[1];
    expect(channelRow).toHaveLength(2);
    for (const button of channelRow ?? []) {
      expect(button.url).toBeDefined();
      expect(button.copy_text).toBeUndefined();
    }
  });

  test("channel buttons keep admin order so left is index 0", () => {
    const { replyMarkup } = formatLogMessage(entry, [
      { label: "Numbers", url: "https://t.me/c/1" },
      { label: "Discuss", url: "https://t.me/c/2" },
    ]);

    expect(replyMarkup.inline_keyboard[1]?.map((button) => button.text)).toEqual([
      "Numbers",
      "Discuss",
    ]);
  });
});
