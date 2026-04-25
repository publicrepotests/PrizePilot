import { NextResponse } from "next/server";
import { clearOrganizer, getPublicState, saveOrganizer } from "lib/prizePilotStore";

const SESSION_COOKIE = "prizepilot_session";

export async function GET(request) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const state = await getPublicState();

  if (!sessionCookie || !state.session.loggedIn) {
    return NextResponse.json({
      ...state,
      session: {
        loggedIn: false,
        organizerName: "",
        businessName: "",
        email: "",
      },
    });
  }

  return NextResponse.json(state);
}

export async function POST(request) {
  const body = await request.json();
  const state = await saveOrganizer({
    organizerName: body.organizerName || "",
    businessName: body.businessName || "",
    email: body.email || "",
  });

  const response = NextResponse.json(state);
  response.cookies.set(SESSION_COOKIE, "active", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const state = await clearOrganizer();
  const response = NextResponse.json(state);
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
