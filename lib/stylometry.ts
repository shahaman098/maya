import type {
  Genre,
  ProfileStats,
  SentenceBucket,
  StyleStats,
} from "@/lib/types";
import { countWords, pct } from "@/lib/utils";

const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "again",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "don",
  "down",
  "for",
  "from",
  "get",
  "got",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "hers",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "me",
  "more",
  "most",
  "my",
  "no",
  "not",
  "now",
  "of",
  "on",
  "one",
  "only",
  "or",
  "other",
  "our",
  "out",
  "over",
  "she",
  "should",
  "so",
  "some",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "up",
  "us",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yours",
]);

const HEDGES = [
  "maybe",
  "probably",
  "kind of",
  "sort of",
  "i think",
  "i guess",
  "might",
  "could",
  "perhaps",
  "possibly",
  "a bit",
  "a little",
  "i feel like",
  "not sure",
  "or something",
  "pretty much",
];

const INTENSIFIERS = [
  "really",
  "very",
  "so",
  "super",
  "absolutely",
  "totally",
  "literally",
  "honestly",
  "actually",
  "seriously",
];

const SLANG = [
  "gonna",
  "wanna",
  "kinda",
  "sorta",
  "yeah",
  "yep",
  "nope",
  "lol",
  "tbh",
  "idk",
  "imo",
  "omg",
  "ugh",
  "haha",
  "hehe",
  "hey",
  "hiya",
  "cool",
  "stuff",
  "folks",
  "guys",
  "dude",
  "mate",
];

const SPELLING_PAIRS: [string, string][] = [
  ["colour", "color"],
  ["favourite", "favorite"],
  ["realise", "realize"],
  ["organise", "organize"],
  ["behaviour", "behavior"],
  ["centre", "center"],
  ["theatre", "theater"],
  ["defence", "defense"],
  ["licence", "license"],
  ["travelling", "traveling"],
  ["cancelled", "canceled"],
  ["grey", "gray"],
  ["analyse", "analyze"],
  ["programme", "program"],
];

const SIGNOFF =
  /^(?:xx+|love|lots of love|thanks|thank you|cheers|best|talk soon|speak soon|see you|take care|catch you|yours|warmly|—|-|–)/i;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function countPhrase(text: string, phrase: string): number {
  const regex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "giu");
  return (text.match(regex) ?? []).length;
}

function countList(text: string, phrases: string[]): number {
  return phrases.reduce((sum, phrase) => sum + countPhrase(text, phrase), 0);
}

export function tokenizeWords(text: string, lowercase = false): string[] {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  return lowercase ? words.map((word) => word.toLowerCase()) : words;
}

export function contentTokens(text: string): string[] {
  return tokenizeWords(text, true).filter(
    (word) =>
      word.length > 2 &&
      !STOPWORDS.has(word) &&
      !word.includes("'") &&
      !word.includes("’"),
  );
}

