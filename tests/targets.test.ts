import { describe, expect, test } from "bun:test";
import type { Api } from "grammy";
import type { ChatFullInfo } from "grammy/types";

import { checkLogTarget, checkTopic } from "../src/admin/targets.ts";

const forumSupergroup = {
  id: -1004435318978,
  type: "supergroup",
  title: "Data",
  is_forum: true,
} as ChatFullInfo;

const channel = { id: -1001234567890, type: "channel", title: "Logs" } as ChatFullInfo;

function fakeApi(overrides: {
  chat?: ChatFullInfo;
  chatError?: boolean;
  member?: Record<string, unknown>;
  memberError?: boolean;
  topicError?: boolean;
}): Api {
  return {
    getChat: async () => {
      if (overrides.chatError) {
        throw new Error("Bad Request: chat not found");
      }
      return overrides.chat ?? channel;
    },
    getChatMember: async () => {
      if (overrides.memberError) {
        throw new Error("Bad Request: user not found");
      }
      return overrides.member ?? { status: "administrator" };
    },
    sendChatAction: async () => {
      if (overrides.topicError) {
        throw new Error("Bad Request: message thread not found");
      }
      return true;
    },
  } as unknown as Api;
}

describe("checkLogTarget", () => {
  test("accepts a forum supergroup even when can_post_messages is absent", async () => {
    const result = await checkLogTarget(
      fakeApi({
        chat: forumSupergroup,
        member: { status: "administrator", can_manage_topics: true },
      }),
      8838824319,
    );
    expect(result.ok).toBe(true);
  });

  test("accepts a channel", async () => {
    const result = await checkLogTarget(fakeApi({ member: { status: "creator" } }), 1);
    expect(result.ok).toBe(true);
  });

  test("rejects private chats and groups", async () => {
    for (const type of ["private", "group"] as const) {
      const result = await checkLogTarget(fakeApi({ chat: { id: 1, type } as ChatFullInfo }), 1);
      expect(result).toEqual({ ok: false, reason: expect.stringContaining("channel atau supergroup") });
    }
  });

  test("rejects a bot that is not an administrator", async () => {
    const result = await checkLogTarget(fakeApi({ member: { status: "member" } }), 1);
    expect(result.ok).toBe(false);
  });

  test("rejects an administrator explicitly denied posting", async () => {
    const result = await checkLogTarget(
      fakeApi({ member: { status: "administrator", can_post_messages: false } }),
      1,
    );
    expect(result.ok).toBe(false);
  });

  test("reports missing chat and missing membership distinctly", async () => {
    expect((await checkLogTarget(fakeApi({ chatError: true }), 1)).ok).toBe(false);
    expect((await checkLogTarget(fakeApi({ memberError: true }), 1)).ok).toBe(false);
  });
});

describe("checkTopic", () => {
  test("accepts a topic in a forum supergroup", async () => {
    expect(await checkTopic(fakeApi({}), forumSupergroup, 2856)).toBeUndefined();
  });

  test("rejects topics for chats that are not forums", async () => {
    expect(await checkTopic(fakeApi({}), channel, 2856)).toContain("bukan forum");
  });

  test("rejects a topic id that does not exist", async () => {
    expect(await checkTopic(fakeApi({ topicError: true }), forumSupergroup, 1)).toContain(
      "tidak ditemukan",
    );
  });
});
