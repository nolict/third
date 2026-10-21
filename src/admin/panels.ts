import type { Bot, Context } from "grammy";
import type { ChatFullInfo } from "grammy/types";

import { config, pageSize } from "../config/env.ts";
import { createApiKey, deleteApiKey, findApiKeyById, listApiKeys } from "../db/apiKeys.ts";
import {
  addChannel,
  addNumberChannel,
  findChannel,
  findNumberChannel,
  listChannels,
  listNumberChannels,
  maxNumberChannels,
  removeChannel,
  setChannelActive,
  swapNumberChannelPositions,
  type ChannelKind,
} from "../db/channels.ts";
import { transaction } from "../db/pool.ts";
import { parseChannelLink } from "../domain/channelLink.ts";
import { formatLogMessage, type NumberButton } from "../domain/logMessage.ts";
import { escapeHtml, truncate } from "../lib/format.ts";
import { verifyApiKey } from "../services/thirdwave.ts";
import type { LogDelivery, OutgoingMessage } from "../bot/telegram.ts";
import {
  adminReplyKeyboard,
  cancelKeyboard,
  channelDetailKeyboard,
  channelsKeyboard,
  confirmDeleteChannelKeyboard,
  confirmDeleteKeyboard,
  homeKeyboard,
  isMenuButton,
  keyDetailKeyboard,
  keysKeyboard,
  menu,
} from "./keyboards.ts";
import { answerCallback, renderPanel } from "./render.ts";
import { checkLogTarget, checkTopic } from "./targets.ts";
import {
  channelPromptView,
  channelView,
  channelsView,
  homeView,
  keyLabelPromptView,
  keysView,
  keyPromptView,
  keyView,
  labelPromptView,
} from "./views.ts";

const maxLabelLength = 32;
const maxKeys = 100;

interface AdminSession {
  screen: ChannelKind | "keys" | "keyLabel" | "label";
  pendingNumber?: { chatId: string; threadId: number | null; title: string; url: string };
  pendingToken?: string;
}

interface AdminDeps {
  bot: Bot;
  delivery: LogDelivery;
  forgetApiKey(id: number): void;
}

const thirdwaveErrors: Record<string, string> = {
  "401": "API key ditolak oleh thirdwave (401).",
  "403": "Akses API tidak aktif untuk akun ini (403).",
  "429": "Rate limit thirdwave tercapai (429).",
  "503": "Thirdwave sedang tidak tersedia (503).",
};

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const coded = Object.entries(thirdwaveErrors).find(([status]) =>
    error.message.includes(`(${status})`),
  );
  return coded ? coded[1] : truncate(error.message, 180);
}

function parseId(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : undefined;
}

function isChannelKind(value: string | undefined): value is ChannelKind {
  return value === "log" || value === "number";
}

function adminId(ctx: Context): number | undefined {
  return ctx.chat?.type === "private" && ctx.from !== undefined && config.adminIds.has(ctx.from.id)
    ? ctx.from.id
    : undefined;
}

function channelTitle(chat: ChatFullInfo): string {
  return chat.title ?? chat.username ?? String(chat.id);
}

function testMessage(numberButtons: NumberButton[]): OutgoingMessage {
  const rendered = formatLogMessage(
    {
      receivedAt: new Date(),
      senderId: "WhatsApp",
      rangeName: "Indonesia Telkomsel",
      number: "6281255512345",
      sms: "Kode verifikasi Anda adalah 123456. Jangan dibagikan.",
    },
    numberButtons,
  );
  return {
    markdownV2: rendered.markdownV2,
    legacyMarkdown: rendered.legacyMarkdown,
    replyMarkup: rendered.replyMarkup,
  };
}

export class AdminPanel {
  private readonly sessions = new Map<number, AdminSession>();

  constructor(private readonly deps: AdminDeps) {}

