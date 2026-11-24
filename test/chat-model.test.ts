import assert from "node:assert/strict";
import test from "node:test";
import {
  chatPrivacy,
  groundedChatInput,
  renderGroundedChat,
} from "../src/domain/chat-grounding.ts";
import { analyzeChat } from "../src/domain/chat-analysis.ts";
import { dateSelection, interpretChat } from "../src/domain/chat-context.ts";
import { demoSalesReport } from "../src/demo/sales-report.ts";
import { chatModelStatus, composeChat } from "../src/server/chat-model.ts";
import { createChatLimiter } from "../src/server/chat-rate-limit.ts";

const { period, report } = demoSalesReport({});
const answer = analyzeChat({
  question: "Bagaimana penjualan?",
  selection: { period },
  report,
  source: "file-privat.csv",
  sourceHref: "/demo/sumber-data",
  evidenceHref: () => "/demo/harian",
});
const input = {
  question: "Apa kabar Toko Rahasia? buyer@example.com",
  answer,
  catalog: ["Brownies Almond"],
  privateNames: ["Toko Rahasia"],
  memory: [{ question: "Brownies Almond gimana?" }],
  demo: false,
  signal: new AbortController().signal,
};
const grounded = groundedChatInput(input);

test("narasi panjang yang valid tidak ditolak oleh pemotongan sanitasi 700 karakter", () => {
  const prose =
    "Coba tinjau penawaran produk dan cocokkan dengan kebutuhan pelanggan. ".repeat(
      12,
    ) + "{{F1}}";
  assert.ok(prose.length > 700 && prose.length < 1600);
  assert.ok(renderGroundedChat({ paragraphs: [prose] }, grounded));
});

test("provider hanya menerima alias, konteks terbatas dan fakta ringkasan", () => {
  const payload = JSON.stringify(grounded.payload);
  assert.doesNotMatch(
    payload,
    /Toko Rahasia|Brownies Almond|buyer@example.com|file-privat|sourceHref/,
  );
  assert.match(payload, /ITEM_/);
  const privacy = chatPrivacy(["Brownies Almond", "Roti (Coklat)"]);
  assert.doesNotMatch(
    privacy.scrub("brownies almond dan Roti (Coklat)"),
    /brownies|roti/i,
  );
  assert.equal(
    privacy.scrub("tanggal,nama,total\n2026-01-01,A,300\n2026-01-02,B,400"),
    "[data mentah dihapus; ajukan pertanyaan analisis]",
  );
  assert.doesNotMatch(
    privacy.scrub(
      "rekening 1234567890, telepon +6281234567890, api_key=AIzaSECRETKEYVALUE123456789",
    ),
    /1234567890|SECRETKEY/,
  );
});

test("narasi memakai token label dan nilai utuh, menolak angka baru serta keluaran berbahaya", () => {
  assert.equal(
    renderGroundedChat(
      {
        paragraphs: [
          "Bisa, mari kita cek. {{F1}}",
          "Kita bisa meninjau catatan promosi sebelum mengambil langkah.",
        ],
      },
      grounded,
    ),
    `Bisa, mari kita cek. ${answer.metrics[0].label}: ${answer.metrics[0].value}\n\nKita bisa meninjau catatan promosi sebelum mengambil langkah.`,
  );
  for (const paragraph of [
    "Omzet Rp999.999 {{F1}}",
    "Laba sepuluh juta {{F1}}",
    "Ada dua pesanan saja. {{F1}}",
    "Penjualan bertambah tiga persen. {{F1}}",
    "{{F99}}",
    "ITEM_999 {{F1}}",
    "<script>alert()</script>{{F1}}",
    "https://evil.test {{F1}}",
    "buyer@example.com {{F1}}",
    "Penjualan naik tanpa bukti.",
  ])
    assert.equal(
      renderGroundedChat({ paragraphs: [paragraph] }, grounded),
      null,
      paragraph,
    );
  assert.equal(
    renderGroundedChat({ paragraphs: ["{{F1}}"], amount: 99 }, grounded),
    null,
  );
});

