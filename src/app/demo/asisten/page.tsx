import type { Metadata } from "next";
import { AssistantView } from "@/components/assistant-view";
import { ChatView } from "@/components/chat-view";
import { demoSalesReport } from "@/demo/sales-report";
import { formatRange, type SearchParams } from "@/domain/sales";
import { uuidPattern } from "@/server/account";
import { chatModelStatus } from "@/server/chat-model";

export const metadata: Metadata = { title: "Asisten demo" };

export default async function AssistantDemo({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  if (!params.tanya) {
    const { report } = demoSalesReport(params);
    const id =
      typeof params.percakapan === "string" &&
      uuidPattern.test(params.percakapan)
        ? params.percakapan
        : undefined;
    return (
      <ChatView
        demo
        rangeLabel={
          report ? formatRange(report.active) : "Di luar cakupan data contoh"
        }
        key={id ?? "new"}
        initial={null}
        initialId={id}
        history={[]}
        limited
        connection={
          chatModelStatus(true) === "ready"
            ? "Gemini siap diuji dengan data contoh."
            : undefined
        }
        filters={{
          periode:
            typeof params.periode === "string" ? params.periode : undefined,
          tampilan:
            typeof params.tampilan === "string" ? params.tampilan : undefined,
        }}
      />
    );
  }
  return (
    <AssistantView scope="demo" params={params} {...demoSalesReport(params)} />
  );
}
