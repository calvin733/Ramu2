import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { businessDate } from "../src/domain/sales-report.ts";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const origin = "http://localhost:3000";
const supabase = "https://ramu-supabase.test";
const spreadsheet = "ramu_fixture_spreadsheet";
const sheetToken = "ramu-fixture-token";
const publishable = "ramu-fixture-publishable";
const secret = "ramu-fixture-secret";
const timezone = "Asia/Jakarta";
const today = businessDate(timezone);
const month = today.slice(0, 7);
const start = month + "-01";
const [year, monthNumber] = month.split("-").map(Number);
const before = new Date(Date.UTC(year, monthNumber - 2, 1))
  .toISOString()
  .slice(0, 10);
const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
const period = { kind: "month", year, month: monthNumber };
const query = "?tampilan=bulanan&periode=" + month;
const dataRoute = "/sumber-data" + query;
const dashboardRoute = "/dashboard" + query;
const sheetHeaders = [
  "Tanggal",
  "Nilai Penjualan",
  "ID Pesanan",
  "Produk",
  "Status",
];
const mapping = {
  date: 0,
  revenue: 1,
  order: 2,
  product: 3,
  status: 4,
  quantity: -1,
  basis: "line",
  dateFormat: "iso",
  moneyFormat: "id",
  validOnly: false,
  multiItem: false,
};
const rows = (brownies) => [
  sheetHeaders,
  [before, "25000", "00017", "Brownies", "Selesai"],
  [before, "35000", "00018", "Roti", "Selesai"],
  [start, String(brownies), "00041", "Brownies", "Selesai"],
  [start, "30000", "00042", "Roti", "Selesai"],
];

const fixtureEnvironment = {
  RAMU_APP_URL: origin,
  SUPABASE_URL: supabase,
  SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SECRET_KEY: secret,
  TURNSTILE_SITE_KEY: "fixture-sitekey",
  GOOGLE_SHEETS_CLIENT_ID: "ramu-fixture.apps.googleusercontent.com",
  GOOGLE_SHEETS_PICKER_KEY: "ramu-fixture-picker-key",
  GOOGLE_SHEETS_PROJECT_NUMBER: "123456",
  GEMINI_API_KEY: "",
  GEMINI_SERVICE_TIER: "unpaid",
  GEMINI_DEMO_ENABLED: "false",
  GEMINI_IMPORT_ENABLED: "false",
  GEMINI_MODEL: "gemini-3.1-flash-lite",
};
const previousEnvironment = Object.fromEntries(
  Object.keys(fixtureEnvironment).map((key) => [key, process.env[key]]),
);
Object.assign(process.env, fixtureEnvironment);

const tokenFor = (profile) => "session-" + profile;
const identities = new Map([
  ["alfa", randomUUID()],
  ["beta", randomUUID()],
]);
const businesses = new Map();
const revisions = new Map();
const sources = new Map();
const drafts = new Map();
const targets = new Map();
const threads = new Map();
const periodCosts = new Map();
const authCodes = new Map();
const revokedSessions = new Set();
const confirmedEmails = new Set(["alfa", "beta"]);
const signupChallenges = new Map();
let googleAvailable = true;
let readsFromGoogle = 0;
let sellerAmount = 70_000;
let app;
let server;

const response = (body, status = 200) =>
  status === 204
    ? new Response(null, { status })
    : Response.json(body, { status });
const empty = () => response(null, 204);
const requestWithinApp = (path, options) =>
  send(path, {
    method: options?.method,
    headers: Object.fromEntries(new Headers(options?.headers)),
  });
const pipe =
  process.platform === "win32"
    ? "\\\\.\\pipe\\ramu-mvp-" + process.pid
    : join(tmpdir(), "ramu-mvp-" + process.pid + ".sock");

