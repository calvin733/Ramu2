"use server";

import { redirect } from "next/navigation";
import {
  businessKinds,
  businessZones,
  currentBusiness,
  requireAccount,
} from "@/server/account";
import { supabaseRequest } from "@/server/supabase-http";

export async function saveBusiness(form: FormData) {
  const account = await requireAccount();
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const timezone = String(form.get("timezone") || businessZones[0]);
  if (
    !name ||
    name.length > 100 ||
    (kind && !businessKinds.some((option) => option === kind)) ||
    !businessZones.some((zone) => zone === timezone)
  )
    redirect("/pengaturan-awal/profil?edit=1&status=invalid");
  const existing = await currentBusiness(account);
  let saved = false;
  try {
    const path = existing
      ? `/rest/v1/businesses?id=eq.${existing.id}&owner_id=eq.${account.id}`
      : "/rest/v1/businesses";
    const values = { name, kind: kind || null, timezone };
    const response = await supabaseRequest(path, {
      method: existing ? "PATCH" : "POST",
      token: account.token,
      body: JSON.stringify(
        existing ? values : { ...values, owner_id: account.id },
      ),
    });
    saved = response.ok || (!existing && response.status === 409);
  } catch {
    // The form remains available when the profile service is temporarily offline.
  }
  if (!saved) redirect("/pengaturan-awal/profil?edit=1&status=retry");
  redirect("/pengaturan-awal/sumber");
}
