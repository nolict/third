const countryCodes: ReadonlyArray<readonly [prefix: string, iso: string]> = [
  ["1", "US"],
  ["60", "MY"],
  ["62", "ID"],
  ["63", "PH"],
  ["65", "SG"],
  ["66", "TH"],
  ["81", "JP"],
  ["84", "VN"],
  ["86", "CN"],
  ["91", "IN"],
  ["92", "PK"],
  ["880", "BD"],
  ["966", "SA"],
  ["971", "AE"],
  ["44", "GB"],
  ["49", "DE"],
  ["33", "FR"],
  ["39", "IT"],
  ["34", "ES"],
  ["7", "RU"],
  ["90", "TR"],
];

export function countryFromRange(rangeName: string, fallback: string): string {
  const lower = rangeName.toLowerCase();
  const byName: ReadonlyArray<readonly [label: string, iso: string]> = [
    ["indonesia", "ID"],
    ["malaysia", "MY"],
    ["philippines", "PH"],
    ["singapore", "SG"],
    ["thailand", "TH"],
    ["vietnam", "VN"],
    ["india", "IN"],
    ["pakistan", "PK"],
    ["bangladesh", "BD"],
    ["saudi", "SA"],
    ["emirates", "AE"],
    ["united states", "US"],
    ["united kingdom", "GB"],
    ["germany", "DE"],
    ["france", "FR"],
    ["italy", "IT"],
    ["spain", "ES"],
    ["russia", "RU"],
    ["turkey", "TR"],
    ["japan", "JP"],
    ["china", "CN"],
  ];
  const match = byName.find(([label]) => lower.includes(label));
  return match?.[1] ?? fallback;
}

export function countryFromNumber(number: string): string {
  const digits = number.replace(/^\+/, "");
  const match = countryCodes.find(([prefix]) => digits.startsWith(prefix));
  return match?.[1] ?? "";
}

const serviceLabels: ReadonlyArray<readonly [pattern: RegExp, label: string]> = [
  [/whatsapp/i, "WA"],
  [/telegram/i, "TG"],
  [/google|gmail/i, "GOOGLE"],
  [/facebook|meta/i, "FB"],
  [/instagram/i, "IG"],
  [/tiktok/i, "TIKTOK"],
  [/twitter|\bx\b/i, "X"],
  [/discord/i, "DISCORD"],
  [/shopee/i, "SHOPEE"],
  [/tokopedia/i, "TOKOPEDIA"],
  [/grab/i, "GRAB"],
  [/gojek/i, "GOJEK"],
  [/netflix/i, "NETFLIX"],
  [/amazon/i, "AMAZON"],
  [/microsoft|outlook/i, "MS"],
  [/apple/i, "APPLE"],
];

export function serviceLabel(senderId: string): string {
  const match = serviceLabels.find(([pattern]) => pattern.test(senderId));
  return match?.[1] ?? (senderId.trim().toUpperCase().slice(0, 12) || "SMS");
}

export function maskNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 0) {
    return "••••";
  }
  const prefix = digits.slice(0, 4);
  const visibleTailLength = Math.min(4, Math.max(0, digits.length - prefix.length));
  const tail = digits.slice(digits.length - visibleTailLength);
  const hiddenLength = Math.max(3, digits.length - prefix.length - visibleTailLength);
  return `${prefix}${"•".repeat(hiddenLength)}${tail}`;
}
