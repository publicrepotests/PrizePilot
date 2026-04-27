import { getCampaignRules, StoreError } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

const SESSION_COOKIE = "prizepilot_session";

export async function GET(request, { params }) {
  const requestId = makeRequestId();
  try {
    const resolved = await params;
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const payload = await getCampaignRules(resolved.id || "", sessionCookie);
    return jsonWithRequestId(payload, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to load campaign rules.");
  }
}
