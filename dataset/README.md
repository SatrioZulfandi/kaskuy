# Uji batch OCR KASKUY

Batch pengembangan mencakup lima struk dari masing-masing merek Alfamart, Alfamidi, dan Indomaret. Uji akhir memakai 40 struk di manifest tersendiri, terdiri dari 13 Alfamart, 13 Alfamidi, dan 14 Indomaret. Foto asli berada di `dataset/raw/`. [Pembagian dan pemeriksaan duplikat](manifests/SELECTION.md)

## Menjalankan batch lewat Wi-Fi

Buka proyek pada development APK KASKUY di HP dengan koneksi Metro yang biasa dipakai. Jalankan `npx expo start --dev-client` jika Metro belum berjalan. HP dan komputer perlu terhubung ke jaringan lokal yang sama. Pemindaian membutuhkan ML Kit bawaan APK KASKUY. [Development build Expo](https://docs.expo.dev/develop/development-builds/introduction/)

Di terminal kedua, jalankan dari akar proyek:

```powershell
npm.cmd run ocr:batch -- --lan
```

Jika komputer memiliki lebih dari satu IP lokal, gunakan alamat IP yang muncul pada koneksi Metro. Contoh:

```powershell
npm.cmd run ocr:batch -- --lan --host 192.168.137.1
```

Buka **Pengaturan → Uji Batch OCR** di HP. Isi host dan token dari terminal, lalu tekan **Jalankan batch**. Runner memakai port `8787` untuk mengirim foto pengembangan dan menerima hasil. Mode Wi-Fi memakai Metro yang sudah berjalan. Jika koneksi Metro berhasil tetapi runner belum dapat dijangkau, periksa apakah port `8787` bisa diakses dari jaringan pribadi Windows.

Foto yang disajikan runner sesuai hash manifest. APK mengunduhnya ke cache privat Expo Image lalu memanggil ML Kit pada file cache. Waktu unduh dikeluarkan dari waktu OCR. Jika transfer foto gagal, **Coba lagi** melanjutkan batch tanpa menghitung gangguan jaringan sebagai kegagalan OCR.

## Menjalankan batch melalui ADB

Sambungkan POCO X6 melalui USB, buka kuncinya, aktifkan USB debugging, dan setujui permintaan debug. Pastikan development APK KASKUY dengan package `com.anonymous.catatkeuangan` sudah terpasang. Jalankan dari akar proyek dengan Node.js 22 dan `adb` di PATH.

```powershell
adb devices -l
npm.cmd run ocr:batch
```

Jika model HP ditampilkan sebagai kode, pilih serial dari daftar ADB.

```powershell
npm.cmd run ocr:batch -- --serial SERIAL_DARI_ADB
```

Perintah memeriksa hash gambar, menyalin foto pengembangan ke cache privat APK, memulai Metro dan penerima hasil lokal, lalu membuka layar batch. Port komputer `8091` dan `8787` diperlukan selama proses. Jika layar belum terbuka setelah APK memuat proyek, buka **Pengaturan → Uji Batch OCR**, lalu masukkan token yang ditampilkan runner. Dengan satu kali mulai, semua foto berjalan berurutan tanpa pemilihan gambar satu per satu dan tanpa rebuild APK.

Runner menggunakan URI foto asli yang disalin utuh, sehingga hasil merefleksikan foto dataset sebagaimana tersedia. Tidak ada crop tambahan saat batch. ML Kit KASKUY membaca tiap foto sekali. Teks yang sama diberikan kepada dua mode parser. Jika pengiriman gagal, **Coba lagi** dengan token yang sama akan mengirim ulang hasil yang masih tersimpan dalam sesi HP dan melewati baris yang telah diterima komputer. Jika aplikasi ditutup sebelum pengiriman berhasil, hasil yang belum sampai ke komputer dapat perlu dibaca lagi.

## Keluaran dan acuan

Setiap eksekusi menyimpan hasil di `dataset/results/<run-id>/`.

- `results.csv` berisi satu baris per foto, waktu OCR, kesalahan, dan prediksi kedua mode. Baris tersimpan bertahap selama batch.
- `results.jsonl` berisi teks OCR asli dan keluaran parser lengkap. CSV dapat memberi awalan apostrof pada teks yang menyerupai formula spreadsheet.
- `accuracy.json` dibuat setelah semua baris diterima dan ID-nya cocok dengan acuan terverifikasi. Ringkasan berisi akurasi per kolom, per merek, dan gabungan, serta jumlah kasus yang membaik atau memburuk.

Mode tanpa koreksi memakai ekstraksi acuan dari batch awal agar hasil antarversi bisa dibandingkan. Mode dengan koreksi memakai parser KASKUY, termasuk perbaikan karakter OCR, pengaitan kolom nominal pembayaran yang terpisah, dan pengecekan aritmetika. Parser menandai hasil rekonstruksi untuk dikonfirmasi. Pembayaran campuran dengan kolom tunai yang ambigu dibiarkan kosong.

[Acuan pengembangan](ground-truth/development.verified.csv) berasal dari dua pembacaan visual foto sebelum OCR, dengan draf per merek di folder yang sama. Dari 75 kolom, 68 dapat dinilai, 5 tidak terbaca, dan 2 tidak berlaku. Nol hanya diisi jika tercetak. `Tunai` mengikuti jumlah tunai tercetak, termasuk pada pembayaran campuran. Secara terpisah, dua pembaca dapat meninjau ulang nilai meragukan sebelum hasil dipakai dalam laporan riset.

Untuk menghitung ulang akurasi dari CSV yang lengkap setelah merevisi acuan, jalankan:

```powershell
node scripts/score-ocr-batch.cjs dataset/results/RUN_ID/results.csv dataset/ground-truth/development.verified.csv
```

Kedua mode memakai penyebut yang sama. Hanya kolom acuan yang terbaca dan terverifikasi masuk penyebut. Kegagalan OCR tetap dihitung salah untuk kolom tersebut. Manifest uji akhir dibiarkan terpisah dari runner pengembangan.

## Uji akhir

[Acuan uji akhir](ground-truth/final.verified.csv) ditranskripsikan dan diperiksa langsung dari foto sebelum OCR. Dari 200 kolom, 177 dapat dinilai, 10 tidak terbaca, dan 13 tidak berlaku.

Gunakan `--final` untuk memilih manifest uji akhir dan acuan tersebut. Opsi ini dapat dipakai bersama `--lan` atau dengan ADB.

```powershell
npm.cmd run ocr:batch -- --final --lan --host 192.168.137.1
```

Uji akhir 19 November 2026 memproses 40 foto di POCO X6 melalui Metro Wi-Fi. Keluaran berada di `dataset/results/final-20261119150632-d3385b6f/`. Akurasi terukur 74/177 (41,81%) tanpa koreksi dan 120/177 (67,80%) dengan koreksi. Parser memakai versi yang sama dengan evaluasi ulang pengembangan. Metadata mencatat hash parser, manifest, dan acuan.

## Menguji perubahan parser dengan teks OCR yang sudah tersimpan

Jalankan replay dari folder hasil batch pengembangan asli.

```powershell
npm.cmd run ocr:replay -- dataset/results/RUN_ID
```

Replay memakai teks OCR yang sama untuk kedua mode serta memeriksa bahwa hasil mode tanpa koreksi masih sama seperti batch awal. CSV, JSONL, dan ringkasan akurasi disimpan di folder replay baru. Metadata menyimpan hash parser dan data sumber. Waktu pada kolom `ocr_ms` berasal dari batch asli.

## Evaluasi rekonstruksi baris dari koordinat

ML Kit mengembalikan kotak teks bersama teks mentah pada satu pemanggilan. Parser memasangkan label dan nilai dengan posisi baris OCR, memakai teks mentah saat koordinat tidak memadai, dan memeriksa konteks tanggal transaksi pada struk.

Hubungkan APK KASKUY di POCO X6 ke Metro, lalu jalankan pengambilan koordinat dari set pengembangan dan evaluasinya.

```powershell
node scripts/capture-ocr-layout.cjs --split dev --host 192.168.137.1 --output dataset/results/layout-development
node --experimental-strip-types scripts/evaluate-ocr-layout.cjs dataset/results/layout-development
```

Opsi `--split final` memakai manifest 40 struk uji akhir. Simpan hasilnya di folder lain. Evaluasi memasangkan dua keluaran dari satu tangkapan per foto. Kolom `baseline_*` di folder evaluasi merekam parser dengan koreksi teks saja. Kolom `corrected_*` merekam parser dengan posisi baris dan konteks tanggal. Menjalankan evaluasi kembali dari `capture.jsonl` tidak memanggil ML Kit.

Untuk sampel tambahan, gunakan `--split validation` atau `--split confirmation`. Acuan visual masing-masing tersimpan di `validation.verified.csv` dan `confirmation.verified.csv`. Hasil awal pada 24 foto adalah 83/98 (84,69%). Setelah set tersebut dipakai untuk diagnosis, replay mencapai 95/98 (96,94%). Uji versi terbaru pada 16 foto konfirmasi yang terpisah menghasilkan 58/64 (90,63%). [Metode pemilihan sampel](manifests/SELECTION.md)

Verifikasi kesiapan tanpa HP dapat dijalankan dengan `npm.cmd run ocr:batch -- --check` dan `npm.cmd run test:ocr`.
