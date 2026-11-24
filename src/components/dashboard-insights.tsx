import Link from "next/link";
import { millions, rupiah, changeText } from "@/domain/sales";
import { productMovements, type SalesReport } from "@/domain/sales-report";

export function DashboardInsights({
  report,
  base,
  query,
}: {
  report: SalesReport;
  base: "/demo" | "/dashboard";
  query: string;
}) {
  const products = report.products ?? [];
  const changes = products
    .filter((product) => product.movement !== null && product.movement > 0)
    .sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0))
    .slice(0, 2);
  const rows = changes.length ? changes : products.slice(0, 2);
  const { decrease } = productMovements(report);
  return (
    <>
      {(rows.length > 0 || decrease) && (
        <section className="dashboard-insights" aria-label="Sorotan periode">
          <div>
            <h2>Perubahan utama</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Produk</th>
                  <th scope="col">Penjualan</th>
                  <th scope="col">Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => (
                  <tr key={product.name}>
                    <th scope="row">{product.name}</th>
                    <td>{rupiah(product.revenue)}</td>
                    <td
                      className={
                        (product.movement ?? 0) < 0 ? "table-down" : "table-up"
                      }
                    >
                      {product.movement === null
                        ? "—"
                        : (product.movement < 0 ? "↓ " : "↑ ") +
                          rupiah(Math.abs(product.movement))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link href={`${base}/produk?${query}`}>Lihat rincian produk →</Link>
          </div>
          {decrease && (
            <div>
              <h2>Yang perlu diperhatikan</h2>
              <div className="insight-decline">
                <h3>{decrease.name}</h3>
                {decrease.previous !== null && decrease.previous > 0 && (
                  <span className="metric-change badge down">
                    {changeText((decrease.movement ?? 0) / decrease.previous)}
                  </span>
                )}
              </div>
              <p>
                {millions(decrease.revenue)}, dari{" "}
                {millions(decrease.previous ?? 0)} pada periode pembanding.
              </p>
              <Link
                href={`${base === "/demo" ? "/demo" : ""}/asisten?${query}&tanya=decline`}
              >
                Tanya tentang penurunan ini →
              </Link>
            </div>
          )}
        </section>
      )}
      <aside className="analysis-notice">
        <p>
          <strong>Analisis tambahan tersedia</strong>
          <span>Lengkapi data laba, arus kas, atau stok sesuai kebutuhan.</span>
        </p>
        <Link
          href={`${base === "/demo" ? "/demo" : ""}/sumber-data?${query}#readiness-title`}
        >
          Lihat kebutuhan data →
        </Link>
      </aside>
    </>
  );
}
