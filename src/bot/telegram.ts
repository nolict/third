import type { Bot } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";

import { listApiKeys } from "../db/apiKeys.ts";
import { listChannels, listNumberChannels, type ChannelRecord } from "../db/channels.ts";
import { targetUrl } from "../domain/channelLink.ts";
import type { NumberButton } from "../domain/logMessage.ts";

export interface DeliveryMessage {
  markdownV2: string;
  legacyMarkdown: string;
}

export interface OutgoingMessage extends DeliveryMessage {
  replyMarkup: { inline_keyboard: InlineKeyboardButton[][] };
}

export type LogTarget = Pick<ChannelRecord, "chatId" | "threadId">;

export interface LogDelivery {
  listTargets(): Promise<ChannelRecord[]>;
  numberButtons(): Promise<NumberButton[]>;
  send(target: LogTarget, message: OutgoingMessage): Promise<void>;
  listActiveApiKeys(): Promise<{ id: number; token: string }[]>;
}

export function createDelivery(bot: Bot): LogDelivery {
  async function send(target: LogTarget, message: OutgoingMessage): Promise<void> {
    const base = {
      reply_markup: message.replyMarkup,
      link_preview_options: { is_disabled: true },
      ...(target.threadId === null ? {} : { message_thread_id: target.threadId }),
    };
    try {
      await bot.api.sendMessage(target.chatId, message.markdownV2, {
        ...base,
        parse_mode: "MarkdownV2",
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("can't parse entities")) {
        throw error;
      }
      await bot.api.sendMessage(target.chatId, message.legacyMarkdown, {
        ...base,
        parse_mode: "Markdown",
      });
    }
  }

  return {
    listTargets: () => listChannels("log"),
    async numberButtons() {
      return (await listNumberChannels()).map((channel) => ({
        label: channel.label,
        url: channel.linkUrl || targetUrl(channel.chatId, channel.threadId),
      }));
    },
    send,
    listActiveApiKeys: async () => (await listApiKeys()).map(({ id, token }) => ({ id, token })),
  };
}
