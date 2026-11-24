import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { DemoShell } from "@/components/demo-shell";
import { requireBusiness } from "@/server/account";

export default async function BusinessLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { business } = await requireBusiness();
  const accountMenu = (
    <div className="account-menu">
      <Link href="/pengaturan-awal/profil?edit=1" className="button quiet">
        Profil usaha
      </Link>
      <form action={signOut}>
        <button className="button quiet" type="submit">
          Keluar akun
        </button>
      </form>
    </div>
  );
  return (
    <DemoShell businessName={business.name} accountMenu={accountMenu}>
      {children}
    </DemoShell>
  );
}
