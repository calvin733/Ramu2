import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loginDestination } from "@/domain/login-destination";
import {
  cookieOptions,
  readSession,
  sessionCookies,
  sessionMaxAge,
  supabaseConfig,
  supabaseRequest,
} from "@/server/supabase-http";

export async function GET(request: Request) {
  const config = supabaseConfig();
  const url = new URL(request.url);
  const origin = config?.appUrl ?? url.origin;
  const code = url.searchParams.get("error")
    ? null
    : url.searchParams.get("code");
  const jar = await cookies();
  const verifier = jar.get(sessionCookies.verifier)?.value;
  const next = loginDestination(jar.get(sessionCookies.destination)?.value);
  const flow = jar.get(sessionCookies.flow)?.value;

  let session;
  if (config && code && verifier) {
    try {
      session = await readSession(
        await supabaseRequest("/auth/v1/token?grant_type=pkce", {
          method: "POST",
          body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
        }),
      );
      if (flow === "email") {
        const who = await supabaseRequest("/auth/v1/user", {
          token: session[sessionCookies.access],
        });
        const user = await who.json();
        if (
          !who.ok ||
          typeof user.email_confirmed_at !== "string" ||
          !user.email_confirmed_at
        ) {
          session = undefined;
        }
      }
    } catch {
      session = undefined;
      // A provider rejection and an expired callback use the same retry screen.
    }
  }

  const destination = session
    ? (next ?? "/pengaturan-awal/profil")
    : (flow === "email" ? "/daftar/verifikasi?" : "/masuk?") +
      new URLSearchParams({
        status: flow === "email" || (code && !verifier) ? "tautan" : "google",
        ...(next ? { lanjut: next } : {}),
      });
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(sessionCookies.verifier, "", cookieOptions(0));
  response.cookies.set(sessionCookies.destination, "", cookieOptions(0));
  response.cookies.set(sessionCookies.flow, "", cookieOptions(0));
  if (session) {
    response.cookies.set(sessionCookies.pendingEmail, "", cookieOptions(0));
    response.cookies.set(sessionCookies.pendingSentAt, "", cookieOptions(0));
  }
  for (const [name, value] of Object.entries(session ?? {})) {
    response.cookies.set(name, value, cookieOptions(sessionMaxAge));
  }
  return response;
}
