import {
  businessDate,
  rangeSalesReport,
  salesReport,
  type SalesFact,
} from "@/domain/sales-report";
import { chatRanges } from "@/domain/chat-context";
import {
  intersect,
  periodWindows,
  readPeriod,
  type SearchParams,
} from "@/domain/sales";
import { requireBusiness, type BusinessScope } from "./account";
import {
  revisionFacts,
  salesRevision,
  type SalesRevision,
} from "./sales-revisions";

type LoadedSales = {
  scope: BusinessScope;
  revision: SalesRevision | null;
  facts: SalesFact[];
};

// Period labels need revision metadata, not every transaction in the source.
export async function businessSalesContext(
  params: SearchParams,
  keepRevision = false,
  loaded?: Pick<LoadedSales, "scope" | "revision">,
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
  const { range } = chatRanges(params);
  const active = coverage
    ? range
      ? intersect(range, coverage)
      : (periodWindows(coverage, period, today)?.active ?? null)
    : null;
  return { business, revision, coverage, period, today, active };
}

export async function businessSales(
  params: SearchParams,
  keepRevision = false,
  loaded?: LoadedSales,
) {
  const context = await businessSalesContext(params, keepRevision, loaded);
  const { revision, coverage, period, today, active } = context;
  if (!revision || !coverage || !active)
    return {
      ...context,
      report: null,
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
  return { ...context, report };
}
