import { readFileSync } from "node:fs";

import { pool } from "./pool.ts";

const schema = readFileSync(new URL("../../sql/schema.sql", import.meta.url), "utf8");

export async function ensureSchema(): Promise<void> {
  try {
    await pool.query(schema);
  } catch (error) {
    throw new Error(`Schema migration failed, refusing to start: ${String(error)}`);
  }
  console.log("[db] schema ready");
}
