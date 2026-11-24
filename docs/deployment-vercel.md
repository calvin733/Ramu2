# RAMU di Vercel: akun tester dan Google Sheets

Akun `test@gmail.com` dan profil Avara Mode Indonesia disimpan di Supabase. Deployment yang memakai proyek Supabase yang sama dapat menggunakan akun dan data aktif tersebut. Login email/password RAMU tidak memerlukan login Google; akses Google diperlukan saat memilih atau membaca ulang spreadsheet.

Dokumen ini adalah persiapan deployment, bukan bukti bahwa domain production telah diuji. Domain Vercel final belum diberikan. Perbaikan importer lokal tidak mengubah izin Google Cloud secara otomatis.

## Konfigurasi production

Gunakan satu domain HTTPS tetap untuk pengujian, misalnya `https://nama-proyek.vercel.app` (contoh, ganti dengan domain sebenarnya). Atur Root Directory `ramu-web` jika repositori berisi folder itu; gunakan framework Next.js dan Node.js yang memenuhi `engines` pada package.json.

Masukkan Environment Variables pada proyek Vercel, cakupan **Production**:

| Variabel                                                               | Isi                                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| RAMU_APP_URL                                                           | Origin domain production, misalnya https://nama-proyek.vercel.app; jangan localhost atau path halaman       |
| SUPABASE_URL                                                           | URL proyek Ramu yang sama                                                                                   |
| SUPABASE_PUBLISHABLE_KEY                                               | Publishable key proyek tersebut                                                                             |
| SUPABASE_SECRET_KEY                                                    | Secret server proyek tersebut, tidak memakai awalan NEXT_PUBLIC_                                            |
| GOOGLE_SHEETS_CLIENT_ID                                                | Client ID OAuth Web application untuk Sheets                                                                |
| GOOGLE_SHEETS_PICKER_KEY                                               | API key Google Picker                                                                                       |
| GOOGLE_SHEETS_PROJECT_NUMBER                                           | Project number numerik dari proyek Google Cloud yang sama                                                   |
| GEMINI_API_KEY, GEMINI_MODEL, GEMINI_SERVICE_TIER, GEMINI_DEMO_ENABLED | Sesuai mode Asisten yang memang ingin digunakan; jangan mengubah unpaid menjadi paid hanya untuk deployment |
| TURNSTILE_SITE_KEY                                                     | Diperlukan bila pendaftaran email publik diaktifkan; secret CAPTCHA disimpan di Supabase Auth               |

`.env.local` di laptop tidak otomatis menjadi Environment Variables Vercel. Setelah mengubah environment variable Vercel, buat deployment baru. Jangan mengunggah `.env.local`, kredensial tester, node_modules atau hasil build lokal ke repositori.

## Pengaturan satu kali oleh pengelola RAMU

Pengguna akhir cukup login Google dan memberi izin pada spreadsheet pilihan. Mereka tidak membuat Google Cloud project, OAuth client, API key, atau mendaftarkan diri sebagai Test user. Detail setup berikut hanya dikerjakan pengelola RAMU.

## Google Cloud

Pada proyek `ramu-dev-515616`, aktifkan Google Picker API dan Google Sheets API.

1. **Google Auth Platform > Clients > RAMU Sheets**: tambahkan origin production HTTPS ke Authorized JavaScript origins. Pertahankan localhost untuk pengembangan lokal. Origin harus cocok scheme, hostname, dan port; tidak memakai path atau wildcard. Client ID harus sama dengan konfigurasi Vercel. Alur Sheets saat ini memakai Google Identity Services token popup dan tidak memakai callback redirect aplikasi.
2. **Credentials > API key Picker**: website restrictions mencakup `https://nama-proyek.vercel.app/*` dan `https://docs.google.com/*`, serta localhost bila pengembangan lokal masih dipakai. Batasi API key ke Google Picker API. Ganti contoh domain dengan domain final.
3. **Audience**: untuk pengembangan berstatus Testing, gunakan akun penguji yang didaftarkan. Untuk pengguna umum, pengelola menyiapkan aplikasi External berstatus Published/Production, domain dan branding, serta verifikasi Google yang berlaku. Pengguna umum tidak perlu dimasukkan satu per satu sebagai Test user. Email login RAMU tidak otomatis menjadi akun Google pemilik spreadsheet.
4. Spreadsheet harus sudah dikonversi menjadi Google Sheets dan dapat dibuka oleh akun Google yang dipilih. File boleh tetap privat.

