import { demoAsOf, demoProduct, demoSales, distribute } from "./fixture.ts";
import { readPeriod, type SearchParams } from "../domain/sales.ts";
import {
  rangeSalesReport,
  salesReport,
  type SalesFact,
} from "../domain/sales-report.ts";
import { chatRanges } from "../domain/chat-context.ts";

const products = [demoProduct.name, "Sable Vanilla", "Ladyfinger", "Roti Susu"];

const facts: SalesFact[] = demoSales.days.flatMap(
  ({ date, revenue, orders }) => {
    if (!orders) return [];
    const weights = date.startsWith("2026-11")
      ? [demoProduct.share, 24, 24, 18]
      : [31, 29, 22, 18];
    const amounts = distribute(revenue, weights);
    const counts = distribute(orders - products.length, weights);
    return products.flatMap((product, index) =>
      distribute(amounts[index], Array<number>(counts[index] + 1).fill(1)).map(
        (amount, order) => ({
          business_date: date,
          status: "completed",
          order_id: [date, index, order].join("-"),
          product,
          revenue: amount,
          product_revenue: amount,
        }),
      ),
    );
  },
);

export function demoSalesReport(params: SearchParams) {
  const period = readPeriod(params, demoAsOf);
  const { range, comparison } = chatRanges(params);
  const capabilities = { orders: true, products: true };
  return {
    period,
    revision: null,
    coverage: demoSales.coverage,
    report: range
      ? rangeSalesReport(
          facts,
          demoSales.coverage,
          range,
          comparison,
          demoAsOf,
          capabilities,
        )
      : salesReport(facts, demoSales.coverage, period, demoAsOf, capabilities),
  };
}
