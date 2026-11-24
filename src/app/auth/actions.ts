"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginDestination } from "@/domain/login-destination";
import { requestVerification, type SignupState } from "@/server/email-signup";
import {
  passwordSession,
  type PasswordLoginState,
} from "@/server/password-auth";
import {
  cookieOptions,
  sessionCookies,
  sessionMaxAge,
  supabaseConfig,
  supabaseRequest,
} from "@/server/supabase-http";

export async function signInWithGoogle(form?: FormData) {
  const config = supabaseConfig();
  if (!config) redirect("/masuk?status=konfigurasi");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const jar = await cookies();
  jar.set(sessionCookies.verifier, verifier, cookieOptions(600));
  jar.set(sessionCookies.flow, "google", cookieOptions(600));
  const destination = loginDestination(form?.get("lanjut"));
  jar.set(
    sessionCookies.destination,
    destination ?? "",
    cookieOptions(destination ? 600 : 0),
  );
  const url = new URL(`${config.url}/auth/v1/authorize`);
  url.search = new URLSearchParams({
    provider: "google",
    prompt: "select_account",
    redirect_to: new URL("/auth/callback", config.appUrl).href,
    code_challenge: challenge,
    code_challenge_method: "s256",
  }).toString();
  redirect(url.href);
}

export async function signInWithEmail(
  _previous: PasswordLoginState,
  form: FormData,
): Promise<PasswordLoginState> {
  if (!supabaseConfig()) return { error: "Login RAMU belum dikonfigurasi." };
  const result = await passwordSession(form);
  if (!result.session) {
    if (result.confirmationRequired && result.email) {
      const jar = await cookies();
      jar.set(sessionCookies.pendingEmail, result.email, cookieOptions(86400));
      const next =
        loginDestination(form.get("lanjut")) ??
        loginDestination(jar.get(sessionCookies.destination)?.value);
      jar.set(
        sessionCookies.destination,
        next ?? "",
        cookieOptions(next ? 86400 : 0),
      );
    }
    return {
      email: result.email,
      error: result.error,
      confirmationRequired: result.confirmationRequired,
      responseId: randomBytes(12).toString("hex"),
    };
  }
  const jar = await cookies();
  jar.set(sessionCookies.verifier, "", cookieOptions(0));
  jar.set(sessionCookies.destination, "", cookieOptions(0));
  jar.set(sessionCookies.flow, "", cookieOptions(0));
  jar.set(sessionCookies.pendingEmail, "", cookieOptions(0));
  jar.set(sessionCookies.pendingSentAt, "", cookieOptions(0));
  for (const [name, value] of Object.entries(result.session))
    jar.set(name, value, cookieOptions(sessionMaxAge));
  redirect(loginDestination(form.get("lanjut")) ?? "/dashboard");
}

async function emailVerificationAction(
  kind: "signup" | "resend",
  form: FormData,
): Promise<SignupState> {
  const verifier = randomBytes(48).toString("base64url");
  const result = await requestVerification(kind, form, verifier);
  if (result.sent && result.email) {
    const jar = await cookies();
    jar.set(sessionCookies.verifier, verifier, cookieOptions(86400));
    jar.set(sessionCookies.flow, "email", cookieOptions(86400));
    jar.set(sessionCookies.pendingEmail, result.email, cookieOptions(86400));
    jar.set(
      sessionCookies.pendingSentAt,
      String(Date.now()),
      cookieOptions(86400),
    );
    const destination =
      loginDestination(form.get("lanjut")) ??
      loginDestination(jar.get(sessionCookies.destination)?.value);
    jar.set(
      sessionCookies.destination,
      destination ?? "",
      cookieOptions(destination ? 86400 : 0),
    );
  }
  return { ...result, responseId: randomBytes(12).toString("hex") };
}

export async function signUpWithEmail(
  _previous: SignupState,
  form: FormData,
): Promise<SignupState> {
  const result = await emailVerificationAction("signup", form);
  if (result.sent) redirect("/daftar/verifikasi");
  return result;
}

export async function resendVerificationEmail(
  _previous: SignupState,
  form: FormData,
): Promise<SignupState> {
  return emailVerificationAction("resend", form);
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(sessionCookies.access)?.value;
  if (token && supabaseConfig()) {
    try {
      await supabaseRequest("/auth/v1/logout?scope=local", {
        method: "POST",
        token,
      });
    } catch {
      // Local sign-out still completes when the Auth API is unreachable.
    }
  }
  for (const name of Object.values(sessionCookies))
    jar.set(name, "", cookieOptions(0));
  redirect("/");
}
