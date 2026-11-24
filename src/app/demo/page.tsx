import { DashboardInsights } from "@/components/dashboard-insights";
import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { CalculationDialog } from "@/components/calculation-dialog";
import { PeriodControls } from "@/components/period-controls";
import { SalesChart } from "@/components/sales-chart";
import { DashboardTargets } from "@/components/target-cards";
import { demoAsOf, demoBusiness, demoSales, demoSource } from "@/demo/fixture";
import { demoSalesReport } from "@/demo/sales-report";
import {
  changeText,
  formatFullDate,
  formatNumber,
  formatRange,
  intersect,
  millions,
  percentageChange,
  periodParams,
  rangeForPeriod,
  rupiah,
  type SearchParams,
} from "@/domain/sales";
import { activeTarget, targetProgress } from "@/domain/targets";
import { readDemoTargets } from "@/server/demo-targets";

export const metadata: Metadata = { title: "Dashboard demo" };

function Change({ value, badge = false }: { value: number; badge?: boolean }) {
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return (
    <span className={`metric-change ${tone}${badge ? " badge" : ""}`}>
      {badge
        ? changeText(value)
        : changeText(value).replace("Naik ", "").replace("Turun ", "")}
    </span>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { period, report: summary } = demoSalesReport(await searchParams);
  const query = periodParams(period);
  const targets = (await readDemoTargets())
    .filter(
      (target) =>
        activeTarget(target, demoAsOf) &&
        intersect(target.range, rangeForPeriod(period)),
    )
    .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="mobile-business">{demoBusiness}</p>
          <p>Data contoh</p>
        </div>
        <Link className="button outline" href={`/demo/sumber-data?${query}`}>
          Hubungkan data saya
        </Link>
      </header>

      <section className="period-row" aria-label="Periode Dashboard">
        <div>
          <b>Periode Dashboard</b>
          <p>
            {summary
              ? formatRange(summary.active, true)
              : "Di luar cakupan data contoh"}
          </p>
        </div>
        <PeriodControls period={period} coverage={demoSales.coverage} />
      </section>

      {summary ? (
        (() => {
          const { active, totals, comparison } = summary;
          const change = percentageChange(
            totals.revenue,
            comparison?.totals.revenue ?? null,
          );
          const orderChange = percentageChange(
            totals.orders,
            comparison?.totals.orders ?? null,
          );
          const averageChange = percentageChange(
            totals.average,
            comparison?.totals.average ?? null,
          );
          const points = summary.chart;
          const peak = points.reduce((best, point) =>
            point.value > best.value ? point : best,
          );
          return (
            <section className="sales-panel" aria-labelledby="sales-title">
              <p className="sales-eyebrow">Kondisi usaha</p>
              <div className="sales-actions">
                <CalculationDialog />
                <Link className="chart-link" href={`/demo/harian?${query}`}>
                  {period.kind === "year"
                    ? "Lihat rincian bulanan"
                    : "Lihat data harian"}{" "}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="revenue-row">
                <h2 id="sales-title">Penjualan</h2>
                {change !== null && <Change value={change} badge />}
              </div>
              <p className="revenue-total">{rupiah(totals.revenue)}</p>
              <p className="sales-context">
                {comparison
                  ? `Sebelumnya Rp${millions(comparison.totals.revenue).replace(" jt", " juta")}`
                  : "Periode pembanding belum tersedia"}
              </p>
              <p className="sales-stats">
                <span>
                  {totals.orders === null
                    ? "Pesanan belum tersedia"
                    : formatNumber(totals.orders) + " pesanan"}{" "}
                  {orderChange !== null && <Change value={orderChange} />}
                </span>
                <span>
                  Rata-rata{" "}
                  {totals.average === null
                    ? "belum tersedia"
                    : `${rupiah(totals.average)} per pesanan`}{" "}
                  {averageChange !== null && <Change value={averageChange} />}
                </span>
              </p>
              <div className="sales-figure">
                {peak.value > 0 && (
                  <p className="peak-label">
                    Penjualan tertinggi · {peak.label}
                  </p>
                )}
                <SalesChart points={points} />
                {comparison && (
                  <p className="chart-comparison">
                    <span>{formatRange(active)}</span>
                    <span>{formatRange(comparison.range)}</span>
                    <span className="comparison-mobile">
                      {formatRange(active)} dibanding{" "}
                      {formatRange(comparison.range, period.kind === "year")}
                    </span>
                  </p>
                )}
              </div>
            </section>
          );
        })()
      ) : (
        <section className="state-panel">
          <h2>Belum ada penjualan untuk periode ini</h2>
          <p>Pilih periode lain untuk melihat catatan penjualan contoh.</p>
          <Link className="button outline" href="/demo">
            Kembali ke periode awal
          </Link>
        </section>
      )}

      <DashboardTargets
        scope="demo"
        entries={targets.map((target) => ({
          target,
          progress: targetProgress(target, demoSales, demoAsOf),
        }))}
        href={"/demo/target-bisnis?" + query}
        sourceHref={"/demo/sumber-data?" + query}
      />

      {summary && (
        <DashboardInsights
          report={summary}
          base="/demo"
          query={query.toString()}
        />
      )}

      <aside className="source-note">
        <Info size={19} aria-hidden="true" />
        <div>
          <strong>Sumber · {demoSource}</strong>
          <p>Data sampai {formatFullDate(demoSales.coverage.end)}.</p>
        </div>
      </aside>
    </>
  );
}
