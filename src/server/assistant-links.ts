import { createHash } from "node:crypto";
import { readIntent } from "@/domain/assistant";
import { periodParams, type Period, type SearchParams } from "@/domain/sales";
import { uuidPattern } from "./account";

export const assistantPaths = {
  business: {
    page: "/asisten",
    evidence: "/dashboard",
    source: "/sumber-data",
  },
  demo: {
    page: "/demo/asisten",
    evidence: "/demo",
    source: "/demo/sumber-data",
  },
} as const;

export type AssistantScope = keyof typeof assistantPaths;
export type AnswerContext = {
  period: Period;
  revisionId?: string;
  intent?: ReturnType<typeof readIntent>;
  pair?: string[];
};

export function productKey(name: string) {
  return createHash("sha256").update(name).digest("hex").slice(0, 20);
}

export function selectedProducts(params: SearchParams) {
  return [params.produk1, params.produk2].filter(
    (value): value is string =>
      typeof value === "string" && /^[a-f0-9]{20}$/.test(value),
  );
}

export function assistantQuery({
  period,
  revisionId,
  intent,
  pair,
}: AnswerContext) {
  const query = periodParams(period);
  if (revisionId && uuidPattern.test(revisionId))
    query.set("revisi", revisionId);
  if (intent) query.set("tanya", intent);
  if (intent === "compare") {
    if (pair?.[0]) query.set("produk1", pair[0]);
    if (pair?.[1]) query.set("produk2", pair[1]);
  }
  return query;
}
