# Maya

A local-first writing studio that learns how you write.

Maya builds a measured voice profile from your own messages, emails, and longer writing, retrieves a few relevant samples, rewrites a draft in that voice, and shows its work: the facts it checked, the AI-shaped phrases it found, and the samples it used.

It is an editor. It is not an AI detector, and it does not promise to beat one.

---

## What it does

- **Builds a voice profile** from real writing. Sentence rhythm, contractions, lowercase habits, punctuation, recurring phrases, openings, and sign-offs. A model adds a qualitative read: rhythm, diction, structure, punctuation, warmth, quirks, and things to avoid.
- **Retrieves style references** using format, audience, length, wording overlap, and optional MiniLM embeddings from a separate embeddings endpoint. Results are diversified so you don't get five near-identical samples.
- **Rewrites in context**: message, email, essay, post, or note; to a friend, colleague, client, or public audience; shorter, same, or a little longer; preserve, light touch, or restructure.
- **Checks the result**: preserved numbers (including number words), quotes, names, and links; AI tells; sentence rhythm; length; PII; and unchanged or repeated drafts.
- **Falls back safely**: if there are fewer than two samples in the draft's format, it uses a conservative generic edit and says so instead of forcing an academic voice onto a text message.
- **Audits fidelity** with the model, then makes a targeted second pass when details go missing. A candidate is only accepted if it does not lose more facts than the first pass.
- **Repairs leftover tells** sentence by sentence, instead of rewriting the whole draft again.
- **Shows the evidence**: which samples were retrieved and why, plus the measured habits behind the profile.
- **Learns from feedback**: a thumbs-up/down, a note, or your own edited version is stored with the draft and the generated output.

## Quick start

Requirements: Node 22+, Ollama (or any OpenAI-compatible chat endpoint), and enough memory for a local model.

```bash
npm install
ollama serve
ollama pull qwen3.5:9b
ollama pull all-minilm
npm run dev
```

Open <http://localhost:3000>.

1. Go to **Voice** and add 10–20 things you have already written.
2. Refresh the profile.
3. Go to **Write**, paste a draft, and press **Rewrite in my voice**.

The default writer is `qwen3.5:9b` at `http://127.0.0.1:11434/v1`. The embedding model is `all-minilm`, which is 384-dimensional and about 45 MB.

A 9B model at Q4 needs roughly 7 GB of free memory. A 12B model at Q8 is closer to 14 GB. The first run is slower while the model loads.

### Using a cloud API instead of local

Both writer slots are saved. Go to **Settings → Writer** and switch to **Cloud API**. Pick a preset (OpenAI, OpenRouter, DeepSeek, Groq, or Custom), set the model, and either paste a key or leave the key field blank to use an environment variable.

Embeddings stay local by default, so semantic retrieval keeps working when the writer is hosted. If you move embeddings to a hosted endpoint as well, that endpoint receives sample text.

The app never includes a key in the repository. Prefer `.env.local`:

```bash
OPENAI_API_KEY=sk-...
# or
OPENROUTER_API_KEY=sk-or-...
# or
DEEPSEEK_API_KEY=...
# or
GROQ_API_KEY=...
# or, for a custom gateway
MAYA_CLOUD_API_KEY=...
```

The Settings key field is stored in the local SQLite database. Leaving it blank keeps the key out of the database.

### Demo workspace

This repository was developed with a demo database in `data/demo.db`. It contains 14 fictional samples, a generated voice profile, four saved rewrites, and one Lab case.

```bash
npm run seed -- --model
MAYA_DB_PATH=./data/demo.db npm run dev
```

`npm run seed` writes to `data/demo.db` by default. It refuses to seed a path that does not contain `demo` unless you pass `--force`, because the seed inserts fictional writing. `--model` also generates the written voice card with the configured writer.

Without `MAYA_DB_PATH`, the app uses `data/maya.db`, which starts empty.

## Windows desktop app

