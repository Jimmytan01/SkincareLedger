# Laporan Penjelasan Kejanggalan 1 & 2 dan Verifikasi Fresh Saldo SKU-002

> [!IMPORTANT]
> **GARANSI KEAMANAN DATA (READ-ONLY)**:  
> **TIDAK ADA DATA APAPUN YANG DIHAPUS, DIUBAH, ATAU DIEKSEKUSI PADA TAHAP INI.**  
> Seluruh data di bawah diambil murni dari query *fresh* database live Supabase.

---

## 1. PENJELASAN KEJANGGALAN 1 — Asal-Usul Baris Melonjak dari 13 ke 22 Baris

### Tabel Fresh 22 Baris `stock_ledger` untuk SKU-002 (Live Database Saat Ini):

Berikut adalah **seluruh 22 baris `stock_ledger` untuk SKU-002** yang diurutkan secara kronologis berdasarkan `created_at`, lengkap dengan penanda baris baru (Baris 14 s/d 22):

| No | Created At (WIB) | Kode Batch | Reason Code | Source Type | Qty Delta | Running Sum | Status Baris | Reference Note |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **1** | `19/7/2026, 18.07.46` | `B002-FAR` | `OPENING_BALANCE` | `SYSTEM_SEED` | **+200** | **200** | Baris Asli (13 Lama) | *(NULL)* |
| **2** | `20/7/2026, 22.31.12` | `B002-NEAR` | `SALE` | `MANUAL` | **-1** | **199** | Baris Asli (13 Lama) | *(NULL)* |
| **3** | `21/7/2026, 19.49.19` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | **200** | Baris Asli (13 Lama) | `coba` |
| **4** | `28/7/2026, 23.47.26` | `B002-NEAR` | `OPNAME_CORRECTION` | `OPNAME_SESSION` | **-1** | **199** | Baris Asli (13 Lama) | `[ESTIMASI FEFO] Defisit dari opname` |
| **5** | `29/7/2026, 12.56.43` | `B002-NEAR` | `SALE` | `MARKETPLACE_ORDER` | **-5** | **194** | Baris Asli (13 Lama) | *(NULL)* |
| **6** | `30/7/2026, 14.48.19` | `RET-7C1F91` | `RETURN_IN` | `RETURN_INSPECTION` | **+2** | **196** | Baris Asli (13 Lama) | *(NULL)* |
| **7** | `30/7/2026, 15.01.04` | `RET-F3CF21` | `RETURN_IN` | `RETURN_INSPECTION` | **+4** | **200** | Baris Asli (13 Lama) | *(NULL)* |
| **8** | `30/7/2026, 16.19.49` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | **201** | Baris Asli (13 Lama) | `coba` |
| **9** | `30/7/2026, 19.13.04` | `RET-6B9D92` | `RETURN_IN` | `RETURN_INSPECTION` | **+5** | **206** | Baris Asli (13 Lama) | *(NULL)* |
| **10** | `30/7/2026, 19.13.48` | `B002-NEAR` | `OPNAME_CORRECTION` | `OPNAME_SESSION` | **-5** | **201** | Baris Asli (13 Lama) | `[ESTIMASI FEFO] Defisit dari opname` |
| **11** | `13/8/2026, 00.02.55` | `B002-NEAR` | `SAMPLE` | `TEST_IMMUTABILITY` | **-1** | **200** | Baris Asli (13 Lama) | `Pengujian trigger immutability INSERT` |
| **12** | `13/8/2026, 00.06.24` | `B002-NEAR` | `SAMPLE` | `TEST_IMMUTABILITY` | **-1** | **199** | Baris Asli (13 Lama) | `Pengujian trigger immutability INSERT` |
| **13** | `13/8/2026, 00.10.38` | `B002-FAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **-200** | **-1** | Baris Asli (13 Lama) | `Pengujian RPC manual correction dengan trigger immutability` |
| **14** | `14/8/2026, 00.16.44` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | **0** | **🆕 BARIS BARU** | `Penetralan entri test Tahap 3 (REF-IMMUTABILITY-...-SAMPLE-1786554175)` |
| **15** | `14/8/2026, 00.16.44` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | **1** | **🆕 BARIS BARU** | `Penetralan entri test Tahap 3 (REF-IMMUTABILITY-...-SAMPLE-1786554384)` |
| **16** | `14/8/2026, 00.16.44` | `B002-FAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+200** | **201** | **🆕 BARIS BARU** | `Penetralan entri test RPC 5 (TEST-CORR-1786554637598)` |
| **17** | `14/8/2026, 00.16.53` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | **202** | **🆕 BARIS BARU** | `Penetralan entri test Tahap 3 (REF-IMMUTABILITY-...-SAMPLE-1786554175)` |
| **18** | `14/8/2026, 00.16.53` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | **203** | **🆕 BARIS BARU** | `Penetralan entri test Tahap 3 (REF-IMMUTABILITY-...-SAMPLE-1786554384)` |
| **19** | `14/8/2026, 00.16.54` | `B002-FAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+200** | **403** | **🆕 BARIS BARU** | `Penetralan entri test RPC 5 (TEST-CORR-1786554637598)` |
| **20** | `14/8/2026, 00.18.00` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **-1** | **402** | **🆕 BARIS BARU** | `Netralisasi eksekusi ganda skrip test` |
| **21** | `14/8/2026, 00.18.00` | `B002-NEAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **-1** | **401** | **🆕 BARIS BARU** | `Netralisasi eksekusi ganda skrip test` |
| **22** | `14/8/2026, 00.18.00` | `B002-FAR` | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **-200** | **201** | **🆕 BARIS BARU** | `Netralisasi eksekusi ganda skrip test` |

