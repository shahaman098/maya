"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, MessageSquare, Upload } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Textarea,
  Toggle,
  useToast,
} from "@/components/ui";
import {
  cleanImportedTexts,
  parseImportFile,
  parseWhatsAppExport,
  splitBulk,
} from "@/lib/importers";
import { detectPii, piiSummary } from "@/lib/pii";
import type { Audience, Genre } from "@/lib/types";
import { AUDIENCES, GENRES } from "@/lib/types";
import {
  AUDIENCE_UI,
  GENRE_LABELS,
  countWords,
  truncate,
} from "@/lib/utils";

type ImportTab = "paste" | "whatsapp" | "file";

export function SampleImport({
  open,
  mode,
  personName,
  onClose,
  onImported,
}: {
  open: boolean;
  mode: "add" | "import";
  personName: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<ImportTab>("paste");
  const [text, setText] = useState("");
  const [name, setName] = useState(personName);
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [genre, setGenre] = useState<Genre>("message");
  const [audience, setAudience] = useState<Audience>("friend");
  const [language, setLanguage] = useState("en");
  const [consent, setConsent] = useState(false);
  const [redact, setRedact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab("paste");
    setText("");
    setName(personName);
    setFileName("");
    setFileText("");
    setGenre(mode === "add" ? "message" : "other");
    setAudience(mode === "add" ? "friend" : "other");
    setLanguage("en");
    setConsent(false);
    setRedact(true);
    setSubmitting(false);
    setError("");
  }, [open, mode, personName]);

  const preview = useMemo(() => {
    if (!open) return [];
    if (mode === "add") return cleanImportedTexts([text]);
    if (tab === "paste") return splitBulk(text);
    if (tab === "whatsapp") {
      return parseWhatsAppExport(text, name || personName);
    }
    if (!fileText) return [];
    try {
      return parseImportFile(fileName, fileText);
    } catch {
      return [];
    }
  }, [open, mode, tab, text, name, personName, fileText, fileName]);

  const pii = useMemo(
    () => detectPii(preview.join("\n")),
    [preview],
  );
  const previewWords = useMemo(
    () => preview.reduce((sum, sample) => sum + countWords(sample), 0),
    [preview],
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      setFileName(file.name);
      setFileText(await file.text());
      setError("");
    } catch {
      setError("That file could not be read.");
    }
  }

  async function submit() {
    if (!consent) {
      setError("Confirm that you have permission to use this writing.");
      return;
    }
    if (preview.length === 0) {
      setError("There is nothing usable to import yet.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (mode === "add") {
        const response = await fetch("/api/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: preview[0],
            genre,
            audience,
            language: language.trim() || "en",
            source: "manual",
            consent,
            redact,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          redactions?: number;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "The sample was not saved.");
        }
        toast.push({
          title: "Sample added",
          description:
            data.redactions && data.redactions > 0
              ? `${data.redactions} personal detail${data.redactions === 1 ? "" : "s"} redacted.`
              : undefined,
          tone: "success",
        });
      } else {
        const response = await fetch("/api/samples/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode:
              tab === "whatsapp"
                ? "whatsapp"
                : tab === "file"
                  ? "file"
                  : "bulk",
            texts: preview,
            genre,
            audience,
            language: language.trim() || "en",
            source:
              tab === "whatsapp"
                ? "whatsapp"
                : tab === "file"
                  ? "file"
                  : "paste",
            consent,
            redact,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          imported?: number;
          duplicates?: number;
          redactions?: number;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "The samples were not imported.");
        }

        const parts = [`${data.imported ?? 0} samples imported`];
        if (data.duplicates) parts.push(`${data.duplicates} duplicates skipped`);
        if (data.redactions) {
          parts.push(
            `${data.redactions} personal detail${data.redactions === 1 ? "" : "s"} redacted`,
          );
        }
        toast.push({
          title: "Import finished",
          description: parts.join(" · "),
          tone: "success",
        });
      }

      onImported();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "add" ? "Add a sample" : "Import your writing";
  const description =
    mode === "add"
      ? "One message, an email, a paragraph. Keep it as you wrote it, not as you wish you had."
      : "Bring in a chat export, a folder of writing, or a few paragraphs pasted by hand.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10.5px] text-faint">
            {preview.length > 0
              ? `${preview.length} ${preview.length === 1 ? "sample" : "samples"} · ${previewWords.toLocaleString("en-GB")} words`
              : "Nothing ready yet"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void submit()}
              loading={submitting}
              disabled={preview.length === 0 || !consent}
            >
              {mode === "add" ? "Add sample" : `Import ${preview.length || ""}`}
            </Button>
          </div>
        </div>
      }
    >
      {mode === "import" && (
        <Segmented
          value={tab}
          onChange={setTab}
          className="mb-4"
          options={[
            { value: "paste", label: "Paste" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "file", label: "File" },
          ]}
        />
      )}

      <div className="space-y-4">
        {mode === "import" && tab === "whatsapp" && (
          <Field
            label="Your display name in the chat"
            hint="Only messages from this name are imported. Everyone else's messages are skipped."
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={personName}
            />
          </Field>
        )}

        {mode === "add" ? (
          <Field
            label="The writing"
            hint="Keep the punctuation, slang, and line breaks. Those are the signal."
          >
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              className="min-h-[170px]"
              placeholder="Paste the writing here…"
            />
          </Field>
        ) : tab === "file" ? (
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.json,.csv,text/plain,application/json,text/csv"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-paper/35 px-6 py-10 text-center transition hover:border-accent/40 hover:bg-paper/60"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-accent">
                <Upload className="h-4 w-4" />
              </span>
              <span className="mt-3 text-[12.5px] font-medium text-ink-soft">
                {fileName || "Choose a file"}
              </span>
              <span className="mt-1 text-[10.5px] text-faint">
                .txt with --- separators, .json, or .csv
              </span>
            </button>
            {fileText && preview.length === 0 && (
              <p className="mt-2 text-[10.5px] text-danger">
                That file did not contain any usable samples.
              </p>
            )}
          </div>
        ) : (
          <Field
            label="Paste your samples"
            hint="Separate samples with a line containing ---. Each sample needs at least 12 characters."
          >
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              className="min-h-[190px]"
              placeholder={
                tab === "whatsapp"
                  ? "Paste the chat export here…"
                  : "Paste the writing here…"
              }
            />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Format">
            <Select
              aria-label="Format"
              value={genre}
              onChange={(event) => setGenre(event.target.value as Genre)}
            >
              {GENRES.map((value) => (
                <option key={value} value={value}>
                  {GENRE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Written to">
            <Select
              aria-label="Audience"
              value={audience}
              onChange={(event) =>
                setAudience(event.target.value as Audience)
              }
            >
              {AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_UI[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language" hint="A short code, e.g. en or pt-BR.">
            <Input
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              maxLength={20}
            />
          </Field>
        </div>

        {preview.length > 0 && (
          <div className="rounded-xl border border-line bg-paper/40 p-3.5">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
              <FileText className="h-3.5 w-3.5" />
              Preview
            </div>
            <div className="mt-2 space-y-2">
              {preview.slice(0, 2).map((sample, index) => (
                <p
                  key={index}
                  className="line-clamp-2 text-[11.5px] leading-5 text-ink-soft"
                >
                  “{truncate(sample, 180)}”
                </p>
              ))}
            </div>
            {preview.length > 2 && (
              <p className="mt-2 text-[10px] text-faint">
                And {preview.length - 2} more.
              </p>
            )}
          </div>
        )}

        {pii.length > 0 && (
          <div
            className={
              redact
                ? "rounded-xl border border-amber/20 bg-amber-soft/60 px-3.5 py-2.5 text-[10.5px] leading-5 text-amber"
                : "rounded-xl border border-danger/20 bg-accent-soft/50 px-3.5 py-2.5 text-[10.5px] leading-5 text-danger"
            }
          >
            {redact
              ? `${piiSummary(pii)} will be replaced before saving.`
              : `${piiSummary(pii)} will be stored exactly as written.`}
          </div>
        )}

        <Toggle
          checked={redact}
          onChange={setRedact}
          label="Redact personal details"
          hint="Emails, phone numbers, card numbers, IDs, and handles are replaced with placeholders."
        />

        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-paper/35 p-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#b0472b]"
          />
          <span className="text-[11.5px] leading-5 text-muted">
            I wrote this or have permission to use it. I understand it will be
            stored locally and sent to the model endpoint configured in
            Settings when used for a rewrite.
          </span>
        </label>

        {error && (
          <p className="rounded-lg bg-accent-soft/50 px-3 py-2 text-[11px] leading-5 text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 text-[10px] text-faint">
          <MessageSquare className="h-3 w-3" />
          Media, system messages, and other people&apos;s messages are skipped.
        </div>
      </div>
    </Modal>
  );
}
