import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginDestination } from "@/domain/login-destination";
import {
  sessionCookies,
  supabaseConfig,
  supabaseRequest,
} from "./supabase-http";

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const businessZones = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
] as const;
export const businessKinds = [
  "Makanan & minuman",
  "Ritel",
  "Jasa",
  "Lainnya",
] as const;

export type Business = {
  id: string;
  name: string;
  kind: string | null;
  timezone: string;
  active_revision_id: string | null;
};

export const currentAccount = cache(async () => {
  const token = (await cookies()).get(sessionCookies.access)?.value;
  if (!token || !supabaseConfig()) return null;
  const response = await supabaseRequest("/auth/v1/user", { token });
  if ([400, 401, 403].includes(response.status)) return null;
  if (!response.ok) throw new Error("Layanan akun RAMU sedang tidak tersedia.");
  const user = await response.json();
  if (typeof user.id !== "string" || !uuidPattern.test(user.id)) return null;
  return { id: user.id as string, token };
});

export const currentBusiness = cache(
  async (
    knownAccount?: NonNullable<Awaited<ReturnType<typeof currentAccount>>>,
  ) => {
    const account = knownAccount ?? (await currentAccount());
    if (!account) return null;
    const response = await supabaseRequest(
      `/rest/v1/businesses?owner_id=eq.${account.id}&select=id,name,kind,timezone,active_revision_id`,
      { token: account.token },
    );
    if (!response.ok) throw new Error("Profil usaha belum dapat dimuat.");
    const businesses = (await response.json()) as Business[];
    return businesses[0] ?? null;
  },
);

export async function requireAccount() {
  const account = await currentAccount();
  if (!account) {
    const destination = loginDestination(
      (await headers()).get("x-ramu-destination"),
    );
    redirect(
      destination
        ? "/masuk?" + new URLSearchParams({ lanjut: destination })
        : "/masuk",
    );
  }
  return account;
}

export async function requireBusiness() {
  const account = await requireAccount();
  const business = await currentBusiness(account);
  if (!business) redirect("/pengaturan-awal/profil");
  return { account, business };
}

export type BusinessScope = Awaited<ReturnType<typeof requireBusiness>>;
