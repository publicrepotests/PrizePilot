import Stripe from "stripe";

const globalForStripe = globalThis;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (!globalForStripe.prizePilotStripe) {
    globalForStripe.prizePilotStripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });
  }

  return globalForStripe.prizePilotStripe;
}
