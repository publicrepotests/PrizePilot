import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

export function makeRequestId() {
  return randomUUID();
}

export function jsonWithRequestId(payload, requestId, init) {
  const response = NextResponse.json(payload, init);
  response.headers.set("x-request-id", requestId);
  return response;
}

export function serverErrorResponse(error, requestId, fallbackMessage) {
  console.error(`[${requestId}] API error`, error);
  return jsonWithRequestId(
    { error: fallbackMessage, requestId },
    requestId,
    { status: 500 }
  );
}
