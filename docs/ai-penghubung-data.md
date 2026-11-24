# Menghubungkan spreadsheet seperti berbicara dengan asisten

Pengaturan OAuth, API key dan layanan Gemini adalah tanggung jawab pengelola RAMU, satu kali per environment. Pengguna akhir tidak membuat Google Cloud project atau memasukkan API key. Alur produknya: pilih akun Google, beri izin pada spreadsheet pilihan, RAMU memahami struktur, jawab hanya makna yang masih ambigu, periksa ringkasan lalu gunakan data.

## Yang diterapkan

- Gemini membaca judul kolom bebas, singkatan dan campuran bahasa dengan pola tipe data. Tidak bergantung hanya pada daftar alias. Kolom di luar kebutuhan penjualan boleh ada dan tidak ditanyakan satu per satu.
- Untuk Google Sheets dengan beberapa tab, server membaca rentang header yang terbatas. Gemini membedakan transaksi, agregasi, dan data lain. Jika hanya satu tab transaksi yang jelas dan sesuai kapasitas, RAMU memilihnya. Jika ada beberapa kandidat, pengguna mendapat pilihan tab relevan dan pencarian tab lain.
- Keluaran model harus sesuai struktur JSON, indeks kolom valid dan tidak tumpang tindih. Angka dihitung server secara deterministik, bukan dihasilkan model.
- Hanya ambiguitas yang ditanyakan. Contohnya apakah nilai merupakan barang per baris atau total pesanan yang diulang, apakah suatu tanggal merupakan tanggal transaksi, atau arti status Final. Pertanyaan model yang relevan dapat dipakai untuk memperjelas konteks kolom.
- Pengguna dapat memilih jawaban singkat atau menjelaskan dalam kalimat sendiri. Jawaban bebas dipahami Gemini sebagai pilihan makna yang diizinkan; tidak menjadi instruksi menjalankan kode atau mengubah akun.
- Percakapan pemahaman memakai tiket bertanda tangan, terikat usaha, sumber dan struktur header, dengan batas waktu. Tiket yang diubah atau dipakai usaha lain ditolak.
- Pemahaman dan makna status disimpan pada pemetaan revisi yang diaktifkan. Pembaruan tab yang sama menggunakan pemahaman tersimpan selama header tetap cocok. Bila struktur berubah, pemahaman diulang.
- Spreadsheet asli tidak diubah. Pemetaan rinci tersedia sebagai opsi pemeriksaan, bukan formulir wajib. Pengguna tetap meninjau ringkasan sebelum sumber aktif berubah.
- Jika Gemini tidak tersedia/kuota habis, statusnya dijelaskan. Pembacaan lokal tersedia tanpa mengaku sebagai hasil Gemini.

## Batas data yang dikirim ke model

Pemahaman struktur mengirim judul kolom/tab yang disamarkan dan kategori tipe data, misalnya tanggal ISO, angka atau teks. Tidak mengirim isi sel, nominal transaksi, ID pesanan, nama pelanggan, file/spreadsheet ID, token Google atau API key dalam prompt. Jawaban bebas pengguna hanya untuk klarifikasi; jangan mengisinya dengan informasi pribadi atau rahasia.

GEMINI_IMPORT_ENABLED mengaktifkan fitur ini. Pengujian lokal dengan data sintetis dapat memakai layanan gratis. Pada runtime production, fitur ini memerlukan GEMINI_SERVICE_TIER=paid dan proyek Gemini yang benar-benar mempunyai Cloud Billing aktif. Kode tidak mengaktifkan billing secara otomatis. Pembatas ini mengikuti pemisahan data contoh dan sumber usaha di RAMU: jangan mengirim struktur rahasia atau informasi pribadi ke layanan gratis. Isi transaksi tetap tidak dikirim meskipun layanan berbayar digunakan.

Gemini gratis dapat menggunakan input/respons untuk peningkatan produk dan peninjauan manusia. Pengelola perlu menyiapkan layanan dan kebijakan privasi production; pengguna akhir tidak perlu membuat proyek AI atau membayar Google secara langsung sebagai bagian dari alur koneksi.

## OAuth untuk pengguna umum

Mode Google OAuth Testing hanya untuk akun penguji yang didaftarkan. Untuk peluncuran umum, pengelola menyiapkan aplikasi External, status Published/Production, domain HTTPS stabil, halaman aplikasi dan kebijakan privasi, serta proses verifikasi Google yang berlaku. Tetap gunakan scope drive.file melalui Google Picker agar pengguna memilih file yang diberi izin; jangan meminta seluruh isi Drive.

Pengaturan origin OAuth, pembatasan website key Picker dan callback Supabase hanya dilakukan pengelola. Pengguna cukup memberi izin melalui Google. Kebijakan administrator organisasi Google Workspace tetap dapat membatasi akses aplikasi.

Panduan environment dan domain: [deployment-vercel.md](deployment-vercel.md).

## Pengujian

```powershell
node --test test/import-assistant.test.ts test/import-tab-discovery.test.ts
node scripts/verify-import-ai.mjs
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify:mvp
```

Tes unit memakai respons provider simulasi untuk membuktikan pemetaan kolom yang tidak ada dalam kamus alias, percakapan klarifikasi, jawaban bebas, kuota, respons model salah, isolasi tiket, pengenalan status, pembacaan header dan pemilihan tab. Skrip verify-import-ai menjalankan permintaan nyata yang hanya berisi struktur sintetis; lulus tes simulasi tidak menggantikan keberhasilan provider nyata.

## Batas implementasi saat ini

Nama dan urutan kolom sumber fleksibel, tetapi pembacaan yang diaktifkan saat ini tetap untuk fakta penjualan: tanggal, nilai, pesanan, produk, status dan unit. Kolom stok, biaya, pelanggan atau metrik lain tidak otomatis menjadi fitur Dashboard hanya karena sudah dikenali sebagai kolom tambahan. Data tambahannya tetap di sumber, bukan dibuang atau diubah. Ini belum merupakan impor universal seluruh 35 tab AVARA sekaligus.

Batas sumber masih 2 MB, 5.000 baris dan 80 kolom. Pemilihan tab tidak menggabungkan transaksi lima tahun dengan ringkasan atau jurnal yang mewakili transaksi sama, agar tidak menghitung ganda. Sinkronisasi masih diminta pengguna, belum background sync. Pertanyaan per sesi terikat sumber; pengguna tidak diminta mengonfirmasi setiap kolom secara rutin.

Referensi:

- https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/terms
