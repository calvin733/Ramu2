import {
  dateKey,
  daysInMonth,
  type SalesDataset,
  type SalesDay,
} from "../domain/sales.ts";
import type { Target } from "../domain/targets.ts";

export const demoAsOf = "2026-11-17";
export const demoBusiness = "Roti & Cerita";
export const demoSource = "Catatan penjualan contoh";
export const demoProduct = { name: "Brownies Almond", share: 34 };

const novemberRevenue = [
  860, 1010, 920, 1150, 1110, 1290, 1200, 1480, 1380, 1580, 1440, 1760, 1600,
  1940, 1840, 2160, 2080,
];
const octoberRevenue = [
  858, 930, 970, 1010, 1080, 1170, 1100, 1360, 1210, 1280, 1370, 1570, 1540,
  1540, 1700, 1620, 1757,
];

export function distribute(total: number, weights: readonly number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  let cumulative = 0;
  let allocated = 0;
  return weights.map((weight) => {
    cumulative += weight;
    const next = Math.floor((cumulative * total) / sum);
    const current = next - allocated;
    allocated = next;
    return current;
  });
}

function dailyRows(year: number, month: number): SalesDay[] {
  const count = year === 2026 && month === 11 ? 17 : daysInMonth(year, month);
  if (year === 2026 && (month === 10 || month === 11)) {
    const weights = month === 11 ? novemberRevenue : octoberRevenue;
    const firstOrders = distribute(month === 11 ? 328 : 302, weights);
    return Array.from({ length: count }, (_, index) => ({
      date: dateKey(year, month, index + 1),
      revenue:
        index < weights.length
          ? weights[index] * 1_000
          : (1160 + index * 27 + (index % 4) * 69) * 1_000,
      orders: firstOrders[index] ?? 18 + (index % 6),
    }));
  }

  return Array.from({ length: count }, (_, index) => {
    const closed = index % 14 === 6;
    const orders = closed
      ? 0
      : 10 + ((index * 13 + month * 5) % 16) + (year - 2025) * 2;
    return {
      date: dateKey(year, month, index + 1),
      revenue: orders * (63_000 + month * 900 + (index % 7) * 1_000),
      orders,
    };
  });
}

export const demoSales: SalesDataset = {
  coverage: { start: "2025-01-01", end: demoAsOf },
  days: [2025, 2026].flatMap((year) =>
    Array.from({ length: year === 2026 ? 11 : 12 }, (_, index) =>
      dailyRows(year, index + 1),
    ).flat(),
  ),
};

const november = { start: "2026-11-01", end: "2026-11-30" };

export const demoTargets: readonly Target[] = [
  {
    id: "omzet",
    kind: "revenue",
    label: "Omzet",
    value: 30_000_000,
    range: november,
    primary: true,
  },
  {
    id: "laba-kotor",
    kind: "gross-profit",
    label: "Laba kotor",
    value: 12_000_000,
    range: november,
  },
  {
    id: "pesanan",
    kind: "orders",
    label: "Jumlah pesanan",
    value: 400,
    range: november,
  },
];

export const demoTargetHistory: readonly Target[] = [
  {
    id: "omzet-okt",
    kind: "revenue",
    label: "Omzet",
    value: 42_000_000,
    range: { start: "2026-10-01", end: "2026-10-31" },
  },
  {
    id: "omzet-sep",
    kind: "revenue",
    label: "Omzet",
    value: 35_000_000,
    range: { start: "2026-09-01", end: "2026-09-30" },
  },
  {
    id: "pesanan-agt",
    kind: "orders",
    label: "Jumlah pesanan",
    value: 420,
    range: { start: "2026-08-01", end: "2026-08-31" },
  },
  {
    id: "laba-kotor-agt",
    kind: "gross-profit",
    label: "Laba kotor",
    value: 8_500_000,
    range: { start: "2026-08-01", end: "2026-08-31" },
  },
  {
    id: "pesanan-jul",
    kind: "orders",
    label: "Jumlah pesanan",
    value: 650,
    range: { start: "2026-07-01", end: "2026-07-31" },
  },
  {
    id: "laba-bersih-jun",
    kind: "net-profit",
    label: "Laba bersih",
    value: 4_500_000,
    range: { start: "2026-06-01", end: "2026-06-30" },
  },
  {
    id: "omzet-mei",
    kind: "revenue",
    label: "Omzet",
    value: 42_000_000,
    range: { start: "2026-05-01", end: "2026-05-31" },
  },
];
