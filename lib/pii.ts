import type { PiiHit } from "@/lib/types";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const ID = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\b\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,4}\b/g;
const HANDLE = /(?<![\w@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{1,29})\b/g;

function matches(regex: RegExp, text: string): { value: string; index: number }[] {
  regex.lastIndex = 0;
  const found: { value: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.push({ value: match[0], index: match.index });
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return found;
}

function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function detectPii(text: string): PiiHit[] {
  const hits: PiiHit[] = [];

  for (const item of matches(EMAIL, text)) {
    hits.push({ type: "email", value: item.value, index: item.index });
  }
  for (const item of matches(IBAN, text)) {
    hits.push({ type: "iban", value: item.value, index: item.index });
  }
  for (const item of matches(CARD, text)) {
    if (luhnValid(item.value)) {
      hits.push({ type: "card", value: item.value, index: item.index });
    }
  }
  for (const item of matches(ID, text)) {
    hits.push({ type: "id", value: item.value, index: item.index });
  }
  for (const item of matches(PHONE, text)) {
    const digits = item.value.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) {
      hits.push({ type: "phone", value: item.value, index: item.index });
    }
  }
  for (const item of matches(HANDLE, text)) {
    hits.push({ type: "handle", value: item.value, index: item.index });
  }

  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.index - b.index)
    .filter((hit) => {
      const key = `${hit.type}:${hit.index}:${hit.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function redactPii(text: string): { text: string; hits: PiiHit[] } {
  const hits = detectPii(text);
  let redacted = text;

  redacted = redacted.replace(EMAIL, "[email]");
  redacted = redacted.replace(IBAN, "[account]");
  redacted = redacted.replace(CARD, (value) => (luhnValid(value) ? "[card]" : value));
  redacted = redacted.replace(ID, "[id]");
  redacted = redacted.replace(PHONE, "[phone]");
  redacted = redacted.replace(HANDLE, "[handle]");

  return { text: redacted, hits };
}

export function piiSummary(hits: PiiHit[]): string {
  if (hits.length === 0) return "No personal details found";
  const counts = new Map<PiiHit["type"], number>();
  for (const hit of hits) {
    counts.set(hit.type, (counts.get(hit.type) ?? 0) + 1);
  }
  const labels: Record<PiiHit["type"], [string, string]> = {
    email: ["email", "emails"],
    phone: ["phone number", "phone numbers"],
    card: ["card number", "card numbers"],
    iban: ["account number", "account numbers"],
    id: ["ID number", "ID numbers"],
    handle: ["handle", "handles"],
  };
  return [...counts.entries()]
    .map(([type, count]) => `${count} ${labels[type][count === 1 ? 0 : 1]}`)
    .join(" · ");
}
