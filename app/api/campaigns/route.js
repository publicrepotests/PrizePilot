import { saveCampaign, StoreError, updateCampaignStatus } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

const SESSION_COOKIE = "prizepilot_session";

export async function POST(request) {
  const requestId = makeRequestId();
  try {
    const body = await request.json();
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const campaign = await saveCampaign(
      {
        title: body.title || "Untitled campaign",
        prize: body.prize || "",
        audience: body.audience || "",
        method: body.method || "",
        type: body.type || "giveaway",
        endsOn: body.endsOn || "TBD",
        status: body.status || "draft",
      },
      sessionCookie
    );

    return jsonWithRequestId(campaign, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to save campaign right now.");
  }
}

export async function PATCH(request) {
  const requestId = makeRequestId();
  try {
    const body = await request.json();
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const updatedCampaign = await updateCampaignStatus(
      body.id || "",
      body.status || "",
      sessionCookie
    );

    return jsonWithRequestId(updatedCampaign, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to update campaign right now.");
  }
}
