import { TargetHistory } from "@/components/target-views";
import type { SearchParams } from "@/domain/sales";

export default async function DemoTargetHistory({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <TargetHistory scope="demo" params={await searchParams} />;
}
