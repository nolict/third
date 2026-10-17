import type { Context } from "grammy";
import type { InlineKeyboard } from "grammy";

export async function renderPanel(ctx: Context, text: string, keyboard: InlineKeyboard): Promise<void> {
  const message = ctx.callbackQuery?.message;
  if (!message || !ctx.chat) {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
    return;
  }
  try {
    await ctx.api.editMessageText(ctx.chat.id, message.message_id, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    if (!isMessageNotModified(error)) {
      throw error;
    }
  }
}

export async function answerCallback(ctx: Context, text: string): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text });
  }
}

function isMessageNotModified(error: unknown): boolean {
  return error instanceof Error && error.message.includes("message is not modified");
}
