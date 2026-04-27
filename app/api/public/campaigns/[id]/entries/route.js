import { StoreError, submitCampaignEntry } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";
import { enforceRateLimit } from "lib/requestSecurity";
import { checkRateLimit } from "lib/rateLimit";
import { createHash } from "node:crypto";
import { verifyEntryCaptcha } from "lib/captcha";

function resolveClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const realIp = request.headers.get("x-real-ip") || "";
  return forwarded.split(",")[0]?.trim() || realIp.trim() || "";
}

function resolveIpHash(request) {
  const ip = resolveClientIp(request);
  if (!ip) {
    return "";
  }
  return createHash("sha256").update(ip).digest("hex");
}

function resolveUserAgentHash(request) {
  const userAgent = String(request.headers.get("user-agent") || "").trim().toLowerCase();
  if (!userAgent) {
    return "";
  }
  return createHash("sha256").update(userAgent).digest("hex");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export async function POST(request, { params }) {
  const requestId = makeRequestId();
  try {
    const resolved = await params;
    const blockedRate = enforceRateLimit(request, requestId, {
      keyPrefix: "entries:submit",
      scope: resolved.id || "campaign",
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many entry attempts. Please wait before trying again.",
    });
    if (blockedRate) {
      return blockedRate;
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonWithRequestId(
        { error: "Entries must be submitted as JSON.", requestId },
        requestId,
        { status: 415 }
      );
    }

    const body = await request.json();
    const normalizedEmail = normalizeEmail(body.email || "");
    const emailHash = normalizedEmail
      ? createHash("sha256").update(normalizedEmail).digest("hex")
      : "";
    const userAgentHash = resolveUserAgentHash(request);

    if (emailHash) {
      const emailRate = checkRateLimit(`entries:email:${resolved.id || "campaign"}:${emailHash}`, {
        limit: 5,
        windowMs: 15 * 60 * 1000,
      });
      if (!emailRate.allowed) {
        const response = jsonWithRequestId(
          { error: "Too many attempts from this email. Please wait and try again.", requestId },
          requestId,
          { status: 429 }
        );
        response.headers.set("retry-after", String(emailRate.retryAfterSec));
        return response;
      }
    }

    if (userAgentHash) {
      const deviceRate = checkRateLimit(`entries:device:${resolved.id || "campaign"}:${userAgentHash}`, {
        limit: 8,
        windowMs: 15 * 60 * 1000,
      });
      if (!deviceRate.allowed) {
        const response = jsonWithRequestId(
          { error: "Too many attempts from this device. Please wait and try again.", requestId },
          requestId,
          { status: 429 }
        );
        response.headers.set("retry-after", String(deviceRate.retryAfterSec));
        return response;
      }
    }

    const captcha = await verifyEntryCaptcha(body.captchaToken || "", resolveClientIp(request));
    if (!captcha.ok) {
      return jsonWithRequestId(
        { error: captcha.message || "Security check failed.", requestId },
        requestId,
        { status: 400 }
      );
    }

    const result = await submitCampaignEntry(resolved.id || "", {
      name: body.name || "",
      email: body.email || "",
      source: body.source || "public-link",
      submissionTitle: body.submissionTitle || "",
      projectLink: body.projectLink || "",
      submissionImageData: body.submissionImageData || "",
      ipHash: resolveIpHash(request),
      userAgentHash,
    });
    return jsonWithRequestId(result, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to submit entry.");
  }
}
