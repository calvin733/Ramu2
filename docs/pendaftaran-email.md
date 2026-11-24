# Aktivasi pendaftaran email RAMU

Kode pendaftaran email sudah tersedia. Aktivasi memerlukan key Turnstile yang benar pada aplikasi dan Supabase. Sebelum konfigurasi itu siap, formulir diblokir agar pendaftaran tidak terbuka tanpa CAPTCHA.

## 1. Buat widget Cloudflare Turnstile

1. Buka https://dash.cloudflare.com/ dan pilih **Turnstile**.
2. Tambahkan widget, misalnya **RAMU Local**, dengan mode **Managed**.
3. Untuk pengembangan ini, tambahkan hostname **localhost**. Isi hostname saja, tanpa http://, port, atau path. Untuk production, gunakan widget/hostname production yang sesuai.
4. Simpan **Site key** dan **Secret key** secara privat. Site key memang digunakan browser; secret key hanya digunakan server Supabase.

Cloudflare mengizinkan hostname lokal untuk widget development. Gunakan key sungguhan untuk mengaktifkan pendaftaran proyek ini. Key dummy yang selalu menerima token bukan perlindungan antispam dan tidak dipakai sebagai konfigurasi operasional.

## 2. Pasang kedua key di tempat yang tepat

| Nilai dari Turnstile | Tempat pengisian                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Site key             | D:\Projects\Ramu\ramu-web\.env.local, variabel TURNSTILE_SITE_KEY                              |
| Secret key           | Supabase proyek Ramu → Authentication → Bot and Abuse Protection / Attack Protection → CAPTCHA |

Contoh tambahan pada .env.local:

```dotenv
TURNSTILE_SITE_KEY=isi_site_key_widget_anda
```

Pertahankan seluruh variabel Supabase/Google/Gemini yang sudah ada. Jangan menimpa file .env.local dan jangan mengirim secret key melalui chat.

Di Supabase, aktifkan **CAPTCHA protection**, pilih **Cloudflare Turnstile**, lalu simpan secret key widget yang sama. Aplikasi meneruskan token ke Supabase; Supabase yang memverifikasinya. Jangan memverifikasi token yang sama dua kali pada server lain karena token sekali pakai.

Pengaturan CAPTCHA Supabase juga berlaku pada login email/password. Form login RAMU sudah mendukung widget ketika TURNSTILE_SITE_KEY tersedia. Login Google tetap memakai alur Google.

## 3. Pastikan konfirmasi email aktif

Pada proyek **Ramu** dengan ref **qyegwniyzxyvsxftqcrb**:

- Buka Authentication → Sign In / Providers → Email.
- Pertahankan **Confirm email** dalam keadaan aktif. Pemeriksaan terakhir menunjukkan auto-confirm nonaktif.
- Site URL: http://localhost:3000
- Redirect URL yang diizinkan: http://localhost:3000/auth/callback

Konfigurasi Google yang sudah ada tetap digunakan. Callback dari Google ke Supabase berbeda dari callback aplikasi di atas.

Form pendaftaran menggunakan endpoint signup biasa dengan publishable key dan PKCE. Akun tidak diberi sesi RAMU saat baru mendaftar. Sesi baru disimpan setelah pertukaran code dan pemeriksaan email yang sudah dikonfirmasi berhasil.

## 4. Siapkan pengiriman email

Supabase SMTP bawaan ditujukan untuk pengujian terbatas: hanya alamat anggota tim organisasi Supabase yang diizinkan, dengan batas bawaan kecil. Dokumentasi yang diperiksa 24 November 2026 menyebut 2 email per jam.

Untuk mengirim konfirmasi kepada tester atau pengguna di luar tim Supabase, buka **Authentication → Email → SMTP Settings** / **Custom SMTP**, lalu konfigurasikan penyedia email yang mendukung SMTP. Siapkan host, port, username, password SMTP, dan alamat pengirim yang diizinkan penyedia. Simpan kredensial pada pengaturan SMTP Supabase, bukan di browser atau chat.

Jangan mematikan konfirmasi email untuk mengatasi kegagalan SMTP. UI akan menjelaskan bila email belum dapat dikirim. Pengaturan SMTP dan pengiriman ke inbox nyata belum diverifikasi hanya dengan menjalankan tes kode.

