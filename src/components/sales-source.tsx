import { formatFullDate } from "@/domain/sales";
import type { SalesRevision } from "@/server/sales-revisions";

export const salesBasis = {
  line: "total per baris atau item",
  order: "total per pesanan",
  unit: "harga satuan × jumlah unit",
};

export function sourceLabel(revision: SalesRevision) {
  const { kind, name, sheet } = revision.source;
  const label = kind === "google_sheets" ? "Google Sheets" : kind.toUpperCase();
  return [label, name, sheet].filter(Boolean).join(" · ");
}

export function SalesSource({
  revision,
  timeZone,
  showStatus = true,
}: {
  revision: SalesRevision;
  timeZone: string;
  showStatus?: boolean;
}) {
  const updated = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(revision.imported_at));
  return (
    <div className="revision-meta">
      <p>
        <strong>{sourceLabel(revision)}</strong>
      </p>
      <p>Data sampai {formatFullDate(revision.covered_through)}</p>
      <p>Diperbarui {updated}</p>
      {showStatus &&
        (!revision.isActive ? (
          <p>Rincian ini memakai revisi sebelumnya.</p>
        ) : (
          revision.source.paused_at && (
            <p>Sumber nonaktif. Data terakhir tetap tersedia.</p>
          )
        ))}
    </div>
  );
}