const previousFetch = globalThis.fetch;
let geminiCalls = 0;
let geminiMode = "ok";
const apiReads = new Map();
let navigationFactDelay = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(
    typeof input === "string" ? input : (input.url ?? input.href),
  );
  const headers = new Headers(options.headers);
  if (url.origin === origin) {
    const result = await requestWithinApp(url.pathname + url.search, options);
    return new Response(
      [204, 304].includes(result.status) ? null : result.body,
      {
        headers: result.headers,
        status: result.status,
      },
    );
  }
  const body = options.body ? JSON.parse(options.body) : null;
  apiReads.set(url.pathname, (apiReads.get(url.pathname) ?? 0) + 1);
  if (url.origin === "https://generativelanguage.googleapis.com") {
    geminiCalls++;
    assert.equal(headers.get("x-goog-api-key"), "fixture-gemini-key");
    assert.doesNotMatch(
      JSON.stringify(body.contents),
      /Brownies|Roti|penjualan-uji|@example\.com/,
    );
    if (geminiMode === "quota") return response({}, 429);
    const payload = JSON.parse(body.contents[0].parts[0].text);
    assert.ok((payload.memory?.length ?? 0) <= 4);
    const data = body.generationConfig.responseJsonSchema.properties.intent
      ? { intent: "sales" }
      : {
          paragraphs: [
            geminiMode === "bad"
              ? "Omzet Rp999999999"
              : "Bisa, mari kita lihat catatannya. {{F1}}",
          ],
        };
    return response({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(data) }] },
        },
      ],
    });
  }
  if (url.origin === "https://sheets.googleapis.com") {
    readsFromGoogle++;
    assert.equal(headers.get("authorization"), "Bearer " + sheetToken);
    assert.ok(url.pathname.startsWith("/v4/spreadsheets/" + spreadsheet));
    if (!googleAvailable) return response({}, 401);
    if (url.pathname.endsWith("batchGetByDataFilter")) {
      if (body.dataFilters?.[0]?.gridRange?.endRowIndex === 3) {
        assert.deepEqual(
          body.dataFilters,
          [21, 0].map((sheetId) => ({
            gridRange: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 3,
              startColumnIndex: 0,
              endColumnIndex: 80,
            },
          })),
        );
        return response({
          valueRanges: body.dataFilters.map((filter) => ({
            dataFilters: [filter],
            valueRange: { values: [sheetHeaders] },
          })),
        });
      }
      assert.deepEqual(body.dataFilters, [{ gridRange: { sheetId: 0 } }]);
      return response({
        valueRanges: [{ valueRange: { values: rows(sellerAmount) } }],
      });
    }
    return response({
      properties: { title: "Penjualan Google Uji" },
      sheets: [
        { properties: { sheetId: 21, title: "Arsip", sheetType: "GRID" } },
        { properties: { sheetId: 0, title: "Transaksi", sheetType: "GRID" } },
      ],
    });
  }

  assert.equal(url.origin, supabase, "Fixture only talks to expected origins");
  const path = url.pathname;
  const key = (name) => url.searchParams.get(name)?.slice(3);
  const bearer = headers.get("authorization");
  const profile = [...identities.keys()].find(
    (name) =>
      bearer === "Bearer " + tokenFor(name) && !revokedSessions.has(name),
  );
  const owner = identities.get(profile);
  const business = businesses.get(owner);
  if (path === "/auth/v1/user")
    return owner
      ? response({
          id: owner,
          email_confirmed_at: confirmedEmails.has(profile)
            ? new Date().toISOString()
            : null,
        })
      : response({}, 401);
  if (path === "/auth/v1/settings")
    return response({
      external: { email: true },
      disable_signup: false,
      mailer_autoconfirm: false,
    });
  if (path === "/auth/v1/signup" || path === "/auth/v1/resend") {
    assert.equal(headers.get("apikey"), publishable);
    if (
      body.email === "invalid-captcha-readiness-probe" ||
      body.gotrue_meta_security?.captcha_token !== "fixture-captcha"
    )
      return response({ error_code: "captcha_failed" }, 400);
    assert.equal(body.code_challenge_method, "s256");
    signupChallenges.set(body.email, body.code_challenge);
    if (path.endsWith("signup")) {
      assert.equal(body.email, "gamma@ramu.example");
      identities.set("gamma", randomUUID());
      return response({
        id: identities.get("gamma"),
        email_confirmed_at: null,
      });
    }
    return response({});
  }
  if (path === "/auth/v1/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      assert.equal(headers.get("apikey"), publishable);
      if (body.gotrue_meta_security?.captcha_token !== "fixture-captcha")
        return response({ error_code: "captcha_failed" }, 400);
      const name = [...identities.keys()].find(
        (name) =>
          body.email === name + "@ramu.example" &&
          body.password === "fixture-password-RAMU",
      );
      if (!name) return response({ error_code: "invalid_credentials" }, 400);
      if (!confirmedEmails.has(name))
        return response({ error_code: "email_not_confirmed" }, 400);
      revokedSessions.delete(name);
      return response({
        access_token: tokenFor(name),
        refresh_token: "refresh-" + name,
        expires_in: 3600,
      });
    }
    const challenge =
      grant === "pkce" &&
      createHash("sha256").update(body.code_verifier).digest("base64url");
    const session =
      grant === "pkce"
        ? authCodes.get(body.auth_code)
        : [...identities.keys()].find(
            (name) => body.refresh_token === "refresh-" + name,
          );
    if (!session || (grant === "pkce" && session.challenge !== challenge))
      return response({}, 400);
    const name = grant === "pkce" ? session.name : session;
    if (grant === "pkce") confirmedEmails.add(name);
    revokedSessions.delete(name);
    return response({
      access_token: tokenFor(name),
      refresh_token: "refresh-" + name,
      expires_in: 3600,
    });
  }
  if (path === "/auth/v1/logout") {
    assert.ok(profile);
    revokedSessions.add(profile);
    return empty();
  }
  if (path === "/rest/v1/businesses") {
    assert.ok(owner);
    if (options.method === "POST") {
      assert.equal(body.owner_id, owner);
      assert.equal(business, undefined);
      businesses.set(owner, {
        ...body,
        id: randomUUID(),
        active_revision_id: null,
      });
      return empty();
    }
    return response(owner === key("owner_id") && business ? [business] : []);
  }
  if (path === "/rest/v1/sales_revisions") {
    const revision = revisions.get(key("id"));
    return response(
      revision &&
        business?.id === key("business_id") &&
        revision.business_id === business?.id
        ? [revision]
        : [],
    );
  }
  if (path === "/rest/v1/data_sources") {
    const source = sources.get(key("id"));
    return response(
      source &&
        business?.id === key("business_id") &&
        source.business_id === business?.id
        ? [source]
        : [],
    );
  }
  if (path === "/rest/v1/sales_facts") {
    if (navigationFactDelay)
      await new Promise((resolve) => setTimeout(resolve, navigationFactDelay));
    const revision = revisions.get(key("revision_id"));
    assert.equal(business?.id, key("business_id"));
    assert.equal(revision?.business_id, business?.id);
    return response(
      revision.facts.filter(
        ({ source_row }) => source_row > Number(key("source_row")),
      ),
    );
  }
  if (path === "/rest/v1/business_targets") {
    assert.equal(business?.id, key("business_id"));
    const filter = url.searchParams.get("id");
    return response(
      [...targets.values()]
        .filter(
          (target) =>
            target.business_id === business?.id &&
            (filter?.startsWith("eq.")
              ? target.id === key("id")
              : target.id > (key("id") ?? "")),
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
  if (path === "/rest/v1/business_conversations") {
    const id = key("id") ?? body?.id;
    const businessId = key("business_id") ?? body?.business_id;
    const threadKey = businessId + ":" + id;
    const stored = threads.get(threadKey);
    if (
      options.method === "POST" ||
      options.method === "PATCH" ||
      options.method === "DELETE"
    ) {
      assert.equal(headers.get("apikey"), secret);
      if (options.method === "DELETE") {
        threads.delete(threadKey);
        return empty();
      }
      if (options.method === "POST" && stored) return response({}, 409);
      if (
        options.method === "PATCH" &&
        stored?.version !== Number(key("version"))
      )
        return response([]);
      const updated = { id, business_id: businessId, ...body };
      threads.set(threadKey, updated);
      return response([updated]);
    }
    assert.equal(businessId, business?.id);
    return response(
      id
        ? stored
          ? [stored]
          : []
        : [...threads.values()].filter((row) => row.business_id === businessId),
    );
  }
  if (path === "/rest/v1/business_period_costs") {
    if (options.method === "POST") {
      assert.equal(headers.get("apikey"), secret);
      periodCosts.set(body.business_id, [body]);
      return empty();
    }
    assert.equal(key("business_id"), business?.id);
    return response(periodCosts.get(business?.id) ?? []);
  }
  assert.equal(headers.get("apikey"), secret);
  assert.doesNotMatch(JSON.stringify(body), /ramu-fixture-token|accessToken/);
  const subject = businesses.get(body.p_owner);
  if (!subject || subject.id !== body.p_business) return response({}, 403);
  const operation = path.split("/").at(-1);
  if (operation === "ramu_save_target") {
    const stored = targets.get(body.p_id);
    if (body.p_version !== null && stored?.version !== body.p_version)
      return response({}, 409);
    targets.set(body.p_id, {
      id: body.p_id,
      business_id: subject.id,
      kind: body.p_kind,
      amount: body.p_amount,
      starts_on: body.p_starts,
      ends_on: body.p_ends,
      selling_days: body.p_selling_days,
      is_primary: body.p_primary,
      version: (stored?.version ?? 0) + 1,
    });
    return response(body.p_id);
  }
  if (operation === "ramu_stage_import") {
    if (body.p_base !== subject.active_revision_id) return response({}, 409);
    drafts.set(body.p_run, { ...body, state: "ready" });
    return empty();
  }
  const draft = drafts.get(body.p_run);
  if (!draft || draft.p_business !== subject.id) return response({}, 404);
  if (operation === "ramu_cancel_import") {
    if (draft.state === "ready") draft.state = "cancelled";
    return empty();
  }
  assert.equal(operation, "ramu_activate_import");
  if (draft.state === "activated") return response(draft.revision);
  if (draft.state !== "ready") return response({}, 410);
  if (draft.p_base !== subject.active_revision_id) return response({}, 409);
  const payload = draft.p_payload;
  const current = revisions.get(subject.active_revision_id);
  const sourceId =
    payload.operation === "update" ? current.source_id : randomUUID();
  if (payload.operation !== "update") {
    sources.set(sourceId, {
      business_id: subject.id,
      kind: payload.kind,
      paused_at: null,
      spreadsheet_id: payload.spreadsheetId ?? null,
      sheet_id: payload.sheetId ?? null,
    });
  }
  const id = randomUUID();
  revisions.set(id, {
    id,
    business_id: subject.id,
    source_id: sourceId,
    covered_from: payload.from,
    covered_through: payload.through,
    imported_at: new Date().toISOString(),
    order_count: payload.orders,
    product_available: payload.products,
    basis: payload.basis,
    file_name: payload.name,
    file_sheet: payload.sheet,
    mapping: payload.mapping,
    facts: payload.facts.map(({ row, date, ...fact }) => ({
      ...fact,
      source_row: row,
      business_date: date,
    })),
  });
  subject.active_revision_id = id;
  draft.state = "activated";
  draft.revision = id;
  return response(id);
};

function send(path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        socketPath: pipe,
        path,
        method,
        headers: {
          host: "localhost:3000",
          "user-agent": "Googlebot",
          ...headers,
          ...(body?.length ? { "content-length": body.length } : {}),
        },
      },
      (reply) => {
        const parts = [];
        reply.on("data", (part) => parts.push(part));
        reply.on("end", () => {
          const buffer = Buffer.concat(parts);
          resolve({
            status: reply.statusCode,
            headers: reply.headers,
            body: buffer,
            text: buffer.toString(),
          });
        });
        reply.on("error", reject);
      },
    );
    request.setTimeout(12_000, () =>
      request.destroy(new Error("Waktu permintaan uji habis")),
    );
    request.on("error", reject);
    request.end(body);
  });
}

