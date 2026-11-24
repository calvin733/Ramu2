import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSales,
  suggestMapping,
  verifyMapping,
} from "../src/domain/import-sales.ts";
import { maxFileBytes } from "../src/domain/import-types.ts";
import {
  openGoogleSpreadsheet,
  sheetFromGoogle,
  sheetHeaderKey,
  SheetsAccessError,
} from "../src/server/import/google-sheets.ts";

const headers = [
  "Tanggal",
  "Nilai Penjualan",
  "ID Pesanan",
  "Produk",
  "Status",
];
const sales = [
  headers,
  ["17/11/2026", "Rp50.000", "00042", "Brownies", "Selesai"],
  [],
  ["18/11/2026", "Rp25.000", "00043", "Roti", "Selesai"],
];

test("nilai terformat Sheets memakai parser yang sama dan mempertahankan ID serta lokasi baris", () => {
  const table = sheetFromGoogle(sales);
  assert.equal(table.rows[1].number, 4);
  const mapping = verifyMapping(
    {
      ...suggestMapping(table.headers),
      dateFormat: "dmy",
    },
    table.headers.length,
  );
  const result = normalizeSales(table, mapping, "Asia/Jakarta");
  assert.deepEqual(result.issues, []);
  assert.equal(result.facts[0].order_id, "00042");
  assert.equal(result.sales, 75_000);
  assert.equal(result.orders, 2);
  assert.notEqual(
    sheetHeaderKey(headers),
    sheetHeaderKey([...headers].reverse()),
  );
  assert.throws(
    () => sheetFromGoogle(Array.from({ length: 5002 }, () => [])),
    /5.000 baris/,
  );
  assert.throws(() => sheetFromGoogle([Array(81).fill("kolom")]), /80 kolom/);
});

test("Sheets membaca tab berdasarkan ID stabil dan membedakan izin dari kegagalan layanan", async (t) => {
  Object.assign(process.env, {
    GOOGLE_SHEETS_CLIENT_ID: "fixture.apps.googleusercontent.com",
    GOOGLE_SHEETS_PICKER_KEY: "fixture-api-key",
    GOOGLE_SHEETS_PROJECT_NUMBER: "111222333",
  });
  const spreadsheetId = "spreadsheet_fixture_01";
  let status = 200;
  let oversize = false;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (url: string, request: RequestInit) => {
      assert.equal(new URL(url).hostname, "sheets.googleapis.com");
      assert.equal(
        new Headers(request.headers).get("Authorization"),
        "Bearer fixture-token",
      );
      assert.equal(request.redirect, "error");
      if (status !== 200) return new Response(null, { status });
      if (oversize) return new Response(" ".repeat(maxFileBytes + 1));
      if (request.method === "POST") {
        assert.ok(
          new URL(url).pathname.endsWith(
            "/" + spreadsheetId + "/values:batchGetByDataFilter",
          ),
        );
        assert.deepEqual(JSON.parse(String(request.body)), {
          dataFilters: [{ gridRange: { sheetId: 0 } }],
          majorDimension: "ROWS",
          valueRenderOption: "FORMATTED_VALUE",
        });
        return Response.json({
          valueRanges: [{ valueRange: { values: sales } }],
        });
      }
      return Response.json({
        properties: { title: "Transaksi November" },
        sheets: [
          { properties: { sheetId: 42, title: "Cadangan", sheetType: "GRID" } },
          {
            properties: {
              sheetId: 9,
              title: "Arsip",
              hidden: true,
              sheetType: "GRID",
            },
          },
          { properties: { sheetId: 12, title: "Grafik", sheetType: "OBJECT" } },
          {
            properties: {
              sheetId: 0,
              title: "Penjualan '26",
              sheetType: "GRID",
            },
          },
        ],
      });
    },
  );
  const file = await openGoogleSpreadsheet("fixture-token", spreadsheetId);
  assert.equal(file.filename, "Transaksi November");
  assert.deepEqual(
    file.tabs.map(({ id }) => id),
    [42, 0],
  );
  assert.equal((await file.read(0)).rows[0].cells[2], "00042");
  await assert.rejects(file.read(9), /Tab sumber tidak tersedia/);
  const calls = fetch.mock.callCount();
  await assert.rejects(
    openGoogleSpreadsheet("fixture-token", "https://example.com/spreadsheet"),
    /Google Picker/,
  );
  assert.equal(fetch.mock.callCount(), calls);
  status = 403;
  await assert.rejects(
    openGoogleSpreadsheet("fixture-token", spreadsheetId),
    SheetsAccessError,
  );
  status = 429;
  await assert.rejects(
    openGoogleSpreadsheet("fixture-token", spreadsheetId),
    /Coba lagi/,
  );
  status = 200;
  oversize = true;
  await assert.rejects(file.read(0), /melebihi 2 MB/);
});
