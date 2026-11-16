import { describe, expect, it } from "vitest";
import { findTells, runChecks } from "@/lib/checks";

describe("AI-tell detection", () => {
  it("flags staged and inflated writing", () => {
    const text =
      "It's not just a feature, it's a shift. Let that sink in. At its core, this is a pivotal moment.";
    const ids = findTells(text).map((tell) => tell.id);

    expect(ids).toContain("not-just");
    expect(ids).toContain("dramatic-closer");
    expect(ids).toContain("deep-saying");
    expect(ids).toContain("ai-lexicon");
  });

  it("detects dropped numbers and quotes", () => {
    const draft =
      'We saved 12% and shipped 4 features on 3 March. Maya said "ship it".';
    const output = "We saved money and shipped 4 features on 3 March.";

    const checks = runChecks({ draft, output });

    expect(checks.facts.missingNumbers).toContain("12%");
    expect(checks.facts.missingQuotes.length).toBeGreaterThan(0);
    expect(checks.facts.critical).toBe(true);
    expect(checks.score).toBeLessThan(80);
    expect(checks.notes.join(" ")).toContain("number");
  });

  it("passes a clean, fact-preserving rewrite", () => {
    const draft =
      'We saved 12% and shipped 4 features on 3 March. Maya said "ship it".';
    const output =
      'We shipped 4 features on 3 March and saved 12%. Maya said "ship it".';

    const checks = runChecks({ draft, output });

    expect(checks.facts.critical).toBe(false);
    expect(checks.tells).toHaveLength(0);
    expect(checks.score).toBeGreaterThanOrEqual(90);
  });
});
