import { createHash } from "node:crypto";
import { passwordCredentials } from "./password-auth.ts";
import {
  allowSignupEmail,
  captchaToken,
  signupAvailability,
} from "./signup-security.ts";
import { supabaseConfig, supabaseRequest } from "./supabase-http.ts";

export type SignupState = {
  email?: string;
  error?: string;
  sent?: boolean;
  retryAfter?: number;
  responseId?: string;
};

export function registrationCredentials(form: FormData) {
  const input = passwordCredentials(form);
  const confirmation = form.get("password_confirmation");
  if (
    !input ||
    input.password.length < 8 ||
    Buffer.byteLength(input.password, "utf8") > 72 ||
    input.password !== confirmation
  )
    return null;
  return input;
}
export function registrationEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

export async function requestVerification(
  kind: "signup" | "resend",
  form: FormData,
  verifier: string,
): Promise<SignupState> {
  const input = kind === "signup" ? registrationCredentials(form) : null;
  const email =
    kind === "signup" ? input?.email : registrationEmail(form.get("email"));
  if (!email)
    return {
      error:
        kind === "signup"
          ? "Isi email yang valid, password minimal 8 karakter, dan konfirmasi password yang sama."
          : "Isi alamat email yang ingin diverifikasi.",
    };
  if (form.get("contact_url"))
    return { email, error: "Pendaftaran belum dapat diproses." };
  const token = captchaToken(form);
  if (!token)
    return { email, error: "Selesaikan pemeriksaan keamanan terlebih dahulu." };
  const wait = allowSignupEmail(email);
  if (wait)
    return {
      email,
      retryAfter: wait,
      error: "Permintaan terlalu sering. Tunggu sebelum mencoba lagi.",
    };
  const availability = await signupAvailability(true);
  if (!availability.ready)
    return {
      email,
      error:
        "Pendaftaran email belum tersedia. Gunakan Google untuk melanjutkan.",
    };
  const config = supabaseConfig()!;
  try {
    const response = await supabaseRequest(
      "/auth/v1/" +
        (kind === "signup" ? "signup" : "resend") +
        "?" +
        new URLSearchParams({
          redirect_to: new URL("/auth/callback", config.appUrl).href,
        }),
      {
        method: "POST",
        body: JSON.stringify({
          email,
          ...(kind === "signup"
            ? { password: input!.password }
            : { type: "signup" }),
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "s256",
          gotrue_meta_security: { captcha_token: token },
        }),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code = body?.error_code ?? body?.code;
      if (response.status === 429)
        return {
          email,
          retryAfter: 60,
          error:
            "Batas pengiriman email tercapai. Tunggu sebentar lalu coba lagi.",
        };
      if (code === "captcha_failed")
        return {
          email,
          error:
            "Pemeriksaan keamanan kedaluwarsa atau belum berhasil. Coba lagi.",
        };
      if (["weak_password", "validation_failed"].includes(code))
        return {
          email,
          error: "Periksa format email dan kekuatan password Anda.",
        };
      return {
        email,
        error:
          "Email konfirmasi belum dapat dikirim. Coba lagi nanti atau daftar dengan Google.",
      };
    }
    // Never trust an accidental auto-confirm configuration or establish a
    // session before verification. Revoke any unexpected session immediately.
    if (!body || typeof body !== "object" || Array.isArray(body))
      return {
        email,
        error: "Konfirmasi email belum dapat disiapkan. Coba lagi.",
      };
    if (body.access_token) {
      try {
        await supabaseRequest("/auth/v1/logout?scope=local", {
          method: "POST",
          token: body.access_token,
        });
      } catch {}
      return {
        email,
        error:
          "Konfirmasi email belum tersedia. Gunakan Google untuk melanjutkan.",
      };
    }
    // Existing accounts receive the same generic success UI, preventing enumeration.
    return { email, sent: true, retryAfter: 60 };
  } catch {
    return { email, error: "Koneksi belum tersedia. Coba lagi sebentar." };
  }
}