  register(): void {
    const { bot } = this.deps;
    bot.command("start", (ctx) => this.openPanel(ctx));
    bot.command("admin", (ctx) => this.openPanel(ctx));
    bot.command("cancel", (ctx) => this.cancel(ctx));
    bot.on("callback_query:data", (ctx) => this.onCallback(ctx, ctx.callbackQuery.data));
    bot.on("message:text", (ctx) => this.onText(ctx, ctx.message.text));
  }

  private async openPanel(ctx: Context): Promise<void> {
    const userId = adminId(ctx);
    if (userId === undefined) {
      return;
    }
    this.sessions.delete(userId);
    const { keys, log, number } = await this.counts();
    await ctx.reply(homeView(config.adminIds.size, keys, log, number), {
      parse_mode: "HTML",
      reply_markup: adminReplyKeyboard,
      link_preview_options: { is_disabled: true },
    });
  }

  private async cancel(ctx: Context): Promise<void> {
    const userId = adminId(ctx);
    if (userId === undefined) {
      return;
    }
    const session = this.sessions.get(userId);
    this.sessions.delete(userId);
    const screen = session?.screen ?? "home";
    await this.openScreen(
      ctx,
      screen === "label" ? "number" : screen === "keyLabel" ? "keys" : screen,
    );
  }

  private async openScreen(ctx: Context, screen: "home" | "keys" | ChannelKind): Promise<void> {
    if (screen === "keys") {
      await this.showKeys(ctx, 0);
    } else if (screen === "log" || screen === "number") {
      await this.showChannels(ctx, screen);
    } else {
      await this.showHome(ctx);
    }
  }

  private async counts(): Promise<{ keys: number; log: number; number: number }> {
    const [keys, log, numbers] = await Promise.all([
      listApiKeys(),
      listChannels("log"),
      listChannels("number"),
    ]);
    return { keys: keys.length, log: log.length, number: numbers.length };
  }

  private async showHome(ctx: Context): Promise<void> {
    const { keys, log, number } = await this.counts();
    await renderPanel(ctx, homeView(config.adminIds.size, keys, log, number), homeKeyboard());
  }

  private async showChannels(ctx: Context, kind: ChannelKind): Promise<void> {
    const channels = kind === "number" ? await listNumberChannels() : await listChannels(kind);
    await renderPanel(ctx, channelsView(kind, channels), channelsKeyboard(kind, channels));
  }

  private async showChannel(ctx: Context, kind: ChannelKind, id: number): Promise<void> {
    if (kind === "number") {
      const [channel, channels] = await Promise.all([findNumberChannel(id), listNumberChannels()]);
      if (!channel) {
        await this.showChannels(ctx, kind);
        return;
      }
      await renderPanel(
        ctx,
        channelView(kind, channel, channels.findIndex((row) => row.id === id)),
        channelDetailKeyboard(kind, channel),
      );
      return;
    }
    const channel = await findChannel(kind, id);
    if (!channel) {
      await this.showChannels(ctx, kind);
      return;
    }
    await renderPanel(ctx, channelView(kind, channel), channelDetailKeyboard(kind, channel));
  }

  private async showKeys(ctx: Context, page: number): Promise<void> {
    const keys = await listApiKeys();
    const pageCount = Math.max(1, Math.ceil(keys.length / pageSize));
    const safePage = Math.min(Math.max(page, 0), pageCount - 1);
    await renderPanel(ctx, keysView(keys.length, safePage, pageCount), keysKeyboard(keys, safePage));
  }

  private async showKey(ctx: Context, id: number): Promise<void> {
    const key = await findApiKeyById(id);
    if (!key) {
      await this.showKeys(ctx, 0);
      return;
    }
    await renderPanel(ctx, keyView(key), keyDetailKeyboard(key.id));
  }

