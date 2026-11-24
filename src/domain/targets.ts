import {
  intersect,
  summarize,
  type DateRange,
  type SalesDataset,
} from "./sales.ts";

export const targetKinds = {
  revenue: "Omzet",
  orders: "Jumlah pesanan",
  "gross-profit": "Laba kotor",
  "net-profit": "Laba bersih",
} as const;

export type TargetKind = keyof typeof targetKinds;
export type Target = {
  id: string;
  kind: TargetKind;
  label: string;
  value: number;
  range: DateRange;
  primary?: boolean;
  sellingDays?: number | null;
};
export type ManagedTarget = Target & { version: number };

export function isTargetKind(kind: string): kind is TargetKind {
  return Object.hasOwn(targetKinds, kind);
}

export type TargetLedger = {
  coverage: DateRange;
  totals: (range: DateRange) => { revenue: number; orders: number | null };
  profit?: (
    range: DateRange,
    revenue: number,
  ) => { gross: bigint | null; net: bigint | null };
};

export const daysBetween = (from: string, to: string) =>
  (Date.parse(to) - Date.parse(from)) / 86_400_000;
export const activeTarget = (target: Target, today: string) =>
  target.range.start <= today && target.range.end >= today;

function exactDisplay(value: bigint) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
}

export function calculateTarget(
  target: Target,
  ledger: TargetLedger | null,
  today: string,
) {
  const daysLeft = Math.max(0, daysBetween(today, target.range.end));
  const upcoming = target.range.start > today;
  const ended = target.range.end < today;
  const periodState: "future" | "past" | "current" = upcoming
    ? "future"
    : ended
      ? "past"
      : "current";
  const through = ended ? target.range.end : today;
  const expected = { start: target.range.start, end: through };
  const observed =
    upcoming || !ledger ? null : intersect(expected, ledger.coverage);
  const empty = {
    periodState,
    daysLeft,
    value: null,
    ratio: null,
    remaining: null,
    perDay: null,
    sellingDaysUsed: null,
    observed,
  };
  if (upcoming)
    return { ...empty, unavailable: null, status: "upcoming" as const };

  const missingCost =
    target.kind === "gross-profit"
      ? "Perlu data HPP"
      : target.kind === "net-profit"
        ? "Perlu data biaya usaha"
        : null;
  if (missingCost && (!ledger?.profit || !observed))
    return {
      ...empty,
      observed: null,
      unavailable: missingCost,
      status: "incomplete" as const,
    };
  if (!ledger || !observed)
    return {
      ...empty,
      unavailable: ledger
        ? "Periode target di luar cakupan data"
        : "Hubungkan data penjualan",
      status: "incomplete" as const,
    };

  const totals = ledger.totals(observed);
  const profit = missingCost ? ledger.profit?.(observed, totals.revenue) : null;
  const profitValue =
    target.kind === "gross-profit" ? profit?.gross : profit?.net;
  if (missingCost && profitValue == null)
    return {
      ...empty,
      unavailable: profit?.gross == null ? "Perlu data HPP" : missingCost,
      status: "incomplete" as const,
    };
  const value =
    profitValue != null
      ? Number(profitValue)
      : target.kind === "orders"
        ? totals.orders
        : totals.revenue;
  if (value !== null && !Number.isSafeInteger(value))
    return {
      ...empty,
      unavailable: "Nilai laba melebihi batas perhitungan",
      status: "incomplete" as const,
    };
  if (value === null)
    return {
      ...empty,
      unavailable: "Perlu ID pesanan selesai",
      status: "incomplete" as const,
    };
  if (observed.start !== expected.start || observed.end !== expected.end) {
    return {
      ...empty,
      value,
      unavailable: "Data target belum lengkap",
      status: "incomplete" as const,
    };
  }

  const balance = BigInt(target.value) - BigInt(value);
  const remaining = balance > 0n ? balance : 0n;
  const sellingDaysUsed =
    target.sellingDays == null ? null : Math.min(target.sellingDays, daysLeft);
  const divisor = sellingDaysUsed ?? daysLeft;
  const perDay =
    remaining > 0n && divisor > 0
      ? (remaining + BigInt(divisor) - 1n) / BigInt(divisor)
      : null;
  const status =
    remaining === 0n
      ? ("achieved" as const)
      : ended
        ? ("missed" as const)
        : ("active" as const);
  return {
    periodState,
    daysLeft,
    observed,
    value,
    ratio: value / target.value,
    remaining: exactDisplay(remaining),
    perDay: perDay === null ? null : exactDisplay(perDay),
    sellingDaysUsed,
    unavailable: null,
    status,
  };
}

export type TargetProgress = ReturnType<typeof calculateTarget>;

export function targetProgress(
  target: Target,
  dataset: SalesDataset,
  asOf: string,
) {
  return calculateTarget(
    target,
    {
      coverage: dataset.coverage,
      totals: (range) => summarize(dataset.days, range),
    },
    asOf,
  );
}
