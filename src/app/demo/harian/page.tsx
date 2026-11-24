import type { Metadata } from "next";
import { SalesDetail } from "@/components/sales-detail";
import type { SearchParams } from "@/domain/sales";
export const metadata: Metadata = { title: "Rincian penjualan demo" };

export default async function Detail({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <SalesDetail params={await searchParams} kind="time" scope="demo" />;
}
