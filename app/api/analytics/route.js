import { getWorkspaceAnalytics, StoreError } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

const SESSION_COOKIE = "prizepilot_session";

export async function GET(request) {
  const requestId = makeRequestId();
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const analytics = await getWorkspaceAnalytics(sessionCookie);
    return jsonWithRequestId(analytics, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to load advanced analytics.");
  }
}
