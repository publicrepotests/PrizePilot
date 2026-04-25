import { NextResponse } from "next/server";
import { saveBilling } from "lib/prizePilotStore";

export async function PATCH(request) {
  const body = await request.json();
  const state = await saveBilling(body.plan || "starter");
  return NextResponse.json(state);
}
