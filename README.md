# Kopi HPP — Asisten Bisnis Kopi

Aplikasi kalkulator HPP dan asisten AI untuk bisnis kopi, berbasis Node.js + Express + MySQL.

## Struktur Project

```
kopi-hpp/
├── server.js          # Backend Express + semua API route
├── package.json
├── .env               # Konfigurasi database & port
└── public/
    └── index.html     # Frontend (otomatis disajikan oleh Express)
```

## Cara Install & Jalankan

### 1. Buat database MySQL

```sql
CREATE DATABASE kopi_hpp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Tabel akan dibuat otomatis saat server pertama kali dijalankan.

### 2. Konfigurasi .env

Edit file `.env` sesuai setup MySQL kamu:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password_mysql_kamu
DB_NAME=kopi_hpp
PORT=3000
```

### 3. Install dependencies

```bash
npm install
```

### 4. Jalankan server

```bash
# Mode produksi
npm start

# Mode development (auto-restart saat file berubah)
npm run dev
```

Buka browser: **http://localhost:3000**

---

## Deploy ke Server VPS/Hosting

### Menggunakan PM2 (recommended)

```bash
# Install PM2 global
npm install -g pm2

# Jalankan aplikasi
pm2 start server.js --name kopi-hpp

# Auto-start saat server reboot
pm2 startup
pm2 save
```

### Menggunakan Nginx sebagai reverse proxy

```nginx
server {
    listen 80;
    server_name domain-kamu.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## API Endpoints

| Method | Endpoint              | Keterangan              |
|--------|-----------------------|-------------------------|
| GET    | /api/bahan            | Ambil semua bahan       |
| POST   | /api/bahan            | Tambah bahan baru       |
| DELETE | /api/bahan/:id        | Hapus bahan             |
| GET    | /api/menu             | Ambil semua menu        |
| POST   | /api/menu             | Tambah menu baru        |
| DELETE | /api/menu/:id         | Hapus menu              |
| GET    | /api/settings/:key    | Ambil setting           |
| POST   | /api/settings         | Simpan setting          |
| POST   | /api/ai/chat          | Proxy ke Anthropic AI   |

---

## Anthropic API Key

API key bisa diset dua cara:
1. **Via .env** — tambahkan `ANTHROPIC_API_KEY=sk-ant-...` di file `.env` (prioritas utama)
2. **Via UI Settings** — input di halaman Pengaturan, tersimpan di database MySQL

API key **tidak pernah dikirim ke browser** — semua request ke Anthropic diproxy melalui server.
