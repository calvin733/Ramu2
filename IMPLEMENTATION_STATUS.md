# Hasil implementasi RAMU

Hasil pendaftaran email terbaru ada pada bagian **Pendaftaran email dan konfirmasi** di akhir dokumen. Hasil pemeriksaan tahap sebelumnya tetap dicatat pada bagian masing-masing.

Diperbarui 24 November 2026 (Asia/Jakarta). Acuan: `Prompt_Induk_RAMU_Integrasi_dan_Penyelesaian.md`. Aplikasi: `D:\Projects\Ramu\ramu-web`.

Implementasi lokal dan pemeriksaan yang dapat dijalankan sudah diselesaikan. Respons Gemini nyata, koneksi Sheets nyata, dan kompatibilitas ekspor vendor asli belum terbukti. Build berhasil tidak berarti siap produksi.

## Status tahap

| Tahap                  | Hasil                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit aktual           | Kode, konfigurasi tanpa mencetak rahasia, database dan Ubah target diperiksa. Folder kerja bukan repo Git; tidak ada commit/push.                                                                             |
| Supabase               | Enam migrasi diterapkan pada Ramu qyegwniyzxyvsxftqcrb melalui Calvin binus. Delapan tabel aplikasi dengan RLS. Empat skrip SQL regresi lulus pada database nyata dan di-rollback.                            |
| Login Google           | Pengguna mengonfirmasi berhasil mencapai profil usaha atau Dashboard di browser. Sesi, refresh, callback, profil, logout dan isolasi dua akun diperiksa dengan API simulasi.                                  |
| Sumber dan hitungan    | CSV/XLSX, pemetaan, pratinjau, aktivasi, ID unik, multiitem, retur, revisi dan kegagalan pembaruan diperiksa. Sheets memakai pipeline yang sama; uji izinnya masih simulasi.                                  |
| Dashboard/Target/biaya | Empat jenis target, cakupan, biaya kosong versus nol, countdown, hari jual, dialog dan konflik diperiksa. Riwayat mendapat rentang tanggal, reset dan kembali dengan filter tersimpan.                        |
| Demo Asisten           | Unpaid dengan fixture server diaktifkan. Memori pasangan pesan terverifikasi, konsep tanpa data, koreksi premis, token natural dan pemeriksaan klaim diperbarui. Data akun tidak diteruskan ke Gemini gratis. |
| Figma/responsif        | Referensi layar dan motion splash diperiksa; font, aset dan token dipertahankan. Layout 44/44 dan interaksi browser 12/12 lulus. Tidak mengklaim seluruh state identik secara piksel.                         |
| Verifikasi akhir       | 54 tes Node lulus. Status format, tipe, build dan integrasi final ada di tabel verifikasi. Batas layanan nyata dicatat terpisah.                                                                              |

## Database dan login nyata

Migrasi diterapkan berurutan, history remote sesuai file lokal:

1. 20261122040000_businesses_and_sales_imports.sql
2. 20261122050000_sales_source_management.sql
3. 20261122060000_business_targets.sql
4. 20261122070000_google_sheets_sources.sql
5. 20261123010000_period_costs_and_chat.sql
6. 20261123170634_harden_access_and_revision_indexes.sql

Database awal belum memiliki tabel aplikasi atau history migrasi. Versi metadata lima entri baru diselaraskan secara terjaga ke file lokal. Migrasi keenam menggunakan versi terbitan server, mencabut EXECUTE publik event trigger rls_auto_enable tanpa menghapus trigger, serta menambah tiga indeks foreign key revisi. CLI tidak tersedia dan registry npm tidak dapat dijangkau; penerapan memakai koneksi Supabase yang tersedia.

test/import-db.sql, test/target-db.sql, test/sheets-db.sql dan test/chat-costs-db.sql dijalankan pada proyek tersebut. Pemeriksaan akhir: **6 migrasi, 8 tabel aplikasi, 8 tabel dengan RLS, 0 pengguna sintetis regresi tertinggal**. Data pengguna tidak di-reset atau dihapus.

import_runs sengaja tidak memiliki policy pengguna: anon/authenticated tidak mempunyai akses langsung, server melakukan mutasi setelah otorisasi. Advisor SECURITY DEFINER terbuka dan foreign key tanpa indeks sudah ditangani. Advisor perlindungan password bocor masih nonaktif; RAMU memakai Google OAuth dan layanan berbayar tidak diaktifkan. INFO indeks belum digunakan bukan alasan menghapus indeks yang dibutuhkan.

