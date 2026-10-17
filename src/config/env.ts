function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

const adminIds = requireEnv("ADMIN_IDS")
  .split(",")
  .map((raw) => raw.trim())
  .filter((raw) => raw.length > 0)
  .map((raw) => {
    if (!/^\d+$/.test(raw)) {
      throw new Error(`ADMIN_IDS contains a non-numeric id: ${raw}`);
    }
    return Number(raw);
  });

if (adminIds.length === 0) {
  throw new Error("ADMIN_IDS must contain at least one Telegram user id");
}

export const config = {
  botToken: requireEnv("BOT_TOKEN"),
  databaseUrl: requireEnv("DATABASE_URL"),
  adminIds: new Set(adminIds),
} as const;

export const pollIntervalMs = 5_000;
export const apiTimeoutMs = 15_000;
export const pageSize = 5;
