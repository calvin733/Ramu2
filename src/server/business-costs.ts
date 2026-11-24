import { cache } from "react";
import type { PeriodCost } from "@/domain/profit";
import { requireBusiness, type BusinessScope } from "./account";
import { supabaseRequest } from "./supabase-http";

export const businessCosts = cache(async (scope?: BusinessScope) => {
  const { account, business } = scope ?? (await requireBusiness());
  const response = await supabaseRequest(
    "/rest/v1/business_period_costs?" +
      new URLSearchParams({
        business_id: "eq." + business.id,
        select: "starts_on,ends_on,cost_of_goods,operating_cost",
        order: "ends_on.desc,starts_on.desc",
        limit: "250",
      }),
    { token: account.token },
  );
  if (!response.ok) throw new Error("Data biaya belum dapat dimuat.");
  return ((await response.json()) as PeriodCost[]).filter((item) =>
    [item.cost_of_goods, item.operating_cost].every(
      (value) => value === null || (Number.isSafeInteger(value) && value >= 0),
    ),
  );
});
