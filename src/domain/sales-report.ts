import {
  formatFullDate,
  formatShortDate,
  intersect,
  periodLabel,
  periodWindows,
  rangeDays,
  type ChartPoint,
  type DateRange,
  type Period,
} from "./sales.ts";

export type SalesFact = {
  business_date: string;
  status: "completed" | "refunded";
  order_id: string | null;
  product: string | null;
  revenue: number;
  product_revenue: number | null;
};

export type SalesCapabilities = { orders: boolean; products: boolean };

export function businessDate(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function localMoney(total: bigint) {
  const value = Number(total);
  if (!Number.isSafeInteger(value))
    throw new RangeError("Nilai penjualan melebihi batas perhitungan Rupiah.");
  return value;
}

function metrics(facts: readonly SalesFact[], trackOrders: boolean) {
  const ids = new Set<string>();
  let sales = 0n;
  let known = trackOrders;
  for (const fact of facts) {
    sales += BigInt(fact.revenue);
    if (fact.status === "completed") {
      if (fact.order_id) ids.add(fact.order_id);
      else known = false;
    }
  }
  const revenue = localMoney(sales);
  const orders = known ? ids.size : null;
  return {
    revenue,
    orders,
    average: orders ? revenue / orders : null,
    rows: facts.length,
  };
}

export function summarizeFacts(
  facts: readonly SalesFact[],
  range: DateRange,
  trackOrders: boolean,
) {
  return metrics(
    facts.filter(
      (fact) =>
        fact.business_date >= range.start && fact.business_date <= range.end,
    ),
    trackOrders,
  );
}

function productAmounts(facts: readonly SalesFact[], available: boolean) {
  if (!available) return null;
  const totals = new Map<string, bigint>();
  for (const fact of facts) {
    if (!fact.product || fact.product_revenue === null) return null;
    totals.set(
      fact.product,
      (totals.get(fact.product) ?? 0n) + BigInt(fact.product_revenue),
    );
  }
  return totals;
}

function periodGroups(
  facts: readonly SalesFact[],
  range: DateRange,
  monthly: boolean,
  trackOrders: boolean,
) {
  const key = (date: string) => (monthly ? date.slice(0, 7) : date);
  const byPeriod = new Map<string, SalesFact[]>();
  for (const fact of facts) {
    const date = key(fact.business_date);
    const group = byPeriod.get(date);
    if (group) group.push(fact);
    else byPeriod.set(date, [fact]);
  }
  const dates = new Set(rangeDays(range, []).map(({ date }) => key(date)));
  const shortMonth = new Intl.DateTimeFormat("id-ID", {
    month: "short",
    timeZone: "UTC",
  });
  return [...dates].map((date) => {
    return {
      date,
      label: monthly
        ? shortMonth.format(new Date(`${date}-01T00:00:00Z`))
        : formatShortDate(date),
      fullLabel: monthly
        ? periodLabel({
            kind: "month",
            year: Number(date.slice(0, 4)),
            month: Number(date.slice(5, 7)),
          })
        : formatFullDate(date),
      ...metrics(byPeriod.get(date) ?? [], trackOrders),
    };
  });
}

export function salesReport(
  facts: readonly SalesFact[],
  coverage: DateRange,
  period: Period,
  today: string,
  capabilities: SalesCapabilities,
) {
  const windows = periodWindows(coverage, period, today);
  return buildReport(facts, windows, period.kind === "year", capabilities);
}

export function rangeSalesReport(
  facts: readonly SalesFact[],
  coverage: DateRange,
  range: DateRange,
  comparable: DateRange | undefined,
  today: string,
  capabilities: SalesCapabilities,
) {
  const active = intersect(range, {
    ...coverage,
    end: coverage.end < today ? coverage.end : today,
  });
  if (!active) return null;
  const incomplete = active.start !== range.start || active.end !== range.end;
  const comparison =
    comparable &&
    !incomplete &&
    comparable.start >= coverage.start &&
    comparable.end <= coverage.end &&
    comparable.end <= today
      ? comparable
      : null;
  return buildReport(
    facts,
    { active, incomplete, comparison },
    false,
    capabilities,
  );
}

function buildReport(
  facts: readonly SalesFact[],
  windows: {
    active: DateRange;
    incomplete: boolean;
    comparison: DateRange | null;
  } | null,
  monthly: boolean,
  capabilities: SalesCapabilities,
) {
  if (!windows) return null;
  const { active, incomplete } = windows;
  const inRange = (range: DateRange) =>
    facts.filter(
      ({ business_date: date }) => date >= range.start && date <= range.end,
    );
  const current = inRange(active);
  const totals = metrics(current, capabilities.orders);
  const prior = windows.comparison ? inRange(windows.comparison) : [];
  const comparison = windows.comparison
    ? { range: windows.comparison, totals: metrics(prior, capabilities.orders) }
    : null;
  const currentGroups = periodGroups(
    current,
    active,
    monthly,
    capabilities.orders,
  );
  const priorGroups = comparison
    ? periodGroups(prior, comparison.range, monthly, capabilities.orders)
    : [];
  const daily = Array.from(
    { length: Math.max(currentGroups.length, priorGroups.length) },
    (_, index) => ({
      current: currentGroups.at(index) ?? null,
      prior: priorGroups.at(index) ?? null,
    }),
  );
  const chart: ChartPoint[] = currentGroups.map((group, index) => ({
    label: group.label,
    fullLabel: group.fullLabel,
    value: group.revenue,
    previous: priorGroups[index]?.revenue ?? null,
  }));
  const currentProducts = productAmounts(current, capabilities.products);
  const priorProducts = comparison
    ? productAmounts(prior, capabilities.products)
    : null;
  const products =
    currentProducts &&
    [...new Set([...currentProducts.keys(), ...(priorProducts?.keys() ?? [])])]
      .map((name) => {
        const actual = currentProducts.get(name) ?? 0n;
        const previous = priorProducts ? (priorProducts.get(name) ?? 0n) : null;
        return {
          name,
          revenue: localMoney(actual),
          previous: previous === null ? null : localMoney(previous),
          movement: previous === null ? null : localMoney(actual - previous),
          share:
            totals.revenue > 0 ? (Number(actual) / totals.revenue) * 100 : null,
        };
      })
      .sort(
        (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "id"),
      );

  return {
    active,
    incomplete,
    totals,
    comparison,
    daily,
    calendar: monthly
      ? periodGroups(current, active, false, capabilities.orders)
      : currentGroups,
    chart,
    products,
    productComparison: priorProducts !== null,
  };
}

export type SalesReport = NonNullable<ReturnType<typeof salesReport>>;

export function productMovements(report: SalesReport) {
  const products = report.products ?? [];
  const increase = products.reduce<(typeof products)[number] | null>(
    (best, product) =>
      (product.movement ?? 0) > (best?.movement ?? 0) ? product : best,
    null,
  );
  const decrease = products.reduce<(typeof products)[number] | null>(
    (worst, product) =>
      (product.movement ?? 0) < (worst?.movement ?? 0) ? product : worst,
    null,
  );
  return { increase, decrease };
}
