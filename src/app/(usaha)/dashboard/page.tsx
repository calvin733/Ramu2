import { DashboardInsights } from "@/components/dashboard-insights";
import Link from "next/link";
import { CalculationDialog } from "@/components/calculation-dialog";
import { PeriodControls } from "@/components/period-controls";
import { SalesChart } from "@/components/sales-chart";
import { SalesSource, salesBasis } from "@/components/sales-source";
import { DashboardTargets } from "@/components/target-cards";
import {
  changeText,
  formatNumber,
  formatRange,
  intersect,
  percentageChange,
  periodParams,
  rangeForPeriod,
  rupiah,
  type SearchParams,
} from "@/domain/sales";
import { activeTarget } from "@/domain/targets";
import { businessSales } from "@/server/business-sales";
import {
  businessTargetResults,
  businessTargets,
} from "@/server/business-targets";

function Change({
  value,
  badge = false,
}: {
  value: number | null;
  badge?: boolean;
}) {
  if (value === null) return null;
  return (
    <span
      className={`metric-change ${value < 0 ? "down" : value === 0 ? "flat" : "up"}${badge ? " badge" : ""}`}
    >
      {badge
        ? changeText(value)
        : changeText(value).replace("Naik ", "").replace("Turun ", "")}
    </span>
  );
}

export default async function BusinessDashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [{ business, revision, coverage, period, report, today }, targets] =
    await Promise.all([businessSales(params), businessTargets()]);
  const active = targets
    .filter(
      (target) =>
        activeTarget(target, today) &&
        intersect(target.range, rangeForPeriod(period)),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.primary)) - Number(Boolean(a.primary)) ||
        b.range.end.localeCompare(a.range.end),
    );
  const targetEntries = await businessTargetResults(active, today, revision);
  const query = periodParams(period);
  const detail = new URLSearchParams(query);
  if (revision) detail.set("revisi", revision.id);
  detail.set("asal", "dashboard");
  const monthly = period.kind === "month";
  const peak = report?.chart.reduce<
    NonNullable<typeof report>["chart"][number] | null
  >((best, point) => (point.value > (best?.value ?? 0) ? point : best), null);

  return (
    <>
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>{business.name}</p>
        </div>
        <Link
          href={`/sumber-data${revision ? `?${query}` : ""}`}
          className="button outline"
        >
          {revision ? "Lihat sumber data" : "Hubungkan data"}
        </Link>
      </header>
      {revision && params.impor === "sukses" && (
        <p className="form-message success dashboard-notice" role="status">
          Sumber penjualan berhasil diaktifkan.
        </p>
      )}
      {revision?.source.paused_at && (
        <p className="form-message dashboard-notice" role="status">
          Sumber nonaktif. Dashboard menampilkan data terakhir.
        </p>
      )}
      {coverage && (
        <section className="period-row" aria-label="Periode Dashboard">
          <div>
            <b>Periode Dashboard</b>
            <p>
              {report
                ? formatRange(report.active, true)
                : "Di luar cakupan data penjualan"}
            </p>
          </div>
          <PeriodControls period={period} coverage={coverage} />
        </section>
      )}
      {report && revision ? (
        <>
          <section className="sales-panel" aria-labelledby="sales-title">
            <p className="sales-eyebrow">Kondisi usaha</p>
            <div className="sales-actions">
              <CalculationDialog basis={salesBasis[revision.basis]} />
              <Link className="chart-link" href={`/dashboard/harian?${detail}`}>
                {monthly ? "Lihat data harian" : "Lihat rincian bulanan"} →
              </Link>
            </div>
            <div className="revenue-row">
              <h2 id="sales-title">Penjualan</h2>
              <Change
                badge
                value={percentageChange(
                  report.totals.revenue,
                  report.comparison?.totals.revenue ?? null,
                )}
              />
            </div>
            <p className="revenue-total">{rupiah(report.totals.revenue)}</p>
            <p className="sales-context">
              {report.comparison ? (
                <>
                  Sebelumnya {rupiah(report.comparison.totals.revenue)}
                  {report.comparison.totals.revenue <= 0 &&
                    ` · Persentase perubahan tidak tersedia karena penjualan pembanding ${report.comparison.totals.revenue === 0 ? "nol" : "negatif"}.`}
                </>
              ) : report.incomplete ? (
                "Cakupan periode belum lengkap. Total memakai tanggal yang tercakup."
              ) : (
                "Cakupan periode pembanding belum tersedia."
              )}
            </p>
            <div className="sales-stats">
              {report.totals.orders === null ? (
                <span>
                  Pesanan belum tersedia · {formatNumber(report.totals.rows)}{" "}
                  baris transaksi
                </span>
              ) : (
                <span>
                  {formatNumber(report.totals.orders)} pesanan{" "}
                  <Change
                    value={percentageChange(
                      report.totals.orders,
                      report.comparison?.totals.orders ?? null,
                    )}
                  />
                </span>
              )}
              <span>
                {report.totals.average === null
                  ? "Rata-rata per pesanan belum tersedia"
                  : `Rata-rata ${rupiah(report.totals.average)} per pesanan`}{" "}
                <Change
                  value={percentageChange(
                    report.totals.average,
                    report.comparison?.totals.average ?? null,
                  )}
                />
              </span>
            </div>
            <div className="sales-figure">
              {peak && (
                <p className="peak-label">Penjualan tertinggi · {peak.label}</p>
              )}
              <SalesChart points={report.chart} />
              {report.comparison && (
                <p className="chart-comparison">
                  <span>{formatRange(report.active)}</span>
                  <span>{formatRange(report.comparison.range)}</span>
                  <span className="comparison-mobile">
                    {formatRange(report.active, true)} dibanding{" "}
                    {formatRange(report.comparison.range, true)}
                  </span>
                </p>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="state-panel">
          <h2>
            {revision
              ? "Belum ada data untuk periode ini"
              : "Belum ada data penjualan"}
          </h2>
          <p>
            {revision
              ? "Pilih periode dalam cakupan sumber penjualan."
              : "Hubungkan Excel atau CSV untuk melihat ringkasan dari catatan usaha Anda."}
          </p>
          <Link
            href={revision ? "/dashboard" : "/demo"}
            className="button outline"
          >
            {revision ? "Kembali ke periode terbaru" : "Coba data contoh"}
          </Link>
        </section>
      )}
      <DashboardTargets
        scope="business"
        entries={targetEntries}
        href={"/target-bisnis?" + query}
        sourceHref={"/sumber-data?" + query + "#readiness-title"}
      />
      {report && (
        <>
          <DashboardInsights
            base="/dashboard"
            report={report}
            query={detail.toString()}
          />
          {!report.products?.some(
            (product) => product.revenue > 0 || product.movement,
          ) && (
            <div className="business-detail-links">
              <Link href={`/dashboard/produk?${detail}`}>
                Lihat rincian produk →
              </Link>
            </div>
          )}
        </>
      )}
      {revision && (
        <aside className="source-note">
          <SalesSource
            revision={revision}
            timeZone={business.timezone}
            showStatus={false}
          />
        </aside>
      )}
      <div className="mobile-account-links">
        <Link href="/pengaturan-awal/profil?edit=1">Profil usaha</Link>
      </div>
    </>
  );
}
