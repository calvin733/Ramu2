import { randomUUID } from "node:crypto";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeTarget } from "@/app/target-actions";
import { demoAsOf, demoSales } from "@/demo/fixture";
import {
  formatFullDate,
  formatNumber,
  formatRange,
  periodLabel,
  type SearchParams,
} from "@/domain/sales";
import { businessDate } from "@/domain/sales-report";
import {
  activeTarget,
  isTargetKind,
  targetKinds,
  targetProgress,
  type ManagedTarget,
  type TargetProgress,
} from "@/domain/targets";
import { requireBusiness, uuidPattern } from "@/server/account";
import {
  businessTargetResults,
  businessTarget,
  businessTargets,
} from "@/server/business-targets";
import { demoTargetId, readDemoTargets } from "@/server/demo-targets";
import { TargetCard, targetAmount, targetPercent } from "./target-cards";
import { TargetForm, TargetOperation } from "./target-form";
import { historyDates, targetReturn } from "@/domain/target-history";
import { EditTargetButton } from "./target-edit-dialog";

type Scope = "business" | "demo";
type Entry = { target: ManagedTarget; progress: TargetProgress };
const statusLabels = {
  achieved: "Tercapai",
  missed: "Tidak tercapai",
  incomplete: "Data belum lengkap",
} as const;
const sortLabels = {
  newest: "Periode terbaru",
  oldest: "Periode terlama",
  lowest: "Nilai target terkecil",
  highest: "Nilai target terbesar",
} as const;

const settings = {
  business: { home: "/target-bisnis", source: "/sumber-data#readiness-title" },
  demo: { home: "/demo/target-bisnis", source: "/demo/sumber-data" },
} as const;

const newest = (a: ManagedTarget, b: ManagedTarget) =>
  b.range.end.localeCompare(a.range.end) || a.id.localeCompare(b.id);

async function load(scope: Scope) {
  if (scope === "demo")
    return { today: demoAsOf, targets: await readDemoTargets() };
  const [{ business }, targets] = await Promise.all([
    requireBusiness(),
    businessTargets(),
  ]);
  return { today: businessDate(business.timezone), targets };
}

async function results(scope: Scope, targets: ManagedTarget[], today: string) {
  return scope === "demo"
    ? targets.map((target) => ({
        target,
        progress: targetProgress(target, demoSales, demoAsOf),
      }))
    : businessTargetResults(targets, today);
}

