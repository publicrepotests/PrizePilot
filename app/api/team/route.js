import {
  addTeamMember,
  getTeamMembers,
  removeTeamMember,
  StoreError,
  updateTeamMemberRole,
} from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";
import { enforceMutationOrigin, enforceRateLimit } from "lib/requestSecurity";

const SESSION_COOKIE = "prizepilot_session";

export async function GET(request) {
  const requestId = makeRequestId();
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const team = await getTeamMembers(sessionCookie);
    return jsonWithRequestId(team, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to load team right now.");
  }
}

export async function POST(request) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Team update blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "team:create",
      limit: 30,
      windowMs: 15 * 60 * 1000,
      message: "Too many team updates. Please wait a moment.",
    });
    if (blockedRate) {
      return blockedRate;
    }

    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const body = await request.json();
    const team = await addTeamMember(
      {
        usernameOrEmail: body.usernameOrEmail || "",
        role: body.role || "manager",
      },
      sessionCookie
    );
    return jsonWithRequestId(team, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to add team member.");
  }
}

export async function PATCH(request) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Team update blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "team:update",
      limit: 60,
      windowMs: 15 * 60 * 1000,
      message: "Too many team updates. Please wait a moment.",
    });
    if (blockedRate) {
      return blockedRate;
    }

    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const body = await request.json();
    const team = await updateTeamMemberRole(body.memberId || "", body.role || "", sessionCookie);
    return jsonWithRequestId(team, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to update team member role.");
  }
}

export async function DELETE(request) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Team update blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "team:delete",
      limit: 30,
      windowMs: 15 * 60 * 1000,
      message: "Too many team updates. Please wait a moment.",
    });
    if (blockedRate) {
      return blockedRate;
    }

    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const body = await request.json();
    const team = await removeTeamMember(body.memberId || "", sessionCookie);
    return jsonWithRequestId(team, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to remove team member.");
  }
}
