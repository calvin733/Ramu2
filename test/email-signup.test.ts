import assert from "node:assert/strict";
import test from "node:test";
import {
  registrationCredentials,
  requestVerification,
} from "../src/server/email-signup.ts";
import {
  createSignupLimiter,
  signupAvailability,
} from "../src/server/signup-security.ts";

function form(email: string, extras: Record<string, string> = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    email,
    password: "valid-password-123",
    password_confirmation: "valid-password-123",
    captcha_token: "fixture-captcha",
    ...extras,
  }))
    f.set(key, value);
  return f;
}
test("email signup validates confirmation and UTF-8 password limits", () => {
  assert.equal(
    registrationCredentials(form(" A@Example.com "))?.email,
    "a@example.com",
  );
  assert.equal(
    registrationCredentials(
      form("a@example.com", { password_confirmation: "wrong" }),
    ),
    null,
  );
  assert.equal(
    registrationCredentials(
      form("a@example.com", {
        password: "short",
        password_confirmation: "short",
      }),
    ),
    null,
  );
  assert.equal(
    registrationCredentials(
      form("a@example.com", {
        password: "🔑".repeat(30),
        password_confirmation: "🔑".repeat(30),
      }),
    ),
    null,
  );
  assert.equal(registrationCredentials(form("invalid")), null);
});
test("signup and resend share a cooldown and bounded hourly allowance", () => {
  const allow = createSignupLimiter();
  assert.equal(allow("a@example.com", 1000), 0);
  assert.equal(allow("a@example.com", 1001), 60);
  assert.equal(allow("b@example.com", 1001), 0);
  assert.equal(allow("a@example.com", 61000), 0);
  assert.equal(allow("a@example.com", 121000), 0);
  assert.ok(allow("a@example.com", 181000) > 60);
  assert.equal(allow("a@example.com", 3601001), 0);
  const all = createSignupLimiter();
  for (let i = 0; i < 30; i++) assert.equal(all(i + "@example.com", 1000), 0);
  assert.ok(all("extra@example.com", 1000) > 0);
});

test("public registration fails closed and requires native CAPTCHA plus email confirmation", async (t) => {
  const names = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "RAMU_APP_URL",
    "TURNSTILE_SITE_KEY",
  ];
  const saved = names.map((n) => process.env[n]);
  t.after(() =>
    names.forEach((n, i) => {
      if (saved[i] === undefined) delete process.env[n];
      else process.env[n] = saved[i];
    }),
  );
  Object.assign(process.env, {
    SUPABASE_URL: "https://signup-fixture.test",
    SUPABASE_PUBLISHABLE_KEY: "public-fixture",
    RAMU_APP_URL: "http://localhost:3000",
  });
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  let calls = 0,
    mode = "ready",
    requestMode = "ok",
    submitted: Record<string, unknown> | undefined,
    revoked = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init: RequestInit = {}) => {
      calls++;
      assert.equal(new Headers(init.headers).get("apikey"), "public-fixture");
      assert.doesNotMatch(url, /admin|valid-password-123/);
      if (mode === "network") throw new Error("network");
      if (url.endsWith("/settings"))
        return Response.json({
          external: { email: true },
          disable_signup: false,
          mailer_autoconfirm: mode === "auto-confirm",
        });
      const b = init.body ? JSON.parse(String(init.body)) : {};
      if (b.email === "invalid-captcha-readiness-probe")
        return Response.json(
          {
            error_code:
              mode === "captcha-off" ? "validation_failed" : "captcha_failed",
          },
          { status: 400 },
        );
      if (url.includes("/logout")) {
        revoked = true;
        assert.equal(
          new Headers(init.headers).get("authorization"),
          "Bearer unexpected-token",
        );
        return new Response(null, { status: 204 });
      }
      submitted = b;
      assert.equal(
        new URL(url).searchParams.get("redirect_to"),
        "http://localhost:3000/auth/callback",
      );
      assert.equal(b.gotrue_meta_security.captcha_token, "fixture-captcha");
      assert.equal(b.code_challenge_method, "s256");
      assert.ok(b.code_challenge.length > 20);
      if (requestMode === "quota")
        return Response.json(
          { error_code: "over_email_send_rate_limit" },
          { status: 429 },
        );
      if (requestMode === "captcha")
        return Response.json({ error_code: "captcha_failed" }, { status: 400 });
      if (requestMode === "smtp")
        return Response.json(
          { message: "private provider details" },
          { status: 500 },
        );
      if (requestMode === "auto-confirm")
        return Response.json({
          access_token: "unexpected-token",
          refresh_token: "unexpected-refresh",
          expires_in: 3600,
        });
      return Response.json(
        url.includes("/resend") || requestMode === "duplicate"
          ? {}
          : { id: "pending", email_confirmed_at: null },
      );
    },
  );
  assert.equal((await signupAvailability(true)).reason, "captcha-key");
  assert.equal(calls, 0);
  process.env.TURNSTILE_SITE_KEY = "fixture-key";
  mode = "auto-confirm";
  assert.equal((await signupAvailability(true)).ready, false);
  mode = "captcha-off";
  assert.equal((await signupAvailability(true)).ready, false);
  mode = "network";
  assert.equal((await signupAvailability(true)).ready, false);
  mode = "ready";
  assert.equal((await signupAvailability(true)).ready, true);
  const before = calls;
  assert.ok(
    (
      await requestVerification(
        "signup",
        form("missing@example.com", { captcha_token: "" }),
        "verifier",
      )
    ).error,
  );
  assert.ok(
    (
      await requestVerification(
        "signup",
        form("bot@example.com", { contact_url: "https://spam.test" }),
        "verifier",
      )
    ).error,
  );
  assert.equal(calls, before);
  const result = await requestVerification(
    "signup",
    form("new@example.com"),
    "a-long-verifier-for-the-pkce-test",
  );
  assert.equal(result.sent, true);
  assert.equal("session" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /valid-password|fixture-captcha/);
  assert.equal(submitted?.password, "valid-password-123");
  assert.equal(submitted?.email_confirm, undefined);
  const retry = await requestVerification(
    "resend",
    form("new@example.com"),
    "verifier",
  );
  assert.equal(retry.sent, undefined);
  assert.ok(retry.retryAfter! > 0);
  const resent = await requestVerification(
    "resend",
    form("resend@example.com"),
    "new-verifier",
  );
  assert.equal(resent.sent, true);
  assert.equal(submitted?.type, "signup");
  assert.equal(submitted?.password, undefined);
  for (const kind of [
    "duplicate",
    "quota",
    "captcha",
    "smtp",
    "auto-confirm",
  ]) {
    requestMode = kind;
    const value = await requestVerification(
      "signup",
      form(kind + "@example.com"),
      "verifier",
    );
    if (kind === "duplicate") assert.equal(value.sent, true);
    else assert.equal(value.sent, undefined, kind);
    assert.doesNotMatch(
      JSON.stringify(value),
      /unexpected-token|private provider|valid-password/,
    );
  }
  assert.equal(revoked, true);
});
