import { TargetHistory } from "@/components/target-views";
import type { SearchParams } from "@/domain/sales";

export default async function BusinessTargetHistory({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <TargetHistory scope="business" params={await searchParams} />;
}
