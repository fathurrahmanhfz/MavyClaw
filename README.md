# MavyClaw

MavyClaw adalah workspace benchmark ops untuk tim agent AI yang butuh cara kerja lebih rapi daripada sekadar chat, spreadsheet, dan catatan acak.

Kalau tim Anda menjalankan benchmark agent, menilai hasil run, memikirkan safety sebelum aksi berisiko, lalu ingin menyimpan lesson learned dan review secara konsisten, MavyClaw memberi titik awal yang sudah konkret.

## Kenapa repo ini layak dipasang

Masalah yang sering terjadi di tim agent ops biasanya sama:
- skenario benchmark tersebar di mana-mana
- hasil run tidak tercatat dengan rapi
- keputusan safety hanya hidup di chat
- pelajaran dari kegagalan hilang setelah task selesai
- review akhir tidak punya format yang konsisten
- dashboard operasional tidak ada atau terlambat dibuat

MavyClaw menyatukan semua itu dalam satu aplikasi ringan yang sudah punya alur kerja nyata.

Jadi alasan orang memasang repo ini bukan karena ingin aplikasi demo biasa, tetapi karena ingin fondasi yang sudah jadi untuk benchmark operations workspace internal.

## Apa yang sudah ada

Repo publik ini sudah berisi aplikasi full-stack yang bisa dijalankan dan langsung menunjukkan alur kerja inti MavyClaw.

Fitur utama yang sudah ada:
- katalog skenario benchmark
- benchmark runs dengan status dan catatan operator
- safety gate untuk evaluasi risiko sebelum aksi
- lessons learned untuk kegagalan dan near-miss
- post-task review yang terstruktur
- dashboard untuk ringkasan operasional
- health endpoint untuk verifikasi runtime
- validasi payload dasar di API
- CI publik untuk typecheck dan build

## Cara kerja MavyClaw

Alur kerja yang didukung MavyClaw:
1. Susun skenario benchmark yang realistis.
2. Jalankan benchmark run terhadap skenario yang dipilih.
3. Catat status run, evidence, dan operator note.
4. Lakukan safety gate sebelum tindakan yang berisiko.
5. Simpan lesson learned dari kegagalan atau near-miss.
6. Tutup pekerjaan dengan post-task review.
7. Pantau ringkasannya dari dashboard.

## Cocok untuk siapa

MavyClaw paling cocok untuk:
- tim AI agent ops
- tim evaluasi agent
- internal tooling team
- engineering manager yang butuh benchmark evidence lebih rapi
- tim yang ingin membangun workflow agent yang lebih aman dan bisa diaudit

Kalau yang dicari adalah platform enterprise yang sudah lengkap dengan auth, multi-user, dan persistence production-ready, repo ini belum di level itu.

## Kenapa ini lebih berguna daripada mulai dari nol

Mulai dari nol kelihatannya mudah, tapi biasanya berakhir dengan:
- schema data yang tidak konsisten
- istilah dan status yang berubah-ubah
- safety review yang tidak pernah benar-benar dibakukan
- lesson learned yang tidak pernah dipakai ulang
- dashboard yang baru dibuat belakangan setelah data sudah berantakan

MavyClaw memberi struktur awal yang langsung bisa dipakai, lalu dikembangkan sesuai proses tim masing-masing.

## Fitur

### Scenario catalog
Kelola skenario benchmark dengan field yang memang berguna untuk operasi nyata, seperti kategori, tingkat kesulitan, readiness, objective, acceptance criteria, safe steps, anti-pattern, dan verification checklist.

### Benchmark runs
Buat run baru, ubah status, simpan operator note, catat evidence, dan lacak perkembangan benchmark dari planned sampai passed atau failed.

### Safety gate
Evaluasi target environment, mode aksi, aset terdampak, recovery path, verifikasi minimum, dan keputusan gate sebelum langkah berisiko dilakukan.

### Lessons learned
Simpan konteks kegagalan, gejala, akar masalah, dampak, pencegahan, dan tingkat promosi pembelajaran agar pengetahuan operasional tidak hilang.

### Post-task review
Simpan hasil akhir task, bukti verifikasi, apa yang berhasil, apa yang gagal, near-miss, dan langkah lanjut paling aman.

### Dashboard
Lihat total skenario, run, lesson, review, safety check, distribusi status, kategori error, dan benchmark terbaru dalam satu tampilan.

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
3. Salin `.env.example` menjadi `.env` bila ingin menyesuaikan konfigurasi lokal.
4. Jalankan `npm run dev`.

### Build
```bash
npm run build
npm run start
```

## Environment

Environment variable yang bisa dipakai:
- `PORT`
- `NODE_ENV`
- `DATABASE_URL`

Saat ini snapshot publik tetap bisa dijalankan tanpa database aktif karena runtime default masih memakai seeded in-memory storage. `DATABASE_URL` sudah disiapkan sebagai fondasi untuk pengembangan persistence berikutnya.

Contoh:
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Status repo saat ini

Posisi repo publik ini sekarang adalah public prototype yang rapi dan layak dipakai untuk:
- evaluasi produk
- demo internal
- fondasi internal tool
- basis pengembangan lanjutan

Yang belum ada saat ini:
- persistence database aktif sebagai runtime default
- auth dan multi-user
- test suite yang lebih lengkap dari quality gate dasar
- fitur production-grade penuh

## Catatan keamanan

Jangan arahkan eksperimen database atau perubahan berisiko ke environment production tanpa verifikasi dan persetujuan yang jelas.

## License

MIT