Auth biasa kini hanya membutuhkan URL/publishable key; secret admin diperlukan terpisah untuk operasi istimewa. Cookie sesi menolak token kosong dan expiry tidak valid. Callback error tidak menukar code. Default zona waktu profil Asia/Jakarta. Keberhasilan Google interaktif berasal dari konfirmasi pengguna, bukan browser otomatis agen. Password, OTP dan key tidak dicetak.

## Perubahan dan cara mencoba

- **Sumber:** /sumber-data atau /demo/sumber-data. Excel/CSV dan ekspor marketplace melalui pemetaan dan pratinjau sebelum aktivasi. Sumber gagal tidak mengganti revisi aktif. Data dibatasi per usaha.
- **Dashboard:** /dashboard dan /demo. Grafik, rincian produk/harian, target dan chat berbagi perhitungan domain. Fixture November tetap Rp24.800.000 dari 328 pesanan. Bukti pesan akun mengacu pada revisi dan periode saat jawaban dibuat.
- **Target:** /target-bisnis atau /demo/target-bisnis. Dialog memakai nilai yang tersedia; editor langsung hanya membaca target yang diminta. Input dipertahankan saat gagal, dengan bantuan akhir bulan/tahun berdasarkan tanggal mulai yang diketik. Target laba menautkan kebutuhan biaya. Periode lampau/mendatang diberi penanda berbeda.
- **Riwayat:** /target-bisnis/riwayat atau /demo/target-bisnis/riwayat. Filter jenis, bulan/rentang tanggal akhir, status, urut dua arah, reset dan tampilkan berikutnya. Rentang mengacu pada tanggal akhir target. Kembali/simpan dari editor mempertahankan filter dan jumlah item terlihat.
- **Chat:** /demo/asisten. Coba penjualan bulan ini, pembanding bulan lalu, alasan turun, prioritas, daftar produk lalu rujukan kedua/pertama, target per hari, serta omzet versus laba lalu penjelasan lebih sederhana. Biaya kosong dijelaskan sebagai kebutuhan data. Premis penurunan yang bertentangan dengan angka dikoreksi.

Mode demo ditentukan endpoint server; boolean client yang berbeda ditolak. Maksimal empat pasangan pesan yang sudah tampil menjadi memori melalui receipt HMAC terikat sesi, thread, versi dan kedaluwarsa. History mentah, receipt palsu serta receipt sesi/thread lain ditolak. Konteks client tidak menjadi sumber fakta. Thread akun disimpan di Supabase dengan kontrol versi dan ID permintaan untuk retry.

Provider menerima alias dan ringkasan, tanpa file/baris transaksi/ID pesanan. Token nilai/label mendukung kalimat natural. Metrik, entitas, unit, periode, sumber perhitungan dan arah dibawa bersama fakta. Klaim salah, angka baru, beberapa bentuk jumlah dalam kata, token asing, HTML dan tautan ditolak. Ini tidak membuktikan seluruh makna bahasa; angka pendukung dan bukti tetap tersedia. Konsep, sapaan, penjualan, target dan batas data memiliki fallback lokal.

Chat mempertahankan pesan optimistis, status proses, Hentikan, retry dan draft. Gulir kini menyesuaikan langsung saat ResizeObserver mendeteksi perubahan; tidak terus menunda frame. Scroll anchoring bawaan thread dimatikan. Gulir manual tetap dihormati.

## Gemini gratis

Hanya GEMINI_DEMO_ENABLED di .env.local diubah menjadi true. Key serta variabel lain dipertahankan dan tidak dicetak; tier tetap unpaid. Billing tidak diaktifkan. Pricing resmi yang dibaca menyediakan free tier untuk gemini-3.1-flash-lite; akses/kuota key tetap harus dibuktikan oleh generateContent nyata.

Data akun dihitung di server RAMU dan disimpan di Supabase; prompt/fakta/history akun tidak dikirim ke Gemini dalam mode unpaid. Demo hanya untuk fixture sintetis dan pertanyaan nonrahasia. Pola sensitif umum diblokir sebelum provider, tetapi filter tidak menjamin semua rahasia terdeteksi. Pengungkapan layanan gratis diperbarui di chat, Privasi dan Ketentuan.

Limiter lokal: 6 giliran/menit/sesi demo, 12/menit/usaha, 60/menit/proses. Tidak ada retry provider berulang otomatis atau rotasi key. Limiter memori belum menjadi pembatas lintas instance untuk deployment publik.

## Figma dan aksesibilitas

File OdXELyzije2OpFLYC1GfOJ dibaca melalui sesi desain yang sama. Frame yang diperiksa: Masuk 88:2356, Profil 88:2395, Hubungkan data 88:2425, Dashboard web 88:2469/mobile 95:1284, Sumber 88:2543, produk 90:1105, harian 90:1126, Riwayat 222:3235, chat mobile 157:3845 dan splash 88:2731.

