import { ZodError } from "zod";
import { LLMError } from "@/lib/llm";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(
  message: string,
  status = 400,
  details?: unknown,
): Response {
  return Response.json({ error: message, details }, { status });
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const path = issue?.path.join(".");
    return jsonError(
      path ? `${path}: ${issue.message}` : (issue?.message ?? "Invalid input."),
      400,
      error.issues,
    );
  }

  if (error instanceof LLMError) {
    return jsonError(error.message, 502, {
      hint: error.hint,
      code: error.code,
    });
  }

  if (isUniqueConstraint(error)) {
    return jsonError("That sample is already in the library.", 409);
  }

  console.error(error);
  return jsonError("Something went wrong on this machine.", 500);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("Invalid JSON body.", 400);
  }
}

export function notFound(message = "Not found."): ApiError {
  return new ApiError(message, 404);
}
