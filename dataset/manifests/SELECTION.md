# Pemisahan data uji OCR KASKUY

Dataset sumber `dataset/raw/Alfamart_Indomaret_Struk/` berisi 122 gambar JPG. Fold sumber terdiri dari 85 `train`, 24 `valid`, dan 13 `test`. Anotasi COCO menandai kotak item, diskon, dan voucher. Nilai yang tercetak pada struk ditranskripsikan langsung dari gambar.

| Merek | Pengembangan | Uji akhir |
| --- | ---: | ---: |
| Alfamart | 5 | 13 |
| Alfamidi | 5 | 13 |
| Indomaret | 5 | 14 |
| Jumlah | 15 | 40 |

Manifest mendefinisikan pembagian KASKUY terlepas dari fold sumber. Kelompok pengembangan diambil dari `train` dan mencakup contoh kontras tinggi, cetakan pudar, bagian terpotong, diskon, dan beberapa metode pembayaran. Kelompok uji akhir dipilih lewat tinjauan visual untuk menyeimbangkan merek dan memuat beragam kondisi gambar. Ada 67 gambar yang tidak dipilih. Berkas sumber tetap pada tempatnya. Gunakan hash SHA-256 pada setiap baris manifest untuk mengunci versi gambar.

Seluruh 122 hash berkas berbeda. Pemeriksaan tambahan membandingkan kemiripan citra dengan 256-bit difference hash pada empat rotasi, nama sumber, serta gambar yang tampak berulang. Tiga pasang foto struk yang sama dan dua pasang transaksi yang sangat mirip ditangani sebagai berikut. Akhiran nama merujuk pada bagian sebelum `.rf.`.

| Pasangan pada folder sumber | Keputusan |
| --- | --- |
| `test` 18 Nov `_76-1-_jpg` dan `train` 18 Nov `_76_jpg` | Keduanya di luar manifest. |
| `train` 18 Nov `_1_jpg` dan `_97_jpg` | Keduanya di luar manifest. |
| `train` 18 Nov `_62_jpg` dan `valid` 18 Nov `_58_jpg` | Keduanya di luar manifest. |
| `train` 18 Nov `_100_jpg` dan `_48_jpg` | Hanya `_48_jpg` masuk pengembangan. Toko, item, tanggal, dan total sama, dengan nomor transaksi, jam, dan metode bayar berbeda. |
| `train` 18 Nov `_56_jpg` dan `_59_jpg` | Keduanya di luar manifest. Toko, item, tanggal, dan nominal sama, dengan nomor transaksi dan jam berbeda. |

Pemeriksaan kemiripan mengurangi risiko kebocoran antar kelompok. Variasi foto yang dipotong atau diubah secara ekstrem masih dapat lolos dari metode ini. Tidak ada OCR maupun transkripsi acuan uji akhir dalam tahap persiapan ini.

## Pemilihan sampel verifikasi tambahan

Untuk memeriksa target akurasi setelah set 40 struk dipakai untuk diagnosis, 67 foto yang belum masuk manifest pengembangan atau uji akhir diurutkan berdasarkan SHA-256 dari gabungan teks `KASKUY independent threshold 93 2026-11-19:` dan hash foto. Setiap merek diambil dari urutan tersebut. Pemeriksa memilih dan mentranskripsikan acuan dari foto sebelum melihat hasil OCR. Bukti pada struk, penanda transaksi, dan hash dibandingkan dengan set sebelumnya untuk menyaring transaksi berulang. Foto terpotong dan cetakan pudar tetap diikutkan jika merek dapat diidentifikasi.

`validation.csv` memuat delapan foto tiap merek. Setelah hasilnya dipakai untuk diagnosis, `confirmation.csv` disusun dari foto tersisa dan diuji setelah versi parser dikunci. Set konfirmasi terdiri dari enam Alfamart, empat Alfamidi, dan enam Indomaret. Jumlah Alfamidi mengikuti sisa foto yang dapat dipastikan merek dan keunikan transaksinya.
