import { jsonWithRequestId, makeRequestId } from "lib/apiUtils";
import { getStoreHealth } from "lib/prizePilotStore";

function parseStripeMode(secretKey) {
  const key = String(secretKey || "").trim();
  if (!key) {
    return "missing";
  }
  if (key.startsWith("sk_live_")) {
    return "live";
  }
  if (key.startsWith("sk_test_")) {
    return "test";
  }
  return "unknown";
}

export async function GET() {
  const requestId = makeRequestId();
  try {
    const store = await getStoreHealth();
    return jsonWithRequestId(
      {
        ok: true,
        service: "PrizePilot",
        backend: store.backend,
        dueLiveCampaigns: store.dueLiveCampaigns,
        stripeMode: parseStripeMode(process.env.STRIPE_SECRET_KEY),
        env: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
      },
      requestId
    );
  } catch (error) {
    console.error(`[${requestId}] health check failed`, error);
    return jsonWithRequestId(
      {
        ok: false,
        service: "PrizePilot",
        error: "Health check failed.",
        stripeMode: parseStripeMode(process.env.STRIPE_SECRET_KEY),
        env: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
      },
      requestId,
      { status: 503 }
    );
  }
}
