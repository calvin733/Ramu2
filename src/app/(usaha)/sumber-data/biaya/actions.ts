"use server";

import { revalidatePath } from "next/cache";
import { targetDate } from "@/domain/target-input";
import { daysBetween } from "@/domain/targets";
import { requireBusiness } from "@/server/account";
import { supabaseRequest } from "@/server/supabase-http";

function readCost(form: FormData, field: string) {
  const input = String(form.get(field) ?? "").trim();
  if (!input) return null;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(input)) return NaN;
  return Number(input.replaceAll(".", ""));
}

export async function savePeriodCost(
  _: { error?: string; saved?: boolean },
  form: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  const { business } = await requireBusiness();
  const start = targetDate(String(form.get("start") ?? ""));
  const end = targetDate(String(form.get("end") ?? ""));
  const hpp = readCost(form, "hpp");
  const expenses = readCost(form, "expenses");
  if (!start || !end || end < start || daysBetween(start, end) > 366)
    return {
      error: "Gunakan tanggal yang valid dan rentang maksimal 367 hari.",
    };
  if (
    (hpp === null && expenses === null) ||
    [hpp, expenses].some(
      (value) => value !== null && !Number.isSafeInteger(value),
    )
  )
    return {
      error:
        "Isi minimal satu nilai Rupiah bulat. Ketik 0 bila biayanya memang nol.",
    };
  try {
    const response = await supabaseRequest(
      "/rest/v1/business_period_costs?on_conflict=business_id,starts_on,ends_on",
      {
        admin: true,
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          business_id: business.id,
          starts_on: start,
          ends_on: end,
          cost_of_goods: hpp,
          operating_cost: expenses,
        }),
      },
    );
    if (!response.ok) throw new Error("Penyimpanan biaya gagal.");
  } catch {
    return {
      error: "Biaya belum dapat disimpan. Periksa koneksi dan coba lagi.",
    };
  }
  for (const path of [
    "/sumber-data/biaya",
    "/target-bisnis",
    "/dashboard",
    "/asisten",
  ])
    revalidatePath(path);
  return { saved: true as const };
}
