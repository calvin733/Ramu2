import { AnalysisReadiness } from "@/components/analysis-readiness";
import Link from "next/link";
import { SalesSource, sourceLabel } from "@/components/sales-source";
import { SourceControls } from "@/components/source-controls";
import { SourceOptions } from "@/components/source-options";
import { periodParams, readPeriod, type SearchParams } from "@/domain/sales";
import { requireBusiness } from "@/server/account";
import { googleSheetsConfig } from "@/server/import/google-sheets";
import { activeRevision } from "@/server/sales-revisions";

export default async function Sources({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [{ business }, revision, params] = await Promise.all([
    requireBusiness(),
    activeRevision(),
    searchParams,
  ]);
  const sheetsConfig = googleSheetsConfig();
  const sheet = revision?.source;
  return (
    <section className="business-stack sources-page">
      <h1>Sumber data</h1>
      <div className="source-active">
        <h2>Penjualan {business.name}</h2>
        {revision ? (
          <>
            <SalesSource revision={revision} timeZone={business.timezone} />
            <div className="active-source-actions">
              <SourceControls
                revision={revision.id}
                label={sourceLabel(revision)}
                paused={Boolean(revision.source.paused_at)}
                sheetsConfig={sheetsConfig}
                googleSource={
                  sheet?.kind === "google_sheets" &&
                  sheet.spreadsheet_id &&
                  sheet.sheet_id !== null
                    ? {
                        spreadsheetId: sheet.spreadsheet_id,
                        sheetId: sheet.sheet_id,
                      }
                    : undefined
                }
              />
              <Link
                className="button outline"
                href={`/sumber-data/kelola?${periodParams(readPeriod(params, revision.covered_through))}`}
              >
                Kelola sumber
              </Link>
            </div>
          </>
        ) : (
          <p>Belum ada sumber aktif.</p>
        )}
      </div>
      <div>
        <h2 className="source-options-heading">Pilihan sumber penjualan</h2>
        <SourceOptions
          activeRevisionId={revision?.id}
          sheetsConfig={sheetsConfig}
        />
      </div>
      <AnalysisReadiness
        sales={Boolean(revision)}
        orders={revision?.order_count != null}
        products={Boolean(revision?.product_available)}
      />
    </section>
  );
}
