import { checkRateLimit } from "lib/rateLimit";
import { getClientIp, jsonWithRequestId } from "lib/apiUtils";

function parseOrigin(value) {
  if (!value) {
    return "";
  }
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins(request) {
  const origins = new Set();
  origins.add(request.nextUrl.origin);

  const appUrlOrigin = parseOrigin(process.env.NEXT_PUBLIC_APP_URL || "");
  if (appUrlOrigin) {
    origins.add(appUrlOrigin);
  }

  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl) {
    origins.add(`https://${vercelUrl.replace(/^https?:\/\//, "")}`);
  }

  return origins;
}

export function enforceMutationOrigin(request, requestId, options = {}) {
  const { message = "Request origin validation failed.", allowWithoutOriginInDev = true } = options;
  const origin = parseOrigin(request.headers.get("origin"));
  const refererOrigin = parseOrigin(request.headers.get("referer"));
  const candidateOrigin = origin || refererOrigin;

  if (!candidateOrigin) {
    if (allowWithoutOriginInDev && process.env.NODE_ENV !== "production") {
      return null;
    }
    return jsonWithRequestId({ error: message, requestId }, requestId, { status: 403 });
  }

  const allowedOrigins = getAllowedOrigins(request);
  if (allowedOrigins.has(candidateOrigin)) {
    return null;
  }

  return jsonWithRequestId({ error: message, requestId }, requestId, { status: 403 });
}

export function enforceRateLimit(request, requestId, options) {
  const {
    keyPrefix = "api",
    scope = "",
    limit = 60,
    windowMs = 60 * 1000,
    message = "Too many requests. Try again shortly.",
  } = options || {};

  const ip = getClientIp(request);
  const key = scope ? `${keyPrefix}:${scope}:${ip}` : `${keyPrefix}:${ip}`;
  const rate = checkRateLimit(key, { limit, windowMs });

  if (rate.allowed) {
    return null;
  }

  const response = jsonWithRequestId({ error: message, requestId }, requestId, { status: 429 });
  response.headers.set("retry-after", String(rate.retryAfterSec));
  return response;
}
