import { describe, expect, it } from "vitest";
import {
  parseCsvImport,
  parseJsonImport,
  parseWhatsAppExport,
  splitBulk,
} from "@/lib/importers";

describe("importers", () => {
  it("extracts only the target name from a WhatsApp export", () => {
    const raw = `[12/03/2024, 09:41:22] Maya: okay so i think we should go
[12/03/2024, 09:42:01] Alex: yeah
[12/03/2024, 09:43:00] Maya: it's kind of far tho
but we can walk`;

    const messages = parseWhatsAppExport(raw, "Maya");

    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain("but we can walk");
    expect(messages.join(" ")).not.toContain("yeah");
  });

  it("splits a bulk paste on ---", () => {
    const raw =
      "First sample that is definitely long enough.\n---\nSecond sample that is also long enough.";

    expect(splitBulk(raw)).toHaveLength(2);
  });

  it("reads JSON arrays of strings and objects", () => {
    const raw = JSON.stringify([
      "A plain string sample that is long enough.",
      { text: "An object sample that is long enough." },
      { message: "A message field that is long enough." },
    ]);

    expect(parseJsonImport(raw)).toHaveLength(3);
  });

  it("reads a CSV text column with quoted commas", () => {
    const raw =
      'text,author\n"hello, this is a sample","Maya"\n"another sample that is long enough","Maya"';

    const texts = parseCsvImport(raw);

    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("hello, this is a sample");
  });
});
