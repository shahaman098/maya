"use client";

import { useMemo } from "react";

type Segment = {
  type: "same" | "add" | "remove";
  text: string;
};

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

function diffWords(before: string, after: string): {
  segments: Segment[];
  tooLong: boolean;
} {
  const a = tokenize(before);
  const b = tokenize(after);

  if (a.length > 1400 || b.length > 1400) {
    return { segments: [{ type: "same", text: after }], tooLong: true };
  }

  const rows = a.length + 1;
  const columns = b.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const segments: Segment[] = [];
  const push = (type: Segment["type"], text: string) => {
    const last = segments.at(-1);
    if (last && last.type === type) last.text += text;
    else segments.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("remove", a[i]);
      i += 1;
    } else {
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push("remove", a[i]);
    i += 1;
  }
  while (j < b.length) {
    push("add", b[j]);
    j += 1;
  }

  return { segments, tooLong: false };
}

export function Diff({ before, after }: { before: string; after: string }) {
  const result = useMemo(() => diffWords(before, after), [before, after]);

  if (result.tooLong) {
    return (
      <div>
        <p className="text-[11.5px] text-muted">
          Word-level changes are available for drafts under about 700 words.
        </p>
        <div className="prose-output mt-3">{after}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="prose-output">
        {result.segments.map((segment, index) =>
          segment.type === "same" ? (
            <span key={index}>{segment.text}</span>
          ) : (
            <span
              key={index}
              className={segment.type === "add" ? "diff-add" : "diff-remove"}
            >
              {segment.text}
            </span>
          ),
        )}
      </div>
      <div className="mt-4 flex items-center gap-4 text-[9.5px] uppercase tracking-[0.08em] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-moss-soft" /> Added
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-soft" /> Removed
        </span>
      </div>
    </div>
  );
}
