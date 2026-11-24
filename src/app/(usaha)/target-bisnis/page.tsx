import { TargetOverview } from "@/components/target-views";
import type { SearchParams } from "@/domain/sales";

export default async function BusinessTargetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <TargetOverview scope="business" params={await searchParams} />;
}