function session() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const cookie = [...cookies]
      .map(([name, value]) => name + "=" + value)
      .join("; ");
    const result = await send(path, {
      ...options,
      headers: { ...options.headers, cookie },
    });
    for (const header of result.headers["set-cookie"] ?? []) {
      const [pair] = header.split(";");
      const [name, value] = pair.split("=");
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return result;
  };
}

const form = (fields) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const redirect = ({ headers }) =>
  (headers["x-action-redirect"] ?? headers.location ?? "").replace(
    /;(push|replace)$/,
    "",
  );
const html = (result) => result.text.replaceAll("<!-- -->", "");

function link(text, label) {
  for (const [, href, contents] of text.matchAll(
    /<a\b[^>]*href="([^"]+)"[^>]*>([^]*?)<\/a>/g,
  )) {
    if (contents.includes(label)) return href.replaceAll("&amp;", "&");
  }
  throw new Error("Tautan tidak ditemukan " + label);
}

function actionId(manifest, name) {
  const id = Object.entries(manifest.node).find(
    ([, value]) => value.exportedName === name,
  )?.[0];
  assert.ok(id, name + " ada dalam build produksi");
  return id;
}

try {
  const manifest = JSON.parse(
    await readFile(
      join(appDirectory, ".next", "server", "server-reference-manifest.json"),
      "utf8",
    ),
  );
  const {
    encodeReply,
  } = require("next/dist/compiled/react-server-dom-webpack/client.node");
  app = require("next")({
    dir: appDirectory,
    dev: false,
    hostname: "localhost",
    port: 3000,
  });
  await app.prepare();
  server = http.createServer(app.getRequestHandler());
  await new Promise((resolve, reject) =>
    server.listen(pipe, resolve).once("error", reject),
  );

  async function action(page, path, name, ...args) {
    const encoded = await encodeReply(args);
    const request = new Request(origin, { method: "POST", body: encoded });
    return page(path, {
      method: "POST",
      body: Buffer.from(await request.arrayBuffer()),
      headers: {
        accept: "text/x-component",
        origin,
        "next-action": actionId(manifest, name),
        "content-type": request.headers.get("content-type"),
      },
    });
  }

  async function login(page, name) {
    const response = await action(page, "/masuk", "signInWithGoogle");
    const authorize = new URL(redirect(response));
    assert.equal(authorize.origin, supabase);
    assert.equal(authorize.searchParams.get("provider"), "google");
    assert.equal(authorize.searchParams.get("prompt"), "select_account");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
    const key = "code-" + name;
    authCodes.set(key, {
      name,
      challenge: authorize.searchParams.get("code_challenge"),
    });
    assert.ok(
      response.headers["set-cookie"].some(
        (item) => item.startsWith("ramu-pkce=") && /httponly/i.test(item),
      ),
    );
    assert.equal(
      new URL(redirect(await page("/auth/callback?code=" + key))).pathname,
      "/pengaturan-awal/profil",
    );
    assert.match(html(await page("/pengaturan-awal/profil")), /Nama usaha/);
    const saved = await action(
      page,
      "/pengaturan-awal/profil",
      "saveBusiness",
      form({
        name: "Usaha " + name,
        kind: "Makanan & minuman",
        timezone,
      }),
    );
    assert.equal(redirect(saved), "/pengaturan-awal/sumber");
  }

  const owner = session();
  const other = session();
  const demo = session();
  const passwordTester = session();
  const signInPage = html(await passwordTester("/masuk"));
  assert.match(signInPage, /Password RAMU/);
  const wrongPassword = await action(
    passwordTester,
    "/masuk",
    "signInWithEmail",
    {},
    form({
      email: "beta@ramu.example",
      password: "wrong-fixture-password",
      captcha_token: "fixture-captcha",
    }),
  );
  assert.match(wrongPassword.text, /Email atau password RAMU belum sesuai/);
  assert.doesNotMatch(wrongPassword.text, /wrong-fixture-password/);
  assert.equal(
    redirect(await passwordTester(dashboardRoute)).startsWith("/masuk"),
    true,
  );
  const passwordLogin = await action(
    passwordTester,
    "/masuk",
    "signInWithEmail",
    {},
    form({
      email: "beta@ramu.example",
      password: "fixture-password-RAMU",
      lanjut: "//evil.example",
      captcha_token: "fixture-captcha",
    }),
  );
  assert.equal(redirect(passwordLogin), "/dashboard");
  assert.ok(
    passwordLogin.headers["set-cookie"].some(
      (item) => item.startsWith("ramu-access=") && /httponly/i.test(item),
    ),
  );
  assert.equal(
    redirect(await passwordTester("/dashboard")),
    "/pengaturan-awal/profil",
  );
  await action(passwordTester, "/masuk", "signOut");
  const signupUser = session();
  assert.match(
    html(await signupUser("/daftar?metode=email")),
    /Buat akun RAMU/,
  );
  const registered = await action(
    signupUser,
    "/daftar?metode=email",
    "signUpWithEmail",
    {},
    form({
      email: "gamma@ramu.example",
      password: "fixture-password-RAMU",
      password_confirmation: "fixture-password-RAMU",
      captcha_token: "fixture-captcha",
      lanjut: "/target-bisnis",
    }),
  );
  assert.equal(redirect(registered), "/daftar/verifikasi");
  assert.ok(
    !registered.headers["set-cookie"].some(
      (value) =>
        value.startsWith("ramu-access=") && !value.startsWith("ramu-access=;"),
    ),
  );
  assert.ok(redirect(await signupUser("/dashboard")).startsWith("/masuk"));
  assert.match(
    html(await signupUser("/daftar/verifikasi")),
    /Periksa email Anda/,
  );
  const pendingLogin = await action(
    signupUser,
    "/masuk",
    "signInWithEmail",
    {},
    form({
      email: "gamma@ramu.example",
      password: "fixture-password-RAMU",
      captcha_token: "fixture-captcha",
    }),
  );
  assert.match(pendingLogin.text, /Konfirmasi email Anda sebelum masuk/);
  const tooSoon = await action(
    signupUser,
    "/daftar/verifikasi",
    "resendVerificationEmail",
    {},
    form({ email: "gamma@ramu.example", captcha_token: "fixture-captcha" }),
  );
  assert.match(tooSoon.text, /Permintaan terlalu sering/);
  authCodes.set("email-gamma", {
    name: "gamma",
    challenge: signupChallenges.get("gamma@ramu.example"),
  });
  const confirmed = await signupUser("/auth/callback?code=email-gamma");
  assert.equal(new URL(redirect(confirmed)).pathname, "/target-bisnis");
  assert.ok(
    confirmed.headers["set-cookie"].some(
      (value) => value.startsWith("ramu-access=") && /httponly/i.test(value),
    ),
  );
  assert.equal(
    redirect(await signupUser("/target-bisnis")),
    "/pengaturan-awal/profil",
  );
  await action(signupUser, "/masuk", "signOut");
  const resendUser = session();
  const resent = await action(
    resendUser,
    "/daftar/verifikasi",
    "resendVerificationEmail",
    {},
    form({
      email: "not-existing@ramu.example",
      captcha_token: "fixture-captcha",
    }),
  );
  assert.match(resent.text, /"sent":true/);
  assert.ok(signupChallenges.get("not-existing@ramu.example"));
  assert.ok(redirect(await resendUser("/dashboard")).startsWith("/masuk"));
  const demoHtml = html(await demo("/demo"));
  assert.match(demoHtml, /Data contoh/);
  assert.match(demoHtml, /Rp24\.800\.000/);
  assert.match(demoHtml, /328 pesanan/);
  // Browser fetch includes Origin. Next may build request.url with its bind host.
  const localChatOrigin = "http://127.0.0.1:3000";
  const originChat = await demo("/demo/asisten/percakapan", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: localChatOrigin,
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    },
    body: Buffer.from(
      JSON.stringify({
        id: randomUUID(),
        requestId: randomUUID(),
        question: "Halo",
        demo: true,
      }),
    ),
  });
  assert.equal(
    originChat.status,
    200,
    "same-origin chat from 127.0.0.1 must work even when RAMU_APP_URL uses localhost: " +
      originChat.text,
  );
  const chatPayload = (demo = true) =>
    Buffer.from(
      JSON.stringify({
        id: randomUUID(),
        requestId: randomUUID(),
        question: "Halo",
        demo,
      }),
    );
  const configuredAppUrl = process.env.RAMU_APP_URL;
  for (const configured of [configuredAppUrl, ""]) {
    process.env.RAMU_APP_URL = configured;
    const validHeaders = {
      host: "localhost:3001",
      origin: "http://localhost:3001",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    };
    assert.equal(
      (
        await demo("/demo/asisten/percakapan", {
          method: "POST",
          headers: validHeaders,
          body: chatPayload(),
        })
      ).status,
      200,
      "same-origin chat supports the active port and an unset canonical URL",
    );
    assert.equal(
      (
        await demo("/api/asisten", {
          method: "POST",
          headers: validHeaders,
          body: chatPayload(false),
        })
      ).status,
      401,
      "valid origin reaches account authentication",
    );
    assert.equal(
      (
        await demo("/api/asisten?id=" + randomUUID(), {
          method: "DELETE",
          headers: validHeaders,
        })
      ).status,
      401,
      "DELETE shares the same origin validation",
    );
    for (const [originHeader, forwarded] of [
      ["https://evil.example", {}],
      ["http://localhost:3002", {}],
      ["https://evil.example", { "x-forwarded-host": "evil.example" }],
    ]) {
      const headers = { ...validHeaders, ...forwarded, origin: originHeader };
      assert.equal(
        (
          await demo("/demo/asisten/percakapan", {
            method: "POST",
            headers,
            body: chatPayload(),
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await demo("/api/asisten?id=" + randomUUID(), {
            method: "DELETE",
            headers,
          })
        ).status,
        403,
      );
    }
  }
  process.env.RAMU_APP_URL = configuredAppUrl;
  const demoEdited = await action(
    demo,
    "/demo",
    "changeTarget",
    "demo",
    {},
    form({
      id: "omzet",
      version: "1",
      start: "2026-11-01",
      end: "2026-11-30",
      kind: "revenue",
      value: "35000000",
      primary: "on",
      "tampilan-editor": "dialog",
    }),
  );
  assert.match(demoEdited.text, /"saved":"disimpan"/);
  assert.match(html(await demo("/demo")), /35\.000\.000/);
  assert.doesNotMatch(html(await session()("/demo")), /35\.000\.000/);
  assert.equal(
    new URL(
      redirect(await demo("/auth/callback?code=tanpa-izin")),
    ).searchParams.get("status"),
    "tautan",
  );
  await login(owner, "alfa");
  await login(other, "beta");
  const business = businesses.get(identities.get("alfa"));
  const assistedUpload = form({
    file: new File(
      [
        `Tanggal,ID Pesanan,Produk,Status,Kuantitas,Nilai Penjualan\n${today},AUTO-1,Kemeja,Selesai,2,300000\n${today},AUTO-1,Celana,Selesai,1,200000\n${today},AUTO-1,Kemeja,Retur,1,-150000`,
      ],
      "item-sales.csv",
    ),
  });
  const assistedInspect = await action(
    owner,
    dataRoute,
    "inspectImport",
    assistedUpload,
  );
  assert.match(assistedInspect.text, /"canPreview":true/);
  assert.match(assistedInspect.text, /"multiItem":true/);
  const assistedMapping = {
    date: 0,
    order: 1,
    product: 2,
    status: 3,
    quantity: 4,
    revenue: 5,
    basis: "order",
    dateFormat: "iso",
    moneyFormat: "id",
    validOnly: false,
    multiItem: false,
  };
  const draftsBeforeCorrection = drafts.size;
  const incorrectBasis = await action(
    owner,
    dataRoute,
    "previewImport",
    assistedUpload,
    assistedMapping,
    undefined,
    undefined,
  );
  assert.match(incorrectBasis.text, /"issueCount":1/);
  assert.match(incorrectBasis.text, /"label":"Gunakan nilai per item"/);
  assert.match(incorrectBasis.text, /"basis":"line"/);
  assert.equal(drafts.size, draftsBeforeCorrection);
  const correctedBasis = await action(
    owner,
    dataRoute,
    "previewImport",
    assistedUpload,
    { ...assistedMapping, basis: "line", multiItem: true },
    undefined,
    undefined,
  );
  assert.match(correctedBasis.text, /"sales":350000/);
  assert.match(correctedBasis.text, /"orders":1/);
  assert.equal(business.active_revision_id, null);
  const assistedDraft = [...drafts.keys()].at(-1);
  await action(owner, dataRoute, "cancelImport", assistedDraft);
  const file = new File(
    [
      rows(50_000)
        .map((row) => row.join(","))
        .join("\n"),
    ],
    "penjualan-uji.csv",
  );
  const upload = form({ file });
  assert.match(
    (await action(owner, dataRoute, "inspectImport", upload)).text,
    /"sample":"00017"/,
  );
  const coverage = { from: before, through: today };
  assert.match(
    (
      await action(
        owner,
        dataRoute,
        "previewImport",
        upload,
        mapping,
        coverage,
        undefined,
      )
    ).text,
    /"sales":140000/,
  );
  const cancelled = [...drafts.keys()].at(-1);
  assert.match(
    (await action(owner, dataRoute, "cancelImport", cancelled)).text,
    /"cancelled":true/,
  );
  assert.match(
    (await action(owner, dataRoute, "activateImport", cancelled, false)).text,
    /Pratinjau sudah tidak tersedia/,
  );
  await action(
    owner,
    dataRoute,
    "previewImport",
    upload,
    mapping,
    coverage,
    undefined,
  );
  const csvRun = [...drafts.keys()].at(-1);
  assert.equal(business.active_revision_id, null);
  const confirm = () =>
    action(owner, dataRoute, "activateImport", csvRun, false);
  const confirmations = await Promise.all([confirm(), confirm()]);
  const revision = business.active_revision_id;
  assert.ok(revision);
  for (const result of confirmations)
    assert.match(result.text, new RegExp(revision));
  assert.equal(revisions.size, 1);

  const target = await action(
    owner,
    "/target-bisnis/baru",
    "changeTarget",
    "business",
    {},
    form({
      id: randomUUID(),
      start,
      end,
      kind: "revenue",
      value: "100000",
      primary: "on",
    }),
  );
  assert.match(redirect(target), /\/target-bisnis\?hasil=disimpan/);
  const persistedTarget = [...targets.values()][0];
  const editFields = {
    id: persistedTarget.id,
    version: "1",
    start,
    end,
    kind: "revenue",
    primary: "on",
    value: "120000",
    "tampilan-editor": "dialog",
  };
  const saveStarted = performance.now();
  const edited = await action(
    owner,
    dashboardRoute,
    "changeTarget",
    "business",
    {},
    form(editFields),
  );
  const elapsedSave = Math.round(performance.now() - saveStarted);
  assert.match(edited.text, /"saved":"disimpan"/);
  assert.match(
    (
      await action(
        owner,
        dashboardRoute,
        "changeTarget",
        "business",
        {},
        form(editFields),
      )
    ).text,
    /Target sudah berubah/,
  );
  assert.match(html(await owner(dashboardRoute)), /Rp120\.000/);
  assert.match(
    (
      await action(
        owner,
        dashboardRoute,
        "changeTarget",
        "business",
        {},
        form({ ...editFields, version: "2", value: "100000" }),
      )
    ).text,
    /"saved":"disimpan"/,
  );
  assert.match(html(await owner("/target-bisnis")), /data-target-editor/);
  const filteredHistory = html(
    await demo(
      "/demo/target-bisnis/riwayat?jenis=revenue&mulai=2026-10-01&sampai=2026-10-31&urut=highest",
    ),
  );
  const historyEditor = new URL(link(filteredHistory, "Omzet"), origin);
  assert.equal(historyEditor.pathname, "/demo/target-bisnis/omzet-okt");
  const historyReturn = historyEditor.searchParams.get("kembali");
  const returnQuery = new URL(historyReturn, origin).searchParams;
  assert.equal(returnQuery.get("mulai"), "2026-10-01");
  assert.equal(returnQuery.get("sampai"), "2026-10-31");
  assert.equal(returnQuery.get("urut"), "highest");
  const historySave = await action(
    demo,
    historyEditor.pathname + historyEditor.search,
    "changeTarget",
    "demo",
    {},
    form({
      id: "omzet-okt",
      version: "1",
      kind: "revenue",
      value: "42000000",
      start: "2026-10-01",
      end: "2026-10-31",
      kembali: historyReturn,
    }),
  );
  const savedHistory = new URL(redirect(historySave), origin);
  assert.equal(savedHistory.pathname, "/demo/target-bisnis/riwayat");
  assert.equal(savedHistory.searchParams.get("mulai"), "2026-10-01");
  assert.equal(savedHistory.searchParams.get("urut"), "highest");
  assert.equal(savedHistory.searchParams.get("hasil"), "disimpan");
  assert.match(
    html(await demo(savedHistory.pathname + savedHistory.search)),
    /Target tersimpan/,
  );
  const dashboard = html(await owner(dashboardRoute));
  assert.match(dashboard, /Rp80\.000/);
  assert.match(dashboard, /2 pesanan/);
  assert.match(dashboard, /80% dari target/);
  navigationFactDelay = 200;
  try {
    for (const visit of ["first", "warm"]) {
      const before = apiReads.get("/rest/v1/sales_facts") ?? 0;
      const started = performance.now();
      const assistantPage = html(await owner("/asisten" + query));
      assert.match(assistantPage, /conversation-shell/);
      const factReads = (apiReads.get("/rest/v1/sales_facts") ?? 0) - before;
      console.log(
        JSON.stringify({
          route: "/asisten",
          visit,
          elapsedMs: Math.round(performance.now() - started),
          factReads,
          simulatedFactDelayMs: navigationFactDelay,
        }),
      );
      if (!process.env.RAMU_NAV_BASELINE)
        assert.equal(factReads, 0, "opening chat only needs source metadata");
    }
  } finally {
    navigationFactDelay = 0;
  }
  const asked = await action(
    owner,
    "/asisten" + query,
    "askAssistant",
    "business",
    period,
    revision,
    {},
    form({
      pertanyaan: "Apa yang mendorong kenaikan penjualan?",
    }),
  );
  const answer = html(await owner(redirect(asked)));
  assert.match(answer, /Brownies mencatat kenaikan terbesar/);
  const proof = link(answer, "Lihat bukti per produk");
  assert.match(proof, new RegExp(revision));
  const evidence = html(await owner(proof.split("#")[0]));
  assert.match(evidence, /penjualan-uji\.csv/);
  assert.match(evidence, /Rp80\.000/);
  assert.match(link(evidence, "Kembali ke Asisten"), /tanya=growth/);
  const conversationId = randomUUID();
  async function chat(
    page,
    { question, version, requestId = randomUUID(), demo = false, history },
  ) {
    const result = await page(
      demo ? "/demo/asisten/percakapan" : "/api/asisten",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "sec-fetch-site": "same-origin",
        },
        body: Buffer.from(
          JSON.stringify({
            id: conversationId,
            requestId,
            question,
            version,
            demo,
            history,
          }),
        ),
      },
    );
    assert.equal(result.status, 200);
    return result.text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .at(-1);
  }
  const requestId = randomUUID();
  const firstTurnStarted = performance.now();
  const firstTurn = await chat(owner, {
    question: "Bagaimana penjualan bulan ini?",
    version: 0,
    requestId,
  });
  assert.ok(
    firstTurn.turn.answer.metrics.some(({ value }) => value === "Rp80.000"),
  );
  const elapsedChat = Math.round(performance.now() - firstTurnStarted);
  const repeat = await chat(owner, {
    question: "Bagaimana penjualan bulan ini?",
    version: 0,
    requestId,
  });
  assert.deepEqual(repeat.turn, firstTurn.turn);
  const secondTurn = await chat(owner, {
    question: "Bandingkan dengan bulan lalu",
    version: 1,
  });
  assert.ok(
    secondTurn.turn.answer.metrics.some(
      ({ label, value }) =>
        label.includes("Pembanding") && value === "Rp60.000",
    ),
  );
  const lacksCost = await chat(owner, {
    question: "Laba bersih saya berapa?",
    version: 2,
  });
  assert.match(lacksCost.turn.answer.summary, /Catat HPP/);
  const savedCost = await action(
    owner,
    "/sumber-data/biaya",
    "savePeriodCost",
    {},
    form({ start, end: today, hpp: "20000", expenses: "10000" }),
  );
  assert.match(savedCost.text, /"saved":true/);
  const profitTurn = await chat(owner, {
    question: "Laba bersih saya berapa?",
    version: 3,
  });
  assert.ok(
    profitTurn.turn.answer.metrics.some(
      ({ label, value }) => label === "Laba bersih" && value === "Rp50.000",
    ),
  );
  assert.match(
    html(await owner("/asisten?percakapan=" + conversationId)),
    /Rp50\.000/,
  );
  assert.match(
    html(await other("/asisten?percakapan=" + conversationId)),
    /Percakapan tidak ditemukan/,
  );
  assert.equal(
    (await other("/api/asisten?id=" + conversationId, { method: "DELETE" }))
      .status,
    204,
  );
  assert.equal(threads.size, 1);
  const demoChat = await chat(demo, {
    question: "Bagaimana penjualan bulan ini?",
    version: 0,
    demo: true,
  });
  assert.ok(
    demoChat.turn.answer.metrics.some(({ value }) => value === "Rp24.800.000"),
  );
  assert.ok(demoChat.turn.demoReceipt);
  const followupDemo = await chat(demo, {
    question: "Bandingkan dengan bulan lalu",
    version: 1,
    demo: true,
    history: [demoChat.turn.demoReceipt],
  });
  assert.ok(
    followupDemo.turn.answer.metrics.some(
      ({ label, value }) =>
        label.includes("Pembanding") && value === "Rp22.065.000",
    ),
  );
  const invalidDemo = async (page, history, question = "Penjualan?") =>
    page("/demo/asisten/percakapan", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: Buffer.from(
        JSON.stringify({
          id: conversationId,
          requestId: randomUUID(),
          question,
          demo: true,
          history,
        }),
      ),
    });
  assert.equal(
    (await invalidDemo(demo, [{ question: "Account confidential history" }]))
      .status,
    400,
  );
  assert.equal(
    (await invalidDemo(session(), [demoChat.turn.demoReceipt])).status,
    400,
  );
  assert.equal(
    (await invalidDemo(demo, [], "Kontak buyer@example.com")).status,
    400,
  );
  assert.equal(
    (
      await owner("/api/asisten", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: chatPayload(true),
      })
    ).status,
    400,
  );
  const chatProof = firstTurn.turn.answer.evidence;
  assert.match(
    link(html(await owner(chatProof)), "Kembali ke Asisten"),
    new RegExp(conversationId),
  );

  const sheet = form({
    kind: "google_sheets",
    spreadsheet,
    accessToken: sheetToken,
  });
  assert.match(
    (await action(owner, dataRoute, "inspectImport", sheet)).text,
    /"name":"Arsip"/,
  );
  sheet.set("sheet", "0");
  const inspected = await action(owner, dataRoute, "inspectImport", sheet);
  const headerKey = /"headerKey":"([a-f0-9]{64})"/.exec(inspected.text)?.[1];
  assert.ok(headerKey);
  sheet.set("headerKey", headerKey);
  const replace = { operation: "replace", revision };
  const staged = await Promise.all([
    action(
      owner,
      dataRoute,
      "previewImport",
      sheet,
      mapping,
      coverage,
      replace,
    ),
    action(
      owner,
      dataRoute,
      "previewImport",
      sheet,
      mapping,
      coverage,
      replace,
    ),
  ]);
  const pending = staged.map(
    (result) => /"preview":\{"id":"([a-f0-9-]+)"/.exec(result.text)?.[1],
  );
  assert.ok(pending.every(Boolean));
  assert.equal(business.active_revision_id, revision);
  assert.match(
    (await action(owner, dataRoute, "activateImport", pending[0], false)).text,
    /"revision"/,
  );
  assert.match(
    (await action(owner, dataRoute, "activateImport", pending[1], false)).text,
    /Sumber aktif sudah berubah/,
  );
  assert.equal(revisions.size, 2);

  const googleRevision = business.active_revision_id;
  const update = { operation: "update", revision: googleRevision };
  googleAvailable = false;
  assert.match(
    (await action(owner, dataRoute, "inspectImport", sheet, update)).text,
    /"reconnect":true/,
  );
  assert.match(html(await owner(dashboardRoute)), /Rp100\.000/);
  googleAvailable = true;
  sellerAmount = 90_000;
  const understoodUpdate = await action(
    owner,
    dataRoute,
    "inspectImport",
    sheet,
    update,
  );
  assert.match(understoodUpdate.text, /"sheet":0/);
  assert.match(understoodUpdate.text, /"provider":"saved"/);
  assert.match(
    (
      await action(
        owner,
        dataRoute,
        "previewImport",
        sheet,
        mapping,
        coverage,
        update,
      )
    ).text,
    /"sales":180000/,
  );
  const refreshed = [...drafts.keys()].at(-1);
  assert.match(
    (await action(other, dataRoute, "activateImport", refreshed, false)).text,
    /Pratinjau sudah tidak tersedia/,
  );
  assert.equal(business.active_revision_id, googleRevision);
  assert.match(
    (await action(owner, dataRoute, "activateImport", refreshed, false)).text,
    /"revision"/,
  );
  assert.match(html(await owner(dashboardRoute)), /Rp120\.000/);
  assert.match(html(await owner(chatProof)), /Rp80\.000/);
  const latestTurn = await chat(owner, {
    question: "Bisa jelaskan penjualan lagi?",
    version: 4,
  });
  assert.match(latestTurn.turn.answer.advice, /revisi terbaru/);
  assert.ok(
    latestTurn.turn.answer.metrics.some(({ value }) => value === "Rp120.000"),
  );
  process.env.GEMINI_API_KEY = "fixture-gemini-key";
  process.env.GEMINI_SERVICE_TIER = "paid";
  apiReads.clear();
  const aiRequestId = randomUUID();
  const narrated = await chat(owner, {
    question: "Gimana penjualan saya?",
    version: 5,
    requestId: aiRequestId,
  });
  assert.equal(narrated.turn.answer.provider, "gemini");
  assert.match(narrated.turn.answer.summary, /Rp120\.000/);
  assert.ok(narrated.turn.answer.analysisSummary);
  assert.equal(geminiCalls, 1, "known question needs one model call");
  assert.equal(
    apiReads.get("/auth/v1/user"),
    1,
    "account read once per chat request",
  );
  assert.equal(
    apiReads.get("/rest/v1/businesses"),
    1,
    "business read once per chat request",
  );
  assert.equal(
    apiReads.get("/rest/v1/sales_facts"),
    2,
    "one fact page plus end-of-pagination check",
  );
  const aiReplay = await chat(owner, {
    question: "Gimana penjualan saya?",
    version: 5,
    requestId: aiRequestId,
  });
  assert.deepEqual(aiReplay.turn, narrated.turn);
  assert.equal(geminiCalls, 1, "replay does not spend provider quota");
  geminiMode = "quota";
  const quotaTurn = await chat(owner, { question: "Penjualan?", version: 6 });
  assert.equal(quotaTurn.turn.answer.provider, "limited");
  assert.match(quotaTurn.turn.answer.providerNotice, /Kuota/);
  assert.equal(geminiCalls, 2);
  geminiMode = "bad";
  const badTurn = await chat(owner, { question: "Penjualan?", version: 7 });
  assert.equal(badTurn.turn.answer.provider, "limited");
  assert.doesNotMatch(JSON.stringify(badTurn), /999999999/);
  process.env.GEMINI_SERVICE_TIER = "unpaid";
  const privateTurn = await chat(owner, { question: "Penjualan?", version: 8 });
  assert.equal(privateTurn.turn.answer.provider, "basic");
  assert.equal(
    geminiCalls,
    3,
    "unpaid mode never sends confidential business facts",
  );
  process.env.GEMINI_DEMO_ENABLED = "true";
  geminiMode = "ok";
  const callsBeforeFree = geminiCalls;
  const freeDemo = await chat(demo, {
    question: "Penjualan?",
    demo: true,
    version: 2,
    history: [demoChat.turn.demoReceipt, followupDemo.turn.demoReceipt],
  });
  assert.equal(freeDemo.turn.answer.provider, "gemini");
  assert.equal(geminiCalls, callsBeforeFree + 1);
  assert.equal(process.env.GEMINI_SERVICE_TIER, "unpaid");
  apiReads.clear();
  await chat(owner, { question: "Target omzet saya realistis?", version: 9 });
  assert.equal(
    apiReads.get("/rest/v1/sales_facts"),
    2,
    "report and target reuse the same fact pages",
  );
  assert.equal(apiReads.get("/auth/v1/user"), 1);
  for (const route of ["/privasi", "/ketentuan"])
    assert.equal((await demo(route)).status, 200);
  assert.equal(
    (await owner("/api/asisten?id=" + conversationId, { method: "DELETE" }))
      .status,
    204,
  );
  assert.equal(threads.size, 0);
  assert.match(html(await owner(proof.split("#")[0])), /Rp80\.000/);
  assert.doesNotMatch(
    html(await other(proof.split("#")[0])),
    /penjualan-uji\.csv/,
  );
  assert.doesNotMatch(
    html(await other(dashboardRoute)),
    /Usaha alfa|Rp120\.000/,
  );
  const readsBeforeDemo = readsFromGoogle;
  assert.match(html(await demo("/demo")), /Rp24\.800\.000/);
  assert.equal(readsFromGoogle, readsBeforeDemo);
  assert.equal(redirect(await action(owner, dashboardRoute, "signOut")), "/");
  const loginAgain = new URL(redirect(await owner(dashboardRoute)), origin);
  assert.equal(loginAgain.pathname, "/masuk");
  assert.equal(loginAgain.searchParams.get("lanjut"), dashboardRoute);
  console.log(
    "Waktu fixture produksi: simpan target " +
      elapsedSave +
      " ms, jawaban Asisten " +
      elapsedChat +
      " ms.",
  );
  console.log(
    "Lulus alur produksi dengan API simulasi: akun, impor, dialog target, konflik versi, biaya, percakapan, bukti revisi, Sheets, dan isolasi.",
  );
} catch (error) {
  process.exitCode = 1;
  console.error(error);
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await app?.close();
  globalThis.fetch = previousFetch;
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
