import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFacts, type SalesFact } from "../src/domain/sales-report.ts";
import { targetDate, targetInput } from "../src/domain/target-input.ts";
import {
  activeTarget,
  calculateTarget,
  type Target,
} from "../src/domain/targets.ts";

const target: Target = {
  id: "pesanan",
  kind: "orders",
  label: "Jumlah pesanan",
  value: 400,
  range: { start: "2026-11-01", end: "2026-11-30" },
};
const today = "2026-11-17";
const coverage = { start: "2026-11-01", end: today };
const facts: SalesFact[] = Array.from({ length: 328 }, (_, id) => ({
  business_date: "2026-11-16",
  status: "completed",
  order_id: String(id).padStart(4, "0"),
  product: null,
  product_revenue: null,
  revenue: 75_000,
}));
facts.push({ ...facts[0], revenue: 200_000 });
const ledger = {
  coverage,
  totals: (range: Target["range"]) => summarizeFacts(facts, range, true),
};

test("Target usaha berbagi fakta penjualan dan menggunakan sisa hari kalender atau hari jual", () => {
  const progress = calculateTarget(target, ledger, today);
  assert.equal(progress.value, 328);
  assert.equal(progress.remaining, 72);
  assert.equal(progress.daysLeft, 13);
  assert.equal(progress.perDay, 6);
  const manual = calculateTarget({ ...target, sellingDays: 10 }, ledger, today);
  assert.equal(manual.sellingDaysUsed, 10);
  assert.equal(manual.perDay, 8);
  assert.equal(
    calculateTarget({ ...target, sellingDays: 0 }, ledger, today).perDay,
    null,
  );
  assert.equal(
    calculateTarget({ ...target, sellingDays: 20 }, ledger, today)
      .sellingDaysUsed,
    13,
  );
  const revenue = calculateTarget(
    { ...target, kind: "revenue", value: 30_000_000 },
    ledger,
    today,
  );
  assert.equal(revenue.value, 24_800_000);
  assert.equal(revenue.perDay, 400_000);
});

test("Cakupan parsial menyimpan nilai sementara dan menahan saran maupun status pencapaian", () => {
  const lateStart = calculateTarget(
    target,
    { ...ledger, coverage: { ...coverage, start: "2026-11-16" } },
    today,
  );
  assert.equal(lateStart.value, 328);
  assert.equal(lateStart.ratio, null);
  assert.equal(lateStart.perDay, null);
  assert.equal(lateStart.status, "incomplete");
  assert.equal(lateStart.observed?.start, "2026-11-16");
  const lostHistory = calculateTarget(target, ledger, "2026-12-01");
  assert.equal(lostHistory.status, "incomplete");
  assert.equal(lostHistory.observed?.end, today);
  assert.equal(
    calculateTarget(target, null, today).unavailable,
    "Hubungkan data penjualan",
  );
});

test("Riwayat menilai target selesai hanya jika ada cakupan penuh dan aktif mencakup tanggal akhir", () => {
  const full = { ...ledger, coverage: target.range };
  const achieved = calculateTarget(
    { ...target, value: 300 },
    full,
    "2026-12-01",
  );
  assert.equal(achieved.status, "achieved");
  assert.ok(achieved.ratio! > 1);
  assert.equal(achieved.perDay, null);
  assert.equal(calculateTarget(target, full, "2026-12-01").status, "missed");
  assert.equal(calculateTarget(target, full, "2026-10-31").status, "upcoming");
  assert.equal(activeTarget(target, "2026-11-30"), true);
  assert.equal(activeTarget(target, "2026-12-01"), false);
});

test("Laba dan pesanan tanpa identitas menyebut kebutuhan datanya", () => {
  const unknownOrders = {
    ...ledger,
    totals: (range: Target["range"]) => summarizeFacts(facts, range, false),
  };
  assert.equal(
    calculateTarget(target, unknownOrders, today).unavailable,
    "Perlu ID pesanan selesai",
  );
  assert.equal(
    calculateTarget({ ...target, kind: "gross-profit" }, ledger, today)
      .unavailable,
    "Perlu data HPP",
  );
  assert.equal(
    calculateTarget({ ...target, kind: "net-profit" }, ledger, today)
      .unavailable,
    "Perlu data biaya usaha",
  );
});

test("Form menerima empat jenis, Rupiah bulat, tanggal ketik, dan menolak rentang yang tidak valid", () => {
  const form = new FormData();
  form.set("value", "30.000.000");
  form.set("start", "01112026");
  form.set("end", "30/11/2026");
  form.set("sellingDays", "0");
  for (const kind of ["revenue", "orders", "gross-profit", "net-profit"]) {
    form.set("kind", kind);
    const result = targetInput(form);
    assert.ok("target" in result);
    assert.deepEqual(result.target.range, target.range);
    assert.equal(result.target.kind, kind);
    assert.equal(result.target.sellingDays, 0);
  }
  form.set("end", "30/10/2026");
  assert.equal("field" in targetInput(form), true);
  assert.equal(targetDate("29/02/2026"), null);
  assert.equal(targetDate("29/02/2028"), "2028-02-29");
});
