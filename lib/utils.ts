import type {
  Audience,
  EvalVariant,
  Genre,
  Intent,
  LengthMode,
  Modality,
} from "@/lib/types";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeForHash(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripThinking(text: string): string {
  return text.replace(/<think(?:ing)?[\s\S]*?<\/think(?:ing)?>/gi, "");
}

export function cleanModelOutput(raw: string): string {
  let text = stripThinking(raw).trim();
  text = text
    .replace(/^```(?:markdown|text|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const lines = text.split("\n");
  if (
    lines.length > 1 &&
    /^(?:here(?:'|’)s|this is|below is)\b.{0,80}\b(?:rewrite|revision|version)\b[.:]?$/i.test(
      lines[0].trim(),
    )
  ) {
    lines.shift();
    text = lines.join("\n").trim();
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

const REMOVED = "\u0000";
const DRAMATIC_CLOSER =
  "(?:let that sink in|(?:take|soak) that in|read that again|(?:just )?think about (?:that|it)|sit with (?:that|it)|that(?:'|’)s (?:the real )?win)";

export function stripSafeTells(text: string, draft?: string): string {
  let result = text;

  // Removals leave a marker so a sentence that now starts mid-clause
  // ("our new flow is live") can be recapitalised afterwards.
  result = result.replace(
    /\b(?:we(?:'|’)re|we are|i(?:'|’)m|i am)\s+(?:thrilled|excited|delighted|proud|happy)\s+to\s+(?:announce|share|reveal|confirm|let you know)(?:\s+that)?\s*/giu,
    REMOVED,
  );
  result = result.replace(
    /(^|\n)\s*(?:thrilled|excited|delighted|proud|happy)\s+to\s+(?:announce|share|reveal|confirm)\s*:?\s*/giu,
    `$1${REMOVED}`,
  );
  result = result.replace(
    new RegExp(`(^|\\n)[ \\t]*${DRAMATIC_CLOSER}(?:[.!?]+|(?=\\n)|$)[ \\t]*`, "giu"),
    "$1",
  );
  result = result.replace(
    new RegExp(
      `([.!?…]["'”’)\\]]?)[ \\t]+${DRAMATIC_CLOSER}(?:[.!?]+(?=\\s|$)|(?=\\n)|$)`,
      "giu",
    ),
    "$1",
  );

  result = result
    .replace(
      new RegExp(`(^|[.!?…]["'”’)\\]]?\\s+|\\n\\s*)${REMOVED}(\\p{Ll})`, "gu"),
      (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`,
    )
    .replaceAll(REMOVED, "");

  // Models sometimes trail off with an ellipsis the draft never had.
  if (draft !== undefined && !/(?:\.{3}|…)\s*$/.test(draft)) {
    result = result.replace(/(\w)\s*(?:\.{3,}|…)\s*$/u, "$1.");
  }

  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isLocalEndpoint(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

export const GENRE_LABELS: Record<Genre, string> = {
  message: "Message",
  email: "Email",
  essay: "Essay",
  post: "Post",
  note: "Note",
  other: "Other",
};

export const GENRE_HINTS: Record<Genre, string> = {
  message: "Texts, DMs, quick replies",
  email: "Work or personal email",
  essay: "Longer writing or coursework",
  post: "Social post or caption",
  note: "Short note or memo",
  other: "Anything else",
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  friend: "a friend",
  family: "family",
  colleague: "a colleague",
  client: "a client",
  public: "a public audience",
  academic: "an academic reader",
  other: "someone else",
};

export const AUDIENCE_UI: Record<Audience, string> = {
  friend: "A friend",
  family: "Family",
  colleague: "A colleague",
  client: "A client",
  public: "Public",
  academic: "Academic",
  other: "Other",
};

export const LENGTH_LABELS: Record<LengthMode, string> = {
  shorter: "Shorter",
  same: "About the same",
  longer: "A little longer",
};

export const INTENT_LABELS: Record<Intent, string> = {
  preserve: "Keep the shape",
  light: "Light touch",
  restructure: "Restructure",
};

export const MODALITY_LABELS: Record<Modality, string> = {
  all: "All writing",
  message: "Messages",
  longform: "Long-form",
};

export const VARIANT_LABELS: Record<EvalVariant, string> = {
  voice: "Voice-matched",
  generic: "Generic edit",
  raw: "Model alone",
  baseline: "Humanizer baseline",
};

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