URL deployment Preview yang berubah tidak otomatis diizinkan Google. Untuk tes integrasi, gunakan domain pengujian yang tetap dan konfigurasi environment yang cocok dengan domain itu.

## Supabase dan CAPTCHA

Atur Site URL ke origin production dan izinkan `https://nama-proyek.vercel.app/auth/callback` pada Redirect URLs. Pertahankan callback lokal jika masih dibutuhkan. Callback Google ke Supabase tetap `https://qyegwniyzxyvsxftqcrb.supabase.co/auth/v1/callback`, berbeda dari callback aplikasi.

Jika Turnstile dipakai, daftarkan hostname production pada widget yang sesuai dan cocokkan site key aplikasi dengan secret di Supabase. Pendaftaran email publik masih memerlukan konfirmasi dan pengiriman SMTP yang benar. Panduan terpisah: [pendaftaran-email.md](pendaftaran-email.md).

## Perilaku data dan batas yang perlu dipahami

- Data yang sudah dikonfirmasi tersimpan di Supabase, sehingga tidak bergantung pada laptop tetap menyala atau filesystem Vercel yang persisten.
- Sheets dibaca ketika pengguna meminta impor atau pembaruan. Belum ada sinkronisasi otomatis di latar belakang. Token Google berumur pendek dipakai selama sesi impor; pengguna mungkin perlu memberikan izin lagi ketika memperbarui data.
- Akun tester cukup login RAMU untuk melihat data yang sudah aktif. Orang yang menghubungkan atau memperbarui Sheets memerlukan akses Google pada spreadsheet.
- Batas sumber saat ini 2 MB dan 5.000 baris per tab. Master lima tahun tidak otomatis diimpor. Tab RAMU_NOV_2026 adalah tampilan awal yang sesuai dengan batas tersebut.
- Limiter memori lokal bersifat per proses dan belum menjadi pembatas terdistribusi lintas instance Vercel. Ini perlu ditinjau sebelum membuka pendaftaran atau pemakaian publik luas.
- Mode Gemini unpaid tetap membatasi AI pada data contoh sintetis sesuai konfigurasi yang ada; deployment tidak otomatis mengubah kebijakan tersebut.

## Pemeriksaan sebelum dan sesudah deployment

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify:mvp
node scripts/verify-deployment.mjs --production
```

Preflight terakhir hanya memeriksa format/presensi konfigurasi pada environment tempat ia dijalankan; bukan membaca setting Google Cloud atau Vercel secara remote. Jika dijalankan lokal dengan RAMU_APP_URL masih localhost, mode production sengaja gagal. Gunakan environment production yang benar untuk mengeceknya, tanpa menimpa konfigurasi lokal secara sembarangan.

Sesudah deployment, verifikasi melalui domain final: login email tester, Dashboard, refresh halaman, Google Picker, pemilihan tab, pratinjau, konfirmasi, angka realisasi, pembaruan Sheets, logout dan login lagi. Sebelum konfirmasi sumber baru, data aktif terakhir harus tetap tampil. Lakukan tes Google nyata melalui browser; tes API simulasi tidak menggantikannya.

Kriteria awal AVARA November 2026: omzet Rp180.043.050, 430 pesanan selesai, 0 masalah pemetaan, jika spreadsheet belum diubah. Jangan menjanjikan bebas error sebelum alur ini lulus pada domain production.

Referensi resmi:

- https://vercel.com/docs/environment-variables
- https://developers.google.com/workspace/drive/picker/guides/web-picker
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://supabase.com/docs/guides/auth/redirect-urls

## Pemahaman kolom oleh Gemini

Alur baru dijelaskan di [ai-penghubung-data.md](ai-penghubung-data.md). Aktifkan GEMINI_IMPORT_ENABLED pada server. Mode production untuk sumber usaha memerlukan proyek Gemini dengan billing aktif dan GEMINI_SERVICE_TIER=paid; kode tidak mengaktifkan billing. Mode gratis lokal tetap untuk pengujian struktur sintetis. Seluruh setup ini dikerjakan pengelola, bukan pengguna akhir.
