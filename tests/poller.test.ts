import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { LogDelivery, OutgoingMessage } from "../src/bot/telegram.ts";
import type { TrafficItem } from "../src/services/thirdwave.ts";

// Every test here answers one question: does an OTP that arrives in a *different*
// Thirdwave account still reach the log channel? The poller is the only place that
// decides which keys are polled, so its two side-effecting imports are faked and
// the poller itself runs unchanged.

let claimed: { apiKeyId: number; fingerprint: string }[] = [];
let logged = new Set<string>();
const delivered: OutgoingMessage[] = [];
const traffic = new Map<string, TrafficItem[]>();
const failing = new Set<string>();

function eventKeyOf(value: TrafficItem): string {
  return [value.number, value.senderId, new Date(value.receivedAt).toISOString()].join("\u0000");
}

mock.module("../src/services/thirdwave.ts", () => ({
  fetchRecentTraffic: (token: string): Promise<TrafficItem[]> => {
    if (failing.has(token)) {
      return Promise.reject(new Error(`key ${token} is closed`));
    }
    return Promise.resolve(traffic.get(token) ?? []);
  },
}));

mock.module("../src/db/otpLogs.ts", () => ({
  eventKey: (number: string, senderId: string, receivedAt: Date): string =>
    [number, senderId, receivedAt.toISOString()].join("\u0000"),
  listLoggedEvents: (): Promise<Set<string>> => Promise.resolve(new Set(logged)),
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
    logged = new Set<string>();
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

  test("two identical OTPs in one batch are both delivered, not collapsed", async () => {
    const identical = "Your WhatsApp code: 555-555.";
    traffic.set("A", [
      item("5", identical, "2026-10-06T00:00:05Z"),
      item("5", identical, "2026-10-06T00:00:05Z"),
    ]);

    await new OtpPoller(makeDelivery([{ id: 1, token: "A" }])).poll();

    expect(delivered).toHaveLength(2);
  });

  test("restarting the poller does not resend the same window", async () => {
    traffic.set("A", [
      item("2", "Your WhatsApp code: 222-222.", "2026-10-06T00:00:02Z"),
      item("1", "Your WhatsApp code: 111-111.", "2026-10-06T00:00:01Z"),
    ]);

    const delivery = makeDelivery([{ id: 1, token: "A" }]);

    await new OtpPoller(delivery).poll();
    expect(delivered).toHaveLength(2);

    delivered.length = 0;
    await new OtpPoller(delivery).poll();
    expect(delivered).toHaveLength(0);
  });

  test("restart skips rows written with an older fingerprint but still sends new OTPs", async () => {
    const seen = item("1", "Your WhatsApp code: 111-111.", "2026-10-06T00:00:01Z");
    const fresh = item("2", "Your WhatsApp code: 222-222.", "2026-10-06T00:00:02Z");
    traffic.set("A", [fresh, seen]);

    logged = new Set([eventKeyOf(seen)]);

    await new OtpPoller(makeDelivery([{ id: 1, token: "A" }])).poll();

    expect(delivered).toHaveLength(1);
  });
});
