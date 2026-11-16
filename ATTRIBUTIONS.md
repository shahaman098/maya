# Attributions

Maya is an original implementation, but it stands on a lot of other work.

## Writing patterns

- **[blader/humanizer](https://github.com/blader/humanizer)** (MIT). The catalogue of AI-writing tells and the idea of ordering them from strongest to weakest informed Maya's check list and prompt. Maya uses its own compact prompt text and its own regular expressions; no source code from the project is copied.
- **Wikipedia, [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)**. The underlying community-maintained pattern list. Wikipedia text is licensed under CC BY-SA; Maya does not reproduce the article, only the general taxonomy.

## Models referenced by the app

- **[Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B)** (Apache 2.0). Default writer for local development. Not redistributed.
- **[sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)** (Apache 2.0). Embeddings for semantic example matching, served through Ollama's `all-minilm`. Not redistributed.
- **[npario/humanizer](https://huggingface.co/npario/humanizer)** (Apache 2.0, based on google/gemma-4-12B). Optional Lab baseline. Not bundled and not used for normal rewrites. Its prompt format is part of its own model distribution; Maya only sends the draft as a single user message for the baseline variant.

No model weights are included in this repository. Downloading and using them is subject to their own licences and terms.

## Software

- [Next.js](https://nextjs.org/) — MIT
- [React](https://react.dev/) — MIT
- [Tailwind CSS](https://tailwindcss.com/) — MIT
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — MIT
- [lucide](https://lucide.dev/) — ISC
- [Zod](https://zod.dev/) — MIT
- [Vitest](https://vitest.dev/) — MIT

## A note on detectors

Maya is an editor, not a detector-evasion tool. The detector figures published by model authors are their own measurements on their own dates and drafts; they are not reproduced or independently verified here. Do not treat any detector score as evidence of authorship.
