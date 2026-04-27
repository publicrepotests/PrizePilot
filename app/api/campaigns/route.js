import { saveCampaign, StoreError, updateCampaignStatus } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";
import { enforceMutationOrigin, enforceRateLimit } from "lib/requestSecurity";

const SESSION_COOKIE = "prizepilot_session";

export async function POST(request) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Campaign update blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "campaigns:create",
      limit: 40,
      windowMs: 15 * 60 * 1000,
      message: "Too many campaign saves. Please wait a moment.",
    });
    if (blockedRate) {
      return blockedRate;
    }

    const body = await request.json();
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const campaign = await saveCampaign(
      {
        title: body.title || "Untitled campaign",
        prize: body.prize || "",
        audience: body.audience || "",
        method: body.method || "",
        judgingCriteria: body.judgingCriteria || "",
        type: body.type || "giveaway",
        endsOn: body.endsOn || "TBD",
        endsAt: body.endsAt || "",
        trustMode: body.trustMode || "open",
        allowedSources: body.allowedSources || ["public-link"],
        audienceAllowlist: body.audienceAllowlist || "",
        brandName: body.brandName || "",
        brandLogoUrl: body.brandLogoUrl || "",
        brandPrimary: body.brandPrimary || "#172033",
        brandAccent: body.brandAccent || "#f06a43",
        hidePrizePilotBranding: Boolean(body.hidePrizePilotBranding),
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
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Campaign update blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "campaigns:update",
      limit: 80,
      windowMs: 15 * 60 * 1000,
      message: "Too many campaign updates. Please wait a moment.",
    });
    if (blockedRate) {
      return blockedRate;
    }

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
