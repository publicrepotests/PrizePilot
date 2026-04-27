import { getStoreHealth } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId } from "lib/apiUtils";
import { buildLaunchReadinessChecks } from "lib/launchReadiness";

export async function GET() {
  const requestId = makeRequestId();
  try {
    const store = await getStoreHealth();
    const readiness = buildLaunchReadinessChecks(store);

    return jsonWithRequestId(
      {
        ok: readiness.ok,
        checks: readiness.checks,
        backend: store.backend,
        warnings: readiness.warnings,
        timestamp: new Date().toISOString(),
      },
      requestId,
      { status: readiness.ok ? 200 : 503 }
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
