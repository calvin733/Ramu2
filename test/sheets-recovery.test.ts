import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  openGoogleSpreadsheet,
  SheetsAccessError,
} from "../src/server/import/google-sheets.ts";

const metadata = {
  properties: { title: "Private workbook" },
  sheets: [
    {
      properties: {
        sheetId: 0,
        title: "Private tab",
        sheetType: "GRID",
        gridProperties: { rowCount: 2, columnCount: 3 },
      },
    },
  ],
};
const sourceId = "private_spreadsheet_identifier";
const token = "private-oauth-token";

function setup(t: TestContext) {
  const names = [
    "GOOGLE_SHEETS_CLIENT_ID",
    "GOOGLE_SHEETS_PICKER_KEY",
    "GOOGLE_SHEETS_PROJECT_NUMBER",
  ];
  const before = names.map((name) => process.env[name]);
  Object.assign(process.env, {
    GOOGLE_SHEETS_CLIENT_ID: "fixture.apps.googleusercontent.com",
    GOOGLE_SHEETS_PICKER_KEY: "fixture-picker-key",
    GOOGLE_SHEETS_PROJECT_NUMBER: "1234",
  });
  t.after(() =>
    names.forEach((name, index) => {
      if (before[index] === undefined) delete process.env[name];
      else process.env[name] = before[index];
    }),
  );
  return t.mock.method(console, "warn", () => {});
}

test("a transient metadata connection failure recovers with one read-only retry and private diagnostics", async (t) => {
  const warnings = setup(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1)
      throw new TypeError("fetch failed " + sourceId + token, {
        cause: { code: "ECONNRESET", message: sourceId + token },
      });
    return Response.json(metadata);
  });
  const book = await openGoogleSpreadsheet(token, sourceId);
  assert.equal(book.tabs[0].id, 0);
  assert.equal(calls, 2);
  const logged = JSON.stringify(
    warnings.mock.calls.map((call) => call.arguments),
  );
  assert.match(logged, /ECONNRESET/);
  assert.match(logged, /metadata/);
  assert.doesNotMatch(logged, /private_|private-|Bearer|googleapis\.com/);
});

test("persistent timeout and malformed responses have distinct messages and bounded attempts", async (t) => {
  const warnings = setup(t);
  let mode = "timeout",
    calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (mode === "timeout")
      throw new DOMException("Private upstream detail", "TimeoutError");
    return new Response("<html>Private upstream detail</html>", {
      headers: { "content-type": "text/html" },
    });
  });
  await assert.rejects(openGoogleSpreadsheet(token, sourceId), /terlalu lama/);
  assert.equal(calls, 2);
  mode = "malformed";
  await assert.rejects(
    openGoogleSpreadsheet(token, sourceId),
    /respons yang belum dapat dibaca/,
  );
  assert.equal(calls, 4);
  const logged = JSON.stringify(
    warnings.mock.calls.map((call) => call.arguments),
  );
  assert.match(logged, /TIMEOUT/);
  assert.match(logged, /INVALID_JSON/);
  assert.doesNotMatch(logged, /Private upstream detail|<html>/);
});

test("authorization errors do not retry while a transient selected-tab service failure can recover", async (t) => {
  setup(t);
  let status = 401,
    calls = 0,
    reads = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      calls++;
      if (status !== 200) return new Response(null, { status });
      if (init.method !== "POST") return Response.json(metadata);
      if (++reads === 1) return new Response(null, { status: 503 });
      return Response.json({
        valueRanges: [
          {
            valueRange: {
              values: [
                ["Tanggal", "Nilai"],
                ["2026-11-01", "100000"],
              ],
            },
          },
        ],
      });
    },
  );
  for (const denied of [401, 403, 404]) {
    status = denied;
    const before = calls;
    await assert.rejects(
      openGoogleSpreadsheet(token, sourceId),
      SheetsAccessError,
    );
    assert.equal(calls - before, 1);
  }
  status = 200;
  const book = await openGoogleSpreadsheet(token, sourceId);
  assert.equal((await book.read(0)).rows[0].cells[1], "100000");
  assert.equal(reads, 2);
});

test("header previews fit small grids instead of requesting columns outside the sheet", async (t) => {
  setup(t);
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      if (init.method !== "POST") return Response.json(metadata);
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.dataFilters, [
        {
          gridRange: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: 3,
          },
        },
      ]);
      return Response.json({
        valueRanges: [
          {
            dataFilters: body.dataFilters,
            valueRange: {
              values: [
                ["Tanggal", "Nilai", "Produk"],
                ["private-value", "100000", "private-product"],
              ],
            },
          },
        ],
      });
    },
  );
  const headers = await (
    await openGoogleSpreadsheet(token, sourceId)
  ).peekHeaders();
  assert.deepEqual(headers[0].headers, ["Tanggal", "Nilai", "Produk"]);
  assert.doesNotMatch(
    JSON.stringify(headers),
    /private-value|private-product|100000/,
  );
});
