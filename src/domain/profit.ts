import type { DateRange } from "./sales.ts";

export type PeriodCost = {
  starts_on: string;
  ends_on: string;
  cost_of_goods: number | null;
  operating_cost: number | null;
};

export function periodCost(costs: readonly PeriodCost[], range: DateRange) {
  return costs.find(
    ({ starts_on, ends_on }) =>
      starts_on === range.start && ends_on === range.end,
  );
}

export function calculateProfit(revenue: number, costs?: PeriodCost) {
  if (costs?.cost_of_goods == null) return { gross: null, net: null };
  const gross = BigInt(revenue) - BigInt(costs.cost_of_goods);
  return {
    gross,
    net:
      costs.operating_cost === null
        ? null
        : gross - BigInt(costs.operating_cost),
  };
}
