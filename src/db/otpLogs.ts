import { query } from "./pool.ts";

export interface LoggedEvent {
  number: string;
  senderId: string;
  receivedAt: Date;
}

export function eventKey(number: string, senderId: string, receivedAt: Date): string {
  return [number, senderId, receivedAt.toISOString()].join("\u0000");
}

export async function listLoggedEvents(apiKeyId: number): Promise<Set<string>> {
  const rows = await query<{ number: string; sender_id: string; received_at: Date }>(
    `SELECT number, sender_id, received_at FROM otp_logs WHERE api_key_id = $1`,
    [apiKeyId],
  );
  return new Set(
    rows.map((row) => eventKey(row.number, row.sender_id, new Date(row.received_at))),
  );
}

export async function claimOtpLog(
  apiKeyId: number,
  fingerprint: string,
  number: string,
  senderId: string,
  rangeName: string,
  receivedAt: Date,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO otp_logs (api_key_id, fingerprint, number, sender_id, range_name, received_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (api_key_id, fingerprint) DO NOTHING
     RETURNING id`,
    [apiKeyId, fingerprint, number, senderId, rangeName, receivedAt],
  );
  return rows.length === 1;
}
