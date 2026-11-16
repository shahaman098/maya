# Benchmark

A repeatable proxy benchmark for the voice pipeline. It is **not** a detector test and it is not a substitute for a human preference study.

## What it measures

Five synthetic drafts, one per format:

- academic results paragraph
- colleague email
- message to a friend
- public launch post
- academic library paragraph

Each case has expected facts (numbers, names, phrases). Every output is checked for:

- **facts**: no critical dropped numbers, quotes, names or links, and every expected fact present
- **pattern**: the app's AI-tell / rhythm / no-change checks
- **edited**: not identical to the draft and not a repeated draft
- **style**: a proxy comparing sentence length, contractions, lowercase starts, short-sentence share and word length to the voice profile
- **latency**

Number words and American/British spelling are normalised for fact checks. Multiword expected facts match as bags of words, so “activation steering” and “steering activation” both count.

## Variants

| Variant | What it is |
|---|---|
| `voice` | Profile + retrieval + audit/polish, with a format-aware fallback |
| `generic` | Same model with anti-slop rules, no profile or samples |
| `raw` | Plain rewrite instruction |
| `baseline` | `hf.co/npario/humanizer:Q4_K_M` via its required completion prompt |
| `voice+humanizer` | Voice output followed by the HF humaniser |

The format-aware fallback is important: if the library has fewer than two samples in the draft's format, the app uses a conservative generic edit and warns. This avoids forcing an academic profile onto a text message.

## Results

Run: 16 November 2026. Local `qwen3.5:9b`, profile built from three long-form academic samples. HF humaniser Q4_K_M.

| Variant | Fact pass | Pattern ≥85 | Meaningful edit | Avg style | Avg tells | Avg time | Proxy /10 |
|---|---:|---:|---:|---:|---:|---:|---:|
| **voice** | **5/5** | **5/5** | **5/5** | 0.33 | 0.0 | 7.3s | **8.7** |
| generic | 5/5 | 3/5 | 4/5 | 0.29 | 0.8 | 1.7s | 7.4 |
| raw | 5/5 | 3/5 | 3/5 | 0.33 | 1.8 | 1.6s | 7.1 |
| baseline (HF) | 4/5 | 5/5 | 5/5 | 0.32 | 0.8 | 2.9s | 7.8 |
| voice + HF | 3/5 | 4/5 | 5/5 | 0.38 | 0.4 | 8.5s | 6.8 |

The proxy weights facts 40%, meaningful edit 20%, pattern 20%, style 20%. It is a product diagnostic, not a universal score.

## Reading the result

**The voice pipeline passes every fact, pattern and meaningful-edit case: 10/10 on those three criteria.** That is the accuracy target for this benchmark.

The style proxy is **3.3/10**, not 10/10. There are three reasons:

1. The profile is based on three long-form academic samples. It has no emails, messages or posts.
2. Three of the five benchmark cases are outside that profile's formats, so they correctly fall back to the generic edit.
3. Style similarity is a crude proxy. A 0.33 does not mean the output sounds bad; it means the measured rhythm is not close to the academic profile. Only a human rating can settle that.

**Overall proxy: 8.7/10.** I would not call the current system 10/10 overall.

## What the benchmark changed

- **Number words are now facts.** “3” and “three” match; dropping “two” is flagged. This removed a false failure in the academic voice case.
- **Format-aware fallback.** An academic-only profile no longer rewrites a text message. The app warns and uses a conservative generic edit until at least two samples exist in that format.
- **No-change and repeated-draft checks.** The generic/raw variants sometimes leave a draft untouched or repeat it. Those are now flagged instead of scoring well.
- **HF humaniser integration.** `npario/humanizer` is wired through its required completion prompt and Ollama's native generate endpoint. It is available as a Lab baseline and can be enabled in Settings.

## Why the HF humaniser is not the default path

It is fast, and it removes patterns well, but in this benchmark it **lost a fact in 1 of 5 cases** and changed the voice. Chaining it after the voice pass was worse: **3/5 facts** vs 5/5 for voice alone. It remains a useful reference and an optional Lab baseline, not a default second pass.

## Reproduce

The benchmark runs against a copy of the workspace so it does not pollute history:

```bash
node - <<'NODE'
const Database = require('better-sqlite3');
const db = new Database('./data/maya.db', { readonly: true });
db.exec("VACUUM INTO './data/bench.db'");
db.close();
NODE
MAYA_DB_PATH=./data/bench.db npm run benchmark
```

The humaniser is optional. If `hf.co/npario/humanizer:Q4_K_M` is not installed, baseline variants are skipped.

The results file is `data/bench-results.json`, which is gitignored.

## Limitations

- Five synthetic cases is a smoke test, not a benchmark suite.
- No human preference ratings yet. The Lab's one-to-five ratings are the next signal.
- The style proxy is not a voice clone score.
- The benchmark does not measure detector evasion. Detectors are unreliable and are not a product goal.
- The local 9B can still fail on new drafts. The checks, audits and format fallback reduce risk; they cannot eliminate it.
