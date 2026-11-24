import Link from "next/link";
import { PeriodCostForm } from "@/components/period-cost-form";
import { formatRange, rupiah, type SearchParams } from "@/domain/sales";
import { isoDate } from "@/domain/import-sales";
import { businessCosts } from "@/server/business-costs";
import { requireBusiness } from "@/server/account";

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireBusiness();
  const { awal, akhir } = await searchParams;
  const range =
    typeof awal === "string" &&
    typeof akhir === "string" &&
    isoDate(awal) &&
    isoDate(akhir) &&
    awal <= akhir
      ? { start: awal, end: akhir }
      : undefined;
  const costs = await businessCosts().catch(() => null);
  return (
    <section className="business-stack sources-page">
      <Link href="/sumber-data#readiness-title" className="back-link">
        Kembali ke sumber data
      </Link>
      <h1>HPP dan biaya usaha</h1>
      <p>
        Simpan total biaya untuk rentang penjualan yang sama. HPP hanya mencakup
        barang yang terjual. Biaya usaha mencakup pengeluaran lain seperti sewa
        dan komisi.
      </p>
      <PeriodCostForm range={range} />
      <h2>Biaya yang sudah dicatat</h2>
      {costs === null ? (
        <p role="alert">
          Data biaya belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.
        </p>
      ) : costs.length ? (
        <dl className="readiness-list">
          {costs.map((item) => (
            <div key={item.starts_on + item.ends_on}>
              <dt>
                {formatRange(
                  { start: item.starts_on, end: item.ends_on },
                  true,
                )}
              </dt>
              <dd>
                HPP{" "}
                {item.cost_of_goods === null
                  ? "belum tercatat"
                  : rupiah(item.cost_of_goods)}
              </dd>
              <dd>
                Biaya usaha{" "}
                {item.operating_cost === null
                  ? "belum tercatat"
                  : rupiah(item.operating_cost)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>Belum ada catatan biaya.</p>
      )}
    </section>
  );
}
