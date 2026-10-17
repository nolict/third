const indonesianMarkers = [
  "kode",
  "jangan",
  "berlaku",
  "menit",
  "adalah",
  "anda",
  "jangan bagikan",
  "rahasia",
];

const englishMarkers = [
  "code",
  "your",
  "verification",
  "do not",
  "share",
  "expires",
  "minutes",
  "valid",
  "is",
];

const labelPattern =
  /(?:code|kode|otp|pin|verification|verifikasi|passcode|token)\b/i;


const separators = /[-\u2013\s]/;

export function detectLanguage(text: string): string {
  const normalized = text.toLowerCase();
  const score = (markers: readonly string[]): number =>
    markers.filter((marker) => new RegExp(`\\b${marker}\\b`).test(normalized)).length;

  return score(indonesianMarkers) > score(englishMarkers) ? "ID" : "EN";
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function isGrouped(value: string): boolean {
  return separators.test(value);
}

function joinSpacedGroups(text: string, start: number): string | null {
  const pattern = /\d{2,4}(?:\s+\d{2,4})+/y;
  pattern.lastIndex = start;
  const match = pattern.exec(text);
  return match === null ? null : match[0];
}

function previousWord(text: string, index: number): string {
  const before = text.slice(0, index).trimEnd();
  const match = before.match(/(\S+)$/);
  return match?.[1] ?? "";
}

function looksLikeQuantityOrPhone(text: string, value: string, index: number): boolean {
  const word = previousWord(text, index).toLowerCase();
  if (/^(rp|idr|usd|stok|stock|sisa|total|qty|jumlah|harga|price|bayar|order|pesanan)$/.test(word)) {
    return true;
  }
  return value.startsWith("0") && value.length > 10;
}

function isDateOrNumber(text: string, index: number, raw: string): boolean {
  const before = text[index - 1];
  const after = text[index + raw.length];
  return before === "/" || after === "/";
}

function readCandidates(text: string): string[] {
  const found: { value: string; index: number }[] = [];
  for (const match of text.matchAll(/\d[\d\s\u2013-]*\d|\d/g)) {
    if (isDateOrNumber(text, match.index, match[0])) {
      continue;
    }
    const value = match[0].trim();
    const joined = isGrouped(value) ? value : joinSpacedGroups(text, match.index);
    found.push({ value: joined ?? value, index: match.index });
  }
  return found
    .filter((candidate) => !looksLikeQuantityOrPhone(text, digits(candidate.value), candidate.index))
    .map((candidate) => candidate.value);
}

export function extractOtp(text: string): string | null {
  const labeled = labelPattern.exec(text);
  if (labeled !== null) {
    const after = text.slice(labeled.index + labeled[0].length);
    const fromLabel = readCandidates(after)
      .map(digits)
      .find((value) => value.length >= 4);
    if (fromLabel !== undefined) {
      return fromLabel;
    }
  }

  const scores = readCandidates(text).map(digits);
  const preferred = scores
    .filter((value) => value.length >= 4 && value.length <= 8)
    .sort((left, right) => right.length - left.length);

  return preferred[0] ?? scores.sort((left, right) => right.length - left.length)[0] ?? null;
}
