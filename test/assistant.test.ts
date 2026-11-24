import assert from "node:assert/strict";
import test from "node:test";
import { demoSales } from "../src/demo/fixture.ts";
import { demoSalesReport } from "../src/demo/sales-report.ts";
import {
  assistantAnswer,
  assistantQuestions,
  classifyQuestion,
  mentionedProducts,
} from "../src/domain/assistant.ts";
import { formatNumber, periodSummary, rupiah } from "../src/domain/sales.ts";
import { salesReport, type SalesFact } from "../src/domain/sales-report.ts";

test("pertanyaan bebas memetakan maksud yang dikenal dan permintaan laba", () => {
  for (const [intent, question] of Object.entries(assistantQuestions)) {
    assert.equal(classifyQuestion(question), intent);
  }
  assert.equal(classifyQuestion("  Kapan pesanan paling banyak? "), "peak");
  assert.equal(classifyQuestion("Bandingkan laba kedua produk"), "profit");
  assert.equal(
    classifyQuestion("Apa warna kemasan yang bagus?"),
    "unsupported",
  );
  assert.deepEqual(
    mentionedProducts("Bandingkan Sable Vanilla dan roti", [
      "Roti",
      "Sable",
      "Sable Vanilla",
    ]),
    ["Sable Vanilla", "Roti"],
  );
});

test("jawaban demo memakai omzet dan pesanan Dashboard dengan bukti produk dan tanggal", () => {
  const { report, period } = demoSalesReport({});
  const dashboard = periodSummary(demoSales, period)!;
  assert.deepEqual(report?.active, dashboard.active);
  assert.equal(report?.totals.orders, dashboard.totals.orders);
  assert.equal(report?.totals.revenue, dashboard.totals.revenue);
  assert.equal(
    report?.comparison?.totals.revenue,
    dashboard.comparison?.totals.revenue,
  );
  const growth = assistantAnswer("growth", report);
  assert.match(growth.summary, /Rp2\.735\.000/);
  assert.deepEqual(growth.evidence, {
    kind: "product",
    names: ["Brownies Almond"],
  });
  assert.deepEqual(assistantAnswer("decline", report).evidence, {
    kind: "product",
    names: ["Sable Vanilla"],
  });
  const peak = assistantAnswer("peak", report);
  assert.deepEqual(peak.evidence, { kind: "time", date: "2026-11-16" });
  assert.equal(
    peak.metrics?.[0].value,
    formatNumber(
      demoSales.days.find(({ date }) => date === "2026-11-16")!.orders,
    ),
  );
  const first = report?.products?.find(
    ({ name }) => name === "Brownies Almond",
  );
  const comparison = assistantAnswer("compare", report, [
    "Brownies Almond",
    "Sable Vanilla",
  ]);
  assert.equal(comparison.metrics?.[0].value, rupiah(first!.revenue));
  assert.equal(
    assistantAnswer("compare", report, ["Ladyfinger", "Ladyfinger"]).recovery,
    "products",
  );
});

test("hari puncak tahunan memakai ID unik per tanggal dan menangani jumlah seri", () => {
  const fact = (day: string, order: string): SalesFact => ({
    business_date: "2026-11-" + day,
    order_id: order,
    product: "Roti",
    product_revenue: 100,
    revenue: 100,
    status: "completed",
  });
  const { report } = demoSalesReport({ tampilan: "tahunan", periode: "2026" });
  assert.equal(report?.chart.length, 11);
  assert.equal(report?.calendar.length, 321);
  const input = [fact("03", "A"), fact("03", "A"), fact("04", "B")];
  const range = { start: "2026-11-01", end: "2026-11-04" };
  const year = { kind: "year", year: 2026 } as const;
  const tied = salesReport(input, range, year, range.end, {
    orders: true,
    products: true,
  });
  const answer = assistantAnswer("peak", tied);
  assert.match(answer.title, /2 hari/);
  assert.equal(answer.metrics?.[0].value, "1");
  assert.deepEqual(answer.evidence, { kind: "time", date: "2026-11-03" });
  assert.equal(assistantAnswer("growth", tied).recovery, "period");
  const known = salesReport(
    [...input, { ...fact("04", "C"), order_id: null }],
    range,
    year,
    range.end,
    { orders: true, products: true },
  );
  assert.equal(assistantAnswer("peak", known).recovery, "source");
});

test("kekurangan cakupan, biaya, dan pemetaan menjelaskan data yang dibutuhkan", () => {
  const { report } = demoSalesReport({});
  assert.ok(report);
  assert.match(
    assistantAnswer("profit", report).summary,
    /harga pokok penjualan/,
  );
  assert.equal(assistantAnswer("growth", null).recovery, "period");
  assert.equal(
    assistantAnswer("decline", { ...report, products: null }).recovery,
    "source",
  );
  assert.equal(
    assistantAnswer("compare", { ...report, products: null }).recovery,
    "source",
  );
  assert.equal(
    assistantAnswer("growth", { ...report, productComparison: false }).evidence
      ?.kind,
    "time",
  );
});
