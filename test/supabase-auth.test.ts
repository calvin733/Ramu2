import assert from "node:assert/strict";
import test from "node:test";
import {
  cookieOptions,
  readSession,
  supabaseConfig,
  supabaseRequest,
} from "../src/server/supabase-http.ts";

test("auth and user requests work without the administrative secret; privileged calls fail closed", async (t) => {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "RAMU_APP_URL",
  ];
  const saved = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    }),
  );
  process.env.SUPABASE_URL = "https://auth-fixture.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "fixture-publishable";
  process.env.RAMU_APP_URL = "http://localhost:3000";
  delete process.env.SUPABASE_SECRET_KEY;
  assert.ok(supabaseConfig());
  assert.equal("secret" in supabaseConfig()!, false);
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      calls++;
      const headers = new Headers(init.headers);
      assert.equal(headers.get("apikey"), "fixture-publishable");
      assert.equal(headers.get("authorization"), "Bearer fixture-user-session");
      return Response.json({ id: "fixture-user" });
    },
  );
  assert.equal(
    (await supabaseRequest("/auth/v1/user", { token: "fixture-user-session" }))
      .status,
    200,
  );
  assert.throws(
    () => supabaseRequest("/rest/v1/business_targets", { admin: true }),
    /administratif/,
  );
  assert.equal(calls, 1);
  assert.equal(cookieOptions(600).secure, false);
  process.env.RAMU_APP_URL = "https://ramu.example";
  assert.equal(cookieOptions(600).secure, true);
});

test("session cookies require valid nonempty tokens and a positive finite expiry", async () => {
  const valid = {
    access_token: "access-fixture",
    refresh_token: "refresh-fixture",
    expires_in: 3600,
  };
  const cookies = await readSession(Response.json(valid));
  assert.equal(cookies["ramu-access"], valid.access_token);
  for (const item of [
    { ...valid, access_token: "" },
    { ...valid, refresh_token: " " },
    { ...valid, expires_in: 0 },
    { ...valid, expires_in: -1 },
    { ...valid, expires_in: null },
    {},
  ])
    await assert.rejects(readSession(Response.json(item)), /Sesi Supabase/);
  await assert.rejects(
    readSession(Response.json(valid, { status: 401 })),
    /Sesi Supabase/,
  );
});
