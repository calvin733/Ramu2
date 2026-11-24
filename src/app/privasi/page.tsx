import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kebijakan privasi" };

export default function Privacy() {
  return (
    <main className="policy-page">
      <Link href="/">RAMU</Link>
      <h1>Kebijakan privasi</h1>
      <p>
        Berlaku 23 November 2026. RAMU mengolah profil usaha, fakta penjualan
        yang diimpor, biaya, target, serta pertanyaan dan jawaban Asisten untuk
        menyediakan analisis usaha. Akun dan data usaha disimpan melalui
        Supabase dengan pembatasan akses menurut pemilik.
      </p>
      <h2>Login akun</h2>
      <p>
        RAMU mendukung login Google serta email dengan password khusus RAMU.
        Login email diverifikasi melalui Supabase Auth. Password tidak disimpan
        dalam tabel usaha, riwayat Asisten, atau penyimpanan browser RAMU.
        Password Gmail tidak diperlukan pada formulir RAMU. Login dengan Google
        diproses pada halaman Google.
      </p>
      <h2>Pendaftaran dan konfirmasi email</h2>
      <p>
        Pendaftaran dengan email memerlukan konfirmasi kepemilikan email melalui
        Supabase sebelum akun dapat digunakan. Pemeriksaan antispam menggunakan
        Cloudflare Turnstile; browser berinteraksi dengan Cloudflare dan token
        pemeriksaannya diteruskan ke Supabase untuk diverifikasi. Pengiriman
        ulang dibatasi. Alamat email yang menunggu konfirmasi disimpan sementara
        dalam cookie untuk membantu alur ini, bukan sebagai bukti bahwa akun
        sudah terverifikasi.
      </p>
      <h2>Pemahaman struktur spreadsheet</h2>
      <p>
        Untuk membantu menghubungkan sumber data, RAMU memakai Gemini untuk
        memahami judul kolom, nama tab yang disamarkan, dan pola tipe data. Isi
        sel transaksi, nominal penjualan, ID pesanan, nama pelanggan, dan token
        Google tidak dikirim pada proses ini. Judul yang memuat pola email,
        identitas atau key disamarkan. Jika ada makna yang belum jelas, pengguna
        dapat menjawab pertanyaan singkat. Jawaban bebas diproses hanya untuk
        memahami pilihan makna; hindari memasukkan data pribadi atau rahasia.
      </p>
      <p>
        Pengujian lokal struktur sintetis dapat menggunakan Gemini gratis, yang
        menurut ketentuan Google dapat memakai input dan respons untuk
        peningkatan produk dan peninjauan manusia. Pengelola dapat
        menonaktifkannya melalui konfigurasi GEMINI_IMPORT_ENABLED. Konfirmasi
        pengguna disimpan bersama pemetaan sumber yang diaktifkan agar tidak
        ditanyakan kembali saat struktur kolom tetap sama. Struktur ini berbeda
        dari pengiriman ringkasan penjualan pada fitur percakapan di bawah.
      </p>
      <h2>Pemrosesan percakapan oleh Gemini</h2>
      <p>
        Ketika Gemini diaktifkan, server mengirim pertanyaan yang sudah melalui
        penyamaran, hingga empat pasangan pertanyaan dan jawaban terakhir, alias
        produk, serta ringkasan fakta yang diperlukan. Nama usaha dan produk
        yang diketahui diganti dengan alias. RAMU menyaring pola umum email,
        nomor telepon, identitas, tautan, dan kredensial. Penyaringan tidak
        menjamin semua bentuk informasi pribadi dapat dikenali; hindari
        memasukkannya ke chat.
      </p>
      <p>
        File sumber, baris transaksi mentah, ID pesanan, kredensial akun, dan
        API key tidak dimasukkan ke isi prompt. Angka ringkasan usaha tetap
        dikirim agar penjelasan relevan. Untuk data usaha, pengelola harus
        menggunakan proyek Gemini dengan Cloud Billing aktif.
      </p>
      <p>
        Menurut ketentuan layanan berbayar Google, prompt dan respons tidak
        digunakan untuk meningkatkan produk Google. Google masih dapat menyimpan
        data secara terbatas untuk mendeteksi penyalahgunaan serta memprosesnya
        di berbagai negara. RAMU tidak menjanjikan penghapusan seketika atau
        tanpa retensi di penyedia.
      </p>
      <h2>Penyimpanan dan penghapusan percakapan</h2>
      <p>
        Percakapan akun disimpan agar dapat dibuka kembali, hingga 24 giliran
        per percakapan. Anda dapat menghapusnya dari Asisten; penghapusan ini
        menghapus percakapan aktif di RAMU, bukan salinan cadangan atau catatan
        penyedia di luar RAMU. Percakapan demo berada di penyimpanan sesi tab
        peramban. Penghapusan percakapan tidak menghapus sumber penjualan atau
        target usaha.
      </p>
      <h2>Pengujian dan pilihan penggunaan</h2>
      <p>
        Demo memakai data usaha sintetis. Gemini gratis diaktifkan secara
        eksplisit untuk demo lokal. Google dapat memakai prompt dan respons
        layanan gratis untuk meningkatkan produk dan peninjauan manusia. Jangan
        memasukkan data pribadi atau rahasia. Riwayat demo diverifikasi dengan
        tanda tangan server sebelum diteruskan sebagai konteks. Analisis dasar
        tersedia tanpa mengirim prompt ke Google saat Gemini tidak
        dikonfigurasi. Pengelola dapat menonaktifkan Gemini dengan menghapus API
        key dari konfigurasi server.
      </p>
      <p>
        <a
          href="https://ai.google.dev/gemini-api/terms"
          target="_blank"
          rel="noreferrer"
        >
          Pemrosesan data Gemini API
        </a>{" "}
        Ã‚Â· <Link href="/ketentuan">Ketentuan penggunaan RAMU</Link>
      </p>
      <Link className="button outline" href="/asisten">
        Buka Asisten
      </Link>
    </main>
  );
}
