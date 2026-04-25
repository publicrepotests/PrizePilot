import { NextResponse } from "next/server";
import { saveCampaign } from "lib/prizePilotStore";

export async function POST(request) {
  const body = await request.json();
  const campaign = await saveCampaign({
    title: body.title || "Untitled campaign",
    prize: body.prize || "",
    audience: body.audience || "",
    method: body.method || "",
    type: body.type || "giveaway",
    endsOn: body.endsOn || "TBD",
    status: body.status || "draft",
  });

  return NextResponse.json(campaign);
}