---

### Penjelasan Rinci Asal-Usul Baris 14 s/d 22:

Ketika Anda memberikan instruksi *"jalankan opsi A"*, skrip eksekusi `execute_option_a_corrections.mjs` dipicu:

1. **Baris 14, 15, 16 (+1, +1, +200)**:  
   Diproduksi oleh eksekusi Opsi A asli melalui background task pada `14/8/2026 00:16:44 WIB`.  
   > *Perhatikan Running Sum pada Baris 16*: Saldo running sum secara tepat dan sempurna mencapai **PERSIS 201 unit**!

2. **Baris 17, 18, 19 (+1, +1, +200)**:  
   Terjadi eksekusi ulang (*duplicate execution*) skrip yang sama secara synchronous pada `14/8/2026 00:16:53 WIB`, sehingga memasukkan koreksi duplikat dan menaikkan running sum dari 201 menjadi 403.

3. **Baris 20, 21, 22 (-1, -1, -200)**:  
   Diproduksi oleh skrip pemulihan duplikasi `fix_double_run.mjs` pada `14/8/2026 00:18:00 WIB` untuk menetralkan duplikasi Baris 17-19 tanpa melanggar prinsip immutability.
   > **Efek Net Baris 17 s/d 22 = 0 unit** ($+1 + 1 + 200 - 1 - 1 - 200 = 0$).

---

## 2. PENJELASAN KEJANGGALAN 2 — Asal-Usul "Batch `B002-NEAR` Defisit -10 Unit"

### 1. Identitas `Batch 10000000-0000-0000-0000-000000000003` (`B002-NEAR`)
Batch `B002-NEAR` adalah batch katalog bawaan dari setup pertama sistem (`SYSTEM_SEED`) dengan tanggal kedaluwarsa lebih cepat dibanding `B002-FAR`. 

Karena sistem mengadopsi alokasi **FEFO (First Expired, First Out)** secara ketat, seluruh transaksi pengeluaran barang (`SALE`, `OPNAME_CORRECTION`, `SAMPLE`) secara otomatis memotong stok dari batch `B002-NEAR` ini terlebih dahulu sebelum menyentuh batch `B002-FAR` (+200 unit).

### 2. Rincian Seluruh 14 Baris Ledger yang Menyentuh Batch `B002-NEAR`:

