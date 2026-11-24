"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, uuidPattern } from "@/server/account";
import { supabaseRequest } from "@/server/supabase-http";

export async function setSourcePaused(revision: string, paused: boolean) {
  const { account, business } = await requireBusiness();
  if (
    !uuidPattern.test(revision) ||
    revision !== business.active_revision_id ||
    typeof paused !== "boolean"
  )
    return { error: "Sumber aktif berubah. Muat ulang halaman dan coba lagi." };
  try {
    const response = await supabaseRequest(
      "/rest/v1/rpc/ramu_set_source_paused",
      {
        method: "POST",
        admin: true,
        body: JSON.stringify({
          p_owner: account.id,
          p_business: business.id,
          p_revision: revision,
          p_paused: paused,
        }),
      },
    );
    if (response.status === 409)
      return {
        error: "Sumber aktif berubah. Muat ulang halaman dan coba lagi.",
      };
    if (!response.ok) throw new Error("Perubahan sumber gagal.");
    revalidatePath("/dashboard");
    revalidatePath("/asisten");
    revalidatePath("/sumber-data");
    revalidatePath("/sumber-data/kelola");
    return { paused };
  } catch {
    return { error: "Status sumber belum dapat dikonfirmasi. Coba lagi." };
  }
}
