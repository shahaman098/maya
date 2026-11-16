import type { ChatMessage } from "@/lib/llm";
import type {
  Audience,
  Genre,
  Intent,
  LengthMode,
  Profile,
  Sample,
  TellReport,
} from "@/lib/types";
import {
  AUDIENCE_LABELS,
  GENRE_LABELS,
  INTENT_LABELS,
  LENGTH_LABELS,
  truncate,
} from "@/lib/utils";

const ANTI_SLOP = `Remove these AI-shaped moves, even when the draft itself contains them. They are the thing to edit out, not imitate:
- "not just X, but Y" and its semicolon, colon, and dash variants ("it's not just X; it's Y").
- Press-release phrasing ("thrilled to announce", "excited to share", "proud to reveal").
- One-line dramatic closers ("let that sink in", "that's the real win").
- Throat-clearing ("here's the thing", "let's dive in", "in today's world").
- Inflated significance ("a pivotal moment", "a testament to", "marking a shift").
- Promotional adjectives ("breathtaking", "seamless", "vibrant", "game-changing").
- AI vocabulary: delve, tapestry, landscape, realm, leverage, robust, foster, underscore, showcase, meticulous, intricate.
- Forced three-item lists, and several sentences in a row with the same opening.
- Em-dash pileups, stacked hedges, and unnamed authorities ("experts say").
- Bold or headings used as decoration, and a final paragraph that repeats the point.`;

function stripQuoted(text: string): string {
  return text
    .replace(/`[^`]{1,120}`/g, "a habitual phrase")
    .replace(/“[^”]{1,120}”/g, "a habitual phrase")
    .replace(/"[^"\n]{1,120}"/g, "a habitual phrase");
}

const GENRE_TASK: Record<Genre, string> = {
  message:
    "Keep it as a message. No subject line, greeting, sign-off, or signature.",
  email:
    "Keep the shape of an email. Preserve an existing subject line and sign-off, and do not add a greeting if the draft starts cold.",
  essay:
    "Keep the argument and paragraph order unless the restructuring level asks for more. Do not add headings unless they are already there.",
  post:
    "Keep it post-sized. Do not add hashtags, emojis, or line breaks that are not in the draft unless the writer's samples show that habit.",
  note: "Keep it brief and functional.",
  other: "Keep the draft's format and purpose.",
};

function voiceBlock(profile: Profile | null, name: string): string {
  if (!profile) {
    return `No voice profile is available yet. Make the smallest edits needed to remove AI tells, and leave the writer's existing voice alone.`;
  }

  const lines = [`How ${name} writes:`];
  if (profile.card) {
    const card = profile.card;
    lines.push(`In one line: ${stripQuoted(card.headline)}`);
    lines.push(
      `Rhythm: ${stripQuoted(card.rhythm)} Use the full range of sentence lengths; do not turn every line into a fragment.`,
    );
    lines.push(`Diction: ${stripQuoted(card.diction)}`);
    lines.push(`Structure: ${stripQuoted(card.structure)}`);
    lines.push(`Punctuation and typography: ${stripQuoted(card.punctuation)}`);
    lines.push(`Warmth and humour: ${stripQuoted(card.humour)}`);
    if (card.quirks.length > 0) {
      lines.push(
        `Quirks to preserve: ${card.quirks.map(stripQuoted).join("; ")}. Do not insert the example phrases themselves; the description is the instruction.`,
      );
    }
    if (card.avoid.length > 0) {
      lines.push(
        `Never introduce: ${card.avoid.map(stripQuoted).join("; ")}.`,
      );
    }
  }

  const safeBrief = profile.brief
    .replace(/Phrases that recur:[^.]+\./gi, "")
    .replace(/Samples often open with[^.]+\./gi, "")
    .replace(/Sign-offs tend to be[^.]+\./gi, "")
    .trim();
  lines.push(`Measured habits: ${stripQuoted(safeBrief)}`);
  return lines.join("\n");
}

