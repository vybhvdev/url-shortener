const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Serve static files from the public folder (one level up)
app.use(express.static('../public'));

// Health check – helps debug connectivity
app.get('/api/health', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: err.message });
  }
});

// Database connection (reused across requests)
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

async function generateShortCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code, exists = true;
  while (exists) {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const res = await getPool().query('SELECT shortCode FROM links WHERE shortCode = $1', [code]);
    exists = res.rows.length > 0;
  }
  return code;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
}

app.post('/api/shorten', async (req, res) => {
  try {
    const { longUrl } = req.body;
    if (!longUrl) return res.status(400).json({ error: 'URL is required' });
    try { new URL(longUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    const shortCode = await generateShortCode();
    await getPool().query('INSERT INTO links (shortCode, longUrl) VALUES ($1, $2)', [shortCode, longUrl]);
    const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
    res.json({ shortCode, shortUrl, longUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const result = await getPool().query('SELECT shortCode, longUrl, clicksCount, createdAt FROM links ORDER BY createdAt DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const linkRes = await getPool().query('SELECT * FROM links WHERE shortCode = $1', [code]);
    if (linkRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const link = linkRes.rows[0];
    const dailyRes = await getPool().query(
      `SELECT DATE(clickedAt) as date, COUNT(*) as count FROM clicks WHERE shortCode = $1 AND clickedAt > NOW() - INTERVAL '30 days' GROUP BY DATE(clickedAt) ORDER BY date ASC`,
      [code]
    );
    const referrerRes = await getPool().query(
      `SELECT COALESCE(NULLIF(referrer,''), 'Direct / Unknown') as referrer, COUNT(*) as count FROM clicks WHERE shortCode = $1 GROUP BY referrer ORDER BY count DESC LIMIT 5`,
      [code]
    );
    const recentRes = await getPool().query(
      `SELECT clickedAt, ip, userAgent, referrer FROM clicks WHERE shortCode = $1 ORDER BY clickedAt DESC LIMIT 10`,
      [code]
    );
    res.json({ ...link, dailyClicks: dailyRes.rows, topReferrers: referrerRes.rows, recentClicks: recentRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const linkRes = await getPool().query('SELECT longUrl FROM links WHERE shortCode = $1', [code]);
    if (linkRes.rows.length === 0) return res.status(404).send('Short URL not found');
    const longUrl = linkRes.rows[0].longUrl;

    await getPool().query('UPDATE links SET clicksCount = clicksCount + 1 WHERE shortCode = $1', [code]);
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referrer = req.headers['referer'] || '';
    await getPool().query(
      'INSERT INTO clicks (shortCode, ip, userAgent, referrer) VALUES ($1, $2, $3, $4)',
      [code, ip, userAgent, referrer]
    );
    res.redirect(302, longUrl);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Export for Vercel
module.exports = app;
