# Impor penjualan tanpa mencocokkan seluruh kolom

Kolom dengan judul yang dikenali dipilih otomatis. RAMU memeriksa sumber secara menyeluruh untuk menentukan apakah nilai dapat dibaca tanpa pertanyaan tambahan. Jika formatnya jelas dan valid, pemilihan file/tab langsung menghasilkan pratinjau. Pengguna tetap mengonfirmasi sebelum sumber aktif berubah.

Format belum jelas tetap meminta keputusan singkat, misalnya nilai yang sama pada beberapa item dapat berarti harga item yang kebetulan sama atau total pesanan yang diulang. Tanggal 03/04/2026 dan pemisah angka yang dapat ditafsirkan berbeda tidak ditebak secara diam-diam. Pengaturan kolom dan format tersedia melalui **Sesuaikan kolom dan format**.

## Kasus AVARA November 2026

Pada tab RAMU_NOV_2026, kolom Nilai Penjualan adalah nilai per baris/item. Beberapa baris dengan ID pesanan sama adalah item berbeda dalam satu pesanan.

- Membaca sebagai total pesanan menghasilkan 139 masalah, pertama pada baris 7, 10, 14 dan 16.
- Membaca sebagai nilai per item menghasilkan 0 masalah, omzet Rp180.043.050 dan 430 pesanan selesai.
- Sumber memiliki 770 baris data; 597 baris selesai/retur dinormalisasi, 173 baris batal/belum selesai dikecualikan.

Alur baru mengenali sumber ini dan langsung membuat pratinjau. Jika pengguna sengaja atau sebelumnya memilih total pesanan, server menawarkan **Gunakan nilai per item** hanya ketika pembacaan alternatif menghilangkan seluruh masalah dan ada item berbeda dalam pesanan yang sama. Tombol tersebut membuat pratinjau baru; tidak mengubah spreadsheet dan tidak mengaktifkan data otomatis.

Sesudah kode diperbarui, tutup dialog impor lama dan muat ulang RAMU. Pilih kembali spreadsheet dan tab RAMU_NOV_2026. Jika format tampilan angka Google membutuhkan pilihan locale, tentukan format angka satu kali. Periksa angka pratinjau, lalu pilih **Gunakan sumber ini**.

## Perlindungan perhitungan

- ID pesanan yang berulang pada nilai per item tetap dihitung sebagai satu pesanan.
- Nilai total pesanan yang diulang tetap dihitung satu kali saat kolomnya memang total pesanan.
- Retur dikurangi satu kali; baris batal/belum selesai tidak menjadi omzet.
- Duplikat persis, status bertentangan, nilai tidak valid, dan masalah lain tetap memblokir impor.
- Kolom total pesanan yang eksplisit tidak otomatis diubah menjadi nilai item untuk menutupi data yang tidak konsisten.
- Koreksi pilihan, pemetaan manual dan impor ulang tetap melalui validasi server serta konfirmasi aktivasi.

Belum ada penggabungan otomatis seluruh tab perusahaan, sinkronisasi background, atau perubahan batas 5.000 baris sumber. Master data AVARA tetap lengkap dan tidak diubah oleh perbaikan importer ini.

Untuk persiapan Vercel, lihat [deployment-vercel.md](deployment-vercel.md).