**For people using Maya:** download **[Maya-Setup.exe](https://github.com/shahaman098/maya/releases/latest/download/Maya-Setup.exe)** and open it. It installs in one click with no admin prompt, opens Maya, and a setup guide takes over. The full walkthrough is in [docs/windows-setup.md](docs/windows-setup.md).

The download page is served from GitHub Pages at <https://shahaman098.github.io/maya/>.

The web UI is wrapped in Electron. The installed app bundles its own Node runtime and the Next standalone server, so the person using it doesn't need Node or a terminal.

```bash
npm run dev             # terminal 1, for desktop development
npm run desktop:dev     # terminal 2, opens the Electron window

npm run desktop:pack    # local unpacked app for testing
npm run desktop:win     # Windows NSIS installer, run on Windows
```

### Publishing a release

`.github/workflows/windows.yml` builds the installer on `windows-latest` and smoke-tests the packaged server against `/api/health`. When you push a `v*` tag, it also publishes `Maya-Setup.exe` to a GitHub Release. Because the file name stays the same, `releases/latest/download/Maya-Setup.exe` always points to the newest build.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

The installer is **unsigned** unless you add a code-signing certificate, so Windows SmartScreen shows "Windows protected your PC" (users click **More info → Run anyway**).

### First-run setup

The NSIS installer runs in one-click mode: per-user, no admin prompt, desktop and Start menu shortcuts, and it launches Maya when it finishes. On first launch the app shows a guided setup:

1. **Choose.** Maya reads RAM and GPU and recommends local (16 GB+ with a dedicated GPU, or 24 GB+) or a cloud API.
2. **Install everything.** One button runs these steps in order and skips any that are already done:
   - downloads `OllamaSetup.exe` from ollama.com and refuses to run it unless Windows reports a valid Authenticode signature from Ollama,
   - installs it silently,
   - starts the Ollama tray app,
   - pulls `qwen3.5:9b`, `all-minilm` and the humaniser `hf.co/npario/humanizer:Q4_K_M` through Ollama's HTTP API with byte-level progress,
   - points embeddings at local Ollama and switches the humaniser on as the Lab baseline (`promptFormat: "humanizer"`).

   On the API route this step comes after the key and skips only the local writer model, so Ollama, `all-minilm` and the humaniser are installed either way. The humaniser is on by default; a checkbox lets people with less memory skip its 7.6 GB.
3. **API key.** Pick a provider, open its key page, paste the key, and **Test and save**. Maya lists the provider's models to check the key before saving it. This step is required on the API route and optional (a backup) on the local route.
4. **Start.** Shows the three steps to a first rewrite and links to Voice.

Setup state is stored in `%APPDATA%\Maya\setup.json`. **Settings → Run setup again** reopens the wizard.

The app data lives in `%APPDATA%\Maya\maya.db`. The local server binds to `127.0.0.1` on a random port. The installer never contains the workspace database; `desktop:prepare` excludes it and refuses to package any `.db`, `.sqlite`, or `.sqlite3` file.

### Desktop caveats

- The first installer must be built by CI on Windows. The automatic Ollama install, the signature check and the one-click installer have not yet been run on a real Windows machine.
- The app bundles the Node runtime from the build machine; the CI uses Node 24 so the native SQLite binary matches.
- No auto-updater yet. To update, users download the newest `Maya-Setup.exe` and run it.
- The macOS `desktop:pack` target is for local testing; the Windows target is the shipping target.

## Models

### Writer: local or cloud

Maya has two saved writer slots:

- **Local** defaults to `qwen3.5:9b` on Ollama at `http://127.0.0.1:11434/v1`.
- **Cloud API** defaults to the OpenAI-compatible shape at `https://api.openai.com/v1`; presets are provided for OpenAI, OpenRouter, DeepSeek, and Groq.

The switch in **Settings → Writer** changes the active slot. The other slot and its key stay saved. The topbar model pill shows which one is live (`Local · qwen3.5:9b` or `API · gpt-4.1`).

For Qwen3.5, thinking is on by default. Maya sends `reasoning_effort: "none"` when **Skip model reasoning** is enabled. If a provider rejects that field, the client retries without it.

The client also retries common OpenAI-compatibility differences: it removes `temperature`, `top_p`, or `response_format` when a provider rejects them, and switches `max_tokens` to `max_completion_tokens` when a newer model requires it. A provider can still reject a request for its own reasons; the connection test and error message are the first place to look.

If the writer is a hosted endpoint, drafts, samples, and retrieved examples leave the machine. The app shows a warning at the top of Settings and in the Writer card.

### Embeddings

The embedding endpoint is separate from the writer. It defaults to local Ollama with `all-minilm` (384 dimensions, about 45 MB) at the usual `/v1` URL. This is deliberate: an API writer should not force your samples through a hosted embedding service.

Changing the embedding base URL, model, or key clears the stored vectors. They rebuild on the next rewrite. You can use a hosted embedding model such as OpenAI's `text-embedding-3-small`, but sample text will go to that endpoint and the dimension changes.

### Baseline (optional)

The Lab can compare against a dedicated humaniser. A good baseline is `npario/humanizer` (12B, Apache 2.0), fine-tuned from Gemma 4. It is not bundled and it is not used for normal rewrites.

One way to run it locally with llama.cpp:

```bash
hf download jialinyyzz/humanizer humanizer-12b-Q4_K_M.gguf prompt_format.json --local-dir ./humanizer-model
llama-server -m ./humanizer-model/humanizer-12b-Q4_K_M.gguf \
  -c 8192 -np 1 -ngl 99 --host 127.0.0.1 --port 8081
```

In **Settings → Baseline**, enable the comparison, set the base URL to `http://127.0.0.1:8081/v1`, and use the model id shown by **Test connection**. Recent GGUF downloads include a chat template that turns the last user message into the model's fixed prompt. Older downloads may not; use a current file or its own app/CLI.

For `npario/humanizer`, also set **Prompt format → Humaniser completion prompt**. The client then uses Ollama's native `/api/generate` endpoint and the model's required completion prompt, not a chat message.

The baseline's published detector results are its authors' measurements, not an independent benchmark. The same applies to any detector number. Maya does not use it in the default voice path: in [BENCHMARK.md](BENCHMARK.md), chaining it after the voice pass reduced fact preservation.

## How the voice engine works

```
samples ──► measured profile ──► voice card
                    │
draft ──► retrieval ─┴──► edit prompt ──► rewrite
                                           │
                              deterministic checks
                                           │
                                  fidelity audit
                                    │          │
                             facts missing?   tells left?
                                    │          │
                              full polish   sentence repair
                                    │          │
                                  candidate audit
                                           │
                                    final rewrite
```

### 1. Measured profile

`lib/stylometry.ts` computes, per modality (all, messages, long-form):

- median and average sentence length, standard deviation, short/long shares;
- contractions, first/second person, lowercase sentence starts, lowercase `i`;
- emoji, exclamation marks, questions;
- commas, periods, semicolons, colons, em dashes, ellipses, parentheses per 1,000 characters;
- hedges, intensifiers, slang, paragraph length, British/American spelling;
- recurring 2–3 word phrases, openings, and sign-offs.

The numeric brief is deterministic. It is also what the writer prompt receives, so the voice does not depend on a model's memory of the samples.

### 2. Voice card

The profile model returns strict JSON: headline, rhythm, diction, structure, punctuation, humour, quirks, and avoid. It is cached and versioned in SQLite. Refreshing creates a new version; the latest is used.

When a card is inserted into a rewrite prompt, quoted example phrases are stripped. The card still describes the habit, but the model cannot lift `"no rush"` or `"thanks maya"` out of the profile and drop it into a message.

### 3. Retrieval

`lib/retrieval.ts` scores candidates by:

- format match and genre bucket;
- audience match;
- length closeness;
- IDF-weighted lexical overlap;
- optional MiniLM cosine similarity;
- a diversity pass (MMR) so the examples do not collapse into near-duplicates.

The default is **2 examples**. Retrieval is intentionally conservative: a small model can treat full samples as source material and borrow their events or phrasing. Set it to 0 if you want the profile alone. The **What I used** panel shows exactly what was retrieved.

### 4. Edit prompt

The writer is told to edit, not replace, the draft:

- keep every fact, number, name, date, quote, and link;
- keep the order and sentence content for a preserve edit;
- keep grammatical words and complete sentences;
- do not add greetings, sign-offs, feelings, or claims;
- remove a compact list of AI tells;
- treat reference samples as style only.

### 5. Checks

`lib/checks.ts` is deterministic and fast:

- numbers (digits and number words), dates, quoted strings, names, links: missing or added;
- unchanged drafts, and drafts repeated inside the output;
- 18+ AI-tell patterns, including not-X-but-Y variants, press-release phrasing, dramatic closers, throat-clearing, AI vocabulary, inflated significance, sales language, chatbot residue, unnamed authority, stacked hedges, repeated openings, uniform rhythm, em-dash pileups, bold decoration, and curly quotes;
- sentence rhythm compared with the profile;
- length ratio;
- PII in the draft and output.

The score is a **pattern score**, not a detector. It is shown so you can decide what to edit, not as proof of authorship.

### 6. Fidelity audit and repair

When **Polish the first pass** is on:

1. The model audits the draft against the rewrite and lists missing details and added claims, including new feelings or reactions.
2. If facts are missing, a full polish pass is requested. The candidate is audited again; it is kept only if it does not increase the fidelity cost.
3. If high/medium AI tells remain, each offending sentence is rewritten on its own. A candidate is kept only if it does not lose facts or add numbers.
4. Two pure-filler patterns (`let that sink in`, `that's the real win`) and press-release framing (`thrilled to announce`) are removed deterministically.

This is deliberately conservative. It would rather return a faithful rewrite with one flagged tell than a fluent rewrite that invents a detail.

### 7. Feedback

Every rewrite stores the draft, output, your edits, your rating, and your note. Those pairs are the raw material for future tuning. They are **not** automatically treated as authentic voice samples; only writing you imported as human-written is used for retrieval.

## Pages

- **Home**: profile snapshot, library stats, recent rewrites, setup checklist.
- **Write**: the editor, context controls, streaming output, diff, checks, evidence, feedback.
- **Voice**: the written read, stylometric fingerprint, phrases, keep/avoid, sample library, import.
- **History**: search, reopen, copy, edit, rate, add a case to the Lab.
- **Lab**: run voice-matched, generic, raw, and optional baseline variants on the same draft; rate outputs manually.
- **Settings**: local/API writer switch, baseline endpoint, separate embeddings endpoint, thinking switch, polish pass, retrieval, PII redaction, export, delete.

## Importing

- **Paste** multiple samples separated by a line containing `---`.
- **WhatsApp export**: paste an exported chat, enter your display name, and get only your messages. Media, system messages, and other people's messages are skipped.
- **File**: `.txt` with `---` separators, `.json` (array of strings or objects with `text`/`message`/`content`/`body`), or `.csv` with a text column.

Imports are deduplicated, short fragments are skipped, and PII is redacted by default: emails, phone numbers, card numbers, IBANs, IDs, and handles.

## Privacy

- Data lives in SQLite at `data/maya.db` (or `MAYA_DB_PATH`). The `data/` directory is ignored by git.
- There is no authentication. It is a single-user local app; do not expose port 3000 to the public internet.
- API keys are stored in the local database. The JSON export omits them. Prefer an environment variable if you use a hosted endpoint.
- PII detection is best-effort. Review a sample after import if it contains sensitive details.
- If you point the writer at a hosted endpoint, drafts, samples, and retrieved examples are sent there. If you point embeddings at a hosted endpoint, sample text is sent there for embedding. The Settings page warns you in both cases.
- Keys pasted into Settings are stored in the local SQLite file. Keys from `.env.local` stay out of the database. The JSON export omits both.
- DOCX, DOC, and PDF files in the project are ignored by git. Imported text lives in the ignored SQLite database. Remove identity details from a document before importing it; the PII redactor covers emails, numbers, cards, and handles, not names.

## Development

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm start          # production server
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run benchmark  # repeatable proxy benchmark, see BENCHMARK.md
npm run seed       # demo database, no model call

npm run desktop:dev      # Electron against the local dev server
npm run desktop:prepare  # copy standalone assets + bundled Node runtime
npm run desktop:pack     # unpacked local desktop app
npm run desktop:win      # Windows NSIS installer
```

Useful environment variables:

```bash
MAYA_DB_PATH=./data/maya.db
MAYA_BASE_URL=http://127.0.0.1:11434/v1
MAYA_MODEL=qwen3.5:9b
MAYA_API_KEY=

MAYA_EMBED_BASE_URL=http://127.0.0.1:11434/v1
MAYA_EMBED_MODEL=all-minilm
MAYA_EMBED_API_KEY=

MAYA_CLOUD_BASE_URL=https://api.openai.com/v1
MAYA_CLOUD_MODEL=gpt-4.1
MAYA_CLOUD_API_KEY=

OPENAI_API_KEY=
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=
```

See `.env.example` for the full list. These only seed the defaults on first run; Settings saved in the app take over. Provider keys are still read at request time when the key field is blank, so adding `OPENAI_API_KEY` to `.env.local` is enough even after the app has been configured.

### Project layout

```
app/                 Next.js routes and pages
  api/               samples, profile, rewrite stream, rewrites, models, settings, eval, export, reset
components/          app shell, write workspace, checks, diff, voice, history, lab, settings
lib/
  db.ts              SQLite schema, migrations, reset
  samples.ts         import, dedupe, redaction, retrieval rows
  stylometry.ts      measured style
  profile.ts         versioned voice profiles and the voice card
  connections.ts     active local/API writer, embedding endpoint, env key fallback
  retrieval.ts       metadata, IDF, MiniLM, MMR
  prompts.ts         edit, profile, polish, and sentence-repair prompts
  checks.ts          deterministic AI-tell and fact checks
  fidelity.ts        model-based audit and acceptance rule
  tell-repair.ts     sentence-level tell repair
  rewrite.ts         pipeline orchestration
  eval.ts            Lab cases and runs
  llm.ts             OpenAI-compatible client, streaming, embeddings, native completion
scripts/seed-demo.ts
scripts/benchmark.ts
scripts/prepare-desktop.mjs
desktop/main.cjs
desktop/preload.cjs
electron-builder.yml
BENCHMARK.md
tests/
```

### Database

SQLite is enough for a personal library. There is no Postgres or pgvector requirement; embeddings are stored as BLOBs and cosine similarity runs in-process. A `data/maya.db` with thousands of samples is still small.

Tables: `samples`, `profiles`, `rewrites`, `eval_cases`, `eval_runs`, `settings`.

### Tests

```bash
npm test
```

The tests cover stylometry, fact/tell checks, PII redaction, and the WhatsApp/JSON/CSV/bulk importers. They do not call a model.

## Limitations

- A 9B local model is not a perfect editor. It can still drop a detail or borrow a phrase from a sample. The audit and checks catch some of this, not all of it. Read the result, especially names, numbers, and dates.
- Short messages are the hardest case: there is less signal, and a terse voice profile can push the model toward fragments. The prompt counterbalances this, but the output still varies.
- The fidelity audit is model-based. It can miss something or over-report. It is a second pair of eyes, not a guarantee.
- Detectors are unreliable and change over time. Maya does not optimise for them and makes no claim about passing one.
- PII detection is regex/Luhn based. It is not a privacy guarantee.
- Single-user, local-first, no auth, no multi-tenant isolation.
- No LoRA training is included. The right first step is retrieval and edited pairs; fine-tune only when there are enough approved examples.
- The baseline comparison is a manual Lab, not a controlled benchmark. The repeatable proxy benchmark is separate; see [BENCHMARK.md](BENCHMARK.md).
- The Cloud API slot needs a working key. Without one, the connection test returns an authentication error; that is expected. API model names and parameter support vary by provider, and the compatibility retries cannot cover every gateway.
- The local and cloud writer slots share the same temperature, retrieval count, and repair settings. Only the endpoint, model, key, and thinking switch are per slot.
- A 9B local model can leave a dense academic draft unchanged or repeat it. The checks flag this now, but it is not a rewrite. For dense long-form work, a stronger cloud API model is usually the better first pass.
- The current profile in this workspace is based on three long-form academic samples. Emails, messages and posts correctly fall back to a generic edit until at least two samples exist in those formats. The benchmark is explicit about this; see [BENCHMARK.md](BENCHMARK.md).
- DOCX is not a first-class upload format in the UI yet. Pasted text, WhatsApp exports, TXT, JSON, and CSV are supported. For a long DOCX, extract the sections that are actually the writer's prose and paste them; template guidance, tables of contents, form labels, and reviewer comments should be excluded.

## Roadmap

1. Use edited pairs to build a small preference/evaluation set.
2. Add an export for training pairs: draft, generated, edited, rating, note.
3. Test a LoRA on the writer only after the retrieval pipeline is stable.
4. Add a proper holdout evaluation with human ratings.
5. Consider a larger writer model for long-form work.

## Licence and attribution

MIT. See [LICENSE](LICENSE) and [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

The AI-tell taxonomy is adapted from [blader/humanizer](https://github.com/blader/humanizer) (MIT), which is based on Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). The implementation here uses original prompt text and regexes; the pattern list is the shared idea.

The optional baseline discussion references [npario/humanizer](https://huggingface.co/npario/humanizer) (Apache 2.0). The default writer is [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B) (Apache 2.0). Embeddings use [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) (Apache 2.0). No model weights are redistributed in this repository.

Maya is not affiliated with or endorsed by any of those projects.