function HistoryRows({
  entries,
  home,
  returnTo,
}: {
  entries: Entry[];
  home: string;
  returnTo?: string;
}) {
  return (
    <>
      <div className="target-history-head" aria-hidden="true">
        <span>Jenis & periode</span>
        <span>Nilai target</span>
        <span>Realisasi</span>
        <span>Selisih</span>
        <span>Status</span>
      </div>
      <ul className="target-history-list" aria-label="Hasil target">
        {entries.map(({ target, progress }) => {
          const delta =
            progress.ratio === null || progress.value === null
              ? null
              : BigInt(progress.value) - BigInt(target.value);
          const status =
            progress.status === "achieved" || progress.status === "missed"
              ? progress.status
              : "incomplete";
          return (
            <li key={target.id} className="target-history-row">
              <div className="history-name">
                <Link
                  href={
                    home +
                    "/" +
                    target.id +
                    (returnTo
                      ? "?" + new URLSearchParams({ kembali: returnTo })
                      : "")
                  }
                >
                  <strong>{target.label}</strong>
                </Link>
                <p className="target-dates">
                  <CalendarDays size={14} aria-hidden="true" />
                  <span>{formatRange(target.range, true)}</span>
                </p>
              </div>
              <p className="history-goal">
                <span className="history-cell-label">Target</span>
                <strong>{targetAmount(target.kind, target.value)}</strong>
              </p>
              <div className="history-realization">
                <span className="history-cell-label">
                  Realisasi
                  {progress.ratio === null && progress.value !== null
                    ? " sementara"
                    : ""}
                </span>
                <strong>
                  {progress.value === null
                    ? "—"
                    : targetAmount(target.kind, progress.value)}
                </strong>
                <p>
                  {progress.ratio === null
                    ? (progress.unavailable ?? "Progres belum tersedia")
                    : targetPercent(progress.ratio) + " dari target"}
                </p>
                {progress.ratio === null &&
                  progress.value !== null &&
                  progress.observed && (
                    <p>Data sampai {formatFullDate(progress.observed.end)}</p>
                  )}
              </div>
              <p
                className={
                  "history-delta" +
                  (delta === null || delta === 0n
                    ? ""
                    : delta > 0n
                      ? " table-up"
                      : " table-down")
                }
              >
                <span className="history-cell-label">Selisih </span>
                {delta === null
                  ? "—"
                  : (delta > 0n ? "+" : delta < 0n ? "−" : "") +
                    targetAmount(target.kind, delta < 0n ? -delta : delta)}
              </p>
              <p className={"history-badge " + status}>
                {statusLabels[status]}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export async function TargetOverview({
  scope,
  params,
}: {
  scope: Scope;
  params: SearchParams;
}) {
  const { today, targets } = await load(scope);
  const { home, source } = settings[scope];
  const active = targets
    .filter((target) => activeTarget(target, today))
    .sort(
      (a, b) =>
        Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || newest(a, b),
    );
  const upcoming = targets
    .filter((target) => target.range.start > today)
    .sort((a, b) => a.range.start.localeCompare(b.range.start) || newest(a, b));
  const ended = targets
    .filter((target) => target.range.end < today)
    .sort(newest)
    .slice(0, 3);
  const [current, history] = await Promise.all([
    results(scope, [...active, ...upcoming], today),
    results(scope, ended, today),
  ]);
  const action = changeTarget.bind(null, scope);
  const cards = (entries: Entry[]) => (
    <div className="target-manager-grid">
      {entries.map(({ target, progress }) => (
        <TargetCard
          key={target.id}
          target={target}
          progress={progress}
          sourceHref={source}
          actions={
            <>
              <EditTargetButton target={target} scope={scope} />
              {!target.primary && (
                <TargetOperation
                  target={target}
                  action={action}
                  operation="primary"
                />
              )}
            </>
          }
        />
      ))}
    </div>
  );

  return (
    <div className="targets-page">
      <header className="dashboard-header targets-page-header">
        <div>
          <h1>Target bisnis</h1>
          <p>Pantau sasaran usaha untuk periode yang Anda pilih.</p>
          {scope === "demo" && (
            <p className="sr-only">
              Data contoh. Perubahan berlaku di sesi demo ini.
            </p>
          )}
        </div>
        <Link href={home + "/baru"} className="button primary">
          + Tambah target
        </Link>
      </header>
      {params.hasil === "disimpan" && (
        <p className="form-message success" role="status">
          Target tersimpan.
        </p>
      )}
      {params.hasil === "dihapus" && (
        <p className="form-message success" role="status">
          Target dihapus.
        </p>
      )}
      <section className="target-section" aria-labelledby="active-targets">
        <h2 id="active-targets">Target yang dipantau</h2>
        {active.length ? (
          cards(current.slice(0, active.length))
        ) : (
          <p className="target-empty">Belum ada target aktif.</p>
        )}
      </section>
      {upcoming.length > 0 && (
        <section className="target-section" aria-labelledby="upcoming-targets">
          <h2 id="upcoming-targets">Target akan datang</h2>
          {cards(current.slice(active.length))}
        </section>
      )}
      <section className="target-section" aria-labelledby="history-targets">
        <header>
          <h2 id="history-targets">Riwayat Target</h2>
        </header>
        {history.length ? (
          <HistoryRows entries={history} home={home} />
        ) : (
          <p className="target-empty">Belum ada target yang berakhir.</p>
        )}
        <Link className="button outline" href={home + "/riwayat"}>
          Buka Riwayat Target
        </Link>
      </section>
    </div>
  );
}

export async function TargetEditor({
  scope,
  id,
  params = {},
}: {
  scope: Scope;
  id: string;
  params?: SearchParams;
}) {
  const { home } = settings[scope];
  const back = targetReturn(params.kembali, home);
  const creating = id === "baru";
  if (!creating && !(scope === "demo" ? demoTargetId : uuidPattern).test(id))
    notFound();
  const targets =
    creating || scope === "demo" ? (await load(scope)).targets : [];
  const target = creating
    ? undefined
    : scope === "demo"
      ? targets.find((item) => item.id === id)
      : ((await businessTarget(id)) ?? undefined);
  if (!creating && !target) notFound();
  return (
    <div className="target-editor-page">
      <Link className="back-link" href={back}>
        ← Kembali ke Target bisnis
      </Link>
      {scope === "demo" && (
        <p className="target-form-hint">
          Data contoh · Perubahan berlaku di sesi demo ini.
        </p>
      )}
      <TargetForm
        id={target?.id ?? randomUUID()}
        target={target}
        action={changeTarget.bind(null, scope)}
        back={back}
        defaultPrimary={creating && !targets.some((item) => item.primary)}
      />
    </div>
  );
}

export async function TargetHistory({
  scope,
  params,
}: {
  scope: Scope;
  params: SearchParams;
}) {
  const { targets, today } = await load(scope);
  const { home } = settings[scope];
  const dates = historyDates(params);
  const ended = targets.filter((target) => target.range.end < today);
  const months = [
    ...new Set(ended.map((target) => target.range.end.slice(0, 7))),
  ]
    .sort()
    .reverse();
  const kind =
    typeof params.jenis === "string" && isTargetKind(params.jenis)
      ? params.jenis
      : "";
  const month =
    typeof params.bulan === "string" && months.includes(params.bulan)
      ? params.bulan
      : "";
  const status =
    typeof params.status === "string" &&
    Object.hasOwn(statusLabels, params.status)
      ? params.status
      : "";
  const sort =
    typeof params.urut === "string" && Object.hasOwn(sortLabels, params.urut)
      ? params.urut
      : "newest";
  const selected = ended.filter(
    (target) =>
      (!kind || target.kind === kind) &&
      (!month || target.range.end.startsWith(month)) &&
      (dates.invalid ||
        ((!dates.from || target.range.end >= dates.from) &&
          (!dates.through || target.range.end <= dates.through))),
  );
  const filtered = (await results(scope, selected, today)).filter(
    (entry) => !status || entry.progress.status === status,
  );
  filtered.sort((a, b) => {
    if (sort === "oldest")
      return (
        a.target.range.end.localeCompare(b.target.range.end) ||
        newest(a.target, b.target)
      );
    if (sort === "lowest" || sort === "highest") {
      const unit =
        Number(a.target.kind === "orders") - Number(b.target.kind === "orders");
      return (
        unit ||
        (a.target.value - b.target.value) * (sort === "lowest" ? 1 : -1) ||
        newest(a.target, b.target)
      );
    }
    return newest(a.target, b.target);
  });
  const requested =
    typeof params.tampil === "string" && /^\d+$/.test(params.tampil)
      ? Number(params.tampil)
      : 6;
  const visible = Math.min(filtered.length, Math.max(6, requested));
  const more = new URLSearchParams({
    jenis: kind,
    bulan: month,
    status,
    urut: sort,
    tampil: String(visible + 6),
    mulai: dates.from,
    sampai: dates.through,
  });
  const backQuery = new URLSearchParams(more);
  backQuery.set("tampil", String(visible));
  const returnTo = home + "/riwayat?" + backQuery;
  return (
    <div className="targets-page">
      <Link className="back-link" href={home}>
        ← Kembali ke Target bisnis
      </Link>
      <header className="dashboard-header">
        <div>
          <h1>Riwayat Target</h1>
          <p>
            {scope === "demo"
              ? "Data contoh · Hasil target yang sudah berakhir."
              : "Lihat hasil target yang periodenya sudah berakhir."}
          </p>
        </div>
      </header>
      {params.hasil === "disimpan" && (
        <p className="form-message success" role="status">
          Target tersimpan.
        </p>
      )}
      {params.hasil === "dihapus" && (
        <p className="form-message success" role="status">
          Target dihapus.
        </p>
      )}
      <form className="target-history-filters" action={home + "/riwayat"}>
        <label>
          Jenis target
          <select name="jenis" defaultValue={kind}>
            <option value="">Semua jenis</option>
            {Object.entries(targetKinds).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Periode berakhir
          <select name="bulan" defaultValue={month}>
            <option value="">Semua periode</option>
            {months.map((id) => (
              <option value={id} key={id}>
                {periodLabel({
                  kind: "month",
                  year: Number(id.slice(0, 4)),
                  month: Number(id.slice(5, 7)),
                })}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="">Semua status</option>
            {Object.entries(statusLabels).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Berakhir mulai
          <input type="date" name="mulai" defaultValue={dates.from} />
        </label>
        <label>
          Berakhir sampai
          <input
            type="date"
            name="sampai"
            defaultValue={dates.through}
            min={dates.from || undefined}
          />
        </label>
        <label>
          Urutkan
          <select name="urut" defaultValue={sort}>
            {Object.entries(sortLabels).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="history-filter-actions">
          <button className="button outline" type="submit">
            Perbarui hasil
          </button>
          <Link className="button quiet" href={home + "/riwayat"}>
            Reset filter
          </Link>
        </div>
      </form>
      {dates.invalid && (
        <p className="form-message" role="alert">
          Periksa rentang tanggal akhir target. Tanggal mulai harus sebelum atau
          sama dengan tanggal sampai.
        </p>
      )}
      {(sort === "lowest" || sort === "highest") && (
        <p className="target-form-hint">
          Nilai diurutkan per satuan, Rupiah lalu jumlah pesanan.
        </p>
      )}
      {filtered.length > 0 ? (
        <>
          <p className="target-form-hint">
            {formatNumber(visible)} dari {formatNumber(filtered.length)} target
          </p>
          <HistoryRows
            entries={filtered.slice(0, visible)}
            home={home}
            returnTo={returnTo}
          />
        </>
      ) : (
        <p className="target-empty">
          {ended.length
            ? "Tidak ada target yang sesuai dengan filter."
            : "Belum ada target yang berakhir."}
        </p>
      )}
      {visible < filtered.length && (
        <div>
          <Link className="button outline" href={home + "/riwayat?" + more}>
            Tampilkan {Math.min(6, filtered.length - visible)} lagi
          </Link>
        </div>
      )}
    </div>
  );
}