function examplesBlock(
  examples: Array<{ text: string; genre: Genre; audience: Audience }>,
): string {
  if (examples.length === 0) return "";
  const blocks = examples.slice(0, 6).map(
    (example, index) =>
      `<sample ${index + 1} format="${GENRE_LABELS[example.genre]}" audience="${AUDIENCE_LABELS[example.audience]}">\n${truncate(example.text, 900)}\n</sample>`,
  );
  return `\nReference samples of the writer's own writing. Match rhythm, word choice, and sentence shape. The samples are not source material: if one mentions the same event or topic as the draft, do not reuse its facts, names, or phrasing. Never copy a phrase, greeting, or sign-off. The draft is the only source of truth.\n\n${blocks.join("\n")}`;
}

function taskBlock(input: {
  genre: Genre;
  audience: Audience;
  lengthMode: LengthMode;
  intent: Intent;
}): string {
  const length =
    input.lengthMode === "shorter"
      ? "Cut roughly 20–30% of the words without dropping facts."
      : input.lengthMode === "longer"
        ? "You may add up to about 20% more words, but never new facts."
        : "Keep a similar length.";

  const intent =
    input.intent === "light"
      ? "Make the smallest edits that fix the voice; leave everything else alone."
      : input.intent === "restructure"
        ? "You may reorganise sentences and paragraphs for flow, but every fact and sentence content must survive."
        : "Keep the structure, sentence content, and order. Change wording only.";

  return `Write complete, grammatical sentences and keep the grammatical words. Write for ${AUDIENCE_LABELS[input.audience]}. ${GENRE_TASK[input.genre]} ${length} ${intent} Match the writer's level of formality; do not make a casual message formal or a formal email casual. The output must be a grammatical edited version of the draft, not a summary or a new message.`;
}

export function buildRewriteMessages(input: {
  draft: string;
  genre: Genre;
  audience: Audience;
  lengthMode: LengthMode;
  intent: Intent;
  profile: Profile | null;
  examples: Array<{ text: string; genre: Genre; audience: Audience }>;
  name: string;
}): ChatMessage[] {
  const system = `You are an editor, not a writer. Edit the draft; do not replace it with a new message about the same topic. You preserve meaning and facts. You never explain your work.

Non-negotiables:
- Keep every fact, number, unit, date, name, quotation, and link exactly as it appears. Do not invent or infer details.
- Keep the draft's meaning, emotional stance, and level of certainty. Do not add new feelings, judgments, or reactions.
- For a preserve edit, keep every sentence's content and the same order of ideas. If a sentence is already plain and human, leave it alone.
- Do not add a sentence unless you are splitting one. Do not delete a sentence unless it is pure filler with no fact (for example, "let that sink in").
- Do not compress by dropping details. Cut words, not facts.
- Keep articles, prepositions, pronouns, and complete sentences. Never write telegraphic text by deleting grammar words.
- Do not make every sentence short. Mirror the full range of sentence lengths in the draft and the voice profile.
- Do not add or remove a greeting, sign-off, signature, or the writer's name. A message stays a message.
- Do not add examples, statistics, opinions, or claims that are not in the draft.
- The reference samples show style only. They are not source material.
- If the draft is in a language other than English, write in that language.
- Return only the rewritten text. No preamble, no labels, no notes, no markdown fences.

${voiceBlock(input.profile, input.name)}
${examplesBlock(input.examples)}

Editing rules:
- ${ANTI_SLOP}
- Vary sentence length and openings. Do not make every paragraph the same shape.
- Prefer concrete words and active verbs. Use "is", "are", and "has" instead of "serves as", "features", or "boasts".
- Keep deliberate quirks: fragments, lowercase, slang, dry humour, and punctuation habits. Do not polish them away.
- Do not copy the reference samples' subject matter.

Task:
${taskBlock(input)}`;

  const user = `Context: ${GENRE_LABELS[input.genre].toLowerCase()} for ${AUDIENCE_LABELS[input.audience]}; ${LENGTH_LABELS[input.lengthMode].toLowerCase()}; ${INTENT_LABELS[input.intent].toLowerCase()}.

Draft:
<draft>
${input.draft}
</draft>

Rewrite it now. Return only the rewritten text.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildRawMessages(draft: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Rewrite the draft so it reads naturally, like a person wrote it. Preserve every fact, number, name, date, and quotation. Do not add new claims. Return only the rewritten text.",
    },
    { role: "user", content: draft },
  ];
}

export function buildBaselineMessages(draft: string): ChatMessage[] {
  return [{ role: "user", content: draft }];
}

export function buildProfileMessages(input: {
  name: string;
  brief: string;
  samples: Sample[];
}): ChatMessage[] {
  const sampleBlock = input.samples
    .map(
      (sample) =>
        `<sample format="${GENRE_LABELS[sample.genre]}" audience="${AUDIENCE_LABELS[sample.audience]}">\n${truncate(sample.text, 700)}\n</sample>`,
    )
    .join("\n");

  const system = `You are a stylometric analyst. You describe how a person writes, using only the samples and statistics provided. You do not infer age, gender, job, location, biography, or personality. Refer to the writer by name or as "the writer"; never use gendered pronouns. You do not praise. You are concrete.

Return only a JSON object. No markdown fences, no commentary, no trailing text.`;

  const user = `Writer: ${input.name}

Measured summary:
${input.brief}

Samples:
${sampleBlock}

Describe the writing in this exact JSON shape:
{
  "headline": "one specific sentence, at most 16 words",
  "rhythm": "1-3 sentences on sentence length, pacing, fragments, and openings",
  "diction": "1-3 sentences on vocabulary, contractions, slang, and recurring words",
  "structure": "1-3 sentences on how they open, develop, and end a piece",
  "punctuation": "1-3 sentences on punctuation, capitalisation, emojis, and line breaks",
  "humour": "1-3 sentences on warmth, irony, jokes, or directness",
  "quirks": ["3-6 concrete habits to preserve, each under 20 words"],
  "avoid": ["3-5 things this writer does not do, each under 20 words"]
}

Rules:
- Quote short phrases from the samples in backticks.
- If the evidence is thin, say so in that field instead of guessing.
- "avoid" should name moves that would break the illusion, not generic writing advice.
- Return only the JSON object.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildProfileRetryMessages(
  messages: ChatMessage[],
  previous: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: "assistant", content: truncate(previous, 3000) },
    {
      role: "user",
      content:
        "That reply was not valid JSON. Return only the JSON object, with every key filled and no markdown fences.",
    },
  ];
}

