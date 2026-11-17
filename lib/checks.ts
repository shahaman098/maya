import { detectPii, piiSummary } from "@/lib/pii";
import { splitSentences, tokenizeWords } from "@/lib/stylometry";
import type {
  Checks,
  FactReport,
  Profile,
  RhythmReport,
  TellReport,
  TellSeverity,
} from "@/lib/types";
import {
  clamp,
  countWords,
  normalizeForHash,
  truncate,
} from "@/lib/utils";

interface TellRule {
  id: string;
  label: string;
  severity: TellSeverity;
  pattern: RegExp;
}

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
  thousand: "1000",
};

const RULES: TellRule[] = [
  {
    id: "not-just",
    label: "Not-X-but-Y construction",
    severity: "high",
    pattern:
      /\b(?:it(?:'|’)s|it is|this is|that(?:'|’)s|that is) not (?:just|only|about)\b[^.!?\n]{1,80}?(?:,|;|:|—|–|\s-\s|\s)\s*(?:it(?:'|’)s|it is|but|this is|that is)\b/giu,
  },
  {
    id: "not-just-bare",
    label: "Not-X-but-Y construction",
    severity: "high",
    pattern:
      /\bnot (?:just|only|about) [^.!?\n]{1,70}?(?:,|;|:|—|–|\s-\s|\s)\s*(?:it(?:'|’)s|it is|but|this is|that is)\b/giu,
  },
  {
    id: "press-release",
    label: "Press-release phrasing",
    severity: "high",
    pattern:
      /\b(?:thrilled|excited|delighted|proud|happy) to (?:announce|share|reveal|confirm|let you know)\b/giu,
  },
  {
    id: "dramatic-closer",
    label: "Dramatic one-line closer",
    severity: "high",
    pattern:
      /\b(?:let that sink in|(?:take|soak) that in|read that again|that(?:'|’)s the (?:real )?win|that(?:'|’)s what it(?:'|’)s about|that(?:'|’)s the whole point|and that(?:'|’)s (?:the )?(?:magic|beauty)|this is what [^.!?\n]{0,40} looks like)\b/giu,
  },
  {
    id: "dramatic-closer-bare",
    label: "Dramatic one-line closer",
    severity: "high",
    pattern:
      /(?:^|[.!?]\s+)(?:think about (?:that|it)|sit with (?:that|it)|just think about (?:that|it)|wow|imagine that)[.!?]+(?=\s|$)/giu,
  },
  {
    id: "milestone-hype",
    label: "Milestone hype",
    severity: "medium",
    pattern:
      /\b(?:(?:a|this|that) (?:huge|big|major|significant|important|key|exciting|proud) (?:moment|milestone|step(?: forward)?|day)|marks? (?:a|an|the) (?:step forward|milestone|new (?:era|chapter)|shift)|(?:a|the) (?:new|next|exciting) chapter|(?:a|the) new beginning|(?:is|was|marks) (?:a|an) (?:milestone|new chapter))\b/giu,
  },
  {
    id: "verdict-sentence",
    label: "Generic verdict sentence",
    severity: "medium",
    pattern:
      /\b(?:these|the|our|this) (?:results|findings|work|study|data) (?:demonstrates?|highlights?|underscores?|showcases?|illustrates?|shows?) (?:a|an|the)? ?(?:promising|significant|compelling|powerful|exciting|novel|important) [a-z-]+/giu,
  },
  {
    id: "stock-closer",
    label: "Stock closing line",
    severity: "medium",
    pattern:
      /\b(?:(?:we|i) can(?:'|’)t wait to (?:hear|see) what you think|(?:we|i)(?:'|’)d love to hear (?:your thoughts|from you|what you think)|feel free to reach out|don(?:'|’)t hesitate to (?:reach out|contact)|i hope this (?:email|message|note) finds you well|stay tuned)\b/giu,
  },
  {
    id: "stock-email",
    label: "Stock email phrasing",
    severity: "low",
    pattern:
      /\b(?:i (?:just )?wanted to (?:follow up|reach out|touch base|check in)|let me know if you have any (?:questions|concerns)|please (?:find|see) attached)\b/giu,
  },
  {
    id: "deep-saying",
    label: "Saying that sounds deep",
    severity: "medium",
    pattern:
      /\b(?:at (?:its|the) core|when you (?:really )?think about it|what really matters is|the (?:real )?(?:magic|beauty) (?:is|lies))\b/giu,
  },
  {
    id: "throat-clearing",
    label: "Throat-clearing opener",
    severity: "high",
    pattern:
      /\b(?:here(?:'|’)s the thing|let(?:'|’)s dive in|let(?:'|’)s be honest|in today(?:'|’)s (?:fast-paced|ever-changing|digital) world|picture this|imagine this)\b/giu,
  },
  {
    id: "ai-lexicon",
    label: "AI vocabulary",
    severity: "medium",
    pattern:
      /\b(?:delve|delving|tapestry|testament to|landscape of|realm of|navigat(?:e|ing) the|leverag(?:e|ing)|robust|foster(?:ing)?|underscor(?:e|ing)|showcas(?:e|ing)|meticulous(?:ly)?|intricate|pivotal|seamless(?:ly)?|vibrant|ever-evolving|game[- ]chang(?:er|ing))\b/giu,
  },
  {
    id: "inflated-significance",
    label: "Inflated significance",
    severity: "high",
    pattern:
      /\b(?:mark(?:ing|s)? a (?:pivotal|turning) (?:moment|point)|stands? as a testament|speaks volumes|leaves? an indelible mark|the future looks bright|continues? to thrive)\b/giu,
  },
  {
    id: "sales-language",
    label: "Sales language",
    severity: "medium",
    pattern:
      /\b(?:nestled|breathtaking|stunning|unforgettable|must-visit|hidden gem|beloved)\b/giu,
  },
  {
    id: "chat-residue",
    label: "Chatbot residue",
    severity: "high",
    pattern:
      /\b(?:great question|i hope this helps|certainly!|of course!|let me know if you(?:'|’)d like|as an ai)\b/giu,
  },
  {
    id: "borrowed-authority",
    label: "Unnamed authority",
    severity: "medium",
    pattern:
      /\b(?:experts (?:say|believe|agree)|studies show|research shows|many people say)\b/giu,
  },
  {
    id: "stacked-hedges",
    label: "Stacked hedges",
    severity: "low",
    pattern:
      /\b(?:could|might|may) (?:potentially|possibly|perhaps)\b|\b(?:perhaps|possibly|maybe) (?:potentially|possibly)\b/giu,
  },
  {
    id: "conclusion-restate",
    label: "Restating the ending",
    severity: "medium",
    pattern:
      /(?:^|\n)\s*(?:in conclusion|ultimately|overall|the bottom line)\b/giu,
  },
];

function matchAll(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  return [...text.matchAll(regex)]
    .map((match) => match[0].replace(/^\s+|\s+$/g, ""))
    .filter(Boolean);
}

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

export function findTells(text: string): TellReport[] {
  const reports: TellReport[] = [];

  for (const rule of RULES) {
    const matches = matchAll(text, rule.pattern);
    if (matches.length === 0) continue;
    reports.push({
      id: rule.id,
      label: rule.label,
      severity: rule.severity,
      count: matches.length,
      examples: [...new Set(matches)].slice(0, 2).map((match) => truncate(match, 90)),
    });
  }

  const sentences = splitSentences(text);
  if (sentences.length >= 5) {
    const openings = sentences
      .map((sentence) => tokenizeWords(sentence, true).slice(0, 2).join(" "))
      .filter((opening) => opening.split(" ").length === 2);
    const counts = new Map<string, number>();
    for (const opening of openings) {
      counts.set(opening, (counts.get(opening) ?? 0) + 1);
    }
    const repeated = [...counts.entries()].find(([, count]) => count >= 3);
    if (repeated) {
      reports.push({
        id: "repeated-openings",
        label: "Repeated sentence openings",
        severity: "medium",
        count: repeated[1],
        examples: [`"${repeated[0]}…"`],
      });
    }
  }

  const lengths = sentences
    .map((sentence) => countWords(sentence))
    .filter((length) => length > 0);
  if (lengths.length >= 6 && stdev(lengths) < 2.5) {
    reports.push({
      id: "uniform-rhythm",
      label: "Uniform sentence rhythm",
      severity: "medium",
      count: 1,
      examples: [`${lengths.length} sentences with a standard deviation of ${stdev(lengths).toFixed(1)} words`],
    });
  }

  const emDashes = (text.match(/[—–]/g) ?? []).length;
  if (emDashes >= 4 && emDashes / Math.max(1, countWords(text) / 100) > 0.8) {
    reports.push({
      id: "em-dash-overuse",
      label: "Em-dash pileup",
      severity: "low",
      count: emDashes,
      examples: ["More than one em dash per 100 words"],
    });
  }

  const merged = new Map<string, TellReport>();
  for (const report of reports) {
    const existing = merged.get(report.label);
    if (existing) {
      existing.count += report.count;
      existing.examples = [
        ...new Set([...existing.examples, ...report.examples]),
      ].slice(0, 2);
    } else {
      merged.set(report.label, { ...report });
    }
  }

  return [...merged.values()];
}

function extractNumbers(text: string): string[] {
  const numeric = text.match(
    /\b\d[\d,]*(?:\.\d+)?%?(?!\d)|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b/giu,
  ) ?? [];
  const words = text.match(
    /(?<!\bno\s)(?<!\bany\s)\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/giu,
  ) ?? [];

  return [
    ...new Set([
      ...numeric.map((match) => match.replace(/,/g, "").toLowerCase()),
      ...words.map((word) => NUMBER_WORDS[word.toLowerCase()]).filter(Boolean),
    ]),
  ];
}

function extractQuotes(text: string): string[] {
  const matches = text.matchAll(/"([^"\n]{2,120})"|“([^”\n]{2,120})”/g);
  const values: string[] = [];
  for (const match of matches) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value) values.push(value.toLowerCase());
  }
  return [...new Set(values)];
}

const NOT_NAMES = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "but",
  "and",
  "so",
  "if",
  "when",
  "after",
  "before",
  "because",
  "however",
  "they",
  "there",
  "then",
  "what",
  "why",
  "how",
  "it",
  "we",
  "you",
  "i",
]);

function extractNames(text: string): string[] {
  const multi =
    text.match(
      /\b(?:[A-Z][a-z]{2,}(?:\s+(?:[A-Z][a-z]{2,}|van|von|de|da|al)){1,3})\b/g,
    ) ?? [];
  const acronyms = text.match(/\b[A-Z]{2,5}\b/g) ?? [];

  const filtered = multi.filter((name) => {
    const first = name.split(/\s+/)[0]?.toLowerCase();
    return !(first && NOT_NAMES.has(first) && name.split(/\s+/).length === 2);
  });

  const all = [...filtered, ...acronyms.filter((value) => value !== "I")];
  return [...new Set(all.map((value) => value.toLowerCase()))].slice(0, 40);
}

function extractLinks(text: string): string[] {
  const matches =
    text.match(/\bhttps?:\/\/[^\s)>\]]+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g) ?? [];
  return [...new Set(matches.map((value) => value.toLowerCase()))];
}

function difference(base: string[], comparison: string[]): string[] {
  const other = new Set(comparison);
  return [...new Set(base)].filter((value) => !other.has(value));
}

function factCheck(draft: string, output: string): FactReport {
  const draftNumbers = extractNumbers(draft);
  const outputNumbers = extractNumbers(output);
  const draftQuotes = extractQuotes(draft);
  const outputQuotes = extractQuotes(output);
  const draftNames = extractNames(draft);
  const outputNames = extractNames(output);
  const draftLinks = extractLinks(draft);
  const outputLinks = extractLinks(output);

  const missingNumbers = difference(draftNumbers, outputNumbers);
  const missingQuotes = difference(draftQuotes, outputQuotes);
  const missingNames = difference(draftNames, outputNames);
  const missingLinks = difference(draftLinks, outputLinks);
  const addedNumbers = difference(outputNumbers, draftNumbers);

  return {
    missingNumbers,
    addedNumbers,
    missingQuotes,
    missingNames,
    missingLinks,
    critical:
      missingNumbers.length > 0 ||
      missingQuotes.length > 0 ||
      missingLinks.length > 0,
  };
}

function rhythmCheck(output: string, profile?: Profile | null): RhythmReport {
  const lengths = splitSentences(output)
    .map((sentence) => countWords(sentence))
    .filter((length) => length > 0);
  const deviation = stdev(lengths);
  const shortShare =
    lengths.length > 0
      ? lengths.filter((length) => length <= 5).length / lengths.length
      : 0;
  const reference = profile?.stats.all;

  let verdict: RhythmReport["verdict"] = "even";
  if (lengths.length < 4) verdict = "short";
  else if (
    deviation < 2.5 ||
    (reference &&
      reference.sentenceLengthStdDev > 0 &&
      deviation < reference.sentenceLengthStdDev * 0.55)
  ) {
    verdict = "flat";
  } else if (shortShare > 0.45 || deviation > 6) {
    verdict = "varied";
  }

  return {
    median: median(lengths),
    stdev: deviation,
    shortShare,
    verdict,
  };
}

export function runChecks(input: {
  draft: string;
  output: string;
  profile?: Profile | null;
}): Checks {
  const { draft, output, profile } = input;
  const facts = factCheck(draft, output);
  const tells = findTells(output);

  const normalizedDraft = normalizeForHash(draft);
  const normalizedOutput = normalizeForHash(output);
  const unchanged =
    normalizedDraft.length > 0 && normalizedDraft === normalizedOutput;
  const repeated =
    !unchanged &&
    normalizedDraft.length > 80 &&
    normalizedOutput.includes(normalizedDraft);

  if (unchanged) {
    tells.push({
      id: "unchanged",
      label: "Draft left unchanged",
      severity: "high",
      count: 1,
      examples: ["The output is identical to the draft."],
    });
  } else if (repeated) {
    tells.push({
      id: "repeated-draft",
      label: "Draft repeated in output",
      severity: "high",
      count: 1,
      examples: ["The draft appears inside the rewrite."],
    });
  }

  const draftBold = (draft.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
  const outputBold = (output.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
  if (outputBold >= 4 && outputBold > draftBold + 1) {
    tells.push({
      id: "bold-decoration",
      label: "Bold as decoration",
      severity: "low",
      count: outputBold,
      examples: ["Several bold phrases were added"],
    });
  }

  const outputCurly = (output.match(/[“”‘’]/g) ?? []).length;
  const draftCurly = (draft.match(/[“”‘’]/g) ?? []).length;
  if (outputCurly >= 2 && draftCurly === 0) {
    tells.push({
      id: "curly-quotes",
      label: "Curly quotes introduced",
      severity: "low",
      count: outputCurly,
      examples: ["Straight quotes became curly quotes"],
    });
  }

  const emDashReference = profile?.stats.all.punctuationPer1000Chars.emDashes;
  if (
    typeof emDashReference === "number" &&
    emDashReference < 0.2 &&
    (output.match(/[—–]/g) ?? []).length > 0
  ) {
    tells.push({
      id: "new-em-dash",
      label: "Em dash where the writer rarely uses one",
      severity: "low",
      count: (output.match(/[—–]/g) ?? []).length,
      examples: ["Em dashes are rare in the samples"],
    });
  }

  const rhythm = rhythmCheck(output, profile);
  const draftWords = Math.max(1, countWords(draft));
  const outputWords = countWords(output);
  const lengthRatio = outputWords / draftWords;

  let score = 100;
  const tellDeduction = tells.reduce(
    (sum, tell) =>
      sum + (tell.severity === "high" ? 6 : tell.severity === "medium" ? 3 : 1),
    0,
  );
  score -= Math.min(30, tellDeduction);
  if (facts.missingNumbers.length > 0) score -= 18;
  if (facts.missingQuotes.length > 0) score -= 12;
  if (facts.missingLinks.length > 0) score -= 12;
  score -= Math.min(8, facts.missingNames.length * 2);
  score -= Math.min(6, facts.addedNumbers.length * 2);
  if (unchanged) score -= 20;
  if (repeated) score -= 18;
  if (rhythm.verdict === "flat") score -= 6;
  if (draftWords >= 40 && (lengthRatio < 0.6 || lengthRatio > 1.65)) score -= 6;
  score = clamp(Math.round(score), 0, 100);

  const notes: string[] = [];
  if (facts.missingNumbers.length > 0) {
    notes.push(
      `${facts.missingNumbers.length} number${facts.missingNumbers.length === 1 ? "" : "s"} changed or disappeared.`,
    );
  }
  if (facts.missingQuotes.length > 0) notes.push("A quotation is missing or changed.");
  if (facts.missingLinks.length > 0) notes.push("A link or email address changed.");
  if (facts.missingNames.length > 0) {
    notes.push(
      `${facts.missingNames.length} name${facts.missingNames.length === 1 ? "" : "s"} may not have survived.`,
    );
  }
  if (unchanged) {
    notes.push("The model left the draft unchanged.");
  } else if (repeated) {
    notes.push("The rewrite repeats the draft instead of editing it.");
  }
  if (tells.length > 0) {
    notes.push(
      `${tells.reduce((sum, tell) => sum + tell.count, 0)} pattern${tells.reduce((sum, tell) => sum + tell.count, 0) === 1 ? "" : "s"} found.`,
    );
  }
  if (rhythm.verdict === "flat") {
    notes.push("The rhythm is more even than the writer's usual style.");
  }
  if (draftWords >= 40 && lengthRatio < 0.6) notes.push("The rewrite is much shorter than the draft.");
  if (draftWords >= 40 && lengthRatio > 1.65) notes.push("The rewrite is much longer than the draft.");

  const draftPii = detectPii(draft);
  if (draftPii.length > 0) {
    notes.push(
      `The draft contains ${piiSummary(draftPii)}. It was sent to the configured model endpoint.`,
    );
  }

  if (notes.length === 0) {
    notes.push("No obvious AI tells, dropped facts, or rhythm problems.");
  }

  const verdict =
    score >= 88
      ? "Reads like a person"
      : score >= 75
        ? "Close, one pass left"
        : score >= 60
          ? "Some AI habits left"
          : "Needs another pass";

  return {
    score,
    verdict,
    facts,
    tells,
    rhythm,
    lengthRatio,
    pii: {
      draft: draftPii,
      output: detectPii(output),
    },
    notes,
  };
}
