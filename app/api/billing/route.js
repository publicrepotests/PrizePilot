import {
  getBillingSubscriptionInfo,
  saveBilling,
  setBillingCancelAtPeriodEnd,
  StoreError,
} from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";
import { enforceMutationOrigin, enforceRateLimit } from "lib/requestSecurity";
import { getStripe } from "lib/stripe";

const SESSION_COOKIE = "prizepilot_session";

export async function PATCH(request) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Billing update blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "billing:update",
      limit: 25,
      windowMs: 15 * 60 * 1000,
      message: "Too many billing changes. Please wait a moment.",
    });
    if (blockedRate) {
      return blockedRate;
    }

    const body = await request.json();
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const action = String(body.action || "").trim().toLowerCase();
    const requestedPlan = String(body.plan || "starter").trim().toLowerCase();

    if (action === "cancel" || action === "resume") {
      const stripe = getStripe();
      const billing = await getBillingSubscriptionInfo(sessionCookie);
      if (stripe && billing.stripeSubscriptionId) {
        await stripe.subscriptions.update(billing.stripeSubscriptionId, {
          cancel_at_period_end: action === "cancel",
        });
      }

      const state = await setBillingCancelAtPeriodEnd(action === "cancel", sessionCookie);
      return jsonWithRequestId(state, requestId);
    }

    if (requestedPlan === "business") {
      return jsonWithRequestId(
        {
          error: "Business plan is temporarily unavailable while enterprise features are in progress.",
          requestId,
        },
        requestId,
        { status: 403 }
      );
    }

    const state = await saveBilling(requestedPlan, sessionCookie);
    return jsonWithRequestId(state, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to update billing right now.");
  }
}
