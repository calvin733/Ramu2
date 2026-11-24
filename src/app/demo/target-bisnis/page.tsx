import { TargetOverview } from "@/components/target-views";
import type { SearchParams } from "@/domain/sales";

export default async function DemoTargetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <TargetOverview scope="demo" params={await searchParams} />;
}
