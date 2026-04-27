import {
  getPublicState,
  getStoreHealth,
  settleExpiredCampaignsForSession,
  StoreError,
} from "lib/prizePilotStore";
import { buildLaunchReadinessChecks } from "lib/launchReadiness";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

const SESSION_COOKIE = "prizepilot_session";

export async function GET(request) {
  const requestId = makeRequestId();
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const state = await getPublicState(sessionCookie);
    if (!state.session.loggedIn) {
      return jsonWithRequestId({ error: "Please sign in to view diagnostics.", requestId }, requestId, {
        status: 401,
      });
    }

    const store = await getStoreHealth();
    const readiness = buildLaunchReadinessChecks(store);

    return jsonWithRequestId(
      {
        ok: true,
        backend: store.backend,
        readiness,
        dueLiveCampaigns: store.dueLiveCampaigns,
        session: {
          username: state.session.username,
          email: state.session.email,
          billingPlan: state.billing.plan,
        },
        timestamp: new Date().toISOString(),
      },
      requestId
    );
  } catch (error) {
    return serverErrorResponse(error, requestId, "Unable to load diagnostics right now.");
  }
}

export async function POST(request) {
  const requestId = makeRequestId();
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const state = await getPublicState(sessionCookie);
    if (!state.session.loggedIn) {
      return jsonWithRequestId({ error: "Please sign in to run diagnostics actions.", requestId }, requestId, {
        status: 401,
      });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    if (action !== "settle_now") {
      return jsonWithRequestId({ error: "Unknown diagnostics action.", requestId }, requestId, {
        status: 400,
      });
    }

    const settled = await settleExpiredCampaignsForSession(sessionCookie);
    return jsonWithRequestId(
      {
        ok: true,
        action: "settle_now",
        settledCount: settled.settledCount,
        settledCampaignIds: settled.processedIds,
        backend: settled.backend,
        settledAt: settled.settledAt,
      },
      requestId
    );
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to run diagnostics action right now.");
  }
}
