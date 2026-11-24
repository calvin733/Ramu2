import { TargetEditor } from "@/components/target-views";
import type { SearchParams } from "@/domain/sales";

export default async function EditDemoTarget({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return (
    <TargetEditor
      scope="demo"
      id={(await params).id}
      params={await searchParams}
    />
  );
}