Manrope lokal, palet, hierarki, ikon dan aset dipertahankan. Screenshot Dashboard desktop/mobile dibandingkan dengan referensi. Layout 11 layar diuji pada 320/390/768/1440 px. Dialog, fokus kembali, batal/Escape, submit, konflik, chat, composer dan gulir diuji pada empat lebar. Focus visible, label, status tertulis dan reduced motion tersedia. Keyboard ponsel fisik dan pembaca layar belum diuji langsung.

Motion splash kini tanpa tagline. Outline dan isian muncul bertahap dengan easing yang lebih lembut; wordmark ramu memakai fade dan pergeseran 8 px selama 1,62 detik, di dalam satu siklus 3000 ms. Layar awal tetap menunggu minimal 3 detik, animasi selesai, serta font siap atau gagal. Frame akhir logo tetap terlihat bila sumber daya belum siap. Reduced motion tetap dihormati.

Perbedaan disengaja: rentang/reset riwayat, helper tanggal, pesan biaya, status provider dan pengungkapan demo gratis yang diminta dokumen. Konten dinamis mengikuti hitungan, termasuk pembulatan nominal, sehingga teks dapat berbeda dari angka statis Figma. Tidak ada pengukuran otomatis selisih piksel seluruh frame/state; kesesuaian sempurna seluruh UI belum dibuktikan.

## Regresi dan pengukuran

- Audit sebelumnya membuktikan editor langsung membaca daftar lagi: dua halaman, 630–644 ms dengan jeda API 300 ms. Sekarang satu target: pertama 320 ms, berikutnya 311 ms, masing-masing satu pembacaan. Ini route produksi lokal dengan API simulasi, bukan SLA/internet.
- Editor demo produksi: pertama 25 ms, berikutnya 9 ms. Integrasi final mengukur simpan target 16 ms dan chat dasar 8 ms; provider/database disimulasikan. Macet permanen Ubah target tidak berhasil direproduksi pada produksi terbaru.
- Development baru belum terukur lengkap: server pengguna sudah aktif, server kedua tidak dimulai dan proses pengguna tidak dihentikan. Probe localhost ditolak EACCES. Angka development historis di README bukan hasil sesi ini.
- Regresi origin sah versus host internal Next/port berbeda diuji; cross-site tetap ditolak. Pemeriksaan origin tidak dihapus untuk mengatasi “Asal permintaan tidak sesuai”.
- Gulir chat 390 px sempat gagal; setelah perbaikan ResizeObserver dan anchoring, 12 kombinasi interaksi lulus.

Repo lama tidak dijalankan/disalin ulang pada pelaksanaan ini. Fondasi chat sebelumnya telah mengadaptasi pola alias, fakta bertoken dan konteks terbatas dari repo lama; pekerjaan ini memperbaiki domain dan integrasi RAMU baru.

## Bukti verifikasi

| Pemeriksaan                 | Hasil dan batas                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| npm.cmd test                | 54/54 lulus, tanpa skip; domain, impor, auth, origin, target, biaya, konteks, grounding dan receipt demo.                                                                                                    |
| npm.cmd run lint            | Lulus setelah perubahan terakhir; hanya Prettier, bukan lint semantik.                                                                                                                                       |
| npm.cmd run typecheck       | Lulus; next typegen dan tsc --noEmit selesai.                                                                                                                                                                |
| npm.cmd run build           | Lulus; kompilasi, TypeScript, prerender, rute dinamis dan proxy selesai.                                                                                                                                     |
| npm.cmd run verify:mvp      | Lulus sesudah build final, termasuk kembali/simpan editor dengan filter riwayat. API Google/Supabase/Gemini simulasi, termasuk unpaid akun tanpa model, demo gratis, history lintas sesi dan input sensitif. |
| SQL Supabase nyata          | Empat skrip regresi lulus; rollback dan tidak ada identitas sintetis tertinggal.                                                                                                                             |
| Login Google nyata          | Berhasil ke profil/Dashboard menurut konfirmasi pengguna.                                                                                                                                                    |
| Browser Edge                | Layout 44/44, interaksi 12/12 lulus. Data API simulasi/halaman hasil render lokal.                                                                                                                           |
| npm.cmd run verify:services | Dicoba; ENOTFOUND domain Supabase dari runtime. Terpisah dari SQL melalui konektor dan login pengguna.                                                                                                       |
| npm.cmd run verify:gemini   | Dicoba dengan fixture unpaid; fallback jaringan sekitar 155 ms. Tidak ada generateContent berhasil; enam giliran provider nyata belum terbukti.                                                              |

## Kebutuhan yang tersisa

