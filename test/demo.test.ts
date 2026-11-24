import assert from "node:assert/strict";
import test from "node:test";
import { demoAsOf, demoSales, demoTargets } from "../src/demo/fixture.ts";
import {
  percentageChange,
  periodParams,
  periodSummary,
  readPeriod,
  rupiah,
  salesSeries,
  type SalesDataset,
} from "../src/domain/sales.ts";
import { targetProgress } from "../src/domain/targets.ts";

test("demo November agrees with the reference figures", () => {
  const period = readPeriod({}, demoAsOf);
  const result = periodSummary(demoSales, period);
  assert.ok(result);
  assert.deepEqual(result.active, { start: "2026-11-01", end: "2026-11-17" });
  assert.equal(result.totals.revenue, 24_800_000);
  assert.equal(result.totals.orders, 328);
  assert.equal(Math.round(result.totals.average ?? NaN), 75_610);
  assert.equal(rupiah(result.totals.average ?? NaN), "Rp75.610");
  assert.equal(result.comparison?.totals.revenue, 22_065_000);
  assert.deepEqual(result.comparison?.range, {
    start: "2026-10-01",
    end: "2026-10-17",
  });

  const points = salesSeries(demoSales, period, result);
  assert.equal(points.length, 17);
  assert.equal(
    points.reduce((sum, point) => sum + point.value, 0),
    result.totals.revenue,
  );
  assert.ok(points[15].value > points[16].value);
});

test("demo targets share the dashboard totals and remaining calendar days", () => {
  const [revenue, grossProfit, orders] = demoTargets.map((target) =>
    targetProgress(target, demoSales, demoAsOf),
  );
  assert.equal(revenue.value, 24_800_000);
  assert.equal(revenue.remaining, 5_200_000);
  assert.equal(revenue.perDay, 400_000);
  assert.equal(revenue.daysLeft, 13);
  assert.equal(orders.remaining, 72);
  assert.equal(orders.perDay, 6);
  assert.equal(grossProfit.value, null);
  assert.equal(grossProfit.unavailable, "Perlu data HPP");
});

test("yearly chart compares like dates and preserves the period in links", () => {
  const period = readPeriod({ tampilan: "tahunan", periode: "2026" }, demoAsOf);
  assert.equal(
    periodParams(period).toString(),
    "tampilan=tahunan&periode=2026",
  );
  const result = periodSummary(demoSales, period);
  assert.ok(result);
  assert.deepEqual(result.comparison?.range, {
    start: "2025-01-01",
    end: "2025-11-17",
  });
  const points = salesSeries(demoSales, period, result);
  assert.equal(points.length, 11);
  assert.equal(
    points.reduce((sum, point) => sum + point.value, 0),
    result.totals.revenue,
  );
});

test("partial leap-year comparison clamps the day to the prior month", () => {
  const dataset: SalesDataset = {
    coverage: { start: "2023-01-01", end: "2024-02-29" },
    days: [],
  };
  const result = periodSummary(dataset, { kind: "year", year: 2024 });
  assert.equal(result?.comparison?.range.end, "2023-02-28");
  assert.equal(result?.totals.average, null);
  assert.equal(percentageChange(400, 0), null);
});

test("missing comparisons and missing periods stay distinguishable from confirmed zeroes", () => {
  assert.equal(
    periodSummary(demoSales, { kind: "month", year: 2027, month: 1 }),
    null,
  );
  const first = periodSummary(demoSales, {
    kind: "month",
    year: 2025,
    month: 1,
  });
  assert.equal(first?.comparison, null);
  assert.equal(
    salesSeries(demoSales, { kind: "month", year: 2025, month: 1 }, first!)[6]
      .value,
    0,
  );
});
