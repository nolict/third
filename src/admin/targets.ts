import type { Api } from "grammy";
import type { ChatFullInfo } from "grammy/types";

export type TargetCheck = { ok: true; chat: ChatFullInfo } | { ok: false; reason: string };

export async function checkLogTarget(api: Api, botUserId: number, chatId: string): Promise<TargetCheck> {
  let chat: ChatFullInfo;
  try {
    chat = await api.getChat(chatId);
  } catch {
    return { ok: false, reason: "Chat tidak ditemukan. Tambahkan bot ke chat terlebih dahulu." };
  }

  if (chat.type !== "channel" && chat.type !== "supergroup") {
    return { ok: false, reason: "Chat tujuan harus channel atau supergroup berforum." };
  }

  let member: Awaited<ReturnType<Api["getChatMember"]>>;
  try {
    member = await api.getChatMember(chat.id, botUserId);
  } catch {
    return { ok: false, reason: "Bot belum menjadi admin chat ini." };
  }

  // Telegram omits can_post_messages for supergroup admins and in some versions for
  // channels, so only an explicit `false` counts as "no permission".
  const canPost =
    member.status === "creator" ||
    (member.status === "administrator" && member.can_post_messages !== false);
  if (!canPost) {
    return { ok: false, reason: "Bot belum admin chat ini atau tanpa izin kirim pesan." };
  }

  return { ok: true, chat };
}

export async function checkTopic(api: Api, chat: ChatFullInfo, threadId: number): Promise<string | undefined> {
  if (chat.type !== "supergroup" || chat.is_forum !== true) {
    return "Chat tersebut bukan forum/topic, jadi topic ID tidak bisa dipakai.";
  }
  try {
    await api.sendChatAction(chat.id, "typing", { message_thread_id: threadId });
    return undefined;
  } catch {
    return `Topic ${threadId} tidak ditemukan. Pastikan link topic benar dan bot admin.`;
  }
}
