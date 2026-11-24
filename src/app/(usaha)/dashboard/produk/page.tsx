import { SalesDetail } from "@/components/sales-detail";
import type { SearchParams } from "@/domain/sales";

export default async function ProductSales({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <SalesDetail params={await searchParams} kind="product" />;
}
