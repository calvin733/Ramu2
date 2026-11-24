# RAMU Web

RAMU untuk UMKM menggabungkan sumber penjualan, Dashboard, target, biaya, dan Asisten. Demo Roti & Cerita dapat dibuka tanpa akun dan tanpa konfigurasi Supabase.

## Menjalankan di Windows

Gunakan Node.js 24 atau lebih baru. Jalankan di PowerShell:

```powershell
Set-Location 'D:\Projects\Ramu\ramu-web'
npm.cmd ci
npm.cmd run dev
```

Buka [http://localhost:3000](http://localhost:3000), lalu pilih **Coba data contoh**. Bulanan dan Tahunan memakai alamat yang menyimpan pilihan periode. Aksi rincian membuka tabel untuk periode yang sama.

Jika Next.js memilih port lain, buka alamat yang tertera di terminal. Validasi chat memakai origin browser dan header Host beserta port permintaan, sehingga alamat internal server tidak menolak akses lokal yang sah. Permintaan dari origin lain tetap ditolak. `RAMU_APP_URL` tetap perlu disesuaikan untuk konfigurasi login dan callback OAuth.

## Menjalankan alur akun dan impor

1. Siapkan proyek Supabase khusus RAMU. Jalankan migrasi di `supabase/migrations` secara berurutan. Pada instalasi Tahap 06, tambahkan `20261123010000_period_costs_and_chat.sql` untuk riwayat Asisten/biaya dan `20261123170634_harden_access_and_revision_indexes.sql` untuk pembatasan fungsi serta indeks. Seluruh enam migrasi sudah diterapkan pada proyek development Ramu; jangan menjalankannya ulang secara buta. Instalasi yang lebih lama perlu menjalankan semua migrasi yang belum diterapkan.
2. Buat `.env.local` dari `.env.example`. Isi `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, dan `RAMU_APP_URL` sesuai origin aplikasi. Kunci privat hanya digunakan pada server untuk mengubah impor, sumber, dan target. Jangan simpan `.env.local` di Git.
3. Aktifkan provider Google pada Supabase Auth. Di Google Cloud, daftarkan callback Supabase `https://<project-ref>.supabase.co/auth/v1/callback`. Di Supabase Auth, daftarkan `http://localhost:3000/auth/callback` dan URL callback HTTPS aplikasi untuk lingkungan yang digunakan. [Panduan konfigurasi Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
4. Jalankan ulang aplikasi. Pilih **Masuk dengan Google**, buat profil usaha, lalu pilih **Excel / CSV**. Gunakan contoh berikut dengan dasar **Total per baris / item**.

```csv
Tanggal,Nilai Penjualan,ID Pesanan,Produk,Status
2026-11-17,50000,00042,Brownies,Selesai
2026-11-18,25000,00043,Roti,Selesai
```

Pratinjau menampilkan Rp75.000 dari dua pesanan. Pilih **Gunakan sumber ini**, lalu lihat Dashboard usaha. Filter tersimpan di URL. Tautan rincian membawa periode dan ID revisi, sehingga bukti yang sudah dibuka tetap mengacu pada file yang sama setelah sumber diperbarui.

- Gunakan **Perbarui data** untuk mengunggah file dalam format yang sama atau membaca ulang tab Google Sheets aktif. Gunakan **Kelola sumber Ã¢â€ â€™ Ganti sumber** untuk berpindah format, spreadsheet, atau tab. Setiap konfirmasi membuat satu revisi utuh dengan cakupan sendiri.
- **Nonaktifkan sumber** menghentikan pembaruan sumber itu. Dashboard tetap menampilkan data terakhir. **Aktifkan kembali sumber** membuka pembaruan berikutnya. Jika impor gagal, data yang aktif tetap tersedia.
- Hari kosong dalam cakupan impor bernilai nol. Periode berjalan memakai data hingga tanggal tercakup terakhir pada kalender usaha. Jika periode lampau belum lengkap atau pembanding tidak tercakup, persentase perubahan tidak ditampilkan. ID pesanan dihitung unik sepanjang periode. Rincian produk membutuhkan nama produk dan nilai yang dapat dialokasikan ke item.

## Pendaftaran email dengan konfirmasi dan CAPTCHA

Halaman **Daftar** menyediakan **Daftar dengan email**, dengan formulir di `/daftar?metode=email` dan halaman konfirmasi `/daftar/verifikasi`. Akun baru belum memperoleh sesi sebelum email diverifikasi. Kirim ulang memiliki jeda 60 detik serta batas permintaan.

Isi `TURNSTILE_SITE_KEY` di `.env.local`, lalu aktifkan provider Turnstile pada perlindungan CAPTCHA Supabase menggunakan secret key dari widget yang sama. Pertahankan **Confirm email** aktif. Sebelum itu selesai, pendaftaran email diblokir; Google dan login akun lama tetap tersedia selama konfigurasi layanan yang dibutuhkannya aktif.

[Panduan aktivasi lengkap, SMTP, dan pengujian](docs/pendaftaran-email.md).

Jalankan `node scripts/verify-signup.mjs` untuk memeriksa site key, kewajiban konfirmasi email, dan CAPTCHA native. Pemeriksaan memakai email yang tidak valid sehingga tidak membuat akun atau mengirim email. Pengiriman ke inbox membutuhkan uji nyata terpisah; SMTP bawaan Supabase hanya mengizinkan alamat anggota tim dan memiliki batas kecil, sehingga penguji di luar tim memerlukan Custom SMTP.

## Login email untuk tester

Halaman `/masuk` menerima email dan **password khusus RAMU** melalui Supabase Auth. Password Gmail tidak digunakan. Google tetap tersedia sebagai pilihan login terpisah dan sekarang memakai `prompt=select_account`, sehingga pemilih akun ditampilkan saat alur Google dimulai. Jika masih masuk ke RAMU, pilih **Keluar akun** terlebih dahulu untuk mengganti akun.

Untuk membuat akun tester sekali tanpa mengharuskan tester membuka email atau login Google:

1. Di proyek Supabase **Ramu**, buka **Authentication â†’ Users â†’ Add user â†’ Create new user**. Isi email tester dan password khusus RAMU, lalu aktifkan **Auto Confirm User** untuk akun uji yang Anda kelola. Ini tidak mengubah pengaturan konfirmasi email semua pengguna.
2. Alternatif melalui skrip lokal: tambahkan `RAMU_TESTER_EMAIL` dan `RAMU_TESTER_PASSWORD` ke `.env.local`, gunakan password khusus minimal 12 karakter, lalu jalankan `node scripts/create-tester.mjs`. Skrip dibatasi pada proyek development `qyegwniyzxyvsxftqcrb`, hanya membuat akun baru, dan tidak mengganti password akun yang sudah ada. Secret key digunakan di server lokal saja.
3. Hapus kedua variabel tester setelah akun berhasil dibuat. Bagikan email dan password RAMU kepada penguji melalui saluran privat. Password tidak dicetak oleh skrip atau disimpan dalam arsip kode.
4. Tester membuka `/masuk`, mengisi email/password RAMU, lalu masuk ke profil usaha jika baru atau ke Dashboard jika profil sudah ada. Refresh sesi dan logout memakai mekanisme yang sama dengan login Google.

Akun yang dibuat lewat Google belum otomatis mempunyai password RAMU. Jangan memakai password Gmail untuk mengisi formulir RAMU; buat akun tester terpisah. Pendaftaran umum juga dapat melalui email setelah CAPTCHA dan pengiriman email siap; pengguna umum tetap wajib mengonfirmasi email. Akun tester yang dibuat lewat administrasi dengan Auto Confirm adalah pengecualian khusus pengujian yang dikelola pengelola.

Pembatas percobaan lokal melengkapi batas Supabase Auth; pembatas memori proses bukan pembatas terdistribusi untuk banyak instance. Periksa pengaturan [kekuatan password dan perlindungan password bocor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) sebelum pengujian publik.

## Google Sheets

1. Di satu proyek Google Cloud, aktifkan Google Picker API dan Google Sheets API. Siapkan Google Auth Platform dan tambahkan akun penguji jika aplikasi masih dalam mode Testing. [Panduan Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker)
2. Buat OAuth client bertipe **Web application** untuk koneksi Sheets. Daftarkan origin `http://localhost:3000` dan origin HTTPS aplikasi di **Authorized JavaScript origins**. Masukkan client ID ke `GOOGLE_SHEETS_CLIENT_ID` dan nomor proyek numerik ke `GOOGLE_SHEETS_PROJECT_NUMBER`. Izin spreadsheet diminta lewat pop-up terpisah dari login RAMU.
3. Buat API key untuk Picker dan masukkan ke `GOOGLE_SHEETS_PICKER_KEY`. Batasi kunci ke Google Picker API dan origin web yang diperlukan. Jika memakai pembatasan website, sertakan juga `https://docs.google.com/*` untuk iframe Picker. Jalankan ulang aplikasi setelah mengisi konfigurasi.
4. Dari **Sumber data**, buka **Google Sheets**, pilih spreadsheet, lalu tab penjualan. Periksa pemetaan dan pratinjau sebelum memilih **Gunakan sumber ini**. Gunakan baris pertama yang terisi untuk judul kolom, tanggal ISO atau DMY yang konsisten, dan format teks untuk ID dengan nol di depan.
5. Setelah mengedit spreadsheet, pilih **Perbarui data** untuk membaca ulang tab yang sama. Jika akses berubah, pilih **Hubungkan ulang** dan pilih kembali spreadsheet tersebut. Bila tab telah dihapus, gunakan **Ganti sumber** untuk memilih tab lain.

RAMU meminta izin `drive.file` lewat Google Picker dan membaca tab melalui Sheets API. Token akses berumur pendek berada dalam memori selama sesi impor. Kredensial OAuth untuk Sheets tidak disimpan di database. Google Sheets dibaca saat pengguna meminta impor atau pembaruan. Jika akses habis atau impor batal, revisi yang terakhir dikonfirmasi tetap tampil. [Model token Google](https://developers.google.com/identity/oauth2/web/guides/use-token-model) Ã‚Â· [Sheets API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGetByDataFilter)

## Laporan Shopee dan Moka

| Sumber | Ekspor dan impor                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shopee | Buka **Seller Centre Ã¢â€ â€™ Pesanan Saya**, atur tanggal, lalu ekspor laporan pesanan. Impor Excel atau CSV. Petakan tanggal, nilai, ID, dan status pesanan. Jika nominal yang sama berulang pada beberapa item dari satu pesanan, pilih **Total per pesanan**.  |
| Moka   | Buka **Backoffice Ã¢â€ â€™ Reports Ã¢â€ â€™ Transactions**, pilih outlet dan tanggal, lalu pilih **Export**. Ekstrak ZIP jika muncul dan pilih Excel atau CSV yang berisi rincian transaksi. Petakan tanggal transaksi, nilai, ID struk, dan status bila tersedia. |

Pilih **Marketplace / kasir** di RAMU untuk membuka panduan dan mengunggah file. Pemetaan vendor dilakukan manual. Uji memakai contoh sintetis karena file asli yang diizinkan atau disamarkan belum tersedia. [Shopee Seller Centre](https://seller.shopee.co.id/) Ã‚Â· [Panduan Moka](https://help.mokapos.com/materi-10-melihat-analisis-dashboard-dan-reports-di-backoffice)

## Target Bisnis

- Pilih **Tambah target**, kemudian pilih Omzet, Jumlah pesanan, Laba kotor, atau Laba bersih. Ketik nilai bulat positif serta tanggal mulai dan selesai. Tanggal bisa diketik sebagai DD/MM/YYYY atau delapan angka.
- **Ubah target** di Dashboard atau Target Bisnis membuka dialog dengan nilai dan versi yang sudah dimuat. Simpan memperbarui kartu sambil mempertahankan periode. Batal dan Escape mengembalikan fokus ke pemicu. Konflik versi tetap terlihat di dialog.
- Target aktif tampil di Dashboard jika beririsan dengan periode terpilih. Realisasi memakai seluruh rentang target yang sudah tercakup. Cakupan parsial menampilkan realisasi sementara dan tanggal data terakhir. Status riwayat dan saran harian membutuhkan cakupan yang cukup.
- Sisa hari jual dapat diisi manual, termasuk nol untuk meniadakan saran harian. Angka yang dipakai dibatasi pada hari kalender tersisa. Target laba dapat disimpan dan menampilkan kebutuhan HPP atau biaya usaha sampai data terkait tersedia.
- Riwayat memakai revisi penjualan yang sedang aktif. Pengguna dapat memfilter jenis, bulan atau rentang tanggal berakhir, serta status. Reset menghapus filter dan navigasi editor mempertahankan pilihan. Pengurutan berdasarkan nilai mengelompokkan target Rupiah dan target pesanan.
- Perubahan target demo berlaku di sesi peramban yang sama. Target usaha disimpan per akun.

## Asisten

- Chat mengikuti periode, produk dan pertanyaan sebelumnya. Coba "Gimana usahaku?", "Tampilkan lima produk", "Yang kedua kenapa turun?", "Bandingkan keduanya", lalu "Apa yang sebaiknya saya prioritaskan?". Rentang eksplisit, hari ini, kemarin, minggu ini/lalu dan hingga 366 hari terakhir didukung. Angka tetap dihitung oleh domain RAMU.
- Pesan muncul langsung saat dikirim, dengan indikator proses, tombol Hentikan, draf yang dipertahankan saat gagal, dan Coba lagi dengan ID yang sama. Enter mengirim; Shift+Enter menambah baris. Demo menyimpan sesi tab; akun menyimpan hingga 24 giliran per percakapan di Supabase. Bukti mengikat periode dan revisi; sumber terbaru tidak mengganti bukti pesan lama.
- Gemini kini merangkai penjelasan percakapan dari fakta terhitung. Pertanyaan umum memerlukan satu panggilan; pertanyaan ambigu dapat memerlukan klasifikasi tambahan. Konteks dikirim maksimal empat pasangan pertanyaan dan jawaban terakhir. Aplikasi mengirim alias nama produk/usaha serta ringkasan metrik, tanpa file, baris transaksi, ID pesanan atau metadata sumber. Pola umum data pribadi disamarkan; pengguna tetap perlu menghindari informasi pribadi dalam chat.
- Model mengembalikan JSON dengan token fakta. RAMU mengganti token dengan nilai, label atau gabungan keduanya, memeriksa metrik, entitas dan arah perubahan, lalu menolak angka baru, token tidak dikenal, tautan dan HTML. Pemeriksaan ini tidak membuktikan seluruh makna narasi; angka pendukung, Dasar analisis dan batas data tetap dapat diperiksa. Output gagal, safety block, jaringan putus atau kuota 429 memakai analisis dasar tanpa percobaan provider berulang otomatis.
- Data penjualan dan identitas usaha dibaca sekali dalam satu permintaan, lalu dipakai kembali untuk laporan dan target. Tidak ada cache fakta lintas akun. Versi percakapan mencegah penimpaan dari tab lain dan ID permintaan mencegah duplikasi ketika mencoba lagi.

### Demo Gemini gratis dan data usaha asli

Konfigurasi lokal mengikuti keputusan mode gratis: `GEMINI_SERVICE_TIER=unpaid`, `GEMINI_DEMO_ENABLED=true`, dan key tetap hanya pada `.env.local`. Model `gemini-3.1-flash-lite` mempunyai free tier menurut dokumentasi Google yang diperiksa; kuota proyek key baru terbukti ketika generateContent berhasil. Jangan mengubah tier ke paid untuk melewati pembatas. Billing dan deploy publik tidak termasuk tahap ini.

- `/demo/asisten` memakai fixture sintetis server. Mode ditentukan alamat endpoint, bukan boolean dari client. Riwayat demo membawa pasangan pertanyaan/jawaban yang sudah tampil melalui receipt bertanda tangan, terikat sesi, thread, versi dan masa berlaku. History/facts buatan client dan receipt dari thread/sesi lain ditolak.
- Jangan memasukkan informasi pribadi, key, data usaha asli, file atau rahasia ke demo. Pola sensitif yang dikenali diblokir sebelum provider; filter tidak menjamin semua rahasia dapat dikenali. Layanan Google gratis dapat memakai prompt/respons untuk peningkatan produk dan peninjauan manusia. Baca `/privasi` dan `/ketentuan`.
- Data akun tetap dapat diimpor, disimpan dan dihitung lewat RAMU/Supabase. Dengan tier unpaid, prompt/fakta/history akun tidak dikirim ke Gemini. Gunakan tautan demo untuk mencoba AI dengan konteks yang berbeda dan label Data contoh.
- Gemini merangkai penjelasan dari fakta yang sudah dihitung. Token nilai dan label memungkinkan kalimat natural; metadata metrik, entitas, satuan, periode dan sumber tetap terikat fakta server. Klaim metrik/entitas dan arah perubahan diperiksa. Ini bukan bukti otomatis seluruh makna bahasa; angka, Dasar analisis dan bukti tetap tersedia untuk diperiksa.
- Pertanyaan yang dikenali memerlukan satu panggilan model; pertanyaan ambigu dapat memerlukan klasifikasi tambahan. Memori dibatasi empat pasangan pesan. Sapaan, konsep omzet/laba/HPP, saran, rujukan produk dan pertanyaan lanjutan mempunyai fallback lokal yang berguna.
- Batas lokal provider: enam giliran/menit/sesi demo, 12/menit/usaha dan 60/menit/proses. Limiter memori bukan pembatas global untuk banyak instance. Matikan demo sebelum menyiapkan deployment publik dan lakukan tinjauan kuota/akses terpisah. Tidak ada rotasi key untuk mengakali kuota.

Setelah mengubah konfigurasi, mulai ulang server. `npm.cmd run verify:gemini` menjalankan beberapa giliran **nyata** dari fixture server dengan mode unpaid, memeriksa output, dan berhenti bila provider gagal/429. Exit 2 berarti konfigurasi belum siap, exit 1 berarti uji belum berhasil, exit 0 berarti seluruh percakapan lolos. Skrip tidak mencetak key dan tidak mengubah billing. `npm.cmd run verify:services` memeriksa provider Google, arah callback dan Data API secara aman; hasilnya tidak menggantikan login interaktif.

Koneksi HTTP runtime agen mengalami ENOTFOUND sehingga uji Gemini nyata belum lulus di sini. Login Google sampai profil/Dashboard telah dikonfirmasi pengguna melalui browsernya. Pengujian Supabase SQL dan pengujian API simulasi dicatat terpisah dalam `IMPLEMENTATION_STATUS.md`.

Referensi resmi: [Ketentuan Gemini API](https://ai.google.dev/gemini-api/terms), [pricing/free tier](https://ai.google.dev/gemini-api/docs/pricing), [API key](https://ai.google.dev/gemini-api/docs/api-key), [output terstruktur](https://ai.google.dev/gemini-api/docs/structured-output). Model dan kuota perlu diperiksa saat pemeliharaan.

## Biaya dan kesiapan analisis

Buka **Sumber data Ã¢â€ â€™ Catat HPP dan biaya** dan masukkan total HPP barang yang terjual serta biaya usaha di luar HPP untuk rentang yang sama dengan data penjualan. Nol berarti biaya diketahui nol. Isian kosong berarti belum tercatat. RAMU memakai tepat satu catatan yang cocok dengan cakupan realisasi, sehingga catatan tumpang tindih tidak dijumlahkan. Laba untuk penjualan parsial ditandai sebagai sementara. Ringkasan kebutuhan kas dan stok tersedia di Sumber data.

## Format dan masa berlaku pratinjau

- Gunakan CSV UTF-8 dengan pemisah koma, titik koma, atau tab, atau pilih tab yang terlihat pada XLSX atau Google Sheets. Batas impor adalah 2 MB, 5.000 baris data, dan 80 kolom. Baris terisi pertama berisi judul kolom. Untuk spreadsheet, format ID dengan nol di depan sebagai teks atau format angka seperti `00000`.
- Tanggal ISO, hariÃ¢â‚¬â€œbulanÃ¢â‚¬â€œtahun, dan bulanÃ¢â‚¬â€œhariÃ¢â‚¬â€œtahun didukung. Pilih urutan yang sesuai dengan file. Gunakan nilai Rupiah bulat. Jika file memuat harga satuan, petakan jumlah unit juga.
- Unduh **Template penjualan CSV** dari pilihan sumber. Pada pemetaan, buka **Lihat contoh baris sumber** untuk memeriksa hubungan antar kolom. Parser yang sudah ada dipakai karena mendukung batas impor, nol di depan, delimiter, dan tab XLSX yang tercakup dalam tes regresi.
- File asli diproses di memori server selama permintaan. Pratinjau menyimpan fakta penjualan yang sudah dinormalisasi di tabel privat dan berlaku selama satu jam. Fakta sementara dikosongkan saat aktivasi, pembatalan, atau pemeriksaan kedaluwarsa pada impor berikutnya. Untuk instalasi yang perlu menghapus pratinjau kedaluwarsa milik usaha yang tidak kembali, jadwalkan SQL berikut lewat proyek Supabase.

```sql
update public.import_runs set state = 'expired', payload = null
where state = 'ready' and expires_at <= now();
```

## Verifikasi

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify:mvp
npm.cmd run verify:services
npm.cmd run verify:gemini
```

`lint` menjalankan pemeriksaan format Prettier. `typecheck` memakai TypeScript strict. Uji Node mencakup demo, impor XLSX/CSV, laporan periode, target, dan jawaban Asisten, termasuk omzet Rp24.800.000 dari 328 pesanan. Jalankan `verify:mvp` setelah build untuk menguji rute dan server action produksi dengan API simulasi. Alurnya mencakup demo, dua akun, login dan profil, batal impor, konfirmasi ganda, Dashboard, target, bukti Asisten, koneksi Sheets, pemulihan izin, dan keluar akun. Uji ini memakai data sintetis dan dapat dijalankan tanpa kredensial.

Setelah semua migrasi diterapkan ke database uji Supabase, jalankan skrip berikut dengan koneksi database uji yang sudah dikonfigurasi untuk `psql`. Skrip memakai identitas sintetis dan mengakhiri perubahan dengan `rollback`.

```powershell
psql -v ON_ERROR_STOP=1 -f test/import-db.sql
psql -v ON_ERROR_STOP=1 -f test/target-db.sql
psql -v ON_ERROR_STOP=1 -f test/sheets-db.sql
psql -v ON_ERROR_STOP=1 -f test/chat-costs-db.sql
```

## Uji sebelum rilis

1. Masuk dengan akun Google penguji di lingkungan uji dan buat profil usaha. Impor CSV contoh di atas. Sebelum konfirmasi, Dashboard harus memakai sumber terakhir atau keadaan belum ada data. Sesudah konfirmasi, periode November 2026 menampilkan Rp75.000 dan dua pesanan.
2. Buat target omzet Rp100.000 untuk November 2026. Hasilnya 75% jika target aktif dan tanggal awal tercakup. Isi awal cakupan `2026-11-01` saat pratinjau hanya jika catatannya memang mencakup hari tersebut. Setelah periode berakhir, hasil target dapat diperiksa di **Riwayat**. Di Asisten, bandingkan Brownies dan Roti, buka bukti, lalu periksa angka Rp50.000 dan Rp25.000 dari revisi yang sama.
3. Dengan OAuth Google Sheets yang dikonfigurasi, pilih spreadsheet privat dan satu tab. Perbarui satu nilai lalu konfirmasi pembaruan. Uji izin yang dicabut atau kedaluwarsa. Data terakhir harus tetap tampil sampai pembaruan berhasil dikonfirmasi. Dari akun uji kedua, pastikan Dashboard, target, dan bukti akun pertama tidak terbaca.
4. Uji masing-masing satu ekspor Shopee dan Moka yang sudah disamarkan. Pertahankan struktur, format tanggal, status, dan pola ID berulang saat menyamarkan isinya. Bandingkan total dan jumlah ID pesanan unik dengan hasil pratinjau sebelum konfirmasi.

Login Google nyata dikonfirmasi berhasil oleh pengguna. Keenam migrasi dan empat skrip SQL regresi sudah dijalankan di Supabase development. Validasi Sheets nyata, respons Gemini nyata, dan ekspor asli Shopee/Moka masih memerlukan konfigurasi, koneksi provider atau sampel. Lihat IMPLEMENTATION_STATUS.md untuk bukti dan batas setiap pemeriksaan.

## Audit pembaruan

| Alur R10                   | Entry point kode                                                | Perubahan dan verifikasi                                                                                                                        |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Splash, akun, dan profil   | `/`, `/masuk`, `/daftar`, `/pengaturan-awal/profil`             | PKCE, sesi, keluar akun, dan tujuan kembali internal diperiksa melalui build produksi dengan API simulasi.                                      |
| Hubungkan sumber dan biaya | `/pengaturan-awal/sumber`, `/sumber-data`                       | Pemetaan dengan contoh baris, template, izin Sheets, revisi aktif, dan biaya menurut cakupan.                                                   |
| Dashboard dan bukti        | `/dashboard`, `/demo`, `/dashboard/harian`, `/dashboard/produk` | Ringkasan demo dan akun memakai fungsi laporan yang sama. Tautan bukti diuji setelah revisi baru diaktifkan.                                    |
| Target dan Riwayat Target  | `/target-bisnis`, `/target-bisnis/riwayat`, kartu Dashboard     | Dialog memakai data kartu. Rute langsung memuat satu target melalui ID. Konflik penyimpanan dan pembaruan kartu diperiksa.                      |
| Asisten                    | `/asisten`, `/demo/asisten`                                     | Pertanyaan lanjutan, rujukan produk, rentang tanggal, simulasi hari jual, biaya, percakapan tersimpan, penanganan 429 dan bukti terikat revisi. |

Audit awal menemukan rute editor akun meminta daftar target lagi. Pada build produksi dengan penundaan API 300 ms per permintaan, rute lama membaca dua halaman dan menunggu 630Ã¢â‚¬â€œ644 ms. Dialog tidak meminta rute editor ketika dibuka. Kasus macet permanen belum dapat direproduksi. Peningkatan Asisten dibandingkan dengan pengenalan maksud MVP sebelumnya pada data contoh yang sama. Pembaruan awal membandingkan konfigurasi repo lama. Pembaruan chat berikutnya mengadaptasi pola alias entitas, fakta bertoken dan konteks terbatas dari repo lama dengan tetap memakai domain RAMU baru. Menjalankan ulang paket lama memerlukan dependensinya.

Uji pengembangan dari salinan MVP mencatat editor akun sekitar 2,29 detik pada akses pertama dan 0,93 detik pada akses berikutnya. Build produksi terbaru memuat satu target pada tautan langsung dalam 319Ã¢â‚¬â€œ330 ms dengan penundaan simulasi yang sama. Pada uji integrasi produksi terpisah tanpa penundaan tambahan, simpan target memerlukan 19 ms dan satu jawaban Asisten 32 ms. Angka tersebut berasal dari pengujian lokal dengan API simulasi.

Komponen editor dan chat diuji di Edge pada 320, 390, 768, dan 1440 piksel bersama data simulasi. Pengujian mencakup nilai awal, batal, fokus, buka kembali, konflik versi, simpan, dan dua giliran pesan. Lint format dan TypeScript dapat dijalankan dengan dependensi terpasang. Pemasangan ESLint dan Playwright terhambat karena registry npm tidak dapat diakses dari lingkungan ini.

## Struktur

- `src/app` memuat rute dan gaya.
- `src/components` memuat komponen tampilan.
- `src/domain` memuat perhitungan penjualan, periode, dan target.
- `src/demo/fixture.ts` memuat catatan penjualan sintetis. Tanggal versi demo tetap 17 November 2026 agar angka acuan dan hitung mundur bisa diulang.
- `src/server` memuat akses Supabase dan pembaca file. Login memakai PKCE Supabase Auth dan sesi dalam cookie HTTP-only. Aplikasi memverifikasi sesi di Auth API lalu membaca data melalui RLS per pemilik. Aktivasi melalui satu transaksi PostgreSQL yang mengunci profil usaha, memeriksa revisi acuan, lalu mengganti sumber aktif.
- `supabase/migrations` memuat skema, kebijakan akses, dan fungsi impor.
