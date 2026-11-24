import {
  businessDate,
  rangeSalesReport,
  salesReport,
  type SalesFact,
} from "@/domain/sales-report";
import { chatRanges } from "@/domain/chat-context";
import { readPeriod, type SearchParams } from "@/domain/sales";
import { requireBusiness, type BusinessScope } from "./account";
import {
  revisionFacts,
  salesRevision,
  type SalesRevision,
} from "./sales-revisions";

export async function businessSales(
  params: SearchParams,
  keepRevision = false,
  loaded?: {
    scope: BusinessScope;
    revision: SalesRevision | null;
    facts: SalesFact[];
  },
) {
  const { business } = loaded?.scope ?? (await requireBusiness());
  const requested = keepRevision ? params.revisi : undefined;
  const revision = loaded
    ? loaded.revision
    : Array.isArray(requested)
      ? null
      : await salesRevision(requested);
  const today = businessDate(business.timezone);
  const latest =
    revision && revision.covered_through < today
      ? revision.covered_through
      : today;
  const period = readPeriod(params, latest);
  const coverage = revision
    ? { start: revision.covered_from, end: latest }
    : null;
  if (!revision || !coverage)
    return {
      business,
      revision: null,
      coverage: null,
      period,
      report: null,
      today,
    };

  const facts = loaded?.facts ?? (await revisionFacts(revision.id));
  const mapping = revision.mapping;
  const capabilities = {
    orders:
      revision.order_count !== null ||
      (mapping.order !== undefined && mapping.order >= 0),
    products:
      revision.product_available ||
      (mapping.product !== undefined && mapping.product >= 0),
  };
  const { range, comparison } = chatRanges(params);
  const report = range
    ? rangeSalesReport(facts, coverage, range, comparison, today, capabilities)
    : salesReport(facts, coverage, period, today, capabilities);
  return { business, revision, coverage, period, report, today };
}
