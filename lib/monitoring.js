import { randomUUID } from "node:crypto";

function parseSentryDsn(rawDsn) {
  const dsn = String(rawDsn || "").trim();
  if (!dsn) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(dsn);
  } catch {
    return null;
  }

  const [publicKey] = parsed.username.split(":");
  if (!publicKey) {
    return null;
  }

  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const projectId = pathSegments[pathSegments.length - 1];
  if (!projectId) {
    return null;
  }

  const pathPrefix = pathSegments.slice(0, -1).join("/");
  const envelopePath = pathPrefix
    ? `/${pathPrefix}/api/${projectId}/envelope/`
    : `/api/${projectId}/envelope/`;
  const endpoint = `${parsed.protocol}//${parsed.host}${envelopePath}`;

  return { endpoint, publicKey };
}

function toErrorPayload(error) {
  if (error instanceof Error) {
    return {
      type: error.name || "Error",
      value: error.message || "Unknown server error",
    };
  }
  return {
    type: "Error",
    value: typeof error === "string" ? error : "Unknown server error",
  };
}

export async function reportServerError(error, context = {}) {
  const sentry = parseSentryDsn(process.env.SENTRY_DSN);
  if (!sentry) {
    return;
  }

  const now = new Date();
  const eventId = String(context.requestId || "").replace(/-/g, "").slice(0, 32);
  const normalizedEventId = eventId || randomUUID().replace(/-/g, "");
  const exceptionValue = toErrorPayload(error);
  const event = {
    event_id: normalizedEventId,
    timestamp: now.toISOString(),
    level: "error",
    platform: "javascript",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    server_name: process.env.VERCEL_URL || process.env.HOSTNAME || "local",
    tags: {
      requestId: context.requestId || "",
      route: context.route || "",
    },
    extra: {
      requestId: context.requestId || "",
      fallbackMessage: context.fallbackMessage || "",
    },
    exception: {
      values: [exceptionValue],
    },
  };

  const envelopeHeader = {
    event_id: normalizedEventId,
    sent_at: now.toISOString(),
    dsn: process.env.SENTRY_DSN,
  };
  const itemHeader = { type: "event" };
  const envelope = `${JSON.stringify(envelopeHeader)}\n${JSON.stringify(itemHeader)}\n${JSON.stringify(event)}`;

  try {
    await fetch(sentry.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${sentry.publicKey}`,
      },
      body: envelope,
      cache: "no-store",
    });
  } catch {}
}
