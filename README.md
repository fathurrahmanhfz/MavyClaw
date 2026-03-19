# MavyClaw

MavyClaw adalah workspace operasi benchmark untuk tim agent AI yang ingin mengelola skenario, run, safety check, lesson learned, review, dan ringkasan operasional dalam satu aplikasi.

## Status saat ini

Repo publik ini sudah berada di level prototype yang rapi dan bisa dijalankan. UI, API, seeded sample data, dan alur kerja inti sudah berfungsi untuk demo, evaluasi produk, dan pengembangan lanjutan.

Snapshot publik saat ini belum memakai persistence database aktif sebagai default runtime. Schema Drizzle dan konfigurasi PostgreSQL sudah disertakan sebagai fondasi, tetapi runtime publik yang ada sekarang masih memakai seeded in-memory storage.

## Kenapa orang perlu memasang repo ini

MavyClaw berguna kalau tim butuh titik awal yang sudah jadi untuk:
- menyusun katalog skenario benchmark
- mencatat dan memantau benchmark runs
- menjalankan safety gate sebelum aksi berisiko
- menyimpan lesson learned dari kegagalan dan near-miss
- mendokumentasikan post-task review
- melihat ringkasan operasional dari dashboard

Alasan utama memasangnya bukan karena ia sudah menjadi platform benchmark paling lengkap, tetapi karena repo ini sudah memberi kerangka kerja operasional yang konkret, cepat dipahami, dan mudah dikembangkan untuk use case agent ops internal.

## Fitur

### Scenario catalog
Kelola skenario benchmark dengan informasi seperti judul, deskripsi, kategori, tingkat kesulitan, readiness, objective, acceptance criteria, safe steps, dan verification checklist.

### Benchmark runs
Buat run baru, ubah status run, simpan catatan operator, dan lacak hasil eksekusi benchmark.

### Safety gate
Catat evaluasi risiko sebelum tindakan penting, termasuk target environment, mode aksi, aset terdampak, recovery path, verifikasi minimum, dan keputusan gate.

### Lessons learned
Simpan pelajaran dari kegagalan, gejala, akar masalah, dampak, dan langkah pencegahan.

### Post-task review
Dokumentasikan hasil akhir task, bukti verifikasi, hal yang berhasil, hal yang gagal, near-miss, dan langkah lanjut paling aman.

### Dashboard
Lihat ringkasan skenario, run, lesson, review, safety check, distribusi status, kategori error, dan benchmark terbaru.

## Batasan saat ini

Batasan yang masih ada di snapshot publik ini:
- persistence database belum aktif sebagai runtime default
- automated test suite belum tersedia
- workflow CI publik belum tersedia
- autentikasi dan multi-user belum tersedia
- ini lebih cocok sebagai internal tool starter daripada produk siap produksi

## Stack

- React
- TypeScript
- Vite
- Express
- TanStack Query
- Tailwind CSS
- Radix UI
- Drizzle ORM
- PostgreSQL-compatible database

## Struktur proyek

- `client/` frontend React
- `server/` API Express
- `shared/` schema bersama
- `script/` build scripts

## Quick start

### Requirements
- Node.js 20+
- npm 10+

### Setup
1. Clone repository.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env` jika ingin menyesuaikan port atau menyiapkan fondasi database.
4. Jalankan `npm run dev`.

### Build
```bash
npm run build
npm run start
```

## Environment

Environment variable minimum untuk menjalankan app lokal:
- `PORT` opsional
- `NODE_ENV` opsional

`DATABASE_URL` belum wajib untuk snapshot publik saat ini, tetapi tetap disertakan untuk pengembangan lanjutan berbasis Drizzle dan PostgreSQL.

Contoh:
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Catatan keamanan

Jangan jalankan perubahan database ke environment production tanpa verifikasi dan persetujuan yang jelas.

## License

MIT
