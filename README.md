# Kaskuy / CatatKeuangan

Aplikasi keuangan pribadi offline untuk Android, menggunakan Expo SDK 57, Expo Router, dan SQLite lokal.

## Fitur non-OCR yang tersedia

- Tambah, edit, dan hapus pemasukan/pengeluaran; perubahan saldo dilakukan dalam transaksi database atomik.
- Pilihan tanggal melalui kalender, kategori, dompet, dan catatan.
- Riwayat per tanggal, pencarian, filter jenis/kategori/dompet/tanggal, serta pemuatan halaman berikutnya.
- Tambah/edit dompet, pilih ikon/warna, arsip/aktifkan kembali, dan statistik seluruh riwayat dompet.
- Buku keuangan terpisah dengan perpindahan buku aktif; kategori digunakan bersama.
- Kelola kategori pribadi, dengan perlindungan kategori yang masih digunakan.
- Budget bulanan per kategori: tambah/edit/hapus, progres aktual, dan peringatan saat hampir habis.
- Tujuh dashboard non-OCR: ringkasan, pengeluaran/pemasukan per kategori, budget, tren harian/bulanan, dan detail dompet. Kategori dan grafik dapat dibuka untuk melihat transaksi terkait.
- Tema sistem/terang/gelap yang tersimpan serta panduan penggunaan pertama.
- Ekspor Excel seluruh transaksi buku aktif dan cadangan SQLite seluruh data keuangan.
- Pemulihan cadangan menambahkan buku baru dan mempertahankan data serta buku aktif yang sudah ada.

Filter Dompet mencakup Semua, Tunai, Bank, E-Wallet, Kredit, dan Arsip. Saldo ringkasan hanya menjumlah dompet aktif.

## Ekspor dan cadangan

Di **Pengaturan → Ekspor dan Cadangan**, gunakan **Ekspor ke Excel** untuk menyimpan transaksi buku aktif sebagai `.xlsx` atau **Simpan Cadangan** untuk menyimpan semua buku sebagai `.sqlite`. Pada Android, pilih folder tujuan seperti Dokumen. Untuk memindahkan cadangan ke Google Drive, buka file tersebut dari pengelola file Android. Pada web, file diunduh melalui browser.

Di HP tujuan, tekan **Pilih File Cadangan**, pilih file `.sqlite`, periksa tanggal, nama buku, dan jumlah transaksi, lalu tekan **Pulihkan Data**. Buku hasil pemulihan dapat dibuka setelah proses selesai.

Cadangan ini berisi buku, dompet, kategori, transaksi, dan budget. Foto/log OCR serta preferensi tampilan tidak disertakan. Cadangan disimpan di luar aplikasi oleh pengguna; buat secara berkala, khususnya sebelum menghapus aplikasi atau berpindah perangkat.

Saat aplikasi dijalankan lewat Metro dalam mode pengembangan, **Buku Contoh** dibuat dengan transaksi bulan berjalan. Aktifkan melalui **Pengaturan → Buku Keuangan** untuk mencoba laporan dan ekspor Excel.

## Status OCR

Alur scan yang sudah ada tetap tersedia. Penyempurnaan parser, kamus adaptif, rekonstruksi koordinat, dan evaluasi akurasi OCR ditunda sampai dataset struk tersedia. Dashboard OCR belum merupakan evaluasi akurasi riset yang final.

## Menjalankan

```sh
npm ci
npx expo start --dev-client
```

Gunakan APK development build yang sudah terpasang. Jangan menambahkan modul native atau menjalankan rebuild Android tanpa kebutuhan dan persetujuan eksplisit; lihat [AGENTS.md](AGENTS.md).

## Verifikasi

```sh
npm run test:finance
npx tsc --noEmit
npx expo lint
```

Pada PowerShell yang menolak skrip `.ps1`, gunakan `npm.cmd` / `npx.cmd`. Lint dapat dijalankan dengan `EXPO_OFFLINE=1` dan `CI=1` untuk pemeriksaan lokal.

Tes memakai Node.js 22.13+ (`node:sqlite`) dan database sementara, menjalankan repository TypeScript asli dengan adapter hanya pada batas native Expo. Data aplikasi tidak dibuka atau diubah oleh tes. Node dapat menampilkan peringatan eksperimental untuk SQLite; itu bukan kegagalan tes.

Database memiliki migrasi versi dan pemulihan seed awal yang terputus tanpa mengganti saldo pengguna. Semua pengujian otomatis tetap perlu dilengkapi pemeriksaan perangkat fisik untuk kamera, berbagi Android, keyboard, dan tata letak.
