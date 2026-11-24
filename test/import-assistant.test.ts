import assert from "node:assert/strict";
import test from "node:test";
import {
  answerReading,
  rememberedReading,
  recommendSalesTabs,
  safeStructureLabel,
  structureProfile,
  understandSales,
} from "../src/server/import/assistant.ts";
import { readCsv } from "../src/server/import/csv.ts";
import { normalizeSales, verifyMapping } from "../src/domain/import-sales.ts";

const csv = (value: string) => readCsv(Buffer.from(value));
const custom = () =>
  csv(
    "Kapan closing,Kode belanja,Barangnya,Fase,Banyak pcs,Net diterima,Kontak\n2026-11-01,PERSONAL-ID-A,Kemeja rahasia,Selesai,2,300000,pelanggan@example.com\n2026-11-01,PERSONAL-ID-A,Celana rahasia,Selesai,1,200000,081234567890",
  );
function model(overrides: Record<string, unknown> = {}) {
  return {
    date: { index: 0, confidence: 1 },
    order: { index: 1, confidence: 1 },
    product: { index: 2, confidence: 1 },
    status: { index: 3, confidence: 1 },
    quantity: { index: 4, confidence: 1 },
    revenue: { index: 5, confidence: 1 },
    basis: "line",
    basisConfidence: 1,
    questions: [],
    ...overrides,
  };
}
let sequence = 0;
const context = () => ({
  business: "fixture-" + ++sequence,
  timezone: "Asia/Jakarta",
  source: "private-document-id",
  privateNames: ["Avara Private"],
});
async function fixture<T>(
  output: unknown,
  run: (requests: Record<string, unknown>[]) => Promise<T>,
  status = 200,
) {
  const original = globalThis.fetch;
  const names = [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_IMPORT_ENABLED",
    "SUPABASE_SECRET_KEY",
  ];
  const previous = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  Object.assign(process.env, {
    GEMINI_API_KEY: "fixture-key",
    GEMINI_MODEL: "gemini-3.1-flash-lite",
    GEMINI_IMPORT_ENABLED: "true",
    SUPABASE_SECRET_KEY: "fixture-signing-secret-only",
  });
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const data = typeof output === "function" ? output(body) : output;
    return new Response(
      JSON.stringify(
        status === 200
          ? {
              candidates: [
                {
                  finishReason: "STOP",
                  content: { parts: [{ text: JSON.stringify(data) }] },
                },
              ],
            }
          : {},
      ),
      { status, headers: { "content-type": "application/json" } },
    );
  };
  try {
    return await run(requests);
  } finally {
    globalThis.fetch = original;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("Gemini understands free headings while receiving no raw cells, financial values, file identity or customer details", async () => {
  await fixture(model(), async (requests) => {
    const sheet = custom();
    const reading = await understandSales(sheet, context());
    assert.equal(reading.reading.provider, "gemini");
    assert.equal(reading.guidance.canPreview, true);
    assert.equal(reading.reading.question, undefined);
    assert.equal(
      normalizeSales(sheet, reading.mapping, "Asia/Jakarta").sales,
      500000,
    );
    const payload = JSON.stringify(requests[0].contents);
    assert.match(payload, /Kapan closing/);
    assert.doesNotMatch(
      payload,
      /300000|200000|PERSONAL-ID-A|pelanggan@example|081234567890|rahasia|private-document-id|fixture-key/,
    );
  });
  assert.doesNotMatch(
    JSON.stringify(structureProfile(custom())),
    /pelanggan@example|300000/,
  );
  assert.doesNotMatch(
    safeStructureLabel(
      "Avara Private pelanggan@example.com 081234567890 sb_secret_abcdefghij",
      ["Avara Private"],
    ),
    /Avara Private|pelanggan@example|081234567890|sb_secret_/,
  );
});

test("only the uncertain meaning is asked, using contextual Gemini wording and a signed conversation", async () => {
  await fixture(
    model({
      revenue: { index: 5, confidence: 0.4 },
      questions: [
        {
          field: "revenue",
          text: "Kolom Net diterima ini nilai barang setelah diskon atau uang yang masuk rekening?",
        },
      ],
    }),
    async () => {
      const sheet = custom();
      const ctx = context();
      const first = await understandSales(sheet, ctx);
      assert.equal(first.reading.question?.field, "revenue");
      assert.match(first.reading.question?.text ?? "", /Net diterima/);
      assert.ok(first.reading.ticket);
      await assert.rejects(
        () =>
          answerReading(
            sheet,
            { ...ctx, business: "different-owner" },
            first.reading.ticket!,
            { choice: 0 },
          ),
        /Sumber berubah/,
      );
      await assert.rejects(
        () =>
          answerReading(sheet, ctx, first.reading.ticket! + "x", { choice: 0 }),
        /tidak valid/,
      );
      const next = await answerReading(sheet, ctx, first.reading.ticket!, {
        choice: 0,
      });
      assert.equal(next.reading.question, undefined);
      assert.equal(next.guidance.canPreview, true);
      assert.equal(next.mapping.revenue, 5);
    },
  );
});

test("natural language replies select a validated choice without inventing new mappings", async () => {
  await fixture(
    (body: {
      generationConfig: {
        responseJsonSchema: { properties: Record<string, unknown> };
      };
    }) =>
      body.generationConfig.responseJsonSchema.properties.index
        ? { index: 0 }
        : model({ revenue: { index: 5, confidence: 0.4 } }),
    async (requests) => {
      const sheet = custom();
      const ctx = context();
      const first = await understandSales(sheet, ctx);
      const next = await answerReading(sheet, ctx, first.reading.ticket!, {
        text: "Pakai kolom Net diterima, itu nilai barang setelah diskon.",
      });
      assert.equal(next.guidance.canPreview, true);
      assert.equal(requests.length, 2);
    },
  );
});

test("ambiguous repeated totals and unknown statuses are clarified rather than silently double counted", async () => {
  await fixture(model(), async () => {
    const sheet = custom();
    sheet.rows[1].cells[5] = "300000";
    const ctx = context();
    const first = await understandSales(sheet, ctx);
    assert.equal(first.reading.question?.field, "basis");
    const next = await answerReading(sheet, ctx, first.reading.ticket!, {
      choice: 1,
    });
    assert.equal(next.mapping.basis, "order");
    assert.equal(
      normalizeSales(sheet, next.mapping, "Asia/Jakarta").sales,
      300000,
    );
  });
  await fixture(model(), async () => {
    const sheet = custom();
    for (const row of sheet.rows) row.cells[3] = "Final";
    const ctx = context();
    const first = await understandSales(sheet, ctx);
    assert.equal(first.reading.question?.field, "statusValue");
    const next = await answerReading(sheet, ctx, first.reading.ticket!, {
      choice: 0,
    });
    assert.equal(next.guidance.canPreview, true);
    assert.equal(next.mapping.statusValues?.final, "completed");
    const stored = verifyMapping(next.mapping, sheet.headers.length);
    assert.equal(
      rememberedReading(sheet, stored, ctx).reading.provider,
      "saved",
    );
    assert.equal(
      rememberedReading(sheet, stored, ctx).reading.question,
      undefined,
    );
  });
});

test("quota and malformed model output have a truthful fallback; duplicates remain blocked", async () => {
  const known = csv(
    "Tanggal,ID Pesanan,Produk,Status,Nilai Penjualan\n2026-11-01,1,Kaos,Selesai,100000\n2026-11-01,1,Rok,Selesai,200000",
  );
  await fixture(
    {},
    async () => {
      const result = await understandSales(known, context());
      assert.equal(result.reading.provider, "local");
      assert.match(result.reading.notice ?? "", /batas/);
      assert.equal(result.guidance.canPreview, true);
    },
    429,
  );
  await fixture(model({ revenue: { index: 999, confidence: 1 } }), async () => {
    const result = await understandSales(custom(), context());
    assert.equal(result.reading.provider, "local");
    assert.ok(result.reading.question);
  });
  await fixture(model(), async () => {
    const sheet = custom();
    sheet.rows.push({ ...sheet.rows[0], number: 8 });
    const result = await understandSales(sheet, context());
    assert.equal(result.guidance.canPreview, false);
    assert.ok(
      normalizeSales(sheet, result.mapping, "Asia/Jakarta").issues.length,
    );
  });
});

test("tab selection uses column meaning and excludes summaries or oversized sources", async () => {
  await fixture(
    {
      tabs: [
        { id: 1, kind: "summary", confidence: 1 },
        { id: 2, kind: "sales_items", confidence: 0.99 },
        { id: 3, kind: "sales_items", confidence: 0.99 },
      ],
    },
    async () => {
      const result = await recommendSalesTabs(
        [
          { id: 1, name: "Sheet A", headers: ["Bulan", "Omzet"], rows: 60 },
          {
            id: 2,
            name: "Sheet B",
            headers: ["Waktu", "Nomor order", "Barang", "Pendapatan"],
            rows: 800,
          },
          {
            id: 3,
            name: "Sheet C",
            headers: ["Tanggal", "ID order", "Produk", "Nilai"],
            rows: 40000,
          },
        ],
        context().business,
      );
      assert.deepEqual(result.suggested, [2]);
      assert.equal(result.automatic, 2);
    },
  );
});

test("public production does not send business structure through an unpaid Gemini configuration", async () => {
  const previousMode = process.env.NODE_ENV;
  const previousTier = process.env.GEMINI_SERVICE_TIER;
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.GEMINI_SERVICE_TIER = "unpaid";
  try {
    await fixture(model(), async (requests) => {
      const result = await understandSales(custom(), context());
      assert.equal(requests.length, 0);
      assert.equal(result.reading.provider, "local");
      assert.match(result.reading.notice ?? "", /belum diaktifkan/);
    });
  } finally {
    if (previousMode === undefined)
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else Object.assign(process.env, { NODE_ENV: previousMode });
    if (previousTier === undefined) delete process.env.GEMINI_SERVICE_TIER;
    else process.env.GEMINI_SERVICE_TIER = previousTier;
  }
});

test("custom status maps cannot accidentally accept prototype property names", async () => {
  const sheet = csv(
    "Tanggal,Nilai Penjualan,Status\n2026-11-01,100000,constructor",
  );
  const mapping = verifyMapping(
    {
      date: 0,
      revenue: 1,
      order: -1,
      product: -1,
      status: 2,
      quantity: -1,
      basis: "line",
      dateFormat: "iso",
      moneyFormat: "id",
      validOnly: false,
      multiItem: true,
      statusValues: { final: "completed" },
    },
    3,
  );
  const result = normalizeSales(sheet, mapping, "Asia/Jakarta");
  assert.equal(result.facts.length, 0);
  assert.equal(result.issues.length, 1);
});
