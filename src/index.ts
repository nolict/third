import { Bot } from "grammy";

import { AdminPanel } from "./admin/panels.ts";
import { createDelivery } from "./bot/telegram.ts";
import { config } from "./config/env.ts";
import { pool } from "./db/pool.ts";
import { ensureSchema } from "./db/schema.ts";
import { OtpPoller } from "./services/poller.ts";

await ensureSchema();

const bot = new Bot(config.botToken);
const delivery = createDelivery(bot);
const poller = new OtpPoller(delivery);
const panel = new AdminPanel({
  bot,
  delivery,
  forgetApiKey: (id) => poller.forgetApiKey(id),
});

panel.register();

bot.catch((error) => {
  console.error(`[bot] update ${error.ctx.update.update_id} failed:`, error.error);
});

bot.start({
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} is running.`);
    poller.start();
  },
});

async function shutdown(signal: string): Promise<void> {
  poller.stop();
  await bot.stop();
  await pool.end();
  console.log(`Stopped (${signal}).`);
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
