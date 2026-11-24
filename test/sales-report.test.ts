import assert from "node:assert/strict";
import test from "node:test";
import {
  businessDate,
  salesReport,
  summarizeFacts,
  type SalesFact,
} from "../src/domain/sales-report.ts";
import {
  percentageChange,
  periodChoices,
  periodParams,
  readPeriod,
  type DateRange,
} from "../src/domain/sales.ts";

function sale(
  business_date: string,
  revenue: number,
  order_id: string | null,
  product = "Brownies",
  status: SalesFact["status"] = "completed",
): SalesFact {
  return {
    business_date,
    revenue,
    order_id,
    product,
    product_revenue: revenue,
    status,
  };
}

const nov = { kind: "month", year: 2026, month: 11 } as const;
const dates: DateRange = { start: "2026-10-01", end: "2026-11-17" };
const capabilities = { orders: true, products: true };

test("data usaha menghitung omzet bersih dan ID unik dari 328 pesanan dengan pembanding setara", () => {
  const facts = Array.from({ length: 328 }, (_, id) =>
    sale(
      "2026-11-16",
      id === 0 ? 275_000 : 75_000,
      String(id).padStart(4, "0"),
    ),
  );
  facts.push(sale("2026-11-16", 50_000, "0000", "Roti"));
  facts.push(sale("2026-11-17", -50_000, "0000", "Roti", "refunded"));
  facts.push(sale("2026-10-17", 22_065_000, "5000"));
  facts.push(sale("2026-10-18", 10_000_000, "5001"));
  const report = salesReport(facts, dates, nov, "2026-11-22", capabilities)!;
  assert.equal(report.totals.revenue, 24_800_000);
  assert.equal(report.totals.orders, 328);
  assert.equal(Math.round(report.totals.average!), 75_610);
  assert.equal(report.totals.rows, 330);
  assert.equal(report.comparison?.totals.revenue, 22_065_000);
  assert.equal(report.comparison?.range.end, "2026-10-17");
  assert.equal(report.daily[0].current?.revenue, 0);
  assert.equal(report.daily[16].current?.revenue, -50_000);
  assert.equal(report.chart.length, 17);
  assert.equal(
    report.products?.find(({ name }) => name === "Roti")?.revenue,
    0,
  );
  assert.equal(summarizeFacts(facts, report.active, true).orders, 328);
});

test("cakupan parsial, data kosong, pembanding nol dan tanggal masa depan memiliki hasil berbeda", () => {
  const cov = { start: "2026-10-01", end: "2026-12-31" };
  const results = salesReport(
    [sale("2026-11-23", 5_000, "new")],
    cov,
    nov,
    "2026-11-22",
    capabilities,
  )!;
  assert.equal(results.active.end, "2026-11-22");
  assert.equal(results.totals.revenue, 0);
  assert.equal(results.totals.orders, 0);
  assert.equal(results.totals.average, null);
  assert.equal(results.comparison?.totals.revenue, 0);
  assert.equal(
    percentageChange(
      results.totals.revenue,
      results.comparison?.totals.revenue ?? null,
    ),
    null,
  );
  const historical = salesReport([], dates, nov, "2026-12-02", capabilities)!;
  assert.equal(historical.incomplete, true);
  assert.equal(historical.comparison, null);
  assert.equal(salesReport([], dates, nov, "2026-10-25", capabilities), null);
  assert.equal(
    businessDate("Asia/Jakarta", new Date("2026-11-17T18:00:00Z")),
    "2026-11-18",
  );
});

test("rincian periode lengkap menyertakan seluruh tanggal pembanding yang lebih panjang", () => {
  const coverage = { start: "2024-01-01", end: "2024-02-29" };
  const facts = [
    sale("2024-01-31", 1_000, "0008"),
    sale("2024-02-29", 2_000, "0009"),
  ];
  const report = salesReport(
    facts,
    coverage,
    { kind: "month", year: 2024, month: 2 },
    "2024-03-01",
    capabilities,
  )!;
  assert.equal(report.daily.length, 31);
  assert.equal(report.daily[30].prior?.revenue, 1_000);
  assert.equal(report.daily[30].current, null);
  assert.equal(report.comparison?.totals.revenue, 1_000);
});

test("pesanan tanpa ID dan total tanpa alokasi produk tetap menyediakan omzet", () => {
  const entries = [
    sale("2026-11-17", 45_000, null),
    { ...sale("2026-11-16", 30_000, "01"), product_revenue: null },
  ];
  const report = salesReport(entries, dates, nov, "2026-11-22", capabilities)!;
  assert.equal(report.totals.revenue, 75_000);
  assert.equal(report.totals.orders, null);
  assert.equal(report.totals.rows, 2);
  assert.equal(report.products, null);
  assert.equal(report.daily[15].current?.orders, 1);
});

test("pilihan periode hanya mencakup kalender sumber dan tetap terbaca dari URL", () => {
  const year = readPeriod(
    { tampilan: "tahunan", periode: "1998" },
    "2026-11-22",
  );
  assert.equal(periodParams(year).toString(), "tampilan=tahunan&periode=1998");
  const options = periodChoices(nov, {
    start: "2026-10-15",
    end: "2026-11-17",
  });
  assert.deepEqual(
    options.map((period) => periodParams(period).get("periode")),
    ["2026-11", "2026-10"],
  );
});