  private async onCallback(ctx: Context, data: string): Promise<void> {
    if (adminId(ctx) === undefined) {
      await ctx.answerCallbackQuery({ text: "Akses ditolak" });
      return;
    }
    await ctx.answerCallbackQuery();
    const [kind, action, rawId, confirm] = data.split(":");
    try {
      if (kind === "m") {
        await this.onMenu(ctx, action);
      } else if (kind === "k") {
        await this.onKeyAction(ctx, action, parseId(rawId), confirm);
      } else if (isChannelKind(kind)) {
        await this.onChannelAction(ctx, kind, action, parseId(rawId), confirm);
      }
    } catch (error) {
      console.error(`[admin] callback ${data} failed: ${String(error)}`);
      await answerCallback(ctx, errorMessage(error));
    }
  }

  private async onMenu(ctx: Context, action: string | undefined): Promise<void> {
    if (action === "keys" || action === "log" || action === "number") {
      await this.openScreen(ctx, action);
    } else if (action === "close") {
      await renderPanel(ctx, "Panel ditutup. Ketik /start untuk membuka lagi.", homeKeyboard());
    } else {
      await this.showHome(ctx);
    }
  }

  private async onKeyAction(
    ctx: Context,
    action: string | undefined,
    id: number | undefined,
    confirm: string | undefined,
  ): Promise<void> {
    if (action === "add") {
      await this.promptForApiKey(ctx);
      return;
    }
    if (action === "noop") {
      return;
    }
    if (action === "page") {
      await this.showKeys(ctx, id ?? 0);
      return;
    }
    if (id === undefined) {
      return;
    }
    if (action === "view") {
      await this.showKey(ctx, id);
    } else if (action === "delete") {
      await this.deleteKey(ctx, id, confirm === "yes");
    }
  }

  private async onChannelAction(
    ctx: Context,
    kind: ChannelKind,
    action: string | undefined,
    id: number | undefined,
    confirm: string | undefined,
  ): Promise<void> {
    if (action === "add") {
      await this.promptChannel(ctx, kind);
      return;
    }
    if (action === "swap") {
      await swapNumberChannelPositions();
      await this.showChannels(ctx, kind);
      return;
    }
    if (action === "test") {
      await this.sendTest(ctx, kind);
      return;
    }
    if (action === "preview") {
      await this.previewButtons(ctx);
      return;
    }
    if (id === undefined) {
      return;
    }
    if (action === "view") {
      await this.showChannel(ctx, kind, id);
    } else if (action === "toggle") {
      if (kind === "number") {
        await answerCallback(ctx, "Channel tombol selalu aktif");
        return;
      }
      const channel = await findChannel(kind, id);
      if (!channel) {
        await answerCallback(ctx, "Channel tidak ditemukan");
        await this.showChannels(ctx, kind);
        return;
      }
      await setChannelActive(kind, id, !channel.isActive);
      await this.showChannel(ctx, kind, id);
    } else if (action === "delete") {
      await this.deleteChannel(ctx, kind, id, confirm === "yes");
    }
  }

  private async promptForApiKey(ctx: Context): Promise<void> {
    const userId = adminId(ctx);
    if (userId === undefined) {
      return;
    }
    this.sessions.set(userId, { screen: "keys" });
    await renderPanel(ctx, keyPromptView(), cancelKeyboard("keys"));
  }

  private async promptKeyLabel(ctx: Context): Promise<void> {
    const userId = adminId(ctx);
    if (userId === undefined) {
      return;
    }
    const session = this.sessions.get(userId);
    const pendingToken = session?.pendingToken;
    this.sessions.set(
      userId,
      pendingToken === undefined ? { screen: "keyLabel" } : { screen: "keyLabel", pendingToken },
    );
    await renderPanel(ctx, keyLabelPromptView(), cancelKeyboard("keys"));
  }

  private async promptChannel(ctx: Context, kind: ChannelKind): Promise<void> {
    const userId = adminId(ctx);
    if (userId === undefined) {
      return;
    }
    if (kind === "number" && (await listNumberChannels()).length >= maxNumberChannels) {
      await answerCallback(ctx, `Maksimal ${maxNumberChannels} channel Numbers`);
      return;
    }
    this.sessions.set(userId, { screen: kind });
    await renderPanel(ctx, channelPromptView(kind), cancelKeyboard(kind));
  }

