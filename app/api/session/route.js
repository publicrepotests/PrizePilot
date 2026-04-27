import {
  getPublicState,
  loginOrganizer,
  logoutOrganizer,
  requestPasswordReset,
  registerOrganizer,
  resetPasswordWithRecoveryPassphrase,
  resetPasswordWithToken,
  StoreError,
} from "lib/prizePilotStore";
import { checkRateLimit } from "lib/rateLimit";
import { sendPasswordResetEmail } from "lib/email";
import {
  getClientIp,
  jsonWithRequestId,
  makeRequestId,
  serverErrorResponse,
} from "lib/apiUtils";
import { enforceMutationOrigin } from "lib/requestSecurity";

const SESSION_COOKIE = "prizepilot_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * Number(process.env.SESSION_TTL_DAYS || 14);
const IS_PROD = process.env.NODE_ENV === "production";

export async function GET(request) {
  const requestId = makeRequestId();
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const state = await getPublicState(sessionCookie);
    return jsonWithRequestId(state, requestId);
  } catch (error) {
    console.error(`[${requestId}] session bootstrap failed`, error);
    return jsonWithRequestId(
      {
        session: {
          loggedIn: false,
          username: "",
          organizerName: "",
          businessName: "",
          email: "",
        },
        billing: {
          plan: "starter",
          status: "trialing",
          renewalDate: "2026-06-01",
          cancelAtPeriodEnd: false,
        },
        campaigns: [],
      },
      requestId
    );
  }
}

export async function POST(request) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Authentication request blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }

    const ip = getClientIp(request);
    const body = await request.json();
    const mode =
      body.mode === "register" ||
      body.mode === "reset_request" ||
      body.mode === "reset_recovery" ||
      body.mode === "reset_confirm"
        ? body.mode
        : "login";
    const limiterKey = `${mode}:${ip}`;
    const rate = checkRateLimit(limiterKey, {
      limit: mode === "register" ? 8 : mode.startsWith("reset") ? 10 : 15,
      windowMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      const limited = jsonWithRequestId(
        { error: "Too many attempts. Try again shortly.", requestId },
        requestId,
        { status: 429 }
      );
      limited.headers.set("retry-after", String(rate.retryAfterSec));
      return limited;
    }

    if (mode === "reset_request") {
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const result = await requestPasswordReset(body, origin);
      if (result.resetUrl && result.deliveryEmail) {
        try {
          await sendPasswordResetEmail({
            to: result.deliveryEmail,
            resetUrl: result.resetUrl,
          });
        } catch (emailError) {
          console.error(`[${requestId}] password reset email failed`, emailError);
        }
      }

      const payload = {
        ok: true,
        message: result.message,
      };
      if (process.env.NODE_ENV !== "production" && result.resetUrl) {
        payload.resetUrl = result.resetUrl;
      }
      return jsonWithRequestId(payload, requestId);
    }

    if (mode === "reset_recovery") {
      const result = await resetPasswordWithRecoveryPassphrase(body);
      return jsonWithRequestId(result, requestId);
    }

    if (mode === "reset_confirm") {
      const result = await resetPasswordWithToken(body);
      return jsonWithRequestId(result, requestId);
    }

    const result =
      mode === "register" ? await registerOrganizer(body) : await loginOrganizer(body);

    const response = jsonWithRequestId(result.state, requestId);
    response.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to complete authentication right now.");
  }
}

export async function DELETE(request) {
  const requestId = makeRequestId();
  try {
    const blockedOrigin = enforceMutationOrigin(request, requestId, {
      message: "Sign out request blocked due to origin check.",
    });
    if (blockedOrigin) {
      return blockedOrigin;
    }

    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const state = await logoutOrganizer(sessionCookie);
    const response = jsonWithRequestId(state, requestId);
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return serverErrorResponse(error, requestId, "Unable to sign out right now.");
  }
}
