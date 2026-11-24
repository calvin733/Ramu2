import Link from "next/link";
import { SetupShell } from "@/components/setup-shell";
import { SourceOptions } from "@/components/source-options";
import { requireBusiness } from "@/server/account";
import { googleSheetsConfig } from "@/server/import/google-sheets";

export default async function SetupSource() {
  await requireBusiness();
  return (
    <SetupShell step={2}>
      <h1>Hubungkan data</h1>
      <SourceOptions setup sheetsConfig={googleSheetsConfig()} />
      <div className="setup-source-footer">
        <Link href="/pengaturan-awal/profil?edit=1" className="button quiet">
          Kembali
        </Link>
        <Link href="/demo" className="button outline source-demo-link">
          Coba data contoh
        </Link>
        <Link href="/dashboard" className="button quiet source-skip-link">
          Hubungkan nanti
        </Link>
      </div>
    </SetupShell>
  );
}