  private async promptNumberLabel(ctx: Context, pending: AdminSession["pendingNumber"]): Promise<void> {
    const userId = adminId(ctx);
    if (userId === undefined || pending === undefined) {
      return;
    }
    this.sessions.set(userId, { screen: "label", pendingNumber: pending });
    await renderPanel(ctx, labelPromptView(pending.title), cancelKeyboard("number"));
  }

  private async deleteKey(ctx: Context, id: number, confirmed: boolean): Promise<void> {
    const key = await findApiKeyById(id);
    if (!key) {
      await this.showKeys(ctx, 0);
      return;
    }
    if (!confirmed) {
      await renderPanel(
        ctx,
        `<b>Hapus key?</b>\n\n${escapeHtml(key.label)}\n\nDatabase menolak menghapus jika key masih memiliki riwayat log.`,
        confirmDeleteKeyboard(id),
      );
      return;
    }
    const deleted = await transaction((client) => deleteApiKey(client, id));
    if (deleted) {
      this.deps.forgetApiKey(id);
    } else {
      await answerCallback(ctx, "Key masih memiliki riwayat log, tidak dihapus");
    }
    await this.showKeys(ctx, 0);
  }

  private async deleteChannel(
    ctx: Context,
    kind: ChannelKind,
    id: number,
    confirmed: boolean,
  ): Promise<void> {
    const channel = await findChannel(kind, id);
    if (!channel) {
      await this.showChannels(ctx, kind);
      return;
    }
    if (!confirmed) {
      await renderPanel(
        ctx,
        `<b>Hapus channel?</b>\n\n${escapeHtml(channel.title)}\n${escapeHtml(channel.chatId)}`,
        confirmDeleteChannelKeyboard(kind, id),
      );
      return;
    }
    await removeChannel(kind, id);
    await this.showChannels(ctx, kind);
  }

