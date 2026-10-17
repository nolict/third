import { describe, expect, test } from "bun:test";

import { parseChannelLink, targetUrl } from "../src/domain/channelLink.ts";

describe("parseChannelLink", () => {
  test("extracts the topic id from a topic link", () => {
    expect(parseChannelLink("https://t.me/c/4435318978/183")).toEqual({
      ok: true,
      link: { chatId: "-1004435318978", threadId: 183 },
    });
  });

  test("tolerates surrounding whitespace and trailing slash", () => {
    expect(parseChannelLink("  https://t.me/c/4435318978/183/  ")).toEqual({
      ok: true,
      link: { chatId: "-1004435318978", threadId: 183 },
    });
  });

  test("accepts username and numeric ids without topic", () => {
    expect(parseChannelLink("@solarian_logs")).toEqual({
      ok: true,
      link: { chatId: "@solarian_logs", threadId: null },
    });
    expect(parseChannelLink("-1001234567890")).toEqual({
      ok: true,
      link: { chatId: "-1001234567890", threadId: null },
    });
  });

  test("rejects malformed topic links instead of sending to the general channel", () => {
    expect(parseChannelLink("https://t.me/c/4435318978").ok).toBe(false);
    expect(parseChannelLink("https://t.me/c/4435318978/0").ok).toBe(false);
    expect(parseChannelLink("https://t.me/c/4435318978/abc").ok).toBe(false);
  });
});

describe("targetUrl", () => {
  test("builds topic links for primary buttons", () => {
    expect(targetUrl("-1004435318978", 183)).toBe("https://t.me/c/4435318978/183");
    expect(targetUrl("-1004435318978", null)).toBe("https://t.me/c/4435318978");
    expect(targetUrl("@solarian_logs", null)).toBe("https://t.me/solarian_logs");
  });
});
