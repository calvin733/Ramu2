import { createHash } from "node:crypto";
import { readSession, supabaseRequest } from "./supabase-http.ts";
import { captchaToken, turnstileSiteKey } from "./signup-security.ts";

export type PasswordLoginState = {
  email?: string;
  error?: string;
  responseId?: string;
  confirmationRequired?: boolean;
};

export function passwordCredentials(form: FormData) {
  const rawEmail = form.get("email");
  const password = form.get("password");
  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    !password.length ||
    password.length > 256
  )
    return null;
  return { email, password };
}

// A bounded per-process guard complements Supabase Auth's own rate limits.
export function createPasswordAttemptLimiter() {
  const attempts = new Map<string, { count: number; until: number }>();
  let total = { count: 0, until: 0 };
  return (email: string, now = Date.now()) => {
    if (total.until <= now) total = { count: 0, until: now + 60_000 };
    for (const [key, item] of attempts)
      if (item.until <= now) attempts.delete(key);
    if (total.count >= 60 || attempts.size >= 1000) return false;
    const key = createHash("sha256").update(email).digest("hex");
    const item = attempts.get(key) ?? { count: 0, until: now + 60_000 };
    if (item.count >= 8) return false;
    item.count++;
    total.count++;
    attempts.set(key, item);
    return true;
  };
}

const allowPasswordAttempt = createPasswordAttemptLimiter();
export async function passwordSession(
  form: FormData,
): Promise<PasswordLoginState & { session?: Record<string, string> }> {
  const input = passwordCredentials(form);
  if (!input)
    return { error: "Isi email yang valid dan password RAMU Anda." } as const;
  const { email, password } = input;
  const token = captchaToken(form);
  if (turnstileSiteKey() && !token)
    return {
      email,
      error: "Selesaikan pemeriksaan keamanan terlebih dahulu.",
    } as const;
  if (!allowPasswordAttempt(email))
    return {
      email,
      error: "Terlalu banyak percobaan masuk. Tunggu sebentar lalu coba lagi.",
    } as const;
  try {
    const response = await supabaseRequest(
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          ...(token ? { gotrue_meta_security: { captcha_token: token } } : {}),
        }),
      },
    );
    if (!response.ok) {
      const info = await response.json().catch(() => ({}));
      const code = info.error_code ?? info.code;
      if (code === "email_not_confirmed")
        return {
          email,
          confirmationRequired: true,
          error:
            "Konfirmasi email Anda sebelum masuk. Buka email dari RAMU atau kirim ulang tautannya.",
        };
      if (code === "captcha_failed")
        return {
          email,
          error:
            "Pemeriksaan keamanan belum berhasil. Selesaikan kembali lalu coba masuk.",
        };
      const error =
        response.status === 429
          ? "Terlalu banyak percobaan masuk. Tunggu sebentar lalu coba lagi."
          : response.status >= 500
            ? "Layanan login sedang tidak tersedia. Coba lagi sebentar."
            : "Email atau password RAMU belum sesuai. Periksa kembali akun yang diberikan.";
      return { email, error } as const;
    }
    return { session: await readSession(response) } as const;
  } catch {
    return {
      email,
      error: "Login belum dapat diselesaikan. Periksa koneksi lalu coba lagi.",
    } as const;
  }
}
