export interface ChannelLink {
  chatId: string;
  threadId: number | null;
  url: string;
}

export type ChannelLinkResult =
  | { ok: true; link: ChannelLink }
  | { ok: false; reason: string };

const topicLinkPattern = /^https?:\/\/t\.me\/c\/(\d+)\/(\d+)\/?$/i;
const usernameLinkPattern = /^https?:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{3,})\/?$/i;
const usernamePattern = /^@[A-Za-z][A-Za-z0-9_]{3,}$/;
const numericPattern = /^-?\d+$/;

export function parseChannelLink(input: string): ChannelLinkResult {
  const value = input.trim();

  const topic = topicLinkPattern.exec(value);
  if (topic) {
    const chatId = `-100${topic[1]}`;
    const threadId = Number(topic[2]);
    if (threadId > 0) {
      return { ok: true, link: { chatId, threadId, url: targetUrl(chatId, threadId) } };
    }
  }

  if (value.startsWith("https://t.me/c/") || value.startsWith("http://t.me/c/")) {
    return { ok: false, reason: "Link topik harus berformat https://t.me/c/<id>/<topic_id>." };
  }

  const usernameLink = usernameLinkPattern.exec(value);
  if (usernameLink) {
    const username = `@${usernameLink[1]}`;
    return { ok: true, link: { chatId: username, threadId: null, url: targetUrl(username, null) } };
  }

  if (usernamePattern.test(value)) {
    return { ok: true, link: { chatId: value, threadId: null, url: targetUrl(value, null) } };
  }

  if (numericPattern.test(value)) {
    return { ok: true, link: { chatId: value, threadId: null, url: targetUrl(value, null) } };
  }

  return { ok: false, reason: "Format tidak dikenali. Kirim @username, -100…, atau link topik." };
}

export function targetUrl(chatId: string, threadId: number | null): string {
  if (chatId.startsWith("@")) {
    return `https://t.me/${chatId.slice(1)}`;
  }
  if (chatId.startsWith("-100")) {
    const bare = chatId.slice(4);
    return threadId === null ? `https://t.me/c/${bare}` : `https://t.me/c/${bare}/${threadId}`;
  }
  return "https://t.me";
}
