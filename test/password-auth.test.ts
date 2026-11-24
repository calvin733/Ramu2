import assert from "node:assert/strict";
import test from "node:test";
import {
  createPasswordAttemptLimiter,
  passwordCredentials,
  passwordSession,
} from "../src/server/password-auth.ts";

const form = (email: unknown, password: unknown) => {
  const value = new FormData();
  if (typeof email === "string") value.set("email", email);
  if (typeof password === "string") value.set("password", password);
  return value;
};

test("email normalization preserves the exact RAMU password and rejects invalid or oversized inputs", () => {
  assert.deepEqual(
    passwordCredentials(form("  Tester@Example.com ", " space-at-both-ends ")),
    {
      email: "tester@example.com",
      password: " space-at-both-ends ",
    },
  );
  for (const [email, password] of [
    ["invalid", "secret"],
    ["a@b.test", ""],
    ["a@b.test", "x".repeat(257)],
    ["x".repeat(255) + "@a.test", "secret"],
    [undefined, "secret"],
  ])
    assert.equal(passwordCredentials(form(email, password)), null);
});

test("password authentication uses publishable Auth credentials, validates the session and keeps errors free of passwords", async (t) => {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "RAMU_APP_URL",
  ];
  const before = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    }),
  );
  Object.assign(process.env, {
    SUPABASE_URL: "https://password-fixture.test",
    SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
    RAMU_APP_URL: "http://localhost:3000",
  });
  delete process.env.SUPABASE_SECRET_KEY;
  let status = 200,
    calls = 0,
    broken = false,
    malformed = false;
  const password = " fixture-RAMU-password ";
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(
      url,
      "https://password-fixture.test/auth/v1/token?grant_type=password",
    );
    assert.equal(init.method, "POST");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("apikey"), "fixture-publishable");
    assert.equal(headers.get("authorization"), null);
    assert.equal(init.cache, "no-store");
    assert.equal(JSON.parse(String(init.body)).password, password);
    if (broken)
      throw new Error("network error with sensitive provider details");
    return Response.json(
      status === 200
        ? malformed
          ? { access_token: "" }
          : {
              access_token: "access-test",
              refresh_token: "refresh-test",
              expires_in: 3600,
            }
        : { message: "sensitive provider details " + password },
      { status },
    );
  });
  assert.ok((await passwordSession(form("valid@ramu.test", password))).session);
  const failures = [];
  for (const code of [400, 401, 403, 429, 503]) {
    status = code;
    const result = await passwordSession(
      form("status" + code + "@ramu.test", password),
    );
    assert.equal(result.session, undefined);
    assert.doesNotMatch(
      JSON.stringify(result),
      /fixture-RAMU-password|sensitive provider/,
    );
    if ([400, 401, 403].includes(code)) failures.push(result.error);
    if (code === 429) assert.match(result.error!, /Terlalu banyak/);
    if (code === 503) assert.match(result.error!, /tidak tersedia/);
  }
  assert.equal(new Set(failures).size, 1);
  status = 200;
  malformed = true;
  assert.equal(
    (await passwordSession(form("malformed@ramu.test", password))).session,
    undefined,
  );
  broken = true;
  assert.match(
    (await passwordSession(form("network@ramu.test", password))).error!,
    /koneksi/i,
  );
  const count = calls;
  await passwordSession(form("invalid", password));
  assert.equal(calls, count);
});

test("local password attempt limits expire and apply independently per identity and globally", () => {
  const allow = createPasswordAttemptLimiter();
  for (let i = 0; i < 8; i++)
    assert.equal(allow("first@ramu.test", 1000), true);
  assert.equal(allow("first@ramu.test", 1000), false);
  assert.equal(allow("other@ramu.test", 1000), true);
  assert.equal(allow("first@ramu.test", 61001), true);
  const global = createPasswordAttemptLimiter();
  for (let i = 0; i < 60; i++)
    assert.equal(global(i + "@ramu.test", 1000), true);
  assert.equal(global("extra@ramu.test", 1000), false);
});

test("native CAPTCHA is forwarded for password login and unconfirmed email never receives a session", async (t) => {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "RAMU_APP_URL",
    "TURNSTILE_SITE_KEY",
  ];
  const saved = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    }),
  );
  Object.assign(process.env, {
    SUPABASE_URL: "https://captcha-login.test",
    SUPABASE_PUBLISHABLE_KEY: "fixture-public",
    RAMU_APP_URL: "http://localhost:3000",
    TURNSTILE_SITE_KEY: "fixture-site",
  });
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      calls++;
      assert.equal(
        JSON.parse(String(init.body)).gotrue_meta_security.captcha_token,
        "fixture-token",
      );
      return Response.json(
        { error_code: "email_not_confirmed" },
        { status: 400 },
      );
    },
  );
  const input = form("unconfirmed@example.com", "fixture-password");
  assert.match((await passwordSession(input)).error!, /pemeriksaan keamanan/);
  assert.equal(calls, 0);
  input.set("captcha_token", "fixture-token");
  const result = await passwordSession(input);
  assert.equal(result.session, undefined);
  assert.equal(result.confirmationRequired, true);
  assert.doesNotMatch(JSON.stringify(result), /fixture-password/);
});
