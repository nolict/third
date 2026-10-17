import type { PoolClient } from "pg";

import { query } from "./pool.ts";

export interface ApiKeyRecord {
  id: number;
  label: string;
  token: string;
  createdAt: Date;
}

interface ApiKeyRow {
  id: string;
  label: string;
  token: string;
  created_at: Date;
}

function toApiKey(row: ApiKeyRow): ApiKeyRecord {
  return { id: Number(row.id), label: row.label, token: row.token, createdAt: row.created_at };
}

const columns = `id, label, token, created_at`;

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const rows = await query<ApiKeyRow>(
    `SELECT ${columns} FROM api_keys ORDER BY created_at DESC`,
  );
  return rows.map(toApiKey);
}

export async function createApiKey(
  client: PoolClient,
  label: string,
  token: string,
): Promise<ApiKeyRecord> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM api_keys WHERE token = $1`,
    [token],
  );
  if (existing.rows.length > 0) {
    throw new Error("API key tersebut sudah terdaftar");
  }
  const { rows } = await client.query<ApiKeyRow>(
    `INSERT INTO api_keys (label, token) VALUES ($1, $2) RETURNING ${columns}`,
    [label, token],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Gagal menyimpan API key");
  }
  return toApiKey(row);
}

export async function deleteApiKey(client: PoolClient, id: number): Promise<boolean> {
  const { rowCount } = await client.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
  return rowCount === 1;
}

export async function findApiKeyById(id: number): Promise<ApiKeyRecord | undefined> {
  const rows = await query<ApiKeyRow>(
    `SELECT ${columns} FROM api_keys WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? toApiKey(row) : undefined;
}
