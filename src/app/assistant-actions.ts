"use server";

import { redirect } from "next/navigation";
import { classifyQuestion, mentionedProducts } from "@/domain/assistant";
import { periodParams, type Period } from "@/domain/sales";
import { demoSalesReport } from "@/demo/sales-report";
import { requireBusiness, uuidPattern } from "@/server/account";
import {
  assistantPaths,
  assistantQuery,
  productKey,
  type AssistantScope,
} from "@/server/assistant-links";
import { businessSales } from "@/server/business-sales";

export async function askAssistant(
  scope: AssistantScope,
  period: Period,
  revision: string | null,
  _: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  if (scope !== "demo" && scope !== "business")
    return { error: "Halaman tidak tersedia." };
  if (scope === "business") await requireBusiness();
  const input = form.get("pertanyaan");
  const question = typeof input === "string" ? input.trim() : "";
  if (!question || question.length > 250)
    return { error: "Tulis pertanyaan sepanjang 1 sampai 250 karakter." };
  const intent = classifyQuestion(question);
  let pair: string[] = [];
  const revisionId =
    scope === "business" && revision && uuidPattern.test(revision)
      ? revision
      : undefined;
  if (intent === "compare") {
    const filters = {
      ...Object.fromEntries(periodParams(period)),
      revisi: revisionId,
    };
    try {
      const { report } =
        scope === "demo"
          ? demoSalesReport(filters)
          : await businessSales(filters, true);
      const names = mentionedProducts(
        question,
        report?.products?.map(({ name }) => name) ?? [],
      );
      if (names.length === 2) pair = names.map(productKey);
    } catch {
      return { error: "Data produk belum bisa dimuat. Coba kirim lagi." };
    }
  }
  redirect(
    assistantPaths[scope].page +
      "?" +
      assistantQuery({ period, revisionId, intent, pair }),
  );
}
