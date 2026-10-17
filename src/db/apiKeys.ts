import { randomBytes } from "node:crypto";

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

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const rows = await query<ApiKeyRow>(
    `SELECT id, label, token, created_at FROM api_keys ORDER BY created_at DESC`,
  );
  return rows.map(toApiKey);
}

export async function createApiKey(client: PoolClient, label: string): Promise<ApiKeyRecord> {
  for (;;) {
    const { rows } = await client.query<ApiKeyRow>(
      `INSERT INTO api_keys (label, token) VALUES ($1, $2)
       ON CONFLICT (token) DO NOTHING
       RETURNING id, label, token, created_at`,
      [label, generateToken()],
    );
    const row = rows[0];
    if (row) {
      return toApiKey(row);
    }
  }
}

export async function replaceApiKeyToken(
  client: PoolClient,
  id: number,
): Promise<ApiKeyRecord | undefined> {
  for (;;) {
    const { rows } = await client.query<ApiKeyRow>(
      `UPDATE api_keys SET token = $2 WHERE id = $1 AND token <> $2
       RETURNING id, label, token, created_at`,
      [id, generateToken()],
    );
    const row = rows[0];
    if (row) {
      return toApiKey(row);
    }
    const { rowCount } = await client.query(`SELECT 1 FROM api_keys WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return undefined;
    }
  }
}

export async function deleteApiKey(client: PoolClient, id: number): Promise<boolean> {
  const { rowCount } = await client.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
  return rowCount === 1;
}

export async function findApiKeyById(id: number): Promise<ApiKeyRecord | undefined> {
  const rows = await query<ApiKeyRow>(
    `SELECT id, label, token, created_at FROM api_keys WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? toApiKey(row) : undefined;
}
