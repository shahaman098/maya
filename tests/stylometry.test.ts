import { describe, expect, it } from "vitest";
import {
  analyzeSamples,
  buildBrief,
  computeStats,
} from "@/lib/stylometry";

const samples = [
  {
    text: "okay so i think we should go. it's kind of far tho",
    genre: "message" as const,
  },
  {
    text: "honestly the whole thing was fine. i'll send it over later",
    genre: "message" as const,
  },
  {
    text: "Thanks for the note. I'll take a look tomorrow and send edits.\n\nBest,\nMaya",
    genre: "email" as const,
  },
];

describe("stylometry", () => {
  it("splits messages and long-form writing", () => {
    const stats = analyzeSamples(samples);

    expect(stats.all.sampleCount).toBe(3);
    expect(stats.message?.sampleCount).toBe(2);
    expect(stats.longform?.sampleCount).toBe(1);
    expect(stats.all.medianSentenceLength).toBeGreaterThan(0);
    expect(stats.all.contractionsPer100Words).toBeGreaterThan(0);
    expect(stats.all.lowercaseStartShare).toBeGreaterThan(0);
    expect(stats.all.favouritePhrases.length).toBeGreaterThan(0);
  });

  it("writes a grounded brief", () => {
    const stats = analyzeSamples(samples).all;
    const brief = buildBrief(stats, "Maya");

    expect(brief).toContain("Maya's median sentence");
    expect(brief).toContain("Contractions");
  });

  it("handles an empty library", () => {
    const stats = computeStats([]);

    expect(stats.sampleCount).toBe(0);
    expect(stats.wordCount).toBe(0);
    expect(stats.medianSentenceLength).toBe(0);
    expect(stats.favouritePhrases).toHaveLength(0);
  });
});
