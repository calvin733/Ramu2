import { demoProduct, demoSales } from "@/demo/fixture";
import {
  changeText,
  formatNumber,
  percentageChange,
  periodSummary,
  rupiah,
  salesSeries,
} from "@/domain/sales";
import { SalesChart } from "./sales-chart";

export function DemoPreview() {
  const period = { kind: "month", year: 2026, month: 11 } as const;
  const summary = periodSummary(demoSales, period);
  if (!summary) return null;
  const change = percentageChange(
    summary.totals.revenue,
    summary.comparison?.totals.revenue ?? null,
  );
  return (
    <section
      className="demo-preview"
      aria-label="Pratinjau dashboard data contoh"
    >
      <div className="preview-header">
        <p>Dashboard</p>
        <small>Data contoh</small>
      </div>
      <div className="preview-sales">
        <p>Penjualan</p>
        <strong>{rupiah(summary.totals.revenue)}</strong>
        {change !== null && (
          <small>
            <b>{changeText(change)}</b> dibanding periode lalu
          </small>
        )}
      </div>
      <SalesChart
        kind="preview"
        points={salesSeries(demoSales, period, summary)}
      />
      <dl className="preview-stats">
        <div>
          <dt>Pesanan</dt>
          <dd>{formatNumber(summary.totals.orders)}</dd>
        </div>
        <div>
          <dt>Rata-rata per pesanan</dt>
          <dd>
            {summary.totals.average === null
              ? "—"
              : rupiah(summary.totals.average)}
          </dd>
        </div>
      </dl>
      <div className="preview-product">
        <span>{demoProduct.name}</span>
        <span>{demoProduct.share}% penjualan</span>
      </div>
    </section>
  );
}
