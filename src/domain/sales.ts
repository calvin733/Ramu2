export type Period =
  | { kind: "month"; year: number; month: number }
  | { kind: "year"; year: number };
export type DateRange = { start: string; end: string };
export type RevenueDay = { date: string; revenue: number };
export type SalesDay = RevenueDay & { orders: number };
export type SalesDataset = { coverage: DateRange; days: readonly SalesDay[] };
export type Metrics = {
  revenue: number;
  orders: number;
  average: number | null;
};
export type SearchParams = Record<string, string | string[] | undefined>;

const monthLabels = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fullDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const integer = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export const formatNumber = (value: number | bigint) => integer.format(value);
export const rupiah = (value: number | bigint) => `Rp${formatNumber(value)}`;
export const millions = (value: number) =>
  `${decimal.format(value / 1_000_000)} jt`;
export const formatFullDate = (value: string) => fullDate.format(asDate(value));
export const formatShortDate = (value: string) =>
  shortDate.format(asDate(value));

function asDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function dateKey(year: number, month: number, day = 1) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodLabel(period: Period) {
  return period.kind === "year"
    ? String(period.year)
    : monthLabels.format(asDate(dateKey(period.year, period.month)));
}

export function periodKey(period: Period) {
  return period.kind === "year"
    ? String(period.year)
    : dateKey(period.year, period.month).slice(0, 7);
}

export function readPeriod(params: SearchParams, asOf: string): Period {
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const value = typeof params.periode === "string" ? params.periode : "";
  if (params.tampilan === "tahunan") {
    return {
      kind: "year",
      year: /^(?:19|20|21)\d{2}$/.test(value) ? Number(value) : year,
    };
  }
  const match = /^((?:19|20|21)\d{2})-(0[1-9]|1[0-2])$/.exec(value);
  return {
    kind: "month",
    year: match ? Number(match[1]) : year,
    month: match ? Number(match[2]) : month,
  };
}

export function periodParams(period: Period) {
  return new URLSearchParams({
    tampilan: period.kind === "year" ? "tahunan" : "bulanan",
    periode: periodKey(period),
  });
}

export function periodChoices(period: Period, coverage: DateRange) {
  const firstYear = Number(coverage.start.slice(0, 4));
  const firstMonth = Number(coverage.start.slice(5, 7));
  const lastYear = Number(coverage.end.slice(0, 4));
  const lastMonth = Number(coverage.end.slice(5, 7));
  const options: Period[] = [];
  for (let year = lastYear; year >= firstYear; year -= 1) {
    if (period.kind === "year") options.push({ kind: "year", year });
    else {
      const earliest = year === firstYear ? firstMonth : 1;
      for (
        let month = year === lastYear ? lastMonth : 12;
        month >= earliest;
        month -= 1
      ) {
        options.push({ kind: "month", year, month });
      }
    }
  }
  if (!options.some((option) => periodKey(option) === periodKey(period)))
    options.unshift(period);
  return options;
}

export function rangeForPeriod(period: Period): DateRange {
  if (period.kind === "year")
    return {
      start: dateKey(period.year, 1),
      end: dateKey(period.year, 12, 31),
    };
  return {
    start: dateKey(period.year, period.month),
    end: dateKey(
      period.year,
      period.month,
      daysInMonth(period.year, period.month),
    ),
  };
}

function previousPeriod(period: Period): Period {
  if (period.kind === "year") return { kind: "year", year: period.year - 1 };
  return period.month === 1
    ? { kind: "month", year: period.year - 1, month: 12 }
    : { kind: "month", year: period.year, month: period.month - 1 };
}

export function intersect(a: DateRange, b: DateRange): DateRange | null {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return start <= end ? { start, end } : null;
}

export function summarize(
  days: readonly SalesDay[],
  range: DateRange,
): Metrics {
  const totals = days.reduce(
    (sum, day) => {
      if (day.date >= range.start && day.date <= range.end) {
        sum.revenue += day.revenue;
        sum.orders += day.orders;
      }
      return sum;
    },
    { revenue: 0, orders: 0 },
  );
  return {
    ...totals,
    average: totals.orders ? totals.revenue / totals.orders : null,
  };
}

