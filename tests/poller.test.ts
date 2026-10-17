import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { LogDelivery, OutgoingMessage } from "../src/bot/telegram.ts";
import type { TrafficItem } from "../src/services/thirdwave.ts";

// Every test here answers one question: does an OTP that arrives in a *different*
// Thirdwave account still reach the log channel? The poller is the only place that
// decides which keys are polled, so its two side-effecting imports are faked and
// the poller itself runs unchanged.

let claimed: { apiKeyId: number; fingerprint: string }[] = [];
const delivered: OutgoingMessage[] = [];
const traffic = new Map<string, TrafficItem[]>();
const failing = new Set<string>();

mock.module("../src/services/thirdwave.ts", () => ({
  fetchRecentTraffic: (token: string): Promise<TrafficItem[]> => {
    if (failing.has(token)) {
      return Promise.reject(new Error(`key ${token} is closed`));
    }
    return Promise.resolve(traffic.get(token) ?? []);
  },
}));

mock.module("../src/db/otpLogs.ts", () => ({
  claimOtpLog: (apiKeyId: number, fingerprint: string): Promise<boolean> => {
    const seen = claimed.some(
      (row) => row.apiKeyId === apiKeyId && row.fingerprint === fingerprint,
    );
    if (!seen) {
      claimed.push({ apiKeyId, fingerprint });
    }
    return Promise.resolve(!seen);
  },
}));

const { OtpPoller } = await import("../src/services/poller.ts");

function item(seed: string, sms: string, receivedAt: string): TrafficItem {
  return {
    receivedAt,
    senderId: "WhatsApp",
    rangeName: "Indonesia Telkomsel",
    rangeTemplate: "62812XXXXXXX",
    number: `62812${seed.padStart(7, "0")}`,
    sms,
    rate: "0.05",
  };
}

function makeDelivery(keys: { id: number; token: string }[]): LogDelivery {
  return {
    send: (_target, message) => {
      delivered.push(message);
      return Promise.resolve();
    },
    listTargets: () =>
      Promise.resolve([{ chatId: -100, threadId: null, title: "Log", isActive: true }]),
    numberButtons: () => Promise.resolve([]),
    listActiveApiKeys: () => Promise.resolve(keys),
  };
}

const twoKeys = [
  { id: 1, token: "A" },
  { id: 2, token: "B" },
];

describe("poller fans out every API key", () => {
  beforeEach(() => {
    claimed = [];
    delivered.length = 0;
    traffic.clear();
    failing.clear();
  });

  test("an OTP in a second account is delivered to the same log channel", async () => {
    traffic.set("A", [item("1", "Kode WhatsApp Anda: 111-111.", "2026-10-06T00:00:01Z")]);
    traffic.set("B", [item("2", "Your WhatsApp code: 222-222.", "2026-10-06T00:00:02Z")]);

    await new OtpPoller(makeDelivery(twoKeys)).poll();

    expect(claimed.map((row) => row.apiKeyId).sort()).toEqual([1, 2]);
    expect(delivered).toHaveLength(2);
  });

  test("a failing key does not block the healthy ones", async () => {
    failing.add("A");
    traffic.set("B", [item("2", "Your WhatsApp code: 222-222.", "2026-10-06T00:00:02Z")]);

    await new OtpPoller(makeDelivery(twoKeys)).poll();

    expect(delivered).toHaveLength(1);
  });

  test("the same OTP seen by two keys is not lost", async () => {
    traffic.set("A", [item("9", "Your WhatsApp code: 999-999.", "2026-10-06T00:00:09Z")]);
    traffic.set("B", [item("9", "Your WhatsApp code: 999-999.", "2026-10-06T00:00:09Z")]);

    await new OtpPoller(makeDelivery(twoKeys)).poll();

    // Deduplication is per key, so each key still logs its own row rather than
    // one key's sighting silently swallowing the other's.
    expect(claimed.map((row) => row.apiKeyId).sort()).toEqual([1, 2]);
  });

  test("bursts newer than the last delivered item are all sent, oldest first", async () => {
    // Newest-first, as the API returns them.
    traffic.set("A", [
      item("2", "Your WhatsApp code: 222-222.", "2026-10-06T00:00:02Z"),
      item("1", "Your WhatsApp code: 111-111.", "2026-10-06T00:00:01Z"),
    ]);

    const delivery = makeDelivery([{ id: 1, token: "A" }]);
    const poller = new OtpPoller(delivery);

    await poller.poll();
    expect(delivered).toHaveLength(2);

    // Nothing new: a second poll must not re-send.
    delivered.length = 0;
    await poller.poll();
    expect(delivered).toHaveLength(0);

    // Polling is not instantaneous, so a message that arrived *before* the one we
    // last saw can show up below it on a later poll. Stopping at the first known
    // item would silently drop it; it must still be delivered.
    traffic.set("A", [
      item("3", "Your WhatsApp code: 333-333.", "2026-10-06T00:00:03Z"),
      item("2", "Your WhatsApp code: 222-222.", "2026-10-06T00:00:02Z"),
      item("9", "Your WhatsApp code: 999-999.", "2026-10-06T00:00:01.5Z"),
    ]);
    await poller.poll();

    expect(delivered).toHaveLength(2);
  });
});
