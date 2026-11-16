import { normalizeForHash } from "@/lib/utils";

export const MIN_SAMPLE_LENGTH = 12;
export const MAX_SAMPLE_LENGTH = 20000;

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF\u200e\u202f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanImportedTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of texts) {
    let text = tidy(raw);
    if (text.length < MIN_SAMPLE_LENGTH) continue;
    if (text.length > MAX_SAMPLE_LENGTH) {
      text = text.slice(0, MAX_SAMPLE_LENGTH).trim();
    }
    const key = normalizeForHash(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length >= 2000) break;
  }

  return cleaned;
}

export function splitBulk(text: string): string[] {
  const raw = tidy(text);
  if (!raw) return [];
  const parts = raw.split(/^\s*---+\s*$/m);
  return cleanImportedTexts(parts.length > 1 ? parts : [raw]);
}

const WHATSAPP_LINE =
  /^\s*\[?(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([ap]\.?m\.?)?\]?\s*(?:-\s*)?([^:\n]{1,60}):\s?([\s\S]*)$/i;

const SYSTEM_LINES = [
  /^messages and calls are end-to-end encrypted/i,
  /^you changed the subject/i,
  /^you changed this group's icon/i,
  /^you created group/i,
  /^you added/i,
  /^you removed/i,
  /^you left$/i,
  /^missed voice call/i,
  /^missed video call/i,
];

const MEDIA_PLACEHOLDER =
  /<?\b(?:media|image|video|audio|sticker|gif|document|contact card|contact)\b omitted>?/gi;

const DELETED =
  /^(?:this message was deleted|you deleted this message|liked a message|reacted to .* with .*)$/i;

function stripMessage(text: string): string {
  return tidy(text.replace(MEDIA_PLACEHOLDER, "")).trim();
}

export function parseWhatsAppExport(raw: string, targetName: string): string[] {
  const target = targetName.trim().toLowerCase();
  if (!target) return [];

  const lines = tidy(raw).split("\n");
  const messages: string[] = [];
  let currentIndex = -1;

  for (const rawLine of lines) {
    const line = rawLine.replace(/[\u200e\u202f]/g, "").trimEnd();
    const match = WHATSAPP_LINE.exec(line);

    if (match) {
      const sender = match[4].trim().replace(/^~/, "").toLowerCase();
      const body = match[5] ?? "";
      if (sender === target) {
        messages.push(body);
        currentIndex = messages.length - 1;
      } else {
        currentIndex = -1;
      }
      continue;
    }

    if (SYSTEM_LINES.some((pattern) => pattern.test(line.trim()))) {
      currentIndex = -1;
      continue;
    }

    if (currentIndex >= 0 && line.trim()) {
      messages[currentIndex] = `${messages[currentIndex]}\n${line}`;
    }
  }

  return cleanImportedTexts(
    messages.map(stripMessage).filter((text) => !DELETED.test(text)),
  );
}

function textFromItem(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  for (const key of ["text", "message", "content", "body", "sample", "writing"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return null;
}

export function parseJsonImport(raw: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.messages)) items = record.messages;
    else if (Array.isArray(record.samples)) items = record.samples;
    else if (Array.isArray(record.data)) items = record.data;
    else items = [data];
  }

  const texts = items
    .map(textFromItem)
    .filter((text): text is string => typeof text === "string");
  if (texts.length === 0) {
    throw new Error("No text fields were found in that JSON file.");
  }
  return cleanImportedTexts(texts);
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (character === '"') {
        if (raw[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && raw[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export function parseCsvImport(raw: string): string[] {
  const rows = parseCsv(raw);
  if (rows.length === 0) return [];

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const aliases = ["text", "message", "content", "body", "sample", "writing"];
  const column = header.findIndex((cell) => aliases.includes(cell));

  if (column >= 0) {
    return cleanImportedTexts(
      rows.slice(1).map((row) => row[column] ?? "").filter(Boolean),
    );
  }

  return cleanImportedTexts(rows.map((row) => row[0] ?? "").filter(Boolean));
}

export function parseImportFile(name: string, raw: string): string[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return parseJsonImport(raw);
  if (lower.endsWith(".csv")) return parseCsvImport(raw);
  return splitBulk(raw);
}
