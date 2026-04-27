import { getCampaignEntrants, StoreError } from "lib/prizePilotStore";
import { jsonWithRequestId, makeRequestId, serverErrorResponse } from "lib/apiUtils";

const SESSION_COOKIE = "prizepilot_session";

function toCsv(rows) {
  const header = [
    "name",
    "email",
    "submissionTitle",
    "source",
    "createdAt",
    "hasImage",
    "projectLink",
  ];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    const values = [
      row.name,
      row.email,
      row.submissionTitle,
      row.source,
      row.createdAt,
      row.hasImage,
      row.projectLink,
    ].map((value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`);
    lines.push(values.join(","));
  });
  return lines.join("\n");
}

export async function GET(request, { params }) {
  const requestId = makeRequestId();
  try {
    const resolved = await params;
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const payload = await getCampaignEntrants(resolved.id || "", sessionCookie);
    const wantsCsv = request.nextUrl.searchParams.get("format") === "csv";

    if (wantsCsv) {
      const csv = toCsv(payload.entrants);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="entrants-${resolved.id || "campaign"}.csv"`,
          "x-request-id": requestId,
        },
      });
    }

    return jsonWithRequestId(payload, requestId);
  } catch (error) {
    if (error instanceof StoreError) {
      return jsonWithRequestId({ error: error.message, requestId }, requestId, {
        status: error.status,
      });
    }
    return serverErrorResponse(error, requestId, "Unable to load entrants.");
  }
}
