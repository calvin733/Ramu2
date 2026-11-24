import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { DemoPreview } from "@/components/demo-preview";
import { InitialSplash } from "@/components/initial-splash";

export default function Home() {
  return (
    <InitialSplash>
      <div className="landing">
        <header>
          <Wordmark />
        </header>
        <main className="landing-grid">
          <div className="landing-copy">
            <h1>
              <span className="landing-web-title">
                Baca kondisi
                <br /> usahamu hari ini
              </span>
              <span className="landing-mobile-title">Kenali RAMU</span>
            </h1>
            <p className="landing-web-copy">
              Hubungkan catatan penjualan Anda. RAMU membantu membaca penjualan
              dan perubahan yang perlu diperhatikan.
            </p>
            <p className="landing-mobile-copy">
              Baca kondisi usaha hari ini dari catatan penjualan yang sudah Anda
              miliki.
            </p>
            <div className="landing-actions">
              <Link className="button account-register" href="/daftar">
                Daftar akun
              </Link>
              <Link className="button account-signin" href="/masuk">
                Masuk
              </Link>
              <Link className="button quiet demo-link" href="/demo">
                Coba data contoh
              </Link>
            </div>
          </div>
          <div className="landing-preview">
            <DemoPreview />
          </div>
        </main>
      </div>
    </InitialSplash>
  );
}
