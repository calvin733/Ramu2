import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const expected = "https://qyegwniyzxyvsxftqcrb.supabase.co";
if (process.env.SUPABASE_URL?.replace(/\/$/, "") !== expected)
  throw new Error("Target Supabase berbeda; tidak ada permintaan dikirim.");
const results = [];
async function check(name, action) {
  try {
    results.push({ name, ...(await action()) });
  } catch (error) {
    results.push({ name, ok: false, error: error.cause?.code ?? error.name });
  }
}
await check("Google provider", async () => {
  const r = await fetch(expected + "/auth/v1/settings", {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  const data = await r.json();
  return {
    ok: r.ok && data.external?.google === true,
    status: r.status,
    googleEnabled: data.external?.google === true,
  };
});
await check("Google authorize dan callback", async () => {
  const callback = new URL("/auth/callback", process.env.RAMU_APP_URL);
  const url = new URL("/auth/v1/authorize", expected);
  url.search = new URLSearchParams({
    provider: "google",
    redirect_to: callback.href,
    code_challenge: "RamuSyntheticVerificationChallenge0000000000000",
    code_challenge_method: "s256",
  });
  const r = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });
  const target = new URL(
    r.headers.get("location") ?? "https://invalid.invalid",
  );
  return {
    ok:
      r.status === 302 &&
      target.hostname === "accounts.google.com" &&
      target.searchParams.get("redirect_uri") ===
        expected + "/auth/v1/callback",
    status: r.status,
    providerHost: target.hostname,
    callbackMatches:
      target.searchParams.get("redirect_uri") ===
      expected + "/auth/v1/callback",
  };
});
await check("Data API tabel aplikasi", async () => {
  const r = await fetch(expected + "/rest/v1/businesses?select=id&limit=0", {
    method: "HEAD",
    headers: { apikey: process.env.SUPABASE_SECRET_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  return { ok: r.ok, status: r.status };
});
console.log(
  JSON.stringify(
    {
      results,
      note: "Pemeriksaan ini tidak membuktikan login Google interaktif. Key, token, dan URL consent lengkap tidak dicetak.",
    },
    null,
    2,
  ),
);
if (results.some((item) => !item.ok)) process.exitCode = 1;
