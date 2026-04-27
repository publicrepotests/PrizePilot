import { getPublicCampaignRulesById } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

export async function GET(_request, { params }) {
  const requestId = makeRequestId();
  try {
    const resolved = await params;
    const payload = await getPublicCampaignRulesById(resolved.id || "");
    if (!payload) {
      return jsonWithRequestId({ error: "Campaign rules not found.", requestId }, requestId, {
        status: 404,
      });
    }
    return jsonWithRequestId(payload, requestId);
  } catch (error) {
    return serverErrorResponse(error, requestId, "Unable to load public rules.");
  }
}
