export const GENRES = ["message", "email", "essay", "post", "note", "other"] as const;
export type Genre = (typeof GENRES)[number];

export const AUDIENCES = [
  "friend",
  "family",
  "colleague",
  "client",
  "public",
  "academic",
  "other",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const LENGTH_MODES = ["shorter", "same", "longer"] as const;
export type LengthMode = (typeof LENGTH_MODES)[number];

export const INTENTS = ["preserve", "light", "restructure"] as const;
export type Intent = (typeof INTENTS)[number];

export const EVAL_VARIANTS = ["voice", "generic", "raw", "baseline"] as const;
export type EvalVariant = (typeof EVAL_VARIANTS)[number];

export type Modality = "all" | "message" | "longform";
export type ProfileStatus = "ready" | "stats_only" | "error";
export type RewriteStatus = "running" | "done" | "error" | "cancelled";

export interface Sample {
  id: string;
  text: string;
  genre: Genre;
  audience: Audience;
  language: string;
  source: string;
  isAuthentic: boolean;
  consent: boolean;
  piiRedacted: boolean;
  charCount: number;
  wordCount: number;
  createdAt: string;
  hasEmbedding: boolean;
}

export interface SentenceBucket {
  label: string;
  share: number;
}

export interface StyleStats {
  sampleCount: number;
  wordCount: number;
  charCount: number;
  avgSentenceLength: number;
  medianSentenceLength: number;
  sentenceLengthStdDev: number;
  shortSentenceShare: number;
  longSentenceShare: number;
  avgWordLength: number;
  typeTokenRatio: number;
  contractionsPer100Words: number;
  firstPersonPer100Words: number;
  secondPersonPer100Words: number;
  lowercaseStartShare: number;
  lowercaseIShare: number;
  emojiPer100Words: number;
  exclamationsPer100Words: number;
  questionsShare: number;
  britishSpellingShare: number | null;
  punctuationPer1000Chars: {
    commas: number;
    periods: number;
    questions: number;
    exclamations: number;
    semicolons: number;
    colons: number;
    emDashes: number;
    ellipses: number;
    parentheses: number;
  };
  hedgingPer100Words: number;
  intensifiersPer100Words: number;
  slangPer100Words: number;
  avgParagraphWords: number;
  sentenceHistogram: SentenceBucket[];
  favouritePhrases: { phrase: string; count: number }[];
  openings: { phrase: string; count: number }[];
  signoffs: string[];
}

export interface ProfileStats {
  all: StyleStats;
  message: StyleStats | null;
  longform: StyleStats | null;
}

export interface VoiceCard {
  headline: string;
  rhythm: string;
  diction: string;
  structure: string;
  punctuation: string;
  humour: string;
  quirks: string[];
  avoid: string[];
}

export interface Profile {
  id: string;
  version: number;
  sampleCount: number;
  stats: ProfileStats;
  brief: string;
  card: VoiceCard | null;
  model: string | null;
  status: ProfileStatus;
  error: string | null;
  createdAt: string;
}

export interface ExamplePreview {
  id: string;
  text: string;
  genre: Genre;
  audience: Audience;
  reason: string;
}

export interface PiiHit {
  type: "email" | "phone" | "card" | "iban" | "id" | "handle";
  value: string;
  index: number;
}

export interface FactReport {
  missingNumbers: string[];
  addedNumbers: string[];
  missingQuotes: string[];
  missingNames: string[];
  missingLinks: string[];
  critical: boolean;
}

export type TellSeverity = "high" | "medium" | "low";

export interface TellReport {
  id: string;
  label: string;
  severity: TellSeverity;
  count: number;
  examples: string[];
}

export interface RhythmReport {
  median: number;
  stdev: number;
  shortShare: number;
  verdict: "flat" | "even" | "varied" | "short";
}

export interface Checks {
  score: number;
  verdict: string;
  facts: FactReport;
  tells: TellReport[];
  rhythm: RhythmReport;
  lengthRatio: number;
  pii: {
    draft: PiiHit[];
    output: PiiHit[];
  };
  notes: string[];
}

export interface Rewrite {
  id: string;
  draft: string;
  output: string;
  edited: string | null;
  genre: Genre;
  audience: Audience;
  tone: string | null;
  lengthMode: LengthMode;
  intent: Intent;
  status: RewriteStatus;
  model: string | null;
  connection: string | null;
  profileId: string | null;
  exampleIds: string[];
  checks: Checks | null;
  rating: number | null;
  feedback: string | null;
  approved: boolean;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RewriteRequest {
  draft: string;
  genre: Genre;
  audience: Audience;
  lengthMode: LengthMode;
  intent: Intent;
}

export interface WriterSettings {
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  embeddingModel: string;
  temperature: number;
  maxExamples: number;
  repairPass: boolean;
  semanticRetrieval: boolean;
  disableThinking: boolean;
}

export interface BaselineSettings {
  enabled: boolean;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  disableThinking: boolean;
}

export interface Settings {
  person: {
    name: string;
  };
  writer: WriterSettings;
  baseline: BaselineSettings;
  privacy: {
    redactPii: boolean;
  };
}

export interface EvalCase {
  id: string;
  name: string;
  draft: string;
  genre: Genre;
  audience: Audience;
  notes: string | null;
  createdAt: string;
}

export interface EvalRun {
  id: string;
  batchId: string;
  caseId: string;
  variant: EvalVariant;
  model: string | null;
  output: string;
  checks: Checks | null;
  manualRating: number | null;
  status: RewriteStatus;
  error: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface HealthProfile {
  id: string;
  version: number;
  sampleCount: number;
  status: ProfileStatus;
  createdAt: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  samples: number;
  profile: HealthProfile | null;
  writer: {
    ok: boolean;
    model: string;
    models: string[];
    error?: string;
  };
}
