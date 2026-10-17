import { query } from "./pool.ts";

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
