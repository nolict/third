import { createHash } from "node:crypto";

import { pollIntervalMs } from "../config/env.ts";
import { claimOtpLog } from "../db/otpLogs.ts";
import { formatLogMessage } from "../domain/logMessage.ts";
import { fetchRecentTraffic, type TrafficItem } from "./thirdwave.ts";
import type { LogDelivery, OutgoingMessage } from "../bot/telegram.ts";

const maxTrackedApiKeys = 50;

function fingerprint(item: TrafficItem): string {
  return createHash("sha256")
    .update([item.receivedAt, item.number, item.senderId, item.sms].join("\u0000"))
    .digest("hex");
}

export class OtpPoller {
  private readonly inFlight = new Set<number>();
  private readonly lastSeen = new Map<number, string>();
  private readonly errorLogged = new Set<number>();
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
    this.lastSeen.delete(id);
    this.errorLogged.delete(id);
  }

  private async pollKey(apiKey: { id: number; token: string }): Promise<void> {
    if (this.inFlight.has(apiKey.id)) {
      return;
    }
    this.inFlight.add(apiKey.id);
    try {
      const items = await fetchRecentTraffic(apiKey.token, maxTrackedApiKeys);
      await this.deliver(apiKey.id, items);
      this.errorLogged.delete(apiKey.id);
    } catch (error) {
      this.report(apiKey.id, error);
    } finally {
      this.inFlight.delete(apiKey.id);
    }
  }

  private async deliver(apiKeyId: number, items: TrafficItem[]): Promise<void> {
    const targets = (await this.delivery.listTargets()).filter((target) => target.isActive);
    if (targets.length === 0) {
      return;
    }
    const numberButtons = await this.delivery.numberButtons();

    for (const item of items) {
      const id = fingerprint(item);
      if (this.lastSeen.get(apiKeyId) === id) {
        break;
      }
      const receivedAt = new Date(item.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        continue;
      }
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
      this.lastSeen.set(apiKeyId, id);
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
