import { apiTimeoutMs } from "../config/env.ts";

const trafficEndpoint = "https://thirdwave.im/api/v1/traffic";

export class ThirdwaveError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ThirdwaveError";
    this.status = status;
  }
}

export interface TrafficItem {
  receivedAt: string;
  senderId: string;
  rangeName: string;
  rangeTemplate: string;
  number: string;
  sms: string;
  rate: string;
}

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new ThirdwaveError(502, `Unexpected traffic payload: ${field} is not a string`);
  }
  return value;
}

function parseItem(value: unknown): TrafficItem {
  if (typeof value !== "object" || value === null) {
    throw new ThirdwaveError(502, "Unexpected traffic payload: item is not an object");
  }
  const record = value as Record<string, unknown>;
  return {
    receivedAt: readString(record, "received_at"),
    senderId: readString(record, "sender_id"),
    rangeName: readString(record, "range_name"),
    rangeTemplate: readString(record, "range_template"),
    number: readString(record, "number"),
    sms: readString(record, "sms"),
    rate: readString(record, "rate"),
  };
}

function parseTraffic(payload: unknown): TrafficItem[] {
  if (typeof payload !== "object" || payload === null || !("items" in payload)) {
    throw new ThirdwaveError(502, "Unexpected traffic payload: items field is missing");
  }
  const items: unknown = (payload as { items: unknown }).items;
  if (!Array.isArray(items)) {
    throw new ThirdwaveError(502, "Unexpected traffic payload: items is not an array");
  }
  return items.map(parseItem);
}

function readApiError(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return undefined;
  }
  const error: unknown = (payload as { error: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

export async function fetchRecentTraffic(apiKey: string, limit = 20): Promise<TrafficItem[]> {
  const url = new URL(trafficEndpoint);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", String(limit));

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(apiTimeoutMs),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new ThirdwaveError(0, `Network error: ${error instanceof Error ? error.message : String(error)}`);
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const detail = readApiError(payload) ?? `HTTP ${response.status}`;
    throw new ThirdwaveError(
      response.status,
      retryAfter ? `${detail} (retry after ${retryAfter}s)` : detail,
    );
  }
  return parseTraffic(payload);
}
