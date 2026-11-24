export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const appUrl = process.env.RAMU_APP_URL;
  return url && key && appUrl ? { url, key, appUrl } : null;
}

export function supabaseRequest(
  path: string,
  {
    admin = false,
    token,
    ...init
  }: RequestInit & { token?: string; admin?: boolean } = {},
) {
  const config = supabaseConfig();
  if (!config) throw new Error("Konfigurasi Supabase belum lengkap.");
  const key = admin ? process.env.SUPABASE_SECRET_KEY : config.key;
  if (!key)
    throw new Error("Konfigurasi administratif Supabase belum lengkap.");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  const bearer = token ?? (key.startsWith("eyJ") ? key : null);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(`${config.url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
}

export const sessionCookies = {
  access: "ramu-access",
  refresh: "ramu-refresh",
  expires: "ramu-expires",
  verifier: "ramu-pkce",
  destination: "ramu-login-next",
  flow: "ramu-auth-flow",
  pendingEmail: "ramu-verification-email",
  pendingSentAt: "ramu-verification-sent-at",
};

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: Boolean(supabaseConfig()?.appUrl.startsWith("https://")),
    path: "/",
    maxAge,
  };
}

export async function readSession(response: Response) {
  const session = await response.json();
  if (
    !response.ok ||
    typeof session.access_token !== "string" ||
    !session.access_token.trim() ||
    typeof session.refresh_token !== "string" ||
    !session.refresh_token.trim() ||
    typeof session.expires_in !== "number" ||
    !Number.isFinite(session.expires_in) ||
    session.expires_in <= 0
  )
    throw new Error("Sesi Supabase tidak tersedia.");
  return {
    [sessionCookies.access]: session.access_token as string,
    [sessionCookies.refresh]: session.refresh_token as string,
    [sessionCookies.expires]: String(Date.now() + session.expires_in * 1000),
  };
}

export const sessionMaxAge = 60 * 60 * 24 * 30;
