import { createHash } from "node:crypto";

import { pollIntervalMs } from "../config/env.ts";
import { claimOtpLog, eventKey, listLoggedEvents } from "../db/otpLogs.ts";
import { formatLogMessage } from "../domain/logMessage.ts";
import { fetchRecentTraffic, type TrafficItem } from "./thirdwave.ts";
import type { LogDelivery, OutgoingMessage } from "../bot/telegram.ts";

const trafficWindowSize = 100;

function contentHash(item: TrafficItem): string {
  return createHash("sha256")
    .update([item.receivedAt, item.number, item.senderId, item.sms].join("\u0000"))
    .digest("hex");
}

function nextFingerprint(occurrences: Map<string, number>, item: TrafficItem): string {
  const base = contentHash(item);
  const occurrence = (occurrences.get(base) ?? 0) + 1;
  occurrences.set(base, occurrence);
  return occurrence === 1 ? base : `${base}:${occurrence}`;
}

export class OtpPoller {
  private readonly inFlight = new Set<number>();
  private readonly errorLogged = new Set<number>();
  private readonly reconciled = new Set<number>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly delivery: LogDelivery) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.poll();
    }, pollIntervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async poll(): Promise<void> {
    const apiKeys = await this.delivery.listActiveApiKeys();
    await Promise.allSettled(apiKeys.map((key) => this.pollKey(key)));
  }

  forgetApiKey(id: number): void {
    this.errorLogged.delete(id);
  }

  private async pollKey(apiKey: { id: number; token: string }): Promise<void> {
    if (this.inFlight.has(apiKey.id)) {
      return;
    }
    this.inFlight.add(apiKey.id);
    try {
      const items = await fetchRecentTraffic(apiKey.token, trafficWindowSize);
      if (!this.reconciled.has(apiKey.id)) {
        await this.reconcile(apiKey.id, items);
        this.reconciled.add(apiKey.id);
      }
      await this.deliver(apiKey.id, items);
      this.errorLogged.delete(apiKey.id);
    } catch (error) {
      this.report(apiKey.id, error);
    } finally {
      this.inFlight.delete(apiKey.id);
    }
  }

  // Rows written by older builds carry a fingerprint from a previous algorithm, so a
  // restart would treat the whole window as new and resend it. Mark events that are
  // already recorded as delivered before the first delivery after a restart.
  private async reconcile(apiKeyId: number, items: TrafficItem[]): Promise<void> {
    const logged = await listLoggedEvents(apiKeyId);
    if (logged.size === 0) {
      return;
    }
    const occurrences = new Map<string, number>();
    for (const item of [...items].reverse()) {
      const receivedAt = new Date(item.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        continue;
      }
      const id = nextFingerprint(occurrences, item);
      if (!logged.has(eventKey(item.number, item.senderId, receivedAt))) {
        continue;
      }
      await claimOtpLog(apiKeyId, id, item.number, item.senderId, item.rangeName, receivedAt);
    }
  }

  private async deliver(apiKeyId: number, items: TrafficItem[]): Promise<void> {
    const targets = (await this.delivery.listTargets()).filter((target) => target.isActive);
    if (targets.length === 0) {
      return;
    }
    const numberButtons = await this.delivery.numberButtons();

    // The API returns newest-first. Any item we have not delivered yet must be sent,
    // even when it sits *below* an item seen on an earlier poll (polling is not
    // instantaneous, so a message can appear late in the list). Send oldest-first so
    // the channel still reads chronologically.
    const oldestFirst = [...items].reverse();
    const occurrences = new Map<string, number>();

    for (const item of oldestFirst) {
      const receivedAt = new Date(item.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        continue;
      }
      const id = nextFingerprint(occurrences, item);

      const isNew = await claimOtpLog(
        apiKeyId,
        id,
        item.number,
        item.senderId,
        item.rangeName,
        receivedAt,
      );
      if (isNew) {
        const rendered = formatLogMessage(
          {
            receivedAt,
            senderId: item.senderId,
            rangeName: item.rangeName,
            number: item.number,
            sms: item.sms,
          },
          numberButtons,
        );
        const message: OutgoingMessage = {
          markdownV2: rendered.markdownV2,
          legacyMarkdown: rendered.legacyMarkdown,
          replyMarkup: rendered.replyMarkup,
        };
        await this.fanOut(targets, message);
      }
    }
  }

  private async fanOut(
    targets: Awaited<ReturnType<LogDelivery["listTargets"]>>,
    message: OutgoingMessage,
  ): Promise<void> {
    const results = await Promise.allSettled(
      targets.map((target) => this.delivery.send(target, message)),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const target = targets[index];
        console.error(
          `[poller] send to ${target?.chatId}/${target?.threadId ?? "general"} failed: ${String(result.reason)}`,
        );
      }
    });
  }

  private report(apiKeyId: number, error: unknown): void {
    if (this.errorLogged.has(apiKeyId)) {
      return;
    }
    this.errorLogged.add(apiKeyId);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[poller] api key #${apiKeyId} failed: ${message}`);
  }
}
