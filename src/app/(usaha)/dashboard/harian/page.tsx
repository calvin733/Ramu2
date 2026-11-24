import { SalesDetail } from "@/components/sales-detail";
import type { SearchParams } from "@/domain/sales";

export default async function DailySales({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <SalesDetail params={await searchParams} kind="time" />;
}
