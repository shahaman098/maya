import { runChecks } from "@/lib/checks";
import {
  auditFidelity,
  fidelityAcceptable,
  type FidelityReport,
} from "@/lib/fidelity";
import { errorResponse, readJson } from "@/lib/http";
import { chat, LLMError, streamChat } from "@/lib/llm";
import { buildPolishMessages } from "@/lib/prompts";
import { createRewrite, updateRewrite } from "@/lib/rewrites";
import {
  isBetterCandidate,
  mergeIssues,
  outputTokenBudget,
  polishIssues,
  prepareRewrite,
} from "@/lib/rewrite";
import { rewriteSchema } from "@/lib/schemas";
import { repairTells } from "@/lib/tell-repair";
import { cleanModelOutput, stripSafeTells } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;



export async function POST(request: Request): Promise<Response> {
  let body: ReturnType<typeof rewriteSchema.parse>;
  try {
    body = rewriteSchema.parse(await readJson(request));
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });

  let rewriteId: string | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();

      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      try {
        send({ type: "stage", stage: "retrieving" });
        const prepared = await prepareRewrite(body, "voice");

        if (prepared.warning) {
          send({ type: "warning", message: prepared.warning });
        }
        if (prepared.examples.length > 0) {
          send({
            type: "examples",
            examples: prepared.examples.map((example) => ({
              id: example.sample.id,
              text: example.sample.text.slice(0, 320),
              genre: example.sample.genre,
              audience: example.sample.audience,
              reason: example.reason,
            })),
          });
        }

        const row = createRewrite({
          draft: body.draft,
          genre: body.genre,
          audience: body.audience,
          lengthMode: body.lengthMode,
          intent: body.intent,
          model: prepared.model,
          connection: prepared.connectionLabel,
          profileId: prepared.profile?.id ?? null,
          exampleIds: prepared.examples.map((example) => example.sample.id),
        });
        rewriteId = row.id;
        send({ type: "start", id: row.id });
        send({ type: "stage", stage: "writing" });

        let output = "";
        const usage = { input: 0, output: 0 };

        for await (const delta of streamChat(
          prepared.connection,
          prepared.messages,
          {
            temperature: prepared.temperature,
            maxTokens: outputTokenBudget(body.draft),
            timeoutMs: 300_000,
            signal: abortController.signal,
            onUsage: (next) => {
              usage.input = next.input;
              usage.output = next.output;
            },
          },
        )) {
          output += delta;
          send({ type: "delta", text: delta });
        }

        output = cleanModelOutput(output);
        if (!output) {
          throw new LLMError("The model returned no usable text.", {
            code: "empty",
            hint: "Try again, or choose a different model in Settings.",
          });
        }

        send({ type: "stage", stage: "checking" });
        let checks = runChecks({
          draft: body.draft,
          output,
          profile: prepared.profile,
        });

        let issues = polishIssues(checks);
        let firstAudit: FidelityReport | null = null;
        if (prepared.settings.writer.repairPass) {
          send({ type: "stage", stage: "auditing" });
          firstAudit = await auditFidelity({
            connection: prepared.connection,
            draft: body.draft,
            output,
            signal: abortController.signal,
          });
          if (firstAudit) issues = mergeIssues(issues, firstAudit);
        }

        if (
          prepared.settings.writer.repairPass &&
          (issues.missing.length > 0 || issues.added.length > 0)
        ) {
          send({ type: "stage", stage: "polishing" });
          try {
            const repaired = await chat(
              prepared.connection,
              buildPolishMessages(prepared.messages, output, issues),
              {
                temperature: 0.45,
                maxTokens: outputTokenBudget(body.draft),
                timeoutMs: 240_000,
                signal: abortController.signal,
              },
            );
            const candidate = cleanModelOutput(repaired.content);
            if (candidate) {
              const candidateChecks = runChecks({
                draft: body.draft,
                output: candidate,
                profile: prepared.profile,
              });
              const candidateAudit = await auditFidelity({
                connection: prepared.connection,
                draft: body.draft,
                output: candidate,
                signal: abortController.signal,
              });
              if (
                isBetterCandidate(candidateChecks, checks) &&
                fidelityAcceptable(firstAudit, candidateAudit)
              ) {
                output = candidate;
                checks = candidateChecks;
                send({ type: "replace", text: output });
              }
            }
            usage.input += repaired.usage.input;
            usage.output += repaired.usage.output;
          } catch (error) {
            if (error instanceof LLMError && error.code === "cancelled") {
              throw error;
            }
          }
        }

        if (prepared.settings.writer.repairPass) {
          send({ type: "stage", stage: "tightening" });
          try {
            const tellRepair = await repairTells({
              connection: prepared.connection,
              draft: body.draft,
              output,
              profile: prepared.profile,
              signal: abortController.signal,
            });
            if (tellRepair.changed) {
              output = tellRepair.output;
              checks = tellRepair.checks;
              send({ type: "replace", text: output });
            }
            usage.input += tellRepair.usage.input;
            usage.output += tellRepair.usage.output;
          } catch (error) {
            if (error instanceof LLMError && error.code === "cancelled") {
              throw error;
            }
          }
        }

        const fillerFree = stripSafeTells(output, body.draft);
        if (fillerFree && fillerFree !== output) {
          const fillerChecks = runChecks({
            draft: body.draft,
            output: fillerFree,
            profile: prepared.profile,
          });
          if (isBetterCandidate(fillerChecks, checks)) {
            output = fillerFree;
            checks = fillerChecks;
            send({ type: "replace", text: output });
          }
        }

        const updated = updateRewrite(row.id, {
          output,
          checks,
          status: "done",
          error: null,
          latencyMs: Date.now() - started,
          tokensIn: usage.input || null,
          tokensOut: usage.output || null,
        });

        send({ type: "done", rewrite: updated });
      } catch (error) {
        const cancelled =
          abortController.signal.aborted ||
          (error instanceof LLMError && error.code === "cancelled");
        const message =
          error instanceof Error ? error.message : "The rewrite failed.";
        const hint = error instanceof LLMError ? error.hint : undefined;

        if (rewriteId) {
          updateRewrite(rewriteId, {
            status: cancelled ? "cancelled" : "error",
            error: cancelled ? null : message,
            latencyMs: Date.now() - started,
          });
        }

        if (!cancelled) {
          send({ type: "error", message, hint });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The client already closed the stream.
        }
        request.signal.removeEventListener("abort", onAbort);
      }
    },
    cancel() {
      closed = true;
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
