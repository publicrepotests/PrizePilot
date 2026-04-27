import { getContestJudgingBoard, StoreError, submitContestJudgingScore } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";
import { enforceMutationOrigin, enforceRateLimit } from "lib/requestSecurity";

const SESSION_COOKIE = "prizepilot_session";

export async function GET(request, { params }) {
  const requestId = makeRequestId();
  try {
    const resolved = await params;
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const payload = await getContestJudgingBoard(resolved.id || "", sessionCookie);
    return jsonWithRequestId(payload, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to load judging dashboard.");
  }
}

export async function POST(request, { params }) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Judging update blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }
    const resolved = await params;
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "judging:score",
      scope: resolved.id || "campaign",
      limit: 120,
      windowMs: 15 * 60 * 1000,
      message: "Too many judging updates. Please wait a moment.",
    });
    if (blockedRate) {
      return blockedRate;
    }

    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const body = await request.json();
    const payload = await submitContestJudgingScore(
      resolved.id || "",
      {
        entrantId: body.entrantId || "",
        score: body.score,
        notes: body.notes || "",
      },
      sessionCookie
    );
    return jsonWithRequestId(payload, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to submit judging score.");
  }
}
