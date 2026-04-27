import { getStoreHealth, settleExpiredCampaignsNow } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

function getCronSecret() {
  return String(process.env.PRIZEPILOT_CRON_SECRET || process.env.CRON_SECRET || "").trim();
}

function isAuthorized(request) {
  const configuredSecret = getCronSecret();
  if (!configuredSecret) {
    return { ok: false, reason: "missing-config" };
  }

  const bearer = String(request.headers.get("authorization") || "");
  const bearerToken = bearer.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : "";
  const headerToken = String(request.headers.get("x-cron-secret") || "").trim();
  const token = bearerToken || headerToken;

  if (!token || token !== configuredSecret) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}

async function handleSettle(request) {
  const requestId = makeRequestId();
  try {
    const auth = isAuthorized(request);
    if (!auth.ok) {
      if (auth.reason === "missing-config") {
        return jsonWithRequestId(
          { error: "Cron secret is not configured.", requestId },
          requestId,
          { status: 503 }
        );
      }
      return jsonWithRequestId({ error: "Unauthorized cron request.", requestId }, requestId, {
        status: 401,
      });
    }

    const [settled, health] = await Promise.all([settleExpiredCampaignsNow(), getStoreHealth()]);
    return jsonWithRequestId(
      {
        ok: true,
        requestId,
        settledCount: settled.settledCount,
        settledCampaignIds: settled.processedIds,
        backend: settled.backend,
        dueLiveCampaignsRemaining: health.dueLiveCampaigns,
        settledAt: settled.settledAt,
      },
      requestId
    );
  } catch (error) {
    return serverErrorResponse(error, requestId, "Unable to settle campaigns right now.");
  }
}

export async function GET(request) {
  return handleSettle(request);
}

export async function POST(request) {
  return handleSettle(request);
}
