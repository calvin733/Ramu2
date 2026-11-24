import { CalendarDays, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatFullDate, formatNumber, rupiah } from "@/domain/sales";
import type { ManagedTarget, Target, TargetProgress } from "@/domain/targets";
import { EditTargetButton } from "./target-edit-dialog";

export const targetDateLabel = (date: string) =>
  date.split("-").reverse().join("/");
export const targetAmount = (kind: Target["kind"], value: number | bigint) =>
  kind === "orders" ? formatNumber(value) + " pesanan" : rupiah(value);
export const targetPercent = (ratio: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);

const missingDetails: Record<string, string> = {
  "Perlu data HPP":
    "Tambahkan harga pokok produk yang terjual pada periode target untuk menghitung laba kotor.",
  "Perlu data biaya usaha":
    "Perhitungan laba bersih memerlukan HPP dan biaya usaha pada periode target.",
  "Perlu ID pesanan selesai":
    "Petakan ID pesanan yang unik agar jumlah pesanan selesai dapat dihitung.",
  "Data target belum lengkap":
    "Realisasi memakai bagian periode yang sudah tercakup.",
};

export function TargetCard({
  target,
  progress,
  actions,
  sourceHref,
  heading,
}: {
  target: Target;
  progress: TargetProgress;
  actions?: ReactNode;
  sourceHref?: string;
  heading?: ReactNode;
}) {
  const format = (value: number | bigint) => targetAmount(target.kind, value);
  const suggestion =
    progress.perDay === null
      ? null
      : "Diperlukan rata-rata " +
        (target.kind === "revenue" ? "omzet " : "") +
        format(progress.perDay) +
        " per " +
        (progress.sellingDaysUsed === null ? "hari" : "hari jual") +
        " untuk mencapai target.";
  const classes = [
    "target-card",
    target.primary && !actions ? "primary-target" : "",
    actions ? "target-managed" : "",
    actions && progress.unavailable && progress.value === null
      ? "target-unavailable"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes} data-period={progress.periodState}>
      <div className="target-identity">
        <div className="target-card-title">
          {heading ?? (
            <h3>{actions ? target.label : "Target " + target.label}</h3>
          )}
          {target.primary && actions && (
            <span className="target-badge">Target utama</span>
          )}
        </div>
        <p className="target-dates">
          <CalendarDays size={14} aria-hidden="true" />
          <span>
            {targetDateLabel(target.range.start)} –{" "}
            {targetDateLabel(target.range.end)}
          </span>
        </p>
        <p className="target-value">
          {(!target.primary || actions) && (
            <span>{actions ? "Target" : "Nilai target"}</span>
          )}{" "}
          <strong>{format(target.value)}</strong>
        </p>
      </div>
      {progress.status !== "upcoming" &&
        (!actions || !progress.unavailable || progress.value !== null) && (
          <div className="target-countdown">
            <strong>{formatNumber(progress.daysLeft)}</strong>
            <span>hari tersisa</span>
          </div>
        )}
      {progress.value !== null && (
        <div className="target-realization">
          <p>
            <span>Realisasi{progress.ratio === null ? " sementara" : ""}</span>{" "}
            <strong>{format(progress.value)}</strong>
          </p>
          {progress.ratio !== null && (
            <>
              <progress
                aria-label={"Progres target " + target.label}
                max={100}
                value={Math.max(0, Math.min(100, progress.ratio * 100))}
              />
              <p className={actions ? "target-metrics" : "sr-only"}>
                <span className="sr-only">
                  {targetPercent(progress.ratio)} dari target
                </span>
                {progress.status === "achieved" ? (
                  <span>Target tercapai</span>
                ) : (
                  progress.remaining !== null && (
                    <span>Sisa {format(progress.remaining)}</span>
                  )
                )}
              </p>
            </>
          )}
          {progress.observed && (
            <p
              className={progress.ratio === null ? "target-through" : "sr-only"}
            >
              Data sampai {formatFullDate(progress.observed.end)}
            </p>
          )}
        </div>
      )}
      {suggestion && (
        <div className="target-suggestion">
          <p>{suggestion}</p>
          {progress.sellingDaysUsed !== null && (
            <p>
              Berdasarkan {formatNumber(progress.sellingDaysUsed)} hari jual.
            </p>
          )}
        </div>
      )}
      {progress.unavailable && (
        <div className="target-suggestion">
          <strong className="target-data-status">
            {actions && <Info size={18} aria-hidden="true" />}
            {progress.unavailable}
          </strong>
          {actions && missingDetails[progress.unavailable] && (
            <p>{missingDetails[progress.unavailable]}</p>
          )}
          {sourceHref && actions && (
            <Link
              href={
                target.kind === "gross-profit" || target.kind === "net-profit"
                  ? sourceHref.startsWith("/demo")
                    ? "/masuk?" +
                      new URLSearchParams({ lanjut: "/sumber-data/biaya" })
                    : "/sumber-data/biaya?" +
                      new URLSearchParams({
                        awal: progress.observed?.start ?? target.range.start,
                        akhir: progress.observed?.end ?? target.range.end,
                      })
                  : sourceHref
              }
            >
              {target.kind === "gross-profit" || target.kind === "net-profit"
                ? "Lengkapi biaya"
                : "Lihat kebutuhan data"}{" "}
              →
            </Link>
          )}
        </div>
      )}
      {progress.status === "upcoming" && (
        <p className="target-through target-upcoming">
          Mulai {formatFullDate(target.range.start)}
        </p>
      )}
      {progress.sellingDaysUsed === 0 &&
        progress.daysLeft > 0 &&
        progress.status === "active" && (
          <p className="target-through target-upcoming">
            Sisa hari jual ditetapkan 0.
          </p>
        )}
      {actions && <div className="target-card-actions">{actions}</div>}
    </article>
  );
}

export function DashboardTargets({
  entries,
  href,
  sourceHref,
  scope,
}: {
  entries: { target: ManagedTarget; progress: TargetProgress }[];
  href: string;
  sourceHref: string;
  scope: "demo" | "business";
}) {
  return (
    <section className="target-section" aria-labelledby="target-heading">
      <header>
        <h2 id="target-heading">Target bisnis</h2>
        <Link href={href}>Kelola target →</Link>
      </header>
      {entries.length ? (
        <div className="target-grid">
          {entries.map(({ target, progress }) => (
            <div
              key={target.id}
              className={
                target.primary
                  ? "dashboard-target-entry is-primary"
                  : "dashboard-target-entry"
              }
            >
              <TargetCard
                target={target}
                progress={progress}
                sourceHref={sourceHref}
                heading={
                  <EditTargetButton
                    target={target}
                    scope={scope}
                    heading
                    label={"Target " + target.label}
                  />
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="target-empty">
          Belum ada target aktif untuk periode ini.
        </p>
      )}
    </section>
  );
}
