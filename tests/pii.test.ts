import { describe, expect, it } from "vitest";
import { detectPii, piiSummary, redactPii } from "@/lib/pii";

describe("PII detection", () => {
  it("finds and redacts common personal details", () => {
    const text =
      "Email maya@example.com or call +1 415 555 0132. Card 4242 4242 4242 4242. Handle @maya_writes.";
    const hits = detectPii(text);

    expect(hits.some((hit) => hit.type === "email")).toBe(true);
    expect(hits.some((hit) => hit.type === "phone")).toBe(true);
    expect(hits.some((hit) => hit.type === "card")).toBe(true);
    expect(hits.some((hit) => hit.type === "handle")).toBe(true);
    expect(piiSummary(hits)).toContain("email");

    const redacted = redactPii(text).text;
    expect(redacted).not.toContain("maya@example.com");
    expect(redacted).not.toContain("4242 4242 4242 4242");
    expect(redacted).toContain("[email]");
    expect(redacted).toContain("[card]");
    expect(redacted).toContain("[phone]");
  });

  it("leaves ordinary dates and numbers alone", () => {
    const text = "We met on 12/03/2024 and shipped 4 features for 12% less.";
    const hits = detectPii(text);
    const redacted = redactPii(text).text;

    expect(hits).toHaveLength(0);
    expect(redacted).toBe(text);
  });
});
