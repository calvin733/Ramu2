import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "./brand";

export function SetupShell({
  step,
  children,
}: {
  step: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div className="setup-shell">
      <header className="setup-side">
        <Wordmark />
        <nav aria-label="Pengaturan awal">
          <ol>
            <li aria-current={step === 1 ? "step" : undefined}>
              <span>1</span>
              {step === 2 ? (
                <Link href="/pengaturan-awal/profil?edit=1">Profil usaha</Link>
              ) : (
                "Profil usaha"
              )}
            </li>
            <li aria-current={step === 2 ? "step" : undefined}>
              <span>2</span>Hubungkan data
            </li>
          </ol>
        </nav>
        <form action={signOut} className="setup-logout">
          <button className="button quiet" type="submit">
            Keluar akun
          </button>
        </form>
      </header>
      <main className="setup-main">{children}</main>
    </div>
  );
}
