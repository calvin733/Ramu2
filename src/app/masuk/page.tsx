import type { Metadata } from "next";
import { AccountPage } from "@/components/account-page";
export const metadata: Metadata = { title: "Masuk" };
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    lanjut?: string | string[];
  }>;
}) {
  const { status, lanjut } = await searchParams;
  return <AccountPage status={status} lanjut={lanjut} />;
}
