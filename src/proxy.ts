import { NextResponse, type NextRequest } from "next/server";
import { loginDestination } from "./domain/login-destination";
import {
  cookieOptions,
  readSession,
  sessionCookies,
  sessionMaxAge,
  supabaseConfig,
  supabaseRequest,
} from "./server/supabase-http";

export async function proxy(request: NextRequest) {
  const destination = loginDestination(
    request.nextUrl.pathname + request.nextUrl.search,
  );
  const next = () => {
    const headers = new Headers(request.headers);
    headers.delete("x-ramu-destination");
    if (destination) headers.set("x-ramu-destination", destination);
    return NextResponse.next({ request: { headers } });
  };
  const refreshToken = request.cookies.get(sessionCookies.refresh)?.value;
  const expiresAt = Number(
    request.cookies.get(sessionCookies.expires)?.value ?? 0,
  );
  if (!supabaseConfig() || !refreshToken || expiresAt > Date.now() + 60_000)
    return next();

  try {
    const refreshed = await supabaseRequest(
      "/auth/v1/token?grant_type=refresh_token",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );
    const cookies = await readSession(refreshed);
    for (const [name, value] of Object.entries(cookies))
      request.cookies.set(name, value);
    const response = next();
    for (const [name, value] of Object.entries(cookies))
      response.cookies.set(name, value, cookieOptions(sessionMaxAge));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    // A failed refresh can race with another request rotating the same token.
    // Leave the cookie untouched. Protected routes independently validate the user.
    return next();
  }
}

export const config = {
  matcher: [
    "/masuk",
    "/daftar/:path*",
    "/pengaturan-awal/:path*",
    "/dashboard/:path*",
    "/asisten/:path*",
    "/api/asisten",
    "/target-bisnis/:path*",
    "/sumber-data/:path*",
  ],
};
