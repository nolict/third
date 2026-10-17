import type { PoolClient } from "pg";

import { pool, query, transaction } from "./pool.ts";

export type ChannelKind = "log" | "number";

export interface ChannelRecord {
  id: number;
  chatId: string;
  threadId: number | null;
  title: string;
  isActive: boolean;
}

export interface NumberChannelRecord extends ChannelRecord {
  label: string;
  position: number;
  linkUrl: string;
}

interface ChannelRow {
  id: string;
  chat_id: string;
  thread_id: string | null;
  title: string;
  is_active: boolean;
  label: string;
  position: string;
  link_url: string;
}

export const maxNumberChannels = 2;

const tableFor: Record<ChannelKind, string> = {
  log: "log_channels",
  number: "number_channels",
};

function toChannel(row: ChannelRow): ChannelRecord {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    threadId: row.thread_id === null ? null : Number(row.thread_id),
    title: row.title,
    isActive: row.is_active,
  };
}

function toNumberChannel(row: ChannelRow): NumberChannelRecord {
  return { ...toChannel(row), label: row.label, position: Number(row.position), linkUrl: row.link_url };
}

const logColumns = `id, chat_id, thread_id, title, is_active`;
const numberColumns = `${logColumns}, label, position, link_url`;

function columnsFor(kind: ChannelKind): string {
  return kind === "number" ? numberColumns : logColumns;
}

export async function listChannels(kind: ChannelKind): Promise<ChannelRecord[]> {
  const rows = await query<ChannelRow>(
    `SELECT ${columnsFor(kind)} FROM ${tableFor[kind]} ORDER BY created_at ASC`,
  );
  return rows.map(toChannel);
}

export async function listNumberChannels(): Promise<NumberChannelRecord[]> {
  const rows = await query<ChannelRow>(
    `SELECT ${numberColumns} FROM number_channels ORDER BY position ASC`,
  );
  return rows.map(toNumberChannel);
}

export async function findChannel(kind: ChannelKind, id: number): Promise<ChannelRecord | undefined> {
  const rows = await query<ChannelRow>(
    `SELECT ${columnsFor(kind)} FROM ${tableFor[kind]} WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? toChannel(row) : undefined;
}

export async function findNumberChannel(id: number): Promise<NumberChannelRecord | undefined> {
  const rows = await query<ChannelRow>(
    `SELECT ${numberColumns} FROM number_channels WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? toNumberChannel(row) : undefined;
}

function assertTargetIsNew(rows: { id: string }[]): void {
  if (rows.length > 0) {
    throw new Error("Channel tersebut sudah terdaftar");
  }
}

export async function addChannel(
  kind: ChannelKind,
  chatId: string,
  threadId: number | null,
  title: string,
): Promise<ChannelRecord> {
  const table = tableFor[kind];
  return transaction(async (client: PoolClient) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE chat_id = $1 AND thread_id IS NOT DISTINCT FROM $2`,
      [chatId, threadId],
    );
    assertTargetIsNew(existing.rows);
    const { rows } = await client.query<ChannelRow>(
      `INSERT INTO ${table} (chat_id, thread_id, title) VALUES ($1, $2, $3)
       RETURNING ${columnsFor(kind)}`,
      [chatId, threadId, title],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Gagal menyimpan channel");
    }
    return toChannel(row);
  });
}

export async function addNumberChannel(
  chatId: string,
  threadId: number | null,
  title: string,
  label: string,
  linkUrl: string,
): Promise<NumberChannelRecord> {
  return transaction(async (client: PoolClient) => {
    const taken = await client.query<{ id: string }>(`SELECT id FROM number_channels FOR UPDATE`);
    if (taken.rows.length >= maxNumberChannels) {
      throw new Error(`Maksimal ${maxNumberChannels} channel Numbers`);
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM number_channels WHERE chat_id = $1 AND thread_id IS NOT DISTINCT FROM $2`,
      [chatId, threadId],
    );
    assertTargetIsNew(existing.rows);
    const { rows } = await client.query<ChannelRow>(
      `INSERT INTO number_channels (chat_id, thread_id, title, label, position, link_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${numberColumns}`,
      [chatId, threadId, title, label, taken.rows.length, linkUrl],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Gagal menyimpan channel");
    }
    return toNumberChannel(row);
  });
}

export async function setChannelActive(
  kind: ChannelKind,
  id: number,
  isActive: boolean,
): Promise<boolean> {
  if (kind === "number") {
    throw new Error("Channel tombol tidak punya status aktif");
  }
  const rows = await query<{ id: string }>(
    `UPDATE ${tableFor[kind]} SET is_active = $2 WHERE id = $1 RETURNING id`,
    [id, isActive],
  );
  return rows.length === 1;
}

export async function swapNumberChannelPositions(): Promise<void> {
  await transaction(async (client: PoolClient) => {
    const { rows } = await client.query<{ id: string; position: string }>(
      `SELECT id, position FROM number_channels ORDER BY position ASC`,
    );
    for (const [index, row] of rows.entries()) {
      const position = rows.length - 1 - index;
      await client.query(`UPDATE number_channels SET position = $2 WHERE id = $1`, [row.id, position]);
    }
  });
}

export async function removeChannel(kind: ChannelKind, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM ${tableFor[kind]} WHERE id = $1`, [id]);
  return rowCount === 1;
}
