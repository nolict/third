import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";

import pg from "pg";

import { config } from "../config/env.ts";

const encryptedWithoutVerification: ConnectionOptions = { rejectUnauthorized: false };

// `sslmode=require` is handled here and stripped from the URL instead of being left to
// pg-connection-string, so TLS settings are controlled in one place and the library's
// sslmode deprecation warning (treated as verify-full) never fires.
function connectionOptions(databaseUrl: string): pg.PoolConfig {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");

  if (sslmode !== "require" && sslmode !== "verify-full") {
    return { connectionString: url.toString(), max: 5 };
  }

  const certificateAuthority = process.env["SSL_CERT_FILE"];
  if (sslmode === "verify-full" && certificateAuthority === undefined) {
    throw new Error("sslmode=verify-full requires SSL_CERT_FILE to point at the CA certificate");
  }

  const ssl: ConnectionOptions = certificateAuthority
    ? { ca: readFileSync(certificateAuthority, "utf8"), rejectUnauthorized: true }
    : encryptedWithoutVerification;

  return { connectionString: url.toString(), max: 5, ssl };
}

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool(connectionOptions(databaseUrl));
}

export const pool = createPool(config.databaseUrl);

export async function query<R extends pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<R[]> {
  const result = await pool.query<R>(text, values);
  return result.rows;
}

export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
