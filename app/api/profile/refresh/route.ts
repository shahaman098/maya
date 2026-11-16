import { ApiError, errorResponse, jsonOk } from "@/lib/http";
import { createProfile } from "@/lib/profile";
import { countSamples } from "@/lib/samples";
import { profileRefreshSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function POST(request: Request): Promise<Response> {
  try {
    if (countSamples() === 0) {
      throw new ApiError("Add a few samples before building a profile.", 400);
    }

    const body = profileRefreshSchema.parse(
      await request.json().catch(() => ({})),
    );
    const { profile, warning } = await createProfile({
      useModel: body.useModel,
    });

    return jsonOk({ profile, warning });
  } catch (error) {
    return errorResponse(error);
  }
}
