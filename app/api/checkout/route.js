import { NextResponse } from "next/server";
import { getStripe } from "lib/stripe";

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

export async function POST(request) {
  const body = await request.json();
  const plan = planConfig[body.plan] || planConfig.starter;
  const stripe = getStripe();

  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured yet. Add STRIPE_SECRET_KEY to enable live checkout.",
      },
      { status: 400 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
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
    success_url: `${origin}/billing/success?plan=${body.plan || "starter"}`,
    cancel_url: `${origin}/billing?canceled=1`,
  });

  return NextResponse.json({
    url: session.url,
  });
}
