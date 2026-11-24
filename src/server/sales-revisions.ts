import { cache } from "react";
import type { ImportMapping, SourceKind } from "@/domain/import-types";
import type { SalesFact } from "@/domain/sales-report";
import {
  currentAccount,
  currentBusiness,
  uuidPattern,
  type BusinessScope,
} from "./account";
import { supabaseRequest } from "./supabase-http";

type Revision = {
  id: string;
  source_id: string;
  covered_from: string;
  covered_through: string;
  imported_at: string;
  order_count: number | null;
  product_available: boolean;
  basis: "line" | "order" | "unit";
  file_name: string;
  file_sheet: string | null;
  mapping: Partial<ImportMapping>;
};
type Source = {
  kind: SourceKind;
  paused_at: string | null;
  spreadsheet_id: string | null;
  sheet_id: number | null;
};

export const salesRevision = cache(
  async (requested?: string, knownScope?: BusinessScope) => {
    const account = knownScope?.account ?? (await currentAccount());
    const business =
      knownScope?.business ?? (account ? await currentBusiness(account) : null);
    const id = requested ?? business?.active_revision_id;
    if (!account || !business || !id || !uuidPattern.test(id)) return null;
    const scope = `business_id=eq.${business.id}`;
    const select =
      "id,source_id,covered_from,covered_through,imported_at,order_count,product_available,basis,file_name,file_sheet,mapping";
    const revisionResponse = await supabaseRequest(
      `/rest/v1/sales_revisions?${scope}&id=eq.${id}&select=${select}`,
      { token: account.token },
    );
    if (!revisionResponse.ok)
      throw new Error("Revisi penjualan belum dapat dimuat.");
    const [revision] = (await revisionResponse.json()) as Revision[];
    if (!revision) return null;
    const sourceResponse = await supabaseRequest(
      `/rest/v1/data_sources?${scope}&id=eq.${revision.source_id}&select=kind,paused_at,spreadsheet_id,sheet_id`,
      { token: account.token },
    );
    if (!sourceResponse.ok)
      throw new Error("Sumber penjualan belum dapat dimuat.");
    const [source] = (await sourceResponse.json()) as Source[];
    if (!source) throw new Error("Sumber penjualan aktif tidak tersedia.");
    return {
      ...revision,
      isActive: id.toLowerCase() === business.active_revision_id,
      source: {
        ...source,
        name: revision.file_name,
        sheet: revision.file_sheet,
      },
    };
  },
);

export type SalesRevision = NonNullable<
  Awaited<ReturnType<typeof salesRevision>>
>;

export function activeRevision() {
  return salesRevision();
}

export const revisionFacts = cache(
  async (revisionId: string, knownScope?: BusinessScope) => {
    const account = knownScope?.account ?? (await currentAccount());
    const business =
      knownScope?.business ?? (account ? await currentBusiness(account) : null);
    if (!account || !business || !uuidPattern.test(revisionId)) return [];
    const facts: SalesFact[] = [];
    let after = 0;
    for (;;) {
      const query = new URLSearchParams({
        business_id: `eq.${business.id}`,
        revision_id: `eq.${revisionId}`,
        source_row: `gt.${after}`,
        order: "source_row.asc",
        limit: "500",
        select:
          "source_row,business_date,status,order_id,product,revenue,product_revenue",
      });
      const response = await supabaseRequest(`/rest/v1/sales_facts?${query}`, {
        token: account.token,
      });
      if (!response.ok)
        throw new Error("Penjualan untuk revisi ini belum dapat dimuat.");
      const page = (await response.json()) as (SalesFact & {
        source_row: number;
      })[];
      if (!page.length) break;
      for (const { source_row, ...fact } of page) {
        if (
          !Number.isInteger(source_row) ||
          source_row <= after ||
          !Number.isSafeInteger(fact.revenue) ||
          (fact.product_revenue !== null &&
            !Number.isSafeInteger(fact.product_revenue))
        )
          throw new Error("Format data penjualan tidak sesuai.");
        facts.push(fact);
        after = source_row;
      }
    }
    return facts;
  },
);
