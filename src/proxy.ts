import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateIsOn, isUnlocked } from "@/lib/auth/gate";

/**
 * The password gate of the hosted app (Next 16 calls this file "proxy"; it used to be "middleware").
 * It runs before every page and server action: without the cookie that /unlock sets, a page request
 * is sent to /unlock and anything else is refused. With APP_PASSWORD unset there is no gate.
 *
 * The data is guarded a second time in src/lib/db/client.ts, next to the database.
 */
export async function proxy(request: NextRequest) {
  if (!gateIsOn()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname === "/unlock") return NextResponse.next();
  if (await isUnlocked(request.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();

  // A server action or any other write from a device that is not unlocked: refuse, do not redirect.
  if (request.method !== "GET" && request.method !== "HEAD") return new NextResponse("Locked", { status: 401 });

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  if (pathname !== "/" && pathname !== "/trainer") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the build's own static files and what a phone fetches to install the app
  // (the manifest and the icons), which hold nothing private.
  matcher: ["/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico).*)"],
};