| No Baris | Reason Code | Source Type | Qty Delta | Running Sum Batch `B002-NEAR` |
| :---: | :--- | :--- | :---: | :---: |
| **Baris 2** | `SALE` | `MANUAL` | **-1** | -1 unit |
| **Baris 3** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | 0 unit |
| **Baris 4** | `OPNAME_CORRECTION` | `OPNAME_SESSION` | **-1** | -1 unit |
| **Baris 5** | `SALE` | `MARKETPLACE_ORDER` | **-5** | -6 unit |
| **Baris 8** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | -5 unit |
| **Baris 10** | `OPNAME_CORRECTION` | `OPNAME_SESSION` | **-5** | **-10 unit** |
| **Baris 11** | `SAMPLE` | `TEST_IMMUTABILITY` | **-1** | -11 unit |
| **Baris 12** | `SAMPLE` | `TEST_IMMUTABILITY` | **-1** | -12 unit |
| **Baris 14** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | -11 unit |
| **Baris 15** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | -10 unit |
| **Baris 17** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | -9 unit |
| **Baris 18** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **+1** | -8 unit |
| **Baris 20** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **-1** | -9 unit |
| **Baris 21** | `MANUAL_CORRECTION` | `MANUAL_CORRECTION` | **-1** | **-10 unit** |

### 3. Mengapa Tidak Pernah Muncul Terpisah di Laporan 13-Baris Sebelumnya?
- Tabel 13-baris pada laporan sebelumnya menampilkan **agregat running sum seluruh SKU-002** (gabungan Batch `B002-FAR`, `B002-NEAR`, dan 3 batch retur).
- Transaksi-transaksi di atas **SUDAH TERMASUK** di dalam 13 baris asli tersebut (yaitu pada Baris 2, 3, 4, 5, 8, 10, 11, 12).
- Ketika dilaporkan bahwa total cache per-batch adalah 211 unit (`B002-FAR` 200 + 3 batch retur 11 = 211), selisih 10 unit menuju total SSOT 201 berasal dari total mutasi akumulasi pada `B002-NEAR` ini (-10 unit).

---

## 3. VERIFIKASI SALDO FINAL DARI NOL (PERHITUNGAN LENGKAP 22 BARIS)

Mari kita hitung **total penjumlahan dari nol** untuk seluruh 22 baris `stock_ledger` SKU-002 saat ini:

1. **Subtotal 10 Baris Transaksi Asli Bisnis (Baris 1 s/d 10)**:
   $$+200 - 1 + 1 - 1 - 5 + 2 + 4 + 1 + 5 - 5 = \mathbf{+201 \text{ unit}}$$

2. **Subtotal 3 Baris Entri Testing (Baris 11 s/d 13)**:
   $$(-1) + (-1) + (-200) = \mathbf{-202 \text{ unit}}$$

3. **Subtotal 3 Baris Koreksi Opsi A Asli (Baris 14 s/d 16)**:
   $$(+1) + (+1) + (+200) = \mathbf{+202 \text{ unit}}$$

4. **Subtotal 3 Baris Duplikasi Skrip (Baris 17 s/d 19)**:
   $$(+1) + (+1) + (+200) = \mathbf{+202 \text{ unit}}$$

5. **Subtotal 3 Baris Penetralan Duplikasi (Baris 20 s/d 22)**:
   $$(-1) + (-1) + (-200) = \mathbf{-202 \text{ unit}}$$

### Total Penjumlahan Matematika (22 Baris):
$$\text{SUM TOTAL LEDGER} = 201 - 202 + 202 + 202 - 202 = \mathbf{201 \text{ UNIT}}$$

---

### Kesimpulan Final:
- Jumlah total 22 baris ledger SKU-002 secara matematis dan empiris menghasilkan saldo akhir **PERSIS 201 UNIT**.
- Seluruh asal-usul baris tambahan (Baris 14 s/d 22) dan asal-usul mutasi Batch `B002-NEAR` (-10 unit) telah terpetakan 100% dan dapat diverifikasi silang.