import Link from "next/link";
import { redirect } from "next/navigation";
import { SetupShell } from "@/components/setup-shell";
import {
  businessKinds,
  businessZones,
  currentBusiness,
  requireAccount,
} from "@/server/account";
import { saveBusiness } from "./actions";

const zoneLabels = [
  "WIB (Asia/Jakarta)",
  "WITA (Asia/Makassar)",
  "WIT (Asia/Jayapura)",
];

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; status?: string }>;
}) {
  await requireAccount();
  const business = await currentBusiness();
  const { edit, status } = await searchParams;
  if (business && edit !== "1") redirect("/dashboard");
  return (
    <SetupShell step={1}>
      <h1>Profil usaha</h1>
      <p className="profile-intro">Mulai dari nama usaha Anda.</p>
      <form action={saveBusiness} className="profile-form">
        {status && (
          <p role="alert" className="form-message">
            {status === "invalid"
              ? "Periksa nama, jenis usaha, dan zona waktu."
              : "Profil belum tersimpan. Silakan coba lagi."}
          </p>
        )}
        <label>
          Nama usaha
          <input
            name="name"
            autoComplete="organization"
            required
            maxLength={100}
            placeholder="Nama usaha Anda"
            defaultValue={business?.name}
          />
          <small className="profile-hint">
            Nama ini ditampilkan di ringkasan.
          </small>
        </label>
        <label>
          Jenis usaha (opsional)
          <select name="kind" defaultValue={business?.kind ?? ""}>
            <option value="">Pilih jenis usaha</option>
            {businessKinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <div className="form-pair">
          <label>
            Mata uang
            <input readOnly value="Rupiah (IDR)" />
          </label>
          {business?.active_revision_id ? (
            <label>
              Zona waktu
              <input
                readOnly
                value={
                  zoneLabels[
                    businessZones.findIndex(
                      (zone) => zone === business.timezone,
                    )
                  ]
                }
              />
              <input type="hidden" name="timezone" value={business.timezone} />
              <small>
                Zona waktu mengikuti catatan penjualan yang sudah diaktifkan.
              </small>
            </label>
          ) : (
            <label>
              Zona waktu
              <select
                name="timezone"
                defaultValue={business?.timezone ?? businessZones[0]}
              >
                {businessZones.map((zone, index) => (
                  <option key={zone} value={zone}>
                    {zoneLabels[index]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="form-actions">
          <Link className="button quiet" href={business ? "/dashboard" : "/"}>
            Kembali
          </Link>
          <button className="button primary">
            <span className="account-web-copy">Hubungkan data</span>
            <span className="account-mobile-copy">Lanjut ke sumber data</span>
          </button>
        </div>
      </form>
    </SetupShell>
  );
}
