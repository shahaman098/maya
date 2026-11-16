import { z } from "zod";
import { getDb } from "@/lib/db";
import { chat } from "@/lib/llm";
import {
  buildProfileMessages,
  buildProfileRetryMessages,
} from "@/lib/prompts";
import { getConsentedSamples } from "@/lib/samples";
import { getSettings } from "@/lib/settings";
import { analyzeSamples, buildBrief } from "@/lib/stylometry";
import type {
  Profile,
  ProfileStats,
  ProfileStatus,
  Sample,
  VoiceCard,
} from "@/lib/types";
import { cleanModelOutput, truncate } from "@/lib/utils";

interface ProfileRow {
  id: string;
  version: number;
  sample_count: number;
  stats: string;
  brief: string;
  card: string | null;
  model: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

const section = z.string().trim().min(1).max(2000);

const voiceCardSchema = z.object({
  headline: z.string().trim().min(1).max(240),
  rhythm: section,
  diction: section,
  structure: section,
  punctuation: section,
  humour: section,
  quirks: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  avoid: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
});

function mapProfile(row: ProfileRow): Profile {
  let stats: ProfileStats;
  try {
    stats = JSON.parse(row.stats) as ProfileStats;
  } catch {
    throw new Error("Stored profile stats are unreadable.");
  }

  let card: VoiceCard | null = null;
  if (row.card) {
    try {
      card = JSON.parse(row.card) as VoiceCard;
    } catch {
      card = null;
    }
  }

  return {
    id: row.id,
    version: row.version,
    sampleCount: row.sample_count,
    stats,
    brief: row.brief,
    card,
    model: row.model,
    status: row.status as ProfileStatus,
    error: row.error,
    createdAt: row.created_at,
  };
}

export function getLatestProfile(): Profile | null {
  const row = getDb()
    .prepare("SELECT * FROM profiles ORDER BY version DESC LIMIT 1")
    .get() as ProfileRow | undefined;
  return row ? mapProfile(row) : null;
}

export function getProfileById(id: string): Profile | null {
  const row = getDb()
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get(id) as ProfileRow | undefined;
  return row ? mapProfile(row) : null;
}

export function profileIsStale(profile: Profile, currentSamples: number): boolean {
  return profile.sampleCount !== currentSamples;
}

function parseCard(raw: string): VoiceCard {
  const cleaned = cleanModelOutput(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The model did not return a JSON object.");
  }

  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("The model's JSON could not be parsed.");
  }

  const parsed = voiceCardSchema.parse(data);
  return {
    ...parsed,
    quirks: parsed.quirks.slice(0, 8),
    avoid: parsed.avoid.slice(0, 8),
  };
}

function chooseProfileSamples(samples: Sample[]): Sample[] {
  const messages = samples.filter((sample) => sample.genre === "message").slice(0, 7);
  const longform = samples.filter((sample) => sample.genre !== "message").slice(0, 7);
  const chosen = [...messages, ...longform];
  const seen = new Set(chosen.map((sample) => sample.id));

  for (const sample of samples) {
    if (chosen.length >= 10) break;
    if (seen.has(sample.id)) continue;
    chosen.push(sample);
    seen.add(sample.id);
  }

  return chosen.slice(0, 14);
}

function insertProfile(input: {
  stats: ProfileStats;
  brief: string;
  card: VoiceCard | null;
  model: string | null;
  status: ProfileStatus;
  error: string | null;
}): Profile {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const max = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM profiles")
    .get() as { version: number };
  const version = max.version + 1;

  db.prepare(
    `INSERT INTO profiles
      (id, version, sample_count, stats, brief, card, model, status, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    version,
    input.stats.all.sampleCount,
    JSON.stringify(input.stats),
    input.brief,
    input.card ? JSON.stringify(input.card) : null,
    input.model,
    input.status,
    input.error,
    createdAt,
  );

  return {
    id,
    version,
    sampleCount: input.stats.all.sampleCount,
    stats: input.stats,
    brief: input.brief,
    card: input.card,
    model: input.model,
    status: input.status,
    error: input.error,
    createdAt,
  };
}

export async function createProfile(options: { useModel?: boolean } = {}): Promise<{
  profile: Profile | null;
  warning?: string;
}> {
  const settings = getSettings();
  const samples = getConsentedSamples();
  if (samples.length === 0) return { profile: null };

  const stats = analyzeSamples(samples);
  const brief = buildBrief(stats.all, settings.person.name);

  let card: VoiceCard | null = null;
  let status: ProfileStatus = "stats_only";
  let error: string | null = null;
  let warning: string | undefined;

  if (options.useModel !== false) {
    const messages = buildProfileMessages({
      name: settings.person.name,
      brief,
      samples: chooseProfileSamples(samples),
    });
    const connection = {
      baseUrl: settings.writer.baseUrl,
      model: settings.writer.model,
      apiKey: settings.writer.apiKey,
      disableThinking: settings.writer.disableThinking,
    };

    try {
      const first = await chat(connection, messages, {
        temperature: 0.35,
        maxTokens: 1800,
        json: true,
        timeoutMs: 150_000,
      });

      try {
        card = parseCard(first.content);
      } catch {
        const second = await chat(
          connection,
          buildProfileRetryMessages(messages, first.content),
          {
            temperature: 0.2,
            maxTokens: 1800,
            json: true,
            timeoutMs: 150_000,
          },
        );
        card = parseCard(second.content);
      }
      status = "ready";
    } catch (caught) {
      error = truncate(
        caught instanceof Error ? caught.message : "The model call failed.",
        500,
      );
      status = "stats_only";
      warning = `The written voice profile could not be generated. The measured profile is saved. ${error}`;
    }
  }

  const profile = insertProfile({
    stats,
    brief,
    card,
    model: options.useModel === false ? null : settings.writer.model,
    status,
    error,
  });

  return { profile, warning };
}

export async function ensureProfileForRewrite(): Promise<Profile | null> {
  const latest = getLatestProfile();
  if (latest) return latest;
  const { profile } = await createProfile({ useModel: false });
  return profile;
}