test("sapaan, saran, rangkuman dan rentang harian memakai domain yang sama", () => {
  assert.equal(interpretChat("halo", undefined, []).intent, "greeting");
  assert.equal(interpretChat("makasih ya", undefined, []).intent, "thanks");
  assert.equal(
    interpretChat("gimana usahaku?", undefined, []).intent,
    "overview",
  );
  assert.equal(
    interpretChat("gimana biar omzet meningkat?", undefined, []).intent,
    "advice",
  );
  assert.equal(interpretChat("tampilkan lima produk", undefined, []).limit, 5);
  assert.deepEqual(
    dateSelection("penjualan 7 hari terakhir", { period }, "2026-11-17").range,
    { start: "2026-11-11", end: "2026-11-17" },
  );
  assert.deepEqual(
    dateSelection("penjualan kemarin", { period }, "2026-11-17").range,
    { start: "2026-11-16", end: "2026-11-16" },
  );
  const advice = analyzeChat({
    question: "Apa prioritas saya?",
    selection: { period },
    report,
    sourceHref: "/demo/sumber-data",
    evidenceHref: () => "/demo/harian",
  });
  assert.equal(advice.context.intent, "advice");
  assert.ok(advice.metrics.some((metric) => metric.value === "Rp24.800.000"));
  assert.match(advice.advice!, /stok, harga, dan promosi/);
});

test("Gemini merangkai fakta dalam satu permintaan, menangani kuota, safety, output salah dan pembatalan", async (t) => {
  const keys = [
    "GEMINI_API_KEY",
    "GEMINI_SERVICE_TIER",
    "GEMINI_DEMO_ENABLED",
    "GEMINI_MODEL",
  ];
  const saved = keys.map((key) => process.env[key]);
  t.after(() =>
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    }),
  );
  process.env.GEMINI_API_KEY = "fixture-key";
  process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";
  process.env.GEMINI_SERVICE_TIER = "unpaid";
  let calls = 0;
  let mode = "ok";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      calls++;
      assert.doesNotMatch(
        String(options.body),
        /file-privat|buyer@example.com|Toko Rahasia|Brownies Almond/,
      );
      assert.equal(
        (options.headers as Record<string, string>)["x-goog-api-key"],
        "fixture-key",
      );
      if (mode === "quota") return new Response(null, { status: 429 });
      if (mode === "network") throw new TypeError("network");
      return Response.json({
        candidates: [
          {
            finishReason: mode === "safety" ? "SAFETY" : "STOP",
            content: {
              parts: [
                { thought: true, text: "internal" },
                {
                  text: JSON.stringify({
                    paragraphs: [
                      mode === "bad"
                        ? "Omzet Rp999999"
                        : "Mari lihat hasilnya. {{F1}}",
                    ],
                  }),
                },
              ],
            },
          },
        ],
      });
    },
  );
  assert.equal(chatModelStatus(), "billing");
  assert.equal((await composeChat(input)).provider, "basic");
  assert.equal(calls, 0);
  process.env.GEMINI_SERVICE_TIER = "paid";
  assert.equal(chatModelStatus(), "ready");
  const response = await composeChat(input);
  assert.equal(response.provider, "gemini");
  assert.match(response.summary!, /Rp24.800.000/);
  assert.equal(calls, 1);
  for (mode of ["quota", "safety", "network", "bad"]) {
    const count: number = calls;
    const fallback = await composeChat(input);
    assert.equal(fallback.provider, "limited");
    assert.equal(fallback.summary, undefined);
    assert.equal(calls, count + 1, "no automatic expensive retries");
  }
  const aborter = new AbortController();
  aborter.abort();
  const count: number = calls;
  await composeChat({ ...input, signal: aborter.signal });
  assert.equal(calls, count);
  assert.equal(chatModelStatus(true), "demo-disabled");
  process.env.GEMINI_DEMO_ENABLED = "true";
  assert.equal(chatModelStatus(true), "ready");
  delete process.env.GEMINI_API_KEY;
  assert.equal(chatModelStatus(), "missing");
});

