import { getPublicCampaignById } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

export async function GET(_request, { params }) {
  const requestId = makeRequestId();
  try {
    const resolved = await params;
    const campaign = await getPublicCampaignById(resolved.id || "");
    if (!campaign) {
      return jsonWithRequestId({ error: "Campaign not found.", requestId }, requestId, {
        status: 404,
      });
    }
    return jsonWithRequestId(campaign, requestId);
  } catch (error) {
    return serverErrorResponse(error, requestId, "Unable to load campaign.");
  }
}
