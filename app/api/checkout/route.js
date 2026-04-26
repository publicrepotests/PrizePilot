import { getStripe } from "lib/stripe";
import { getPublicState } from "lib/prizePilotStore";
import { checkRateLimit } from "lib/rateLimit";
import {
  getClientIp,
  jsonWithRequestId,
  makeRequestId,
  serverErrorResponse,
} from "lib/apiUtils";

const planConfig = {
  starter: {
    label: "Starter",
    amount: 1900,
  },
  pro: {
    label: "Pro",
    amount: 4900,
  },
  business: {
    label: "Business",
    amount: 9900,
  },
};
const SESSION_COOKIE = "prizepilot_session";

export async function POST(request) {
  const requestId = makeRequestId();
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    const state = await getPublicState(sessionToken);
    if (!state.session.loggedIn) {
      return jsonWithRequestId({ error: "Please sign in to start checkout.", requestId }, requestId, {
        status: 401,
      });
    }

    const ip = getClientIp(request);
    const rate = checkRateLimit(`checkout:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) {
      const limited = jsonWithRequestId(
        { error: "Too many checkout attempts. Please wait and try again.", requestId },
        requestId,
        { status: 429 }
      );
      limited.headers.set("retry-after", String(rate.retryAfterSec));
      return limited;
    }

    const body = await request.json();
    const selectedPlanId = Object.prototype.hasOwnProperty.call(planConfig, body.plan)
      ? body.plan
      : "starter";
    const plan = planConfig[selectedPlanId];
    const stripe = getStripe();

    if (!stripe) {
      return jsonWithRequestId(
        {
          error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to enable live checkout.",
          requestId,
        },
        requestId,
        { status: 400 }
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: state.session.email || undefined,
      client_reference_id: state.session.username || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: plan.amount,
            recurring: {
              interval: "month",
            },
            product_data: {
              name: `PrizePilot ${plan.label}`,
            },
          },
        },
      ],
      success_url: `${origin}/billing/success?plan=${selectedPlanId}`,
      cancel_url: `${origin}/billing?canceled=1`,
      metadata: {
        username: state.session.username || "",
        plan: selectedPlanId,
      },
    });

    return jsonWithRequestId(
      {
        url: session.url,
      },
      requestId
    );
  } catch (error) {
    return serverErrorResponse(error, requestId, "Unable to create checkout session right now.");
  }
}