test("batas provider terpisah per usaha dan memiliki batas global serta jendela waktu", () => {
  const allow = createChatLimiter();
  for (let i = 0; i < 12; i++) assert.equal(allow("a", false, 1000), true);
  assert.equal(allow("a", false, 1000), false);
  assert.equal(allow("b", false, 1000), true);
  for (let i = 0; i < 6; i++) assert.equal(allow("demo", true, 1000), true);
  assert.equal(allow("demo", true, 1000), false);
  assert.equal(allow("a", false, 61_001), true);
  const globalLimit = createChatLimiter();
  for (let i = 0; i < 60; i++)
    assert.equal(globalLimit(String(i), false, 1000), true);
  assert.equal(globalLimit("new", false, 1000), false);
});

test("fokus produk dapat diikuti, diganti dengan daftar dan dirujuk hingga urutan kesepuluh", () => {
  const ask = (question: string, previous?: typeof answer.context) =>
    analyzeChat({
      question,
      previous,
      selection: { period },
      report,
      sourceHref: "/demo/sumber-data",
      evidenceHref: () => "/demo/produk",
    });
  const top = ask("Tampilkan lima produk");
  const selected = ask("Yang kedua kenapa turun?", top.context);
  assert.equal(ask("Yang kedua", top.context).title, top.context.products[1]);
  assert.ok(selected.context.product);
  const followup = ask("Penjualannya gimana?", selected.context);
  assert.equal(followup.title, selected.context.product);
  assert.equal(
    ask("Tampilkan tiga produk", selected.context).context.products.length,
    3,
  );
  assert.equal(
    ask("Produk apa yang menurun?", selected.context).context.intent,
    "decline",
  );
  const growth = ask("Apa pendorong kenaikan penjualan?");
  assert.ok(growth.context.product);
  assert.equal(
    ask("Kenapa produk itu?", growth.context).context.product,
    growth.context.product,
  );
  const fifth = interpretChat(
    "Yang kelima",
    { ...top.context, products: ["A", "B", "C", "D", "E"] },
    [],
  );
  assert.equal(fifth.product, "E");
  assert.equal(
    ask("Yang kesepuluh kenapa?", top.context).title,
    "Produk mana yang Anda maksud?",
  );
});

test("ringkasan saran menyertakan hasil laba dan kebutuhan target yang sudah dihitung", () => {
  const overview = analyzeChat({
    question: "Apa prioritas saya?",
    selection: { period },
    report,
    costs: [
      {
        starts_on: report!.active.start,
        ends_on: report!.active.end,
        cost_of_goods: 1_000_000,
        operating_cost: 800_000,
      },
    ],
    sourceHref: "/demo/sumber-data",
    evidenceHref: () => "/demo/harian",
  });
  assert.ok(
    overview.metrics.some(
      ({ label, value }) =>
        label.includes("Laba bersih") && value === "Rp23.000.000",
    ),
  );
  assert.ok(overview.metrics.length <= 12);
});

test("concept and product comparisons retain their topic on simpler followups", () => {
  const question = "Apa beda omzet dan laba?";
  const first = analyzeChat({
    question,
    selection: { period },
    report: null,
    sourceHref: "/demo/sumber-data",
    evidenceHref: () => "/demo/harian",
  });
  assert.equal(first.context.intent, "concept");
  const second = analyzeChat({
    question: "Jelaskan lebih sederhana",
    previous: first.context,
    selection: { period },
    report: null,
    sourceHref: "/demo/sumber-data",
    evidenceHref: () => "/demo/harian",
  });
  assert.ok(second.summary.length < first.summary.length);
  assert.equal(interpretChat("Halo Ramu!", undefined, []).intent, "greeting");
  const comparison = {
    ...answer.context,
    intent: "compare" as const,
    products: ["A", "B"],
  };
  assert.deepEqual(
    interpretChat("Jelaskan yang tadi lebih simpel", comparison, ["A", "B"])
      .pair,
    ["A", "B"],
  );
});
