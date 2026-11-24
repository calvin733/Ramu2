"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { targetInput, type TargetActionState } from "@/domain/target-input";
import type { ManagedTarget } from "@/domain/targets";
import { targetReturn } from "@/domain/target-history";
import { requireBusiness, uuidPattern } from "@/server/account";
import {
  businessTargets,
  writeBusinessTarget,
} from "@/server/business-targets";
import {
  demoTargetId,
  readDemoTargets,
  writeDemoTargets,
} from "@/server/demo-targets";

export async function changeTarget(
  scope: "business" | "demo",
  _state: TargetActionState,
  form: FormData,
): Promise<TargetActionState> {
  const demo = scope === "demo";
  if (!demo) await requireBusiness();
  const id = String(form.get("id") ?? "");
  const rawVersion = String(form.get("version") ?? "");
  const version = rawVersion === "" ? null : Number(rawVersion);
  if (
    !(demo ? demoTargetId : uuidPattern).test(id) ||
    (version !== null &&
      (!/^\d+$/.test(rawVersion) ||
        !Number.isSafeInteger(version) ||
        version <= 0 ||
        version > 2147483647))
  )
    return { error: "Target tidak valid. Muat ulang halaman dan coba lagi." };
  const operation = form.get("operation") ?? "save";
  let target: Omit<ManagedTarget, "id" | "version"> | undefined;
  if (operation === "save") {
    const parsed = targetInput(form);
    if (!("target" in parsed)) return parsed;
    target = parsed.target;
  } else if (
    (operation !== "primary" && operation !== "delete") ||
    version === null
  ) {
    return { error: "Perubahan target tidak valid." };
  }

  const changed = "Target sudah berubah. Muat ulang halaman sebelum menyimpan.";
  const home = demo ? "/demo/target-bisnis" : "/target-bisnis";
  const dashboard = demo ? "/demo" : "/dashboard";
  try {
    const all = demo
      ? await readDemoTargets()
      : operation === "primary"
        ? await businessTargets()
        : [];
    const stored = all.find((item) => item.id === id);
    if (operation === "primary") {
      if (!stored || stored.version !== version) return { error: changed };
      target = { ...stored, primary: true };
    }

    if (demo) {
      if (version === null && stored) {
        // A repeat submission for a newly created target preserves the saved target.
      } else {
        if (version !== null && stored?.version !== version) {
          if (stored || operation !== "delete") return { error: changed };
        }
        const updated = all
          .filter((item) => item.id !== id)
          .map((item) =>
            target?.primary && item.primary
              ? { ...item, primary: false, version: item.version + 1 }
              : item,
          );
        if (target)
          updated.push({ ...target, id, version: (version ?? 0) + 1 });
        const error = await writeDemoTargets(updated);
        if (error) return { error };
      }
    } else {
      const error = await writeBusinessTarget(id, version, target);
      if (error) return { error };
    }
  } catch {
    return { error: "Perubahan target belum dapat disimpan. Coba lagi." };
  }
  revalidatePath(home);
  revalidatePath(home + "/riwayat");
  revalidatePath(dashboard);
  const saved = operation === "delete" ? "dihapus" : "disimpan";
  if (form.get("tampilan-editor") === "dialog") return { saved };
  const destination = new URL(
    targetReturn(form.get("kembali"), home),
    "https://ramu.invalid",
  );
  destination.searchParams.set("hasil", saved);
  redirect(destination.pathname + destination.search);
}