## 5. Mulai ulang dan periksa kesiapan

Mulai ulang server development agar site key terbaca, kemudian jalankan:

```powershell
Set-Location 'D:\Projects\Ramu\ramu-web'
node scripts/verify-signup.mjs
```

Pemeriksaan ini hanya menggunakan alamat email yang tidak valid dan token CAPTCHA yang tidak valid. Pemeriksaan tidak membuat akun dan tidak mengirim email.

Hasil yang diharapkan:

```json
{ "turnstileSiteKeyConfigured": true, "ready": true, "reason": "ready" }
```

Arti alasan ketika belum siap:

| reason           | Tindakan                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| configuration    | Lengkapi konfigurasi URL, publishable key, dan origin RAMU.                      |
| captcha-key      | Isi TURNSTILE_SITE_KEY lalu mulai ulang server.                                  |
| confirmation     | Aktifkan provider email, pendaftaran, dan kewajiban konfirmasi email.            |
| captcha-provider | Aktifkan CAPTCHA native pada Supabase dengan provider dan secret key yang benar. |
| unavailable      | Periksa koneksi/layanan Auth, lalu coba kembali.                                 |

Hasil ready tidak membuktikan email berhasil sampai ke inbox. Pengiriman SMTP dan interaksi CAPTCHA nyata diuji melalui formulir.

## 6. Uji alur pengguna

1. Buka http://localhost:3000/daftar lalu pilih **Daftar dengan email**.
2. Isi email yang boleh menerima email uji, password, dan konfirmasi password.
3. Selesaikan pemeriksaan Turnstile lalu pilih **Buat akun RAMU**.
4. Halaman **Periksa email Anda** muncul. Pengguna belum bisa membuka Dashboard sebagai akun baru.
5. Buka tautan email pada browser yang sama dengan pendaftaran.
6. Setelah konfirmasi, RAMU mengarahkan ke profil usaha atau tujuan internal yang valid.
7. Isi profil, keluar akun, kemudian masuk kembali menggunakan email/password yang sama.
8. Periksa kirim ulang: ada jeda 60 detik. CAPTCHA harus diisi ulang untuk permintaan baru.
9. Jika tautan kedaluwarsa/sudah digunakan/dibuka pada browser lain, ikuti pesan pemulihan. Bila email sudah terverifikasi, pengguna dapat masuk dengan email/password. Jika belum, kirim tautan baru dari browser yang akan dipakai.

Alamat email yang menunggu konfirmasi disimpan sementara dalam cookie HttpOnly untuk membantu pengisian formulir. Cookie itu tidak memberi izin login. Password tidak dimasukkan ke URL, cookie, atau hasil server action.

## Perlindungan yang diterapkan

- Pendaftaran diblokir ketika key belum tersedia, konfirmasi email dimatikan, atau pemeriksaan tidak membuktikan CAPTCHA native aktif.
- Pemeriksaan token dilakukan Supabase, bukan sekadar memastikan field CAPTCHA terisi.
- Form mencocokkan konfirmasi password dan membatasi panjang input.
- Signup dan resend memakai PKCE, termasuk challenge baru saat kirim ulang.
- Tidak ada sesi sebelum konfirmasi. Respons signup yang tiba-tiba berisi sesi tidak digunakan dan sesi tersebut dicabut.
- Hasil untuk alamat yang sudah ada tidak menampilkan apakah akun tersebut terdaftar.
- Signup/resend berbagi cooldown 60 detik, batas 3 permintaan per email per jam, dan 30 permintaan per proses per jam. Batas native Supabase tetap berlaku.
- Pembatas memori lokal bukan pembatas terdistribusi untuk banyak instance. Tinjau kapasitas serta kebijakan rate limit hosting/Supabase sebelum deployment publik.

Akun tester yang dibuat secara administratif dengan Auto Confirm adalah alur khusus pengelola. Pendaftaran publik tidak memanggil admin API dan tidak memakai Supabase secret key.

## Referensi resmi

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
- https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- https://developers.cloudflare.com/turnstile/troubleshooting/testing/
