import assert from "node:assert/strict";
import test from "node:test";
import { openGoogleSpreadsheet } from "../src/server/import/google-sheets.ts";

test("tab discovery reads only bounded header ranges and matches tabs by stable sheet ID", async () => {
  const savedFetch = globalThis.fetch;
  const names = [
    "GOOGLE_SHEETS_CLIENT_ID",
    "GOOGLE_SHEETS_PICKER_KEY",
    "GOOGLE_SHEETS_PROJECT_NUMBER",
  ];
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, {
    GOOGLE_SHEETS_CLIENT_ID: "fixture.apps.googleusercontent.com",
    GOOGLE_SHEETS_PICKER_KEY: "fixture-picker-key",
    GOOGLE_SHEETS_PROJECT_NUMBER: "1234",
  });
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.dataFilters.length, 2);
      assert.ok(
        body.dataFilters.every(
          (filter: {
            gridRange: {
              startRowIndex: number;
              endRowIndex: number;
              endColumnIndex: number;
            };
          }) =>
            filter.gridRange.startRowIndex === 0 &&
            filter.gridRange.endRowIndex === 3 &&
            filter.gridRange.endColumnIndex === 80,
        ),
      );
      return Response.json({
        valueRanges: [
          {
            dataFilters: [{ gridRange: { sheetId: 20 } }],
            valueRange: {
              values: [
                ["Order", "Harga"],
                ["private-order-id", 300000],
              ],
            },
          },
          {
            dataFilters: [{ gridRange: { sheetId: 10 } }],
            valueRange: {
              values: [
                ["Produk", "Stok"],
                ["private-product", 40],
              ],
            },
          },
        ],
      });
    }
    return Response.json({
      properties: { title: "Private workbook" },
      sheets: [
        {
          properties: {
            sheetId: 10,
            title: "A",
            sheetType: "GRID",
            gridProperties: { rowCount: 50 },
          },
        },
        {
          properties: {
            sheetId: 20,
            title: "B",
            sheetType: "GRID",
            gridProperties: { rowCount: 800 },
          },
        },
      ],
    });
  };
  try {
    const book = await openGoogleSpreadsheet(
      "fixture-token",
      "fixture-spreadsheet",
    );
    const headers = await book.peekHeaders();
    assert.deepEqual(
      headers.map((tab) => [tab.id, tab.headers, tab.rows]),
      [
        [10, ["Produk", "Stok"], 50],
        [20, ["Order", "Harga"], 800],
      ],
    );
    assert.doesNotMatch(
      JSON.stringify(headers),
      /private-order-id|private-product|300000/,
    );
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