export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const marked = normalized.replace(/([.!?…]+["'”’)\]]*)\s+/g, "$1\u0000");
  return marked
    .split(/\u0000|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function histogram(lengths: number[], total: number): SentenceBucket[] {
  const buckets = [
    { label: "1–5", count: 0 },
    { label: "6–10", count: 0 },
    { label: "11–15", count: 0 },
    { label: "16–25", count: 0 },
    { label: "26+", count: 0 },
  ];
  for (const length of lengths) {
    const bucket = buckets.find((candidate) => {
      if (candidate.label === "1–5") return length <= 5;
      if (candidate.label === "6–10") return length >= 6 && length <= 10;
      if (candidate.label === "11–15") return length >= 11 && length <= 15;
      if (candidate.label === "16–25") return length >= 16 && length <= 25;
      return length >= 26;
    });
    if (bucket) bucket.count += 1;
  }
  return buckets.map((bucket) => ({
    label: bucket.label,
    share: total > 0 ? round(bucket.count / total, 3) : 0,
  }));
}

function emptyStats(): StyleStats {
  return {
    sampleCount: 0,
    wordCount: 0,
    charCount: 0,
    avgSentenceLength: 0,
    medianSentenceLength: 0,
    sentenceLengthStdDev: 0,
    shortSentenceShare: 0,
    longSentenceShare: 0,
    avgWordLength: 0,
    typeTokenRatio: 0,
    contractionsPer100Words: 0,
    firstPersonPer100Words: 0,
    secondPersonPer100Words: 0,
    lowercaseStartShare: 0,
    lowercaseIShare: 0,
    emojiPer100Words: 0,
    exclamationsPer100Words: 0,
    questionsShare: 0,
    britishSpellingShare: null,
    punctuationPer1000Chars: {
      commas: 0,
      periods: 0,
      questions: 0,
      exclamations: 0,
      semicolons: 0,
      colons: 0,
      emDashes: 0,
      ellipses: 0,
      parentheses: 0,
    },
    hedgingPer100Words: 0,
    intensifiersPer100Words: 0,
    slangPer100Words: 0,
    avgParagraphWords: 0,
    sentenceHistogram: histogram([], 0),
    favouritePhrases: [],
    openings: [],
    signoffs: [],
  };
}

export function computeStats(
  samples: Array<{ text: string; genre: Genre }>,
): StyleStats {
  if (samples.length === 0) return emptyStats();

  const texts = samples.map((sample) => sample.text);
  const joined = texts.join("\n");
  const words = tokenizeWords(joined);
  const wordCount = words.length;
  const charCount = joined.length;
  const sentences = texts.flatMap(splitSentences);
  const sentenceLengths = sentences
    .map((sentence) => countWords(sentence))
    .filter((length) => length > 0);

  let commas = 0;
  let periods = 0;
  let questions = 0;
  let exclamations = 0;
  let semicolons = 0;
  let colons = 0;
  let emDashes = 0;
  let parentheses = 0;
  let ellipses = 0;

  for (const character of joined) {
    if (character === ",") commas += 1;
    else if (character === ".") periods += 1;
    else if (character === "?") questions += 1;
    else if (character === "!") exclamations += 1;
    else if (character === ";") semicolons += 1;
    else if (character === ":") colons += 1;
    else if (character === "—" || character === "–") emDashes += 1;
    else if (character === "(") parentheses += 1;
  }
  ellipses =
    (joined.match(/…/g) ?? []).length + (joined.match(/\.\.\./g) ?? []).length;

  const wordsPer100 = wordCount > 0 ? 100 / wordCount : 0;
  const charsPer1000 = charCount > 0 ? 1000 / charCount : 0;

  const contractions = (
    joined.match(/\b[\p{L}]+['’](?:s|t|re|ve|ll|d|m)\b/giu) ?? []
  ).length;
  const firstPerson = (
    joined.match(/\b(?:i|me|my|mine|i['’](?:m|ve|d|ll))\b/giu) ?? []
  ).length;
  const secondPerson = (
    joined.match(/\b(?:you|your|yours|you['’](?:re|ve|ll|d)|u)\b/giu) ?? []
  ).length;
  const uppercaseI = (joined.match(/\bI\b/g) ?? []).length;
  const lowercaseI = (joined.match(/\bi\b/g) ?? []).length;
  const totalI = uppercaseI + lowercaseI;

  let lowercaseStarts = 0;
  let letterStarts = 0;
  for (const sentence of sentences) {
    const firstLetter = sentence.match(/\p{L}/u)?.[0];
    if (!firstLetter) continue;
    letterStarts += 1;
    if (
      firstLetter === firstLetter.toLowerCase() &&
      firstLetter !== firstLetter.toUpperCase()
    ) {
      lowercaseStarts += 1;
    }
  }

  const emojiCount = (joined.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const questionSentences = sentences.filter((sentence) =>
    /[?]\s*["'”’)\]]*$/.test(sentence),
  ).length;

  let british = 0;
  let american = 0;
  for (const [britishForm, americanForm] of SPELLING_PAIRS) {
    british += countPhrase(joined, britishForm);
    american += countPhrase(joined, americanForm);
  }

  const paragraphs = texts
    .flatMap((text) => text.split(/\n\s*\n/))
    .map((paragraph) => countWords(paragraph))
    .filter((length) => length >= 3);
  const sampleLengths = texts.map(countWords).filter((length) => length > 0);
  const avgParagraphWords =
    paragraphs.length >= 2 ? mean(paragraphs) : mean(sampleLengths);

  const lowerTokens = tokenizeWords(joined, true);
  const phraseCounts = new Map<string, number>();
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= lowerTokens.length - size; index += 1) {
      const parts = lowerTokens.slice(index, index + size);
      if (parts.some((part) => /^\d+$/.test(part))) continue;
      if (parts.every((part) => STOPWORDS.has(part))) continue;
      const phrase = parts.join(" ");
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }
  const phraseThreshold = wordCount > 200 ? 2 : 1;
  const favouritePhrases = [...phraseCounts.entries()]
    .filter(([, count]) => count >= phraseThreshold)
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        b[0].split(" ").length - a[0].split(" ").length ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  const openingCounts = new Map<string, number>();
  for (const text of texts) {
    const opening = tokenizeWords(text, true).slice(0, 2).join(" ");
    if (!opening) continue;
    openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
  }
  const openings = [...openingCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([phrase, count]) => ({ phrase, count }));

  const signoffCounts = new Map<string, number>();
  for (const text of texts) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const last = lines.at(-1);
    if (!last || last.length > 50 || !SIGNOFF.test(last)) continue;
    signoffCounts.set(last, (signoffCounts.get(last) ?? 0) + 1);
  }
  const signoffs = [...signoffCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([line]) => line);

  const sentenceCount = sentenceLengths.length;
  const shortCount = sentenceLengths.filter((length) => length <= 5).length;
  const longCount = sentenceLengths.filter((length) => length >= 26).length;

  return {
    sampleCount: samples.length,
    wordCount,
    charCount,
    avgSentenceLength: round(mean(sentenceLengths)),
    medianSentenceLength: round(median(sentenceLengths)),
    sentenceLengthStdDev: round(stdev(sentenceLengths)),
    shortSentenceShare: sentenceCount > 0 ? shortCount / sentenceCount : 0,
    longSentenceShare: sentenceCount > 0 ? longCount / sentenceCount : 0,
    avgWordLength: wordCount > 0 ? round(mean(words.map((word) => word.length)), 2) : 0,
    typeTokenRatio:
      lowerTokens.length > 0
        ? round(new Set(lowerTokens.slice(0, 300)).size / Math.min(lowerTokens.length, 300), 2)
        : 0,
    contractionsPer100Words: round(contractions * wordsPer100, 1),
    firstPersonPer100Words: round(firstPerson * wordsPer100, 1),
    secondPersonPer100Words: round(secondPerson * wordsPer100, 1),
    lowercaseStartShare: letterStarts > 0 ? lowercaseStarts / letterStarts : 0,
    lowercaseIShare: totalI > 0 ? lowercaseI / totalI : 0,
    emojiPer100Words: round(emojiCount * wordsPer100, 1),
    exclamationsPer100Words: round(exclamations * wordsPer100, 1),
    questionsShare: sentenceCount > 0 ? questionSentences / sentenceCount : 0,
    britishSpellingShare:
      british + american > 0 ? round(british / (british + american), 2) : null,
    punctuationPer1000Chars: {
      commas: round(commas * charsPer1000, 1),
      periods: round(periods * charsPer1000, 1),
      questions: round(questions * charsPer1000, 1),
      exclamations: round(exclamations * charsPer1000, 1),
      semicolons: round(semicolons * charsPer1000, 1),
      colons: round(colons * charsPer1000, 1),
      emDashes: round(emDashes * charsPer1000, 1),
      ellipses: round(ellipses * charsPer1000, 1),
      parentheses: round(parentheses * charsPer1000, 1),
    },
    hedgingPer100Words: round(countList(joined, HEDGES) * wordsPer100, 1),
    intensifiersPer100Words: round(countList(joined, INTENSIFIERS) * wordsPer100, 1),
    slangPer100Words: round(countList(joined, SLANG) * wordsPer100, 1),
    avgParagraphWords: round(avgParagraphWords),
    sentenceHistogram: histogram(sentenceLengths, sentenceCount),
    favouritePhrases,
    openings,
    signoffs,
  };
}

export function analyzeSamples(
  samples: Array<{ text: string; genre: Genre }>,
): ProfileStats {
  const messageSamples = samples.filter((sample) => sample.genre === "message");
  const longformSamples = samples.filter((sample) => sample.genre !== "message");

  return {
    all: computeStats(samples),
    message: messageSamples.length > 0 ? computeStats(messageSamples) : null,
    longform: longformSamples.length > 0 ? computeStats(longformSamples) : null,
  };
}

export function buildBrief(stats: StyleStats, name = "This writer"): string {
  if (stats.sampleCount === 0) return "No writing samples yet.";

  const lines: string[] = [];
  if (stats.sampleCount < 8) {
    lines.push(
      `Based on only ${stats.sampleCount} samples, so treat this as a sketch rather than a rulebook.`,
    );
  }

  lines.push(
    `${name}'s median sentence is ${stats.medianSentenceLength} words, and ${pct(
      stats.shortSentenceShare,
    )} of sentences are five words or fewer. The rest run longer, so mix short and long sentences.`,
  );

  if (stats.contractionsPer100Words >= 3) {
    lines.push(
      `Contractions are frequent (${stats.contractionsPer100Words} per 100 words).`,
    );
  } else if (stats.contractionsPer100Words < 1) {
    lines.push(
      `Contractions are rare (${stats.contractionsPer100Words} per 100 words).`,
    );
  }

  if (stats.lowercaseStartShare >= 0.15) {
    lines.push(`${pct(stats.lowercaseStartShare)} of sentences begin lowercase.`);
  }
  if (stats.lowercaseIShare >= 0.4 && stats.firstPersonPer100Words >= 2) {
    lines.push(`The first-person pronoun appears as "i" more often than "I".`);
  }

  const emDashes = stats.punctuationPer1000Chars.emDashes;
  if (emDashes >= 0.8) {
    lines.push(`Em dashes appear about ${emDashes} times per 1,000 characters.`);
  } else if (emDashes < 0.2) {
    lines.push("Em dashes are almost absent.");
  }
  if (stats.punctuationPer1000Chars.semicolons < 0.2) {
    lines.push("Semicolons are essentially absent.");
  }
  if (stats.questionsShare >= 0.15) {
    lines.push(`Questions make up ${pct(stats.questionsShare)} of sentences.`);
  }

  const nameToken = name.toLowerCase().split(/\s+/)[0];
  const phraseItems = stats.favouritePhrases
    .filter(
      (item) =>
        !nameToken ||
        !item.phrase.toLowerCase().split(/\s+/).includes(nameToken),
    )
    .slice(0, 3);
  if (phraseItems.length > 0) {
    const phrases = phraseItems
      .map((item) => `"${item.phrase}"`)
      .join(", ");
    lines.push(`Phrases that recur: ${phrases}.`);
  }
  if (stats.openings.length > 0 && stats.openings[0].count >= 2) {
    const openers = stats.openings
      .filter((item) => item.count >= 2)
      .slice(0, 2)
      .map((item) => `"${item.phrase}"`)
      .join(" or ");
    if (openers) lines.push(`Samples often open with ${openers}.`);
  }
  if (stats.signoffs.length > 0) {
    lines.push(
      `Sign-offs tend to be ${stats.signoffs
        .slice(0, 2)
        .map((line) => `"${line}"`)
        .join(" or ")}.`,
    );
  }
  if (stats.avgParagraphWords > 0) {
    lines.push(`Paragraphs run about ${stats.avgParagraphWords} words.`);
  }

  return lines.slice(0, 7).join(" ");
}
