# OpenClaw Sandbox Lab Backup

Backup ini dibuat untuk menjaga hasil kerja saat ini agar bisa dipulihkan kembali tanpa Paperclip.

## Isi backup
- Source code aplikasi dari `openclaw-sandbox-lab`
- Manifest pemulihan di `restore-manifest.json`
- Template konfigurasi di `.env.example`
- Catatan backup di `BACKUP_NOTES.md`

## Yang sengaja tidak ikut
- Folder atau file Paperclip
- `.git`
- `node_modules`
- `dist`, `build`, `.next`, `coverage`
- File rahasia seperti `.env`, key, secret, token

## Prasyarat
- Node.js 20+
- npm 10+
- PostgreSQL yang aman untuk dipakai

## Langkah pulih cepat
1. Clone repo backup ini.
2. Salin `.env.example` menjadi `.env`.
3. Isi nilai environment yang dibutuhkan, terutama `DATABASE_URL`.
4. Jalankan `npm install`.
5. Untuk mode pengembangan, jalankan `npm run dev`.
6. Untuk mode build, jalankan `npm run build` lalu `npm run start`.

## Catatan penting
- Aplikasi ini memiliki konfigurasi Drizzle yang membutuhkan `DATABASE_URL`.
- Jangan jalankan `npm run db:push` ke database produksi tanpa persetujuan eksplisit.
- Repo ini adalah snapshot yang dapat dipakai OpenClaw sebagai basis restore dan bootstrap ulang.
