import { cache } from "react";
import { summarizeFacts, type SalesFact } from "@/domain/sales-report";
import { calculateProfit, periodCost } from "@/domain/profit";
import {
  calculateTarget,
  targetKinds,
  type ManagedTarget,
  type TargetLedger,
} from "@/domain/targets";
import { requireBusiness, uuidPattern, type BusinessScope } from "./account";
import { businessCosts } from "./business-costs";
import {
  revisionFacts,
  salesRevision,
  type SalesRevision,
} from "./sales-revisions";
import { supabaseRequest } from "./supabase-http";

type TargetRow = {
  id: string;
  kind: ManagedTarget["kind"];
  amount: number;
  starts_on: string;
  ends_on: string;
  selling_days: number | null;
  is_primary: boolean;
  version: number;
};

const targetFields =
  "id,kind,amount,starts_on,ends_on,selling_days,is_primary,version";
function toTarget(row: TargetRow): ManagedTarget {
  if (!uuidPattern.test(row.id) || !Number.isSafeInteger(row.amount))
    throw new Error("Data target tidak sesuai.");
  return {
    id: row.id,
    kind: row.kind,
    label: targetKinds[row.kind],
    value: row.amount,
    range: { start: row.starts_on, end: row.ends_on },
    sellingDays: row.selling_days,
    primary: row.is_primary,
    version: row.version,
  };
}

export async function businessTarget(id: string) {
  if (!uuidPattern.test(id)) return null;
  const { account, business } = await requireBusiness();
  const response = await supabaseRequest(
    "/rest/v1/business_targets?" +
      new URLSearchParams({
        business_id: "eq." + business.id,
        id: "eq." + id,
        select: targetFields,
      }),
    { token: account.token },
  );
  if (!response.ok) throw new Error("Target bisnis belum dapat dimuat.");
  const [target] = (await response.json()) as TargetRow[];
  return target ? toTarget(target) : null;
}

export const businessTargets = cache(async (scope?: BusinessScope) => {
  const { account, business } = scope ?? (await requireBusiness());
  const targets: ManagedTarget[] = [];
  let after: string | undefined;
  for (;;) {
    const query = new URLSearchParams({
      business_id: "eq." + business.id,
      order: "id.asc",
      limit: "250",
      select: targetFields,
    });
    if (after) query.set("id", "gt." + after);
    const response = await supabaseRequest(
      "/rest/v1/business_targets?" + query,
      { token: account.token },
    );
    if (!response.ok) throw new Error("Target bisnis belum dapat dimuat.");
    const rows = (await response.json()) as TargetRow[];
    if (!rows.length) return targets;
    for (const row of rows) {
      if (after && row.id <= after)
        throw new Error("Data target tidak sesuai.");
      targets.push(toTarget(row));
      after = row.id;
    }
  }
});

async function targetLedger(
  revision: SalesRevision,
  includeCosts: boolean,
  loaded?: { facts: SalesFact[]; scope: BusinessScope },
): Promise<TargetLedger> {
  const [facts, costs] = await Promise.all([
    loaded?.facts ?? revisionFacts(revision.id),
    includeCosts
      ? businessCosts(loaded?.scope).catch(() => [])
      : Promise.resolve([]),
  ]);
  const trackOrders =
    revision.order_count !== null ||
    (revision.mapping.order !== undefined && revision.mapping.order >= 0);
  return {
    coverage: { start: revision.covered_from, end: revision.covered_through },
    totals: (range) => summarizeFacts(facts, range, trackOrders),
    ...(includeCosts
      ? {
          profit: (range, revenue) =>
            calculateProfit(revenue, periodCost(costs, range)),
        }
      : {}),
  };
}

export async function businessTargetResults(
  targets: readonly ManagedTarget[],
  today: string,
  revision?: SalesRevision | null,
  loaded?: { facts: SalesFact[]; scope: BusinessScope },
) {
  const source = revision === undefined ? await salesRevision() : revision;
  const needsSales = targets.some((target) => target.range.start <= today);
  const ledger =
    source && needsSales
      ? await targetLedger(
          source,
          targets.some(
            (target) =>
              target.kind === "gross-profit" || target.kind === "net-profit",
          ),
          loaded,
        )
      : null;
  return targets.map((target) => ({
    target,
    progress: calculateTarget(target, ledger, today),
  }));
}

export async function writeBusinessTarget(
  id: string,
  version: number | null,
  target?: Omit<ManagedTarget, "id" | "version">,
) {
  const { business, account } = await requireBusiness();
  const payload = {
    p_owner: account.id,
    p_business: business.id,
    p_id: id,
    p_version: version,
  };
  const response = await supabaseRequest(
    "/rest/v1/rpc/" + (target ? "ramu_save_target" : "ramu_delete_target"),
    {
      method: "POST",
      admin: true,
      body: JSON.stringify(
        target
          ? {
              ...payload,
              p_kind: target.kind,
              p_amount: target.value,
              p_starts: target.range.start,
              p_ends: target.range.end,
              p_selling_days: target.sellingDays ?? null,
              p_primary: Boolean(target.primary),
            }
          : payload,
      ),
    },
  );
  if (response.status === 409)
    return "Target sudah berubah. Muat ulang halaman sebelum menyimpan.";
  if (!response.ok) return "Perubahan target belum dapat disimpan. Coba lagi.";
  return null;
}
