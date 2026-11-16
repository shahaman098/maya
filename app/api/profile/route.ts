import { errorResponse, jsonOk } from "@/lib/http";
import { getLatestProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return jsonOk({ profile: getLatestProfile() });
  } catch (error) {
    return errorResponse(error);
  }
}
