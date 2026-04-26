import { jsonWithRequestId, makeRequestId } from "lib/apiUtils";

export async function GET() {
  const requestId = makeRequestId();
  return jsonWithRequestId(
    {
      ok: true,
      service: "PrizePilot",
      timestamp: new Date().toISOString(),
    },
    requestId
  );
}
