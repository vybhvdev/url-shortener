const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Supabase connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function generateShortCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code;
  let exists = true;
  while (exists) {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const res = await pool.query('SELECT shortCode FROM links WHERE shortCode = $1', [code]);
    exists = res.rows.length > 0;
  }
  return code;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
}

app.post('/api/shorten', async (req, res) => {
  const { longUrl } = req.body;
  if (!longUrl) return res.status(400).json({ error: 'URL is required' });
  try { new URL(longUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  const shortCode = await generateShortCode();
  await pool.query('INSERT INTO links (shortCode, longUrl) VALUES ($1, $2)', [shortCode, longUrl]);
  const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
  res.json({ shortCode, shortUrl, longUrl });
});

app.get('/api/links', async (req, res) => {
  const result = await pool.query('SELECT shortCode, longUrl, clicksCount, createdAt FROM links ORDER BY createdAt DESC');
  res.json(result.rows);
});

app.get('/api/stats/:code', async (req, res) => {
  const { code } = req.params;
  const linkRes = await pool.query('SELECT shortCode, longUrl, clicksCount, createdAt FROM links WHERE shortCode = $1', [code]);
  if (linkRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const link = linkRes.rows[0];

  const dailyRes = await pool.query(`
    SELECT DATE(clickedAt) as date, COUNT(*) as count
    FROM clicks
    WHERE shortCode = $1 AND clickedAt > NOW() - INTERVAL '30 days'
    GROUP BY DATE(clickedAt)
    ORDER BY date ASC
  `, [code]);

  const referrerRes = await pool.query(`
    SELECT COALESCE(NULLIF(referrer,''), 'Direct / Unknown') as referrer, COUNT(*) as count
    FROM clicks
    WHERE shortCode = $1
    GROUP BY referrer
    ORDER BY count DESC
    LIMIT 5
  `, [code]);

  const recentRes = await pool.query(`
    SELECT clickedAt, ip, userAgent, referrer
    FROM clicks
    WHERE shortCode = $1
    ORDER BY clickedAt DESC
    LIMIT 10
  `, [code]);

  res.json({
    ...link,
    dailyClicks: dailyRes.rows,
    topReferrers: referrerRes.rows,
    recentClicks: recentRes.rows
  });
});

app.get('/:code', async (req, res) => {
  const { code } = req.params;
  const linkRes = await pool.query('SELECT longUrl FROM links WHERE shortCode = $1', [code]);
  if (linkRes.rows.length === 0) return res.status(404).send('Short URL not found');
  const longUrl = linkRes.rows[0].longUrl;

  await pool.query('UPDATE links SET clicksCount = clicksCount + 1 WHERE shortCode = $1', [code]);
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const referrer = req.headers['referer'] || '';
  await pool.query('INSERT INTO clicks (shortCode, ip, userAgent, referrer) VALUES ($1, $2, $3, $4)', [code, ip, userAgent, referrer]);

  res.redirect(302, longUrl);
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}
module.exports = app;
