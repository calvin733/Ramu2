import type { Metadata } from "next";
import { AssistantLoadError, AssistantView } from "@/components/assistant-view";
import { ChatView } from "@/components/chat-view";
import { readIntent } from "@/domain/assistant";
import {
  formatRange,
  periodLabel,
  readPeriod,
  type SearchParams,
} from "@/domain/sales";
import { businessDate } from "@/domain/sales-report";
import { requireBusiness, uuidPattern } from "@/server/account";
import { assistantQuery, selectedProducts } from "@/server/assistant-links";
import { businessSales, businessSalesContext } from "@/server/business-sales";
import { chatModelStatus } from "@/server/chat-model";
import {
  conversationList,
  readConversation,
} from "@/server/chat-conversations";

export const metadata: Metadata = { title: "Asisten" };

export default async function Assistant({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { account, business } = await requireBusiness();
  if (!params.tanya) {
    const id =
      typeof params.percakapan === "string" &&
      uuidPattern.test(params.percakapan)
        ? params.percakapan
        : undefined;
    const scope = { businessId: business.id, token: account.token };
    try {
      const [initial, history, sales] = await Promise.all([
        id ? readConversation(scope, id) : null,
        conversationList(scope),
        businessSalesContext(params, true),
      ]);
      if (id && !initial)
        return (
          <p className="form-message" role="status">
            Percakapan tidak ditemukan.{" "}
            <a href="/asisten">Buka percakapan baru</a>.
          </p>
        );
      return (
        <ChatView
          key={id ?? "new"}
          initial={initial}
          initialId={id}
          history={history}
          demo={false}
          rangeLabel={
            sales.active ? formatRange(sales.active) : periodLabel(sales.period)
          }
          limited={!process.env.GEMINI_API_KEY}
          connection={
            chatModelStatus() === "ready"
              ? "Gemini siap digunakan. Ketersediaan diperiksa saat mengirim pesan."
              : chatModelStatus() === "billing"
                ? "Analisis usaha memakai data yang tersedia di RAMU."
                : "Analisis dasar aktif. Gemini belum dikonfigurasi."
          }
          filters={{
            periode:
              typeof params.periode === "string" ? params.periode : undefined,
            tampilan:
              typeof params.tampilan === "string" ? params.tampilan : undefined,
          }}
        />
      );
    } catch {
      return <AssistantLoadError href="/asisten" />;
    }
  }
  let data;
  try {
    data = await businessSales(params, true);
  } catch {
    const retry = assistantQuery({
      period: readPeriod(params, businessDate(business.timezone)),
      revisionId: typeof params.revisi === "string" ? params.revisi : undefined,
      intent: readIntent(params.tanya),
      pair: selectedProducts(params),
    });
    // Without explicit filters the active revision determines the initial period.
    if (!params.periode) retry.delete("periode");
    return <AssistantLoadError href={"/asisten?" + retry} />;
  }
  return <AssistantView scope="business" params={params} {...data} />;
}