export function buildTellRepairMessages(input: {
  sentence: string;
  tells: TellReport[];
  output: string;
  draft: string;
}): ChatMessage[] {
  const labels = input.tells
    .map((tell) =>
      tell.examples[0]
        ? `${tell.label} ("${tell.examples[0]}")`
        : tell.label,
    )
    .join("; ");

  const system = `You are a line editor. Rewrite one AI-shaped sentence so it sounds like the writer, without changing the meaning and without adding anything. Return only the new sentence. If the sentence can be removed without losing meaning, return DELETE. No quotes, no commentary, no labels.`;

  const user = `AI tell: ${labels}

Sentence to rewrite:
${input.sentence}

Full rewrite for context:
<rewrite>
${truncate(input.output, 5000)}
</rewrite>

Original draft for facts:
<draft>
${truncate(input.draft, 5000)}
</draft>

Rewrite only that sentence. Keep every fact. Keep articles, prepositions, pronouns, and a complete grammatical sentence; do not shorten it by deleting grammar words. Do not add a greeting, sign-off, name, feeling, or new detail. Match the writer's existing voice; do not make it more formal.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildPolishMessages(
  messages: ChatMessage[],
  output: string,
  issues: { missing: string[]; added: string[]; tells: string[] },
): ChatMessage[] {
  const fixes: string[] = [];

  if (issues.missing.length > 0) {
    fixes.push(
      `Restore these exact details from the draft: ${issues.missing.slice(0, 12).join(", ")}.`,
    );
  }
  if (issues.added.length > 0) {
    fixes.push(
      `Remove claims that the draft does not support: ${issues.added.slice(0, 8).join("; ")}.`,
    );
  }
  if (issues.tells.length > 0) {
    fixes.push(
      `Remove these AI-shaped moves: ${issues.tells.slice(0, 8).join("; ")}. Do not replace them with another one.`,
    );
  }

  fixes.push(
    "Remove any greeting, sign-off, signature, or writer's name that is not in the draft.",
  );
  fixes.push("Do not add any new fact, feeling, or opinion.");
  fixes.push(
    "Change only what is needed to fix these problems. Leave every other sentence and every fact exactly as it is.",
  );

  return [
    ...messages,
    { role: "assistant", content: output },
    {
      role: "user",
      content: `Correct that rewrite. ${fixes.join(" ")} Keep the voice. Return only the corrected text.`,
    },
  ];
}
