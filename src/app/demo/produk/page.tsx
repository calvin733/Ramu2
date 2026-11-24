import type { Metadata } from "next";
import { SalesDetail } from "@/components/sales-detail";
import type { SearchParams } from "@/domain/sales";

export const metadata: Metadata = { title: "Rincian produk demo" };

export default async function DemoProducts({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <SalesDetail kind="product" scope="demo" params={await searchParams} />
  );
}