1. **Gemini nyata:** jalankan npm.cmd run verify:gemini dari terminal lokal dengan jaringan. Semua giliran harus provider: gemini. Skrip berhenti pada gagal/429 tanpa mencetak key. Sampai lulus, integrasi/fallback sudah diuji, provider nyata belum terverifikasi.
2. **Sheets:** GOOGLE_SHEETS_CLIENT_ID, GOOGLE_SHEETS_PICKER_KEY dan GOOGLE_SHEETS_PROJECT_NUMBER masih kosong saat audit. Ikuti README untuk API, origin, akun penguji dan scope. Login Google tidak otomatis mengonfigurasi Sheets. CSV/XLSX tetap tersedia.
3. **Vendor:** diperlukan satu ekspor Shopee dan Moka yang diizinkan/disamarkan. Pemetaan sintetis lulus, format vendor sesungguhnya belum dijamin. Tautan help Moka lama tidak dapat dibuka saat audit; petunjuk menu perlu dicocokkan dengan Backoffice yang dipakai.

Tidak ada deploy publik, aktivasi billing, perubahan proyek Supabase lain atau penghapusan data pengguna. Production tetap tahap tersendiri sesuai dokumen.

## Penyempurnaan splash dan Hubungkan data

- Tagline splash dihapus, logo dipusatkan, dan wordmark muncul lebih bertahap tanpa efek blur. Durasi minimum 3 detik dipertahankan.
- Konflik aturan tiga kolom pada pilihan sumber pengaturan diperbaiki. Pilihan Sheets/Excel kini bertumpuk; container query memindahkan aksi ke bawah teks ketika ruang kartu sempit, termasuk pada zoom. Footer Kembali, Coba data contoh dan Hubungkan nanti dirapikan. Alur impor tetap memakai komponen yang sama.
- Pemeriksaan terfokus memakai komponen aktual dan API impor simulasi: tujuh lebar viewport, zoom 150%/200%, dialog Sheets/file, panduan marketplace, serta sampel keyframe splash. Sebanyak 22 pemeriksaan browser lulus (11 normal dan 11 reduced motion). Pemeriksaan format tiga file yang diubah, TypeScript, dan build produksi lulus; build sempat terkena EPERM direktori output Windows lalu berhasil pada pengulangan tanpa perubahan kode. Lint seluruh folder masih menandai format README.md dan docs/pendaftaran-email.md, yang tidak diubah pada penyempurnaan UI ini.

## Pendaftaran email dan konfirmasi

Pendaftaran melalui **Daftar dengan email** kini mencakup email, password dan konfirmasi password, halaman **Periksa email Anda**, serta kirim ulang dengan jeda. Email baru belum mendapatkan sesi RAMU sebelum konfirmasi berhasil. Tujuan halaman internal dipertahankan ketika pengguna mencoba masuk sebelum verifikasi.

Server mewajibkan CAPTCHA native Supabase dan konfirmasi email sebelum menerima signup/resend. Token Turnstile diteruskan untuk validasi Supabase; secret key tidak dikirim ke aplikasi. Batas lokal signup/resend: jeda 60 detik, tiga permintaan per email per jam, dan 30 permintaan per proses per jam. Pembatas ini masih berupa memori lokal, ditambah perlindungan Supabase.

Key Turnstile belum disediakan pengguna. Status lokal pemeriksaan kesiapan adalah `captcha-key`, sehingga pendaftaran email diblokir sampai konfigurasi lengkap. Provider email aktif dan auto-confirm nonaktif pada pemeriksaan proyek Ramu. Pengiriman email nyata belum diuji; tester di luar tim organisasi memerlukan Custom SMTP. Panduan lengkap: [docs/pendaftaran-email.md](docs/pendaftaran-email.md).

- `npm.cmd test`: **65/65 lulus**, tanpa skip, termasuk validasi signup, CAPTCHA, konfirmasi wajib, batas permintaan dan penolakan sesi prematur.
- Build produksi dan pemeriksaan TypeScript lulus. Prerender sempat gagal dengan EPERM direktori output Windows; build selesai memakai satu worker sementara. Pengaturan jumlah worker tidak dipertahankan pada konfigurasi proyek.
- `npm.cmd run verify:mvp`: lulus pada build produksi dengan API simulasi, termasuk signup, akun belum terverifikasi, login yang ditolak, cooldown resend, callback PKCE, tujuan internal, logout dan resend generik. Ini tidak membuktikan pengiriman email atau widget CAPTCHA nyata.
- Render HTTP lokal halaman daftar, formulir email, verifikasi dan masuk berhasil. Interaksi browser dengan widget Turnstile serta pengiriman ke inbox masih menunggu key dan SMTP.
