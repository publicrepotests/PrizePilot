import { getStoreHealth } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId } from "lib/apiUtils";

export async function GET() {
  const requestId = makeRequestId();
  try {
    const store = await getStoreHealth();
    const checks = {
      database: store.ok,
      stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      appUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      resetEmailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    };

    const ready = checks.database && checks.appUrlConfigured;
    return jsonWithRequestId(
      {
        ok: ready,
        checks,
        backend: store.backend,
        timestamp: new Date().toISOString(),
      },
      requestId,
      { status: ready ? 200 : 503 }
    );
  } catch (error) {
    console.error(`[${requestId}] readiness failed`, error);
    return jsonWithRequestId(
      {
        ok: false,
        error: "Readiness check failed.",
      },
      requestId,
      { status: 503 }
    );
  }
}
