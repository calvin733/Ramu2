import type { Metadata } from "next";
import { AccountPage } from "@/components/account-page";
export const metadata: Metadata = { title: "Daftar akun" };
export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    lanjut?: string | string[];
    metode?: string | string[];
  }>;
}) {
  const { status, lanjut, metode } = await searchParams;
  return (
    <AccountPage
      register
      emailSignup={metode === "email"}
      status={status}
      lanjut={lanjut}
    />
  );
}
