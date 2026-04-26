import { StoreError, submitCampaignEntry } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

export async function POST(request, { params }) {
  const requestId = makeRequestId();
  try {
    const resolved = await params;
    const body = await request.json();
    const result = await submitCampaignEntry(resolved.id || "", {
      name: body.name || "",
      email: body.email || "",
      source: body.source || "direct",
    });
    return jsonWithRequestId(result, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to submit entry.");
  }
}
