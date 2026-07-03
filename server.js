require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── DATABASE ──────────────────────────────────────────────────────────────
let db;

async function connectDB() {
  db = await mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'kopi_ai',
    waitForConnections: true,
    connectionLimit: 10,
  });
  console.log('✓ Terhubung ke MySQL');
}

async function initTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bahan (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nama       VARCHAR(100) NOT NULL,
      harga      DECIMAL(12,2) NOT NULL,
      qty        DECIMAL(12,4) NOT NULL,
      satuan     VARCHAR(20)  NOT NULL,
      hpu        DECIMAL(12,4) NOT NULL COMMENT 'harga per unit',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nama       VARCHAR(100) NOT NULL,
      overhead   DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_komposisi (
      id       INT AUTO_INCREMENT PRIMARY KEY,
      menu_id  INT NOT NULL,
      bahan_id INT NOT NULL,
      qty      DECIMAL(12,4) NOT NULL,
      FOREIGN KEY (menu_id)  REFERENCES menu(id)  ON DELETE CASCADE,
      FOREIGN KEY (bahan_id) REFERENCES bahan(id) ON DELETE RESTRICT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      k VARCHAR(100) PRIMARY KEY,
      v TEXT
    )
  `);

  console.log('✓ Tabel siap');
}

// ─── HELPER ────────────────────────────────────────────────────────────────
function ok(res, data)  { res.json({ ok: true,  data }); }
function err(res, msg, code = 400) { res.status(code).json({ ok: false, error: msg }); }

// ─── BAHAN ROUTES ──────────────────────────────────────────────────────────
// GET semua bahan
app.get('/api/bahan', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM bahan ORDER BY created_at DESC');
    ok(res, rows);
  } catch (e) { err(res, e.message, 500); }
});

// POST tambah bahan
app.post('/api/bahan', async (req, res) => {
  try {
    const { nama, harga, qty, satuan } = req.body;
    if (!nama || !harga || !qty || !satuan) return err(res, 'Field tidak lengkap');
    const hpu = parseFloat(harga) / parseFloat(qty);
    const [result] = await db.execute(
      'INSERT INTO bahan (nama, harga, qty, satuan, hpu) VALUES (?, ?, ?, ?, ?)',
      [nama, harga, qty, satuan, hpu]
    );
    const [rows] = await db.execute('SELECT * FROM bahan WHERE id = ?', [result.insertId]);
    ok(res, rows[0]);
  } catch (e) { err(res, e.message, 500); }
});

// DELETE hapus bahan
app.delete('/api/bahan/:id', async (req, res) => {
  try {
    // Cek apakah bahan dipakai di menu
    const [used] = await db.execute('SELECT COUNT(*) as c FROM menu_komposisi WHERE bahan_id = ?', [req.params.id]);
    if (used[0].c > 0) return err(res, 'Bahan masih digunakan di menu, hapus menu terkait terlebih dahulu');
    await db.execute('DELETE FROM bahan WHERE id = ?', [req.params.id]);
    ok(res, { id: parseInt(req.params.id) });
  } catch (e) { err(res, e.message, 500); }
});

// ─── MENU ROUTES ───────────────────────────────────────────────────────────
// GET semua menu beserta komposisi
app.get('/api/menu', async (req, res) => {
  try {
    const [menus] = await db.execute('SELECT * FROM menu ORDER BY created_at DESC');
    for (const m of menus) {
      const [komps] = await db.execute(`
        SELECT mk.id, mk.qty, b.id AS bahan_id, b.nama, b.satuan, b.hpu
        FROM menu_komposisi mk
        JOIN bahan b ON b.id = mk.bahan_id
        WHERE mk.menu_id = ?`, [m.id]);
      m.komposisi = komps;
    }
    ok(res, menus);
  } catch (e) { err(res, e.message, 500); }
});

// POST tambah menu
app.post('/api/menu', async (req, res) => {
  try {
    const { nama, overhead, komposisi } = req.body;
    if (!nama) return err(res, 'Nama menu wajib diisi');
    if (!komposisi || komposisi.length === 0) return err(res, 'Komposisi bahan tidak boleh kosong');

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      const [result] = await conn.execute(
        'INSERT INTO menu (nama, overhead) VALUES (?, ?)',
        [nama, overhead || 0]
      );
      const menuId = result.insertId;
      for (const k of komposisi) {
        await conn.execute(
          'INSERT INTO menu_komposisi (menu_id, bahan_id, qty) VALUES (?, ?, ?)',
          [menuId, k.bahan_id, k.qty]
        );
      }
      await conn.commit();
      conn.release();

      // Ambil data menu lengkap
      const [menus] = await db.execute('SELECT * FROM menu WHERE id = ?', [menuId]);
      const [komps] = await db.execute(`
        SELECT mk.id, mk.qty, b.id AS bahan_id, b.nama, b.satuan, b.hpu
        FROM menu_komposisi mk JOIN bahan b ON b.id = mk.bahan_id
        WHERE mk.menu_id = ?`, [menuId]);
      menus[0].komposisi = komps;
      ok(res, menus[0]);
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (e) { err(res, e.message, 500); }
});

// DELETE hapus menu
app.delete('/api/menu/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM menu WHERE id = ?', [req.params.id]);
    ok(res, { id: parseInt(req.params.id) });
  } catch (e) { err(res, e.message, 500); }
});

// ─── SETTINGS ROUTES ───────────────────────────────────────────────────────
// GET setting by key
app.get('/api/settings/:key', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT v FROM settings WHERE k = ?', [req.params.key]);
    ok(res, rows[0]?.v || null);
  } catch (e) { err(res, e.message, 500); }
});

// POST upsert setting
app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return err(res, 'Key wajib diisi');
    await db.execute(
      'INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
      [key, value]
    );
    ok(res, { key, value });
  } catch (e) { err(res, e.message, 500); }
});

// ─── AI PROXY ──────────────────────────────────────────────────────────────
// Proxy ke Anthropic agar API key aman di server
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;
    if (!messages || !messages.length) return err(res, 'Messages kosong');

    // Ambil API key: prioritas dari .env, fallback dari DB
    let apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const [rows] = await db.execute("SELECT v FROM settings WHERE k = 'anthropic_api_key'");
      apiKey = rows[0]?.v || '';
    }
    if (!apiKey) return err(res, 'API key Anthropic belum diset. Silakan isi di halaman Pengaturan.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt || 'Kamu adalah asisten bisnis kopi yang ramah.',
        messages,
      }),
    });

    const data = await response.json();
    if (data.error) return err(res, data.error.message);
    const reply = data.content?.find(x => x.type === 'text')?.text || '';
    ok(res, { reply });
  } catch (e) { err(res, e.message, 500); }
});

// ─── CATCH ALL → index.html ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    await connectDB();
    await initTables();
    app.listen(PORT, () => {
      console.log(`\n🚀 Kopi HPP berjalan di http://localhost:${PORT}\n`);
    });
  } catch (e) {
    console.error('❌ Gagal start server:', e.message);
    process.exit(1);
  }
})();
