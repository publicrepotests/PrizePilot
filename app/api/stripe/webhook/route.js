import { getStripe } from "lib/stripe";
import {
  markWebhookEventProcessed,
  syncBillingFromCheckout,
  syncBillingFromSubscription,
  StoreError,
} from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

function toDateString(unixSeconds) {
  if (!unixSeconds) {
    return undefined;
  }
  return new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);
}

export async function POST(request) {
  const requestId = makeRequestId();
  try {
    const stripe = getStripe();
    if (!stripe) {
      return jsonWithRequestId({ error: "Stripe is not configured.", requestId }, requestId, {
        status: 400,
      });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return jsonWithRequestId(
        { error: "Missing STRIPE_WEBHOOK_SECRET.", requestId },
        requestId,
        { status: 400 }
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return jsonWithRequestId({ error: "Missing Stripe signature.", requestId }, requestId, {
        status: 400,
      });
    }

    const body = await request.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    const shouldProcess = await markWebhookEventProcessed(event.id, "stripe");
    if (!shouldProcess) {
      return jsonWithRequestId({ received: true, duplicate: true }, requestId);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await syncBillingFromCheckout({
          username: session.metadata?.username,
          plan: session.metadata?.plan,
          status: "active",
          renewalDate: DEFAULT_RENEWAL_DATE,
          stripeCustomerId: session.customer ? String(session.customer) : null,
          stripeSubscriptionId: session.subscription ? String(session.subscription) : null,
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await syncBillingFromSubscription({
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          renewalDate: toDateString(subscription.current_period_end),
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription ? String(invoice.subscription) : null;
        if (subscriptionId) {
          await syncBillingFromSubscription({
            stripeSubscriptionId: subscriptionId,
            status: "past_due",
            renewalDate: undefined,
            cancelAtPeriodEnd: false,
          });
        }
        break;
      }
      default:
        break;
    }

    return jsonWithRequestId({ received: true }, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Stripe webhook processing failed.");
  }
}

const DEFAULT_RENEWAL_DATE = "2026-06-01";