export function formatRange(range: DateRange, withYear = false) {
  const start = asDate(range.start);
  const end = asDate(range.end);
  if (withYear && start.getUTCFullYear() !== end.getUTCFullYear())
    return `${shortDate.format(start)} ${start.getUTCFullYear()} – ${shortDate.format(end)} ${end.getUTCFullYear()}`;
  const sameMonth = range.start.slice(0, 7) === range.end.slice(0, 7);
  const label = sameMonth
    ? `${range.start === range.end ? "" : `${start.getUTCDate()}–`}${shortDate.format(end)}`
    : `${shortDate.format(start)}–${shortDate.format(end)}`;
  return withYear ? `${label} ${end.getUTCFullYear()}` : label;
}

export function periodWindows(
  coverage: DateRange,
  period: Period,
  asOf = coverage.end,
) {
  const range = rangeForPeriod(period);
  const effectiveCoverage = {
    start: coverage.start,
    end: coverage.end < asOf ? coverage.end : asOf,
  };
  const active = intersect(range, effectiveCoverage);
  if (!active) return null;

  const prior = previousPeriod(period);
  const priorRange = rangeForPeriod(prior);
  const priorEndMonth =
    prior.kind === "year" ? Number(active.end.slice(5, 7)) : prior.month;
  const priorEndDay = Math.min(
    Number(active.end.slice(8)),
    daysInMonth(prior.year, priorEndMonth),
  );
  const comparable = {
    start: priorRange.start,
    end:
      active.end === range.end
        ? priorRange.end
        : dateKey(prior.year, priorEndMonth, priorEndDay),
  };
  const incomplete =
    active.start !== range.start ||
    (range.end < asOf && active.end !== range.end);
  const comparison =
    !incomplete &&
    comparable.start >= effectiveCoverage.start &&
    comparable.end <= effectiveCoverage.end
      ? comparable
      : null;
  return { active, comparison, incomplete };
}

export function periodSummary(dataset: SalesDataset, period: Period) {
  const windows = periodWindows(dataset.coverage, period);
  if (!windows) return null;
  const { active, comparison } = windows;
  return {
    active,
    totals: summarize(dataset.days, active),
    comparison: comparison
      ? { range: comparison, totals: summarize(dataset.days, comparison) }
      : null,
  };
}

export function percentageChange(
  value: number | null,
  previous: number | null,
) {
  return value === null || previous === null || previous <= 0
    ? null
    : ((value - previous) / previous) * 100;
}

export function changeText(change: number) {
  const value = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
  }).format(Math.abs(change));
  return change > 0
    ? `↑ Naik ${value}%`
    : change < 0
      ? `↓ Turun ${value}%`
      : "Tetap 0%";
}

export function rangeDays(range: DateRange, days: readonly RevenueDay[]) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const entries: RevenueDay[] = [];
  for (
    const date = asDate(range.start), last = asDate(range.end);
    date <= last;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const key = date.toISOString().slice(0, 10);
    entries.push(byDate.get(key) ?? { date: key, revenue: 0 });
  }
  return entries;
}

export type ChartPoint = {
  label: string;
  fullLabel: string;
  value: number;
  previous: number | null;
};

export function salesSeries(
  dataset: { days: readonly RevenueDay[] },
  period: Period,
  summary: { active: DateRange; comparison: { range: DateRange } | null },
): ChartPoint[] {
  const prior = summary.comparison?.range;
  const otherDays = prior ? rangeDays(prior, dataset.days) : [];
  if (period.kind === "month") {
    return rangeDays(summary.active, dataset.days).map((day, index) => ({
      label: formatRange({ start: day.date, end: day.date }),
      fullLabel: formatFullDate(day.date),
      value: day.revenue,
      previous: otherDays[index]?.revenue ?? null,
    }));
  }

  const totalsByMonth = (days: RevenueDay[]) => {
    const totals = new Map<string, number>();
    for (const day of days) {
      const month = day.date.slice(5, 7);
      totals.set(month, (totals.get(month) ?? 0) + day.revenue);
    }
    return totals;
  };
  const shortMonth = new Intl.DateTimeFormat("id-ID", {
    month: "short",
    timeZone: "UTC",
  });
  const current = totalsByMonth(rangeDays(summary.active, dataset.days));
  const previous = totalsByMonth(otherDays);
  return [...current].map(([month, value]) => ({
    label: shortMonth.format(asDate(dateKey(period.year, Number(month)))),
    fullLabel: periodLabel({
      kind: "month",
      year: period.year,
      month: Number(month),
    }),
    value,
    previous: previous.get(month) ?? null,
  }));
}
