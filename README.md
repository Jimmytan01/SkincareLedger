# Sistem Rekonsiliasi Stok Skincare

Aplikasi manajemen dan rekonsiliasi stok skincare berbasis **Stock Ledger Append-Only** sebagai *Single Source of Truth* (SSOT). Didesain untuk menutup 5 kebocoran stok utama: pesanan batal tanpa pengembalian, penanganan retur yang membingungkan, sampel/bonus keluar tidak tercatat, estimasi stok awal, serta kesalahan input manual admin.

---

## 🚀 Fitur Utama & Keunggulan Arsitektur

1. **Stock Ledger Append-Only (Immutability)**:
   - Sumber kebenaran mutlak. Hak `UPDATE` dan `DELETE` dicabut di Postgres RLS.
   - Setiap mutasi stok dilakukan atomik via RPC / Server Actions.
2. **Alokasi FEFO Otomatis (First Expired, First Out)**:
   - Satu fungsi alokasi tunggal (`process_stock_out_fefo`). Operator tidak pernah memilih batch secara manual.
3. **Titik Pencatatan Marketplace Presisi**:
   - Shopee terpotong saat `SHIPPED`, TikTok saat `IN_TRANSIT`. Sebelum titik tsb hanya terjadi *reservasi stok*.
4. **Alur Inspeksi Retur Terpisah**:
   - **Layak Jual**: Dialokasikan ke batch baru berinisial `RET-` + entri ledger `RETURN_IN`.
   - **Rusak / Hilang**: Tidak ada ledger kedua (mencegah double count), tetapi dicatat di tabel klaim (`returns_claims`) untuk audit.
5. **Versioning Resep Bundle**:
   - Resep bundle tersimpan sebagai snapshot versi saat order dibuat (`bundle_recipe_version`), menjaga integritas data transaksi historis walau resep bundle diubah.
6. **Marketplace Event Adapter Pattern (Rule #12)**:
   - Mendukung Event-Driven Architecture yang siap disambungkan ke Webhook Shopee/TikTok asli tanpa mengubah logika bisnis inti.
7. **Keamanan & Performa**:
   - Proteksi rute penuh via Supabase Auth + Edge Middleware (akses tanpa login otomatis ditolak 307 ke `/login`).
   - Ledger Explorer menggunakan Server-Side Pagination yang responsif walau memproses ribuan data.

---

## 🎮 Panduan Menjalankan Simulasi Marketplace

Halaman simulasi dapat diakses pada menu sidebar **Simulasi Sistem** (`/simulation`):

### 1. Injeksi Event Manual (`SimulatedEventSource`)
1. Buka menu **Simulasi Sistem** $\rightarrow$ **Form Simulasi Event Marketplace**.
2. Pilih **Event Type**: `ORDER_CREATED`, `STATUS_UPDATED`, `CANCELLED`, atau `RETURN_REQUESTED`.
3. Pilih **Channel**: `SHOPEE` / `TIKTOK`.
4. Masukkan **Order ID**, **SKU Produk/Bundle**, dan **Kuantitas**.
5. Klik **Kirim Event**. Event akan divalidasi oleh Zod Schema, dicek idempotency-nya, dan diproses oleh mesin state order.

### 2. Import Batch File CSV/XLSX (`FileImportEventSource`)
1. Buka menu **Simulasi Sistem** $\rightarrow$ **Upload File CSV/XLSX Event**.
2. Unggah file CSV/XLSX berformat event.
3. Klik **Proses Import Batch**. Semua event dalam file akan diproses secara berurutan dan terisolasi per idempotency key.

---

## 🔌 Titik Ganti / Integration Adapter (Kesiapan Webhook Real - Rule #12)

Sistem dirancang secara ketat menggunakan **Adapter Pattern** agar siap diintegrasikan dengan API / Webhook Shopee dan TikTok asli tanpa mengubah logika stok atau ledger.

### 1. Kontrak Interface Tunggal (`MarketplaceEvent`)
File kontrak terletak pada `src/types/marketplace.ts`:
```typescript
export interface MarketplaceEvent {
  event_id: string
  event_type: 'ORDER_CREATED' | 'STATUS_UPDATED' | 'CANCELLED' | 'RETURN_REQUESTED'
  order_id: string
  channel: 'SHOPEE' | 'TIKTOK'
  status?: 'CREATED' | 'SHIPPED' | 'IN_TRANSIT' | 'CANCELLED'
  timestamp: string
  items: {
    sku: string
    qty: number
  }[]
}
```

### 2. Titik Masuk Event Tunggal (`processMarketplaceEvent`)
File handler terletak pada `src/actions/marketplace.ts`:
```typescript
export async function processMarketplaceEvent(event: MarketplaceEvent)
```
Baik **SimulatedEventSource** (form manual) maupun **FileImportEventSource** (file import) **TIDAK PERNAH** menulis ke tabel ledger secara langsung. Keduanya SELALU memanggil `processMarketplaceEvent(event)`.

### 3. Cara Menyambung Webhook Asli (Shopee / TikTok) di Masa Depan:
Saat API/Webhook asli siap disambungkan:
1. Buat route handler API baru di Next.js: `src/app/api/webhooks/shopee/route.ts` dan `src/app/api/webhooks/tiktok/route.ts`.
2. Pada webhook handler tsb, lakukan parsing signature webhook asli, lalu *map* payload Shopee/TikTok ke objek `MarketplaceEvent`.
3. Panggil `await processMarketplaceEvent(mappedEvent)`.
4. **Logika bisnis inti, idempotency check, FEFO allocation, serta audit ledger 100% bekerja otomatis tanpa perlu modifikasi sedikitpun.**

---

## ⚙️ Skrip & Perintah Pengembangan

- `npm run dev` : Menjalankan server pengembangan lokal.
- `npm run build` : Membuat production build.
- `npx tsc --noEmit` : Memeriksa validasi tipe TypeScript.
