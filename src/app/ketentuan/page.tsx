import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ketentuan penggunaan" };

export default function Terms() {
  return (
    <main className="policy-page">
      <Link href="/">RAMU</Link>
      <h1>Ketentuan penggunaan</h1>
      <p>
        Berlaku 23 November 2026. RAMU membantu pemilik usaha memahami catatan
        penjualan, biaya, dan target. Fitur yang memakai Gemini ditujukan untuk
        pengguna berusia minimal 18 tahun dan penggunaan usaha atau profesional
        di wilayah yang didukung Google.
      </p>
      <h2>Data dan tanggung jawab pengguna</h2>
      <p>
        Gunakan data yang Anda miliki atau berhak Anda olah. Jangan mengirim
        kata sandi, API key, nomor rekening, identitas pelanggan, atau informasi
        pribadi melalui percakapan. Jangan menggunakan layanan untuk aktivitas
        ilegal, menipu, melanggar hak pihak lain, atau melewati pengamanan
        penyedia AI.
      </p>
      <h2>Jawaban Asisten</h2>
      <p>
        RAMU menghitung angka dari data yang tersedia. Gemini dapat membantu
        merangkai penjelasan dan saran. Jawaban AI dapat keliru, termasuk dalam
        menafsirkan sebab atau konteks. Periksa angka pendukung, cakupan
        periode, serta catatan usaha sebelum mengambil keputusan. Asisten tidak
        melakukan perubahan target atau transaksi melalui pesan.
      </p>
      <h2>Ketersediaan layanan</h2>
      <p>
        Koneksi, kuota, serta layanan Google dan Supabase dapat memengaruhi
        fitur. RAMU memakai analisis dasar ketika Gemini tidak tersedia atau
        jawabannya tidak lolos pemeriksaan. Keberhasilan usaha dan ketersediaan
        tanpa gangguan tidak dijanjikan.
      </p>
      <h2>Layanan Google</h2>
      <p>
        Pada tahap lokal ini, data usaha asli dihitung di RAMU dan tidak dikirim
        ke Gemini. Pemrosesan data usaha asli melalui Gemini memerlukan layanan
        berbayar dengan Cloud Billing aktif. Layanan gratis hanya boleh
        digunakan untuk pengujian data sintetis tanpa informasi pribadi atau
        rahasia. Ketentuan Google dan kebijakan penggunaan yang berlaku tetap
        harus dipatuhi.
      </p>
      <p>
        <a
          href="https://ai.google.dev/gemini-api/terms"
          target="_blank"
          rel="noreferrer"
        >
          Ketentuan Gemini API
        </a>{" "}
        · <Link href="/privasi">Kebijakan privasi RAMU</Link>
      </p>
      <Link className="button outline" href="/asisten">
        Buka Asisten
      </Link>
    </main>
  );
}
