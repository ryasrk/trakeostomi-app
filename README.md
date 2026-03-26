# trakeostomi-app

Aplikasi web laporan Trakeostomi (Form Publik + Dashboard Admin) berbasis Node.js + Express dengan upload multi-gambar.

## Fitur

- Form publik (tanpa login) untuk input laporan
- Upload multi-gambar untuk tindakan (max 10 file, max 5MB/file, JPG/PNG/WEBP)
- Dashboard admin (login) untuk lihat, filter, pagination, edit, delete
- Export CSV
- Keamanan dasar: session admin, rate-limit, Helmet + CSP, proteksi akses upload, CSRF token untuk aksi admin

## Prasyarat

- Node.js (disarankan LTS)
- npm

## Instalasi

```bash
cd trakeostomi-app
npm install
```

## Konfigurasi Environment

Buat file `.env` di root project (file ini sudah di-`gitignore`). Contoh:

```bash
PORT=3000

# Admin credentials (WAJIB ganti untuk produksi)
ADMIN_USER=admin
ADMIN_PASS=GANTI_PASSWORD_ADMIN

# Session secret minimal 32 karakter
SESSION_SECRET=GANTI_SESSION_SECRET_MIN_32_CHAR

# Hanya set 1 kalau kamu deploy di balik reverse proxy (contoh: Nginx / Cloudflare / Vercel)
TRUST_PROXY=0
```

Catatan:
- Jangan commit `.env` atau credential apa pun.
- Default password admin hanya untuk development.

## Menjalankan Lokal

```bash
node server.js
```

Lalu buka:
- Lokal: `http://127.0.0.1:3000`
- LAN: `http://<IP-LAN-PC>:3000`

## Admin Login

- Halaman login: `/login.html`
- Dashboard admin: `/admin.html`

Catatan keamanan:
- Aksi admin (logout/edit/delete/export) memakai CSRF token dari endpoint login. Token disimpan di browser (storage) dan dikirim via header `x-csrf-token`.

## Ngrok (Expose ke Internet sementara)

Ngrok digunakan untuk membuat URL publik sementara yang men-tunnel ke server kamu.

### Install (Ubuntu)

```bash
sudo snap install ngrok
```

### Authtoken

Ambil authtoken dari dashboard ngrok, lalu set (jangan share token):

```bash
ngrok config add-authtoken <TOKEN_KAMU>
```

### Jalankan tunnel ke port 3000

Pastikan app sudah jalan (`node server.js`), lalu:

```bash
ngrok http 3000
```

Ngrok akan menampilkan URL publik (HTTPS). Dashboard lokal ngrok:

- `http://127.0.0.1:4040`

### URL Fixed / Reserved Domain

URL fixed tidak tersedia di Free plan. Jika akun kamu sudah mendukung reserved domain, jalankan:

```bash
ngrok http --domain=nongravitational-blondell-awakeable.ngrok-free.dev 3000
```

Kalau muncul error `not authorized` / butuh paid plan, berarti fitur reserved domain belum aktif di plan kamu.

## Data & Upload

Project ini memakai penyimpanan lokal selama development:

- `data.json` (data laporan)
- `public/uploads/` (file gambar)

Keduanya di-`gitignore` karena termasuk data runtime dan bisa berisi data sensitif.

## Catatan Produksi

- Jangan pakai password default.
- Pastikan `SESSION_SECRET` kuat.
- Untuk deployment serverless (mis. Vercel), filesystem lokal tidak cocok untuk `data.json` dan `uploads` (harus pindah ke DB + object storage).