  private async sendTest(ctx: Context, kind: ChannelKind): Promise<void> {
    const active = (await listChannels(kind)).filter((channel) => channel.isActive);
    if (active.length === 0 || !ctx.chat) {
      return;
    }
    const message = testMessage(await this.deps.delivery.numberButtons());

    const results = await Promise.allSettled(
      active.map((target) => this.deps.delivery.send(target, message)),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    const failedDetails = results
      .map((result, i) =>
        result.status === "rejected"
          ? `• ${active[i]?.title ?? active[i]?.chatId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
          : null,
      )
      .filter((line): line is string => line !== null);

    const statusLine =
      failed === 0
        ? `✅ Test terkirim ke ${active.length} channel`
        : `❌ Gagal di ${failed} dari ${active.length} channel`;

    const text = failedDetails.length > 0 ? `${statusLine}\n\n${failedDetails.join("\n")}` : statusLine;
    await ctx.api.sendMessage(ctx.chat.id, text);
  }

  private async previewButtons(ctx: Context): Promise<void> {
    if (!ctx.chat) {
      return;
    }
    const numbers = await this.deps.delivery.numberButtons();
    if (numbers.length === 0) {
      await ctx.api.sendMessage(ctx.chat.id, "Belum ada channel, tombol tidak tampil");
      return;
    }
    const lines = numbers.map((number, index) => `${index + 1}. ${number.label} → ${number.url}`);
    await ctx.api.sendMessage(ctx.chat.id, `Tombol OTP:\n${lines.join("\n")}`);
  }

  private async onText(ctx: Context, text: string): Promise<void> {
    const userId = adminId(ctx);
    if (userId === undefined) {
      return;
    }
    if (isMenuButton(text)) {
      this.sessions.delete(userId);
      if (text === menu.apiKeys) {
        await this.showKeys(ctx, 0);
      } else if (text === menu.logChannels) {
        await this.showChannels(ctx, "log");
      } else if (text === menu.numbers) {
        await this.showChannels(ctx, "number");
      } else {
        await this.showHome(ctx);
      }
      return;
    }
    const session = this.sessions.get(userId);
    if (!session) {
      return;
    }
    if (session.screen === "keys") {
      await this.submitApiKey(ctx, userId, text);
    } else if (session.screen === "keyLabel") {
      await this.submitKeyLabel(ctx, userId, session.pendingToken ?? "", text);
    } else if (session.screen === "label") {
      await this.submitNumberLabel(ctx, userId, session.pendingNumber, text);
    } else {
      await this.submitChannel(ctx, userId, session.screen, text);
    }
  }

  private async submitApiKey(ctx: Context, userId: number, text: string): Promise<void> {
    const token = text.trim();
    if (token.length === 0 || /\s/.test(token)) {
      await ctx.reply("API key tidak valid. Kirim satu token tanpa spasi.");
      return;
    }
    if ((await listApiKeys()).length >= maxKeys) {
      await ctx.reply(`Maksimal ${maxKeys} key.`);
      return;
    }
    const check = await verifyApiKey(token);
    if (!check.ok) {
      await ctx.reply(check.reason);
      return;
    }
    this.sessions.set(userId, { screen: "keyLabel", pendingToken: token });
    await this.promptKeyLabel(ctx);
  }

  private async submitKeyLabel(ctx: Context, userId: number, token: string, text: string): Promise<void> {
    const label = text.trim();
    if (label.length === 0 || label.length > maxLabelLength) {
      await ctx.reply(`Label harus 1-${maxLabelLength} karakter.`);
      return;
    }
    try {
      const key = await transaction((client) => createApiKey(client, label, token));
      this.sessions.delete(userId);
      await this.showKey(ctx, key.id);
    } catch (error) {
      await ctx.reply(errorMessage(error));
    }
  }

  private async submitChannel(
    ctx: Context,
    userId: number,
    kind: ChannelKind,
    text: string,
  ): Promise<void> {
    const target = await this.resolveTarget(ctx, text);
    if (target === undefined) {
      return;
    }
    if (kind === "number") {
      await this.promptNumberLabel(ctx, target);
      return;
    }
    try {
      await addChannel(kind, target.chatId, target.threadId, target.title);
    } catch (error) {
      await ctx.reply(errorMessage(error));
      return;
    }
    this.sessions.delete(userId);
    await this.showChannels(ctx, kind);
  }

  private async submitNumberLabel(
    ctx: Context,
    userId: number,
    pending: AdminSession["pendingNumber"],
    text: string,
  ): Promise<void> {
    if (pending === undefined) {
      this.sessions.delete(userId);
      await this.showChannels(ctx, "number");
      return;
    }
    const label = text.trim();
    if (label.length === 0 || label.length > maxLabelLength) {
      await ctx.reply(`Label harus 1-${maxLabelLength} karakter.`);
      return;
    }
    try {
      await addNumberChannel(pending.chatId, pending.threadId, pending.title, label, pending.url);
    } catch (error) {
      await ctx.reply(errorMessage(error));
      return;
    }
    this.sessions.delete(userId);
    await this.showChannels(ctx, "number");
  }

  private async resolveTarget(
    ctx: Context,
    text: string,
  ): Promise<{ chatId: string; threadId: number | null; title: string; url: string } | undefined> {
    const parsed = parseChannelLink(text);
    if (!parsed.ok) {
      await ctx.reply(parsed.reason);
      return undefined;
    }
    const target = await checkLogTarget(this.deps.bot.api, this.deps.bot.botInfo.id, parsed.link.chatId);
    if (!target.ok) {
      await ctx.reply(target.reason);
      return undefined;
    }
    const chat = target.chat;
    if (parsed.link.threadId !== null) {
      const topicError = await checkTopic(this.deps.bot.api, chat, parsed.link.threadId);
      if (topicError !== undefined) {
        await ctx.reply(topicError);
        return undefined;
      }
    }
    return {
      chatId: chat.id.toString(),
      threadId: parsed.link.threadId,
      title: channelTitle(chat),
      url: parsed.link.url,
    };
  }
}
