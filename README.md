## Navigasi mobile

Dashboard, Target Bisnis, Asisten dan Sumber data memakai satu ukuran logo, jarak header, navigasi empat kolom serta posisi menu akun pada layar hingga 760 px. Header tetap konsisten ketika sidebar dari desktop sebelumnya diringkas. Lebar scrollbar dicadangkan agar perpindahan halaman tidak menggeser tata letak.

Setiap fitur akun mempunyai loading boundary agar navigasi bawaan Next.js dapat menyiapkan shell halaman; indikator pada tautan memberi respons selama navigasi tertunda. Tidak ada jeda minimum splash saat berpindah fitur.

Pembukaan Asisten hanya mengambil metadata revisi untuk label periode; transaksi baru dibaca ketika diperlukan untuk analisis. Data demo untuk perhitungan tidak lagi menjadi dependensi runtime komponen navigasi. Regresi ini diperiksa di verify:mvp: membuka Asisten tidak boleh membaca sales_facts. Pada uji produksi lokal dengan API simulasi dan jeda 200 ms per pembacaan facts, rute Asisten turun dari 443/416 ms menjadi 15/7 ms (pertama/berikutnya), dengan dua pembacaan facts menjadi nol. Angka ini bukan pengukuran jaringan Vercel atau ponsel.
