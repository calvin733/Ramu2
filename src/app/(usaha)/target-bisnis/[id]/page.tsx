import { TargetEditor } from "@/components/target-views";
import type { SearchParams } from "@/domain/sales";

export default async function EditBusinessTarget({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return (
    <TargetEditor
      scope="business"
      id={(await params).id}
      params={await searchParams}
    />
  );
}
