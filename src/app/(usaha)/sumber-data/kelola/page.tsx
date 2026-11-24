import Link from "next/link";
import { SalesSource, sourceLabel } from "@/components/sales-source";
import { SourceControls } from "@/components/source-controls";
import { periodParams, readPeriod, type SearchParams } from "@/domain/sales";
import { requireBusiness } from "@/server/account";
import { googleSheetsConfig } from "@/server/import/google-sheets";
import { activeRevision } from "@/server/sales-revisions";

export default async function ManageSource({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [{ business }, revision, params] = await Promise.all([
    requireBusiness(),
    activeRevision(),
    searchParams,
  ]);
  const query = revision
    ? `?${periodParams(readPeriod(params, revision.covered_through))}`
    : "";
  return (
    <section className="business-stack sources-page">
      <h1>Kelola sumber</h1>
      {revision ? (
        <>
          <div className="source-active">
            <h2>Penjualan {business.name}</h2>
            <SalesSource revision={revision} timeZone={business.timezone} />
          </div>
          <p>
            Saat mengganti sumber, ringkasan tetap memakai data terakhir sampai
            Anda mengonfirmasi sumber baru.
          </p>
          <div className="active-source-actions">
            <SourceControls
              manage
              revision={revision.id}
              label={sourceLabel(revision)}
              paused={Boolean(revision.source.paused_at)}
              sheetsConfig={googleSheetsConfig()}
            />
          </div>
        </>
      ) : (
        <p>Belum ada sumber penjualan.</p>
      )}
      <Link className="back-link" href={`/sumber-data${query}`}>
        ← Kembali ke Sumber data
      </Link>
    </section>
  );
}
