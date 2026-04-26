import { saveBilling, StoreError } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

const SESSION_COOKIE = "prizepilot_session";

export async function PATCH(request) {
  const requestId = makeRequestId();
  try {
    const body = await request.json();
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const state = await saveBilling(body.plan || "starter", sessionCookie);
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
