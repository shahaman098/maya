import { describe, expect, it } from "vitest";
import { findTells } from "@/lib/checks";
import { isDeletableFiller } from "@/lib/tell-repair";
import { stripSafeTells } from "@/lib/utils";

function ids(text: string): string[] {
  return findTells(text).map((tell) => tell.id);
}

describe("paraphrased AI tells", () => {
  it("flags paraphrased dramatic closers", () => {
    expect(ids("The files are uploaded. Take that in.")).toContain(
      "dramatic-closer",
    );
  });

  it("flags standalone closers but not the same words mid-sentence", () => {
    expect(ids("The files are uploaded. Think about that.")).toContain(
      "dramatic-closer-bare",
    );
    expect(ids("I'll think about that tomorrow.")).toHaveLength(0);
    expect(
      stripSafeTells("Read the brief. Think about it carefully before Friday."),
    ).toBe("Read the brief. Think about it carefully before Friday.");
    expect(stripSafeTells("Think about it carefully.")).toBe(
      "Think about it carefully.",
    );
    expect(stripSafeTells("The files are uploaded. Think about that.")).toBe(
      "The files are uploaded.",
    );
  });

  it("flags milestone hype", () => {
    expect(ids("This is a big moment for the product.")).toContain(
      "milestone-hype",
    );
    expect(ids("This marks a step forward for the team.")).toContain(
      "milestone-hype",
    );
    expect(ids("This is a milestone and a new chapter.")).toContain(
      "milestone-hype",
    );
  });

  it("flags generic verdict sentences", () => {
    expect(
      ids("These results demonstrate a promising inference-time intervention."),
    ).toContain("verdict-sentence");
  });

  it("flags stock closers", () => {
    expect(ids("We can't wait to hear what you think.")).toContain(
      "stock-closer",
    );
  });

  it("treats ordinary email phrasing as low severity", () => {
    const tells = findTells("Let me know if you have any questions.");
    expect(tells.map((tell) => tell.id)).toContain("stock-email");
    expect(tells.every((tell) => tell.severity === "low")).toBe(true);
  });

  it("leaves plain sentences alone", () => {
    expect(
      ids(
        "Hybrid steering cut sycophantic agreement by 42% and kept 96% of general capability.",
      ),
    ).toHaveLength(0);
    expect(ids("We hit the first milestone on Tuesday.")).toHaveLength(0);
  });
});

describe("stripSafeTells", () => {
  it("recapitalises a sentence after removing press-release phrasing", () => {
    expect(
      stripSafeTells("We're excited to share that our new onboarding flow is live!"),
    ).toBe("Our new onboarding flow is live!");
  });

  it("removes paraphrased closers", () => {
    expect(stripSafeTells("The files are uploaded. Take that in.")).toBe(
      "The files are uploaded.",
    );
  });

  it("replaces a trailing ellipsis the draft did not have", () => {
    expect(
      stripSafeTells("A promising intervention...", "A promising intervention."),
    ).toBe("A promising intervention.");
    expect(stripSafeTells("Well...", "Well...")).toBe("Well...");
  });
});

describe("isDeletableFiller", () => {
  const hype = findTells("It's a milestone and a new chapter.");

  it("allows dropping a fact-free hype sentence", () => {
    expect(isDeletableFiller("It's a milestone and a new chapter.", hype)).toBe(
      true,
    );
  });

  it("keeps sentences with numbers, names, or non-filler tells", () => {
    expect(
      isDeletableFiller("Version 2 is a big moment for the product.", hype),
    ).toBe(false);
    expect(
      isDeletableFiller("This is a big moment for Priya and the team.", hype),
    ).toBe(false);
    const verdict = findTells(
      "These results demonstrate a promising intervention.",
    );
    expect(
      isDeletableFiller("These results demonstrate a promising intervention.", verdict),
    ).toBe(false);
  });
});
