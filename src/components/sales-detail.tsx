import Link from "next/link";
import { demoSource } from "@/demo/fixture";
import { demoSalesReport } from "@/demo/sales-report";
import { readIntent } from "@/domain/assistant";
import {
  formatNumber,
  formatRange,
  periodParams,
  rupiah,
  type SearchParams,
} from "@/domain/sales";
import { productMovements, type SalesReport } from "@/domain/sales-report";
import {
  assistantPaths,
  assistantQuery,
  productKey,
  selectedProducts,
  type AssistantScope,
} from "@/server/assistant-links";
import { businessSales } from "@/server/business-sales";
import { SalesSource, salesBasis } from "./sales-source";

const percent = new Intl.NumberFormat("id-ID", {
  style: "percent",
  maximumFractionDigits: 1,
});

function TimeTable({
  report,
  monthly,
  calendar,
}: {
  report: SalesReport;
  monthly: boolean;
  calendar: boolean;
}) {
  const prior = calendar ? null : report.comparison;
  const rows = calendar
    ? report.calendar.map((current) => ({ current, prior: null }))
    : report.daily;
  return (
    <div
      className="sales-table-wrap"
      tabIndex={0}
      role="region"
      aria-label="Tabel penjualan"
    >
      <table className="data-table sales-evidence-table">
        <caption>
          {monthly ? "Ringkasan harian" : "Ringkasan bulanan"} ·{" "}
          {formatRange(report.active, true)}
        </caption>
        <thead>
          <tr>
            <th scope="col">{monthly ? "Tanggal" : "Bulan"}</th>
            <th scope="col">Penjualan</th>
            {prior && <th scope="col">Penjualan pembanding</th>}
            <th scope="col">Pesanan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ current, prior: previous }) => (
            <tr
              key={current?.fullLabel ?? previous?.fullLabel}
              id={current ? "hari-" + current.date : undefined}
            >
              <th scope="row">
                {current?.fullLabel ?? "—"}
                {previous && <small>Pembanding {previous.fullLabel}</small>}
              </th>
              <td>{current ? rupiah(current.revenue) : "—"}</td>
              {prior && <td>{previous ? rupiah(previous.revenue) : "—"}</td>}
              <td>
                {current?.orders == null ? "—" : formatNumber(current.orders)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total periode</th>
            <td>{rupiah(report.totals.revenue)}</td>
            {prior && <td>{rupiah(prior.totals.revenue)}</td>}
            <td>
              {report.totals.orders === null
                ? "—"
                : formatNumber(report.totals.orders)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ProductTable({
  report,
  pair,
  showTotals,
}: {
  report: SalesReport;
  pair: string[];
  showTotals: boolean;
}) {
  const products = report.products ?? [];
  const prior = report.productComparison ? report.comparison : null;
  const { increase: leading } = productMovements(report);
  return (
    <>
      {leading && (
        <section className="product-leader">
          <h2>{leading.name}</h2>
          <p>
            Produk dengan kenaikan terbesar · Naik{" "}
            {rupiah(leading.movement ?? 0)}
          </p>
        </section>
      )}
      <div
        className="sales-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Tabel produk"
      >
        <table className="data-table sales-evidence-table product-evidence-table">
          <caption>
            Penjualan bersih per produk · {formatRange(report.active, true)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Produk</th>
              {prior && <th scope="col">Pembanding</th>}
              <th scope="col">Penjualan</th>
              {prior && <th scope="col">Perubahan</th>}
              <th scope="col">Porsi</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr
                key={product.name}
                id={"produk-" + productKey(product.name)}
                className={
                  pair.includes(productKey(product.name))
                    ? "evidence-selected"
                    : undefined
                }
              >
                <th scope="row">
                  {product.name}
                  {product.share !== null && product.share > 0 && (
                    <progress
                      className="product-share"
                      value={Math.min(100, product.share)}
                      max={100}
                      aria-hidden="true"
                    />
                  )}
                </th>
                {prior && (
                  <td>
                    {product.previous === null ? "—" : rupiah(product.previous)}
                  </td>
                )}
                <td>{rupiah(product.revenue)}</td>
                {prior && (
                  <td
                    className={
                      product.movement && product.movement < 0
                        ? "table-down"
                        : product.movement
                          ? "table-up"
                          : undefined
                    }
                  >
                    {product.movement === null
                      ? "—"
                      : product.movement === 0
                        ? rupiah(0)
                        : `${product.movement > 0 ? "↑" : "↓"} ${rupiah(Math.abs(product.movement))}`}
                  </td>
                )}
                <td>
                  {product.share === null
                    ? "—"
                    : percent.format(product.share / 100)}
                </td>
              </tr>
            ))}
          </tbody>
          {showTotals && (
            <tfoot>
              <tr>
                <th scope="row">Total penjualan periode</th>
                {prior && <td>{rupiah(prior.totals.revenue)}</td>}
                <td>{rupiah(report.totals.revenue)}</td>
                {prior && (
                  <td>
                    {rupiah(
                      BigInt(report.totals.revenue) -
                        BigInt(prior.totals.revenue),
                    )}
                  </td>
                )}
                <td>–</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {report.comparison && !prior && (
        <p className="detail-caption">
          Identitas produk atau nilai per item pada periode pembanding belum
          lengkap.
        </p>
      )}
      <p className="detail-caption">
        Porsi dihitung dari penjualan bersih pada periode terpilih dan tersedia
        ketika total penjualan lebih besar dari nol.
      </p>
    </>
  );
}

export async function SalesDetail({
  params,
  kind,
  scope = "business",
}: {
  params: SearchParams;
  kind: "time" | "product";
  scope?: AssistantScope;
}) {
  const demo = scope === "demo";
  const data = demo
    ? demoSalesReport(params)
    : await businessSales(params, true);
  const { revision, period, report } = data;
  const paths = assistantPaths[scope];
  const fromChat = params.asal === "percakapan";
  const fromAssistant = params.asal === "asisten" || fromChat;
  const intent = fromAssistant ? readIntent(params.tanya) : null;
  const pair = intent === "compare" ? selectedProducts(params) : [];
  const filters = periodParams(period);
  const returnQuery = assistantQuery({
    period,
    revisionId: revision?.id,
    intent,
    pair,
  });
  const evidence = new URLSearchParams(returnQuery);
  evidence.set(
    "asal",
    fromChat ? "percakapan" : fromAssistant ? "asisten" : "dashboard",
  );
  if (fromChat) {
    for (const key of [
      "awal",
      "akhir",
      "bandingAwal",
      "bandingAkhir",
      "percakapan",
      "pesan",
    ]) {
      const value = params[key];
      if (typeof value === "string" && value.length <= 36)
        evidence.set(key, value);
    }
    const thread = evidence.get("percakapan");
    if (thread) returnQuery.set("percakapan", thread);
  }
  const anchor =
    fromChat && /^[a-f\d-]{36}$/i.test(evidence.get("pesan") ?? "")
      ? "#pesan-" + evidence.get("pesan")
      : "";
  const calendar = period.kind === "year" && params.rincian === "harian";
  const monthly =
    period.kind === "month" || calendar || typeof params.awal === "string";
  const isProduct = kind === "product";
  const title = isProduct
    ? "Rincian produk"
    : monthly
      ? "Data penjualan harian"
      : "Data penjualan bulanan";

  return (
    <div className="detail-page business-sales-detail">
      <Link
        href={
          fromAssistant
            ? paths.page + "?" + returnQuery + anchor
            : paths.evidence + "?" + filters
        }
        className="back-link"
      >
        ← Kembali ke {fromAssistant ? "Asisten" : "Dashboard"}
      </Link>
      <h1>{title}</h1>
      {revision && "business" in data && (
        <SalesSource revision={revision} timeZone={data.business.timezone} />
      )}
      {demo && <p>Data contoh · {demoSource}</p>}
      {report && (revision || demo) ? (
        <>
          <p className="detail-range">
            {formatRange(report.active, true)}
            {report.comparison &&
              (!calendar || isProduct) &&
              ` dibanding ${formatRange(report.comparison.range, true)}`}
          </p>
          {report.incomplete && (
            <p className="form-message">
              Cakupan periode belum lengkap. Rincian memakai tanggal yang
              tercakup.
            </p>
          )}
          {isProduct ? (
            report.products === null ? (
              <div className="state-panel">
                <h2>Rincian produk belum tersedia</h2>
                <p>
                  {revision?.basis === "order"
                    ? "Sumber memakai total pesanan. Petakan nilai per baris atau harga satuan agar penjualan dapat dialokasikan ke produk."
                    : "Petakan nama produk dan nilai per item untuk setiap transaksi pada periode ini."}
                </p>
              </div>
            ) : report.products.length ? (
              <ProductTable
                report={report}
                pair={pair}
                showTotals={fromAssistant}
              />
            ) : (
              <p className="target-empty">
                Belum ada produk tercatat pada periode ini.
              </p>
            )
          ) : (
            <>
              <TimeTable
                report={report}
                monthly={monthly}
                calendar={calendar}
              />
              <p className="detail-caption">
                {revision && <>Dasar nilai · {salesBasis[revision.basis]}. </>}
                {report.totals.orders === null
                  ? `ID pesanan belum memadai untuk menghitung jumlah pesanan dari ${formatNumber(report.totals.rows)} baris transaksi.`
                  : "Total pesanan menghitung setiap ID unik sepanjang periode."}
              </p>
            </>
          )}
        </>
      ) : (
        <section className="state-panel">
          <h2>
            {revision || demo
              ? "Tidak ada cakupan untuk periode ini"
              : "Revisi penjualan tidak tersedia"}
          </h2>
          <p>
            {revision || demo
              ? "Kembali untuk memilih periode yang tercakup."
              : "Kembali untuk membuka rincian dari sumber yang tersedia."}
          </p>
        </section>
      )}
      {(revision || demo) && (
        <div className="business-detail-links">
          <Link
            href={
              paths.evidence + (isProduct ? "/harian?" : "/produk?") + evidence
            }
          >
            {isProduct ? "Lihat rincian penjualan" : "Lihat rincian produk"} →
          </Link>
          <Link href={paths.source + "?" + filters}>Lihat sumber data →</Link>
        </div>
      )}
    </div>
  );
}
