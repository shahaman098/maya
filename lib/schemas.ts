import { z } from "zod";
import {
  AUDIENCES,
  EVAL_VARIANTS,
  GENRES,
  INTENTS,
  LENGTH_MODES,
} from "@/lib/types";

const genreSchema = z.enum(GENRES);
const audienceSchema = z.enum(AUDIENCES);
const lengthModeSchema = z.enum(LENGTH_MODES);
const intentSchema = z.enum(INTENTS);
const languageSchema = z.string().trim().min(2).max(20).default("en");
const consentSchema = z
  .boolean()
  .refine((value) => value, {
    message: "Confirm that you wrote this or have permission to use it.",
  });

export const sampleCreateSchema = z.object({
  text: z.string().trim().min(12, "A sample needs at least 12 characters.").max(20000),
  genre: genreSchema.default("other"),
  audience: audienceSchema.default("other"),
  language: languageSchema,
  source: z.string().trim().max(40).default("manual"),
  consent: consentSchema,
  redact: z.boolean().default(true),
});

export const sampleImportSchema = z
  .object({
    mode: z.enum(["bulk", "whatsapp", "file"]).default("bulk"),
    texts: z.array(z.string()).max(2000).optional(),
    raw: z.string().max(500000).optional(),
    name: z.string().trim().max(60).optional(),
    genre: genreSchema.default("other"),
    audience: audienceSchema.default("other"),
    language: languageSchema,
    source: z.string().trim().max(40).default("import"),
    consent: consentSchema,
    redact: z.boolean().default(true),
  })
  .refine((data) => (data.texts && data.texts.length > 0) || data.raw, {
    message: "There is nothing to import.",
    path: ["texts"],
  });

export const sampleUpdateSchema = z.object({
  text: z.string().trim().min(12).max(20000).optional(),
  genre: genreSchema.optional(),
  audience: audienceSchema.optional(),
});

export const rewriteSchema = z.object({
  draft: z.string().trim().min(10, "Paste a draft first.").max(20000),
  genre: genreSchema.default("message"),
  audience: audienceSchema.default("friend"),
  lengthMode: lengthModeSchema.default("same"),
  intent: intentSchema.default("preserve"),
});

export const feedbackSchema = z.object({
  edited: z.string().max(30000).nullable().optional(),
  rating: z.number().int().min(-1).max(5).nullable().optional(),
  feedback: z.string().max(2000).nullable().optional(),
  approved: z.boolean().optional(),
});

export const profileRefreshSchema = z.object({
  useModel: z.boolean().default(true),
});

export const writerConnectionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().max(500),
  embeddingModel: z.string().trim().min(1).max(200),
  temperature: z.number().min(0).max(2),
  maxExamples: z.number().int().min(0).max(10),
  repairPass: z.boolean(),
  semanticRetrieval: z.boolean(),
  disableThinking: z.boolean(),
});

export const baselineConnectionSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().max(500),
  temperature: z.number().min(0).max(2),
  disableThinking: z.boolean(),
});

export const settingsSchema = z.object({
  person: z.object({
    name: z.string().trim().min(1, "Add a name.").max(60),
  }),
  writer: writerConnectionSchema,
  baseline: baselineConnectionSchema,
  privacy: z.object({
    redactPii: z.boolean(),
  }),
});

export const settingsPatchSchema = z.record(z.string(), z.unknown());

export const evalCaseSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  draft: z.string().trim().min(10).max(20000),
  genre: genreSchema.default("message"),
  audience: audienceSchema.default("friend"),
  notes: z.string().trim().max(1000).optional(),
});

export const evalRunSchema = z.object({
  caseId: z.string().trim().min(1).max(100),
  variant: z.enum(EVAL_VARIANTS),
  batchId: z.string().trim().min(1).max(100).optional(),
});

export const evalRatingSchema = z.object({
  manualRating: z.number().int().min(1).max(5).nullable(),
});

export const resetSchema = z.object({
  confirm: z.literal("DELETE"),
});

export const modelsTestSchema = z.object({
  baseUrl: z.string().trim().min(1).max(500),
  apiKey: z.string().max(500).optional(),
});

export const sampleQuerySchema = z.object({
  q: z.string().max(200).optional(),
  modality: z.enum(["all", "message", "longform"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const rewriteQuerySchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});
