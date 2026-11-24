import { createHash } from "node:crypto";
import { supabaseConfig, supabaseRequest } from "./supabase-http.ts";

export type SignupAvailability = {
  ready: boolean;
  reason:
    | "ready"
    | "configuration"
    | "captcha-key"
    | "confirmation"
    | "captcha-provider"
    | "unavailable";
};
export function turnstileSiteKey() {
  return process.env.TURNSTILE_SITE_KEY?.trim() || undefined;
}
let cached:
  { key: string; until: number; value: SignupAvailability } | undefined;

/** A deliberately invalid email can never create an account or send an email.
 * Only a native Auth captcha_failed response proves CAPTCHA is enforced. */
export async function signupAvailability(
  force = false,
): Promise<SignupAvailability> {
  const config = supabaseConfig();
  if (!config) return { ready: false, reason: "configuration" };
  const siteKey = turnstileSiteKey();
  if (!siteKey) return { ready: false, reason: "captcha-key" };
  const cacheKey = config.url + "|" + config.key + "|" + siteKey;
  if (!force && cached?.key === cacheKey && cached.until > Date.now())
    return cached.value;
  let value: SignupAvailability = { ready: false, reason: "unavailable" };
  try {
    const response = await supabaseRequest("/auth/v1/settings");
    const settings = await response.json();
    if (!response.ok) throw new Error("Settings unavailable");
    if (
      settings.external?.email !== true ||
      settings.disable_signup === true ||
      settings.mailer_autoconfirm !== false
    )
      value = { ready: false, reason: "confirmation" };
    else {
      const probe = await supabaseRequest("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({
          email: "invalid-captcha-readiness-probe",
          password: "not-used-for-any-account",
          gotrue_meta_security: {
            captcha_token: "ramu-invalid-readiness-token",
          },
        }),
      });
      const result = await probe.json().catch(() => ({}));
      const enforced =
        !probe.ok && (result.error_code ?? result.code) === "captcha_failed";
      value = {
        ready: enforced,
        reason: enforced ? "ready" : "captcha-provider",
      };
    }
  } catch {
    /* Fail closed when service readiness cannot be verified. */
  }
  cached = {
    key: cacheKey,
    until: Date.now() + (value.ready ? 60_000 : 5_000),
    value,
  };
  return value;
}

export function captchaToken(form: FormData) {
  const value = form.get("captcha_token");
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 2048
    ? value
    : null;
}

export function createSignupLimiter() {
  const entries = new Map<
    string,
    { count: number; until: number; last: number }
  >();
  let global = { count: 0, until: 0 };
  return (email: string, now = Date.now()) => {
    for (const [key, row] of entries) if (row.until <= now) entries.delete(key);
    if (global.until <= now) global = { count: 0, until: now + 3_600_000 };
    const key = createHash("sha256").update(email).digest("hex");
    const row = entries.get(key) ?? {
      count: 0,
      until: now + 3_600_000,
      last: -Infinity,
    };
    const wait = Math.max(0, Math.ceil((row.last + 60_000 - now) / 1000));
    if (wait) return wait;
    if (row.count >= 3) return Math.max(1, Math.ceil((row.until - now) / 1000));
    if (global.count >= 30 || entries.size >= 1000)
      return Math.max(1, Math.ceil((global.until - now) / 1000));
    row.count++;
    row.last = now;
    global.count++;
    entries.set(key, row);
    return 0;
  };
}
export const allowSignupEmail = createSignupLimiter();
