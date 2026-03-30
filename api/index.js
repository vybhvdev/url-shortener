const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('../public'));

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
    const res = await getPool().query('SELECT shortcode FROM links WHERE shortcode = $1', [code]);
    exists = res.rows.length > 0;
  }
  return code;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
}

app.get('/api/health', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    await getPool().query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: err.message });
  }
});

app.post('/api/shorten', async (req, res) => {
  try {
    const { longUrl } = req.body;
    if (!longUrl) return res.status(400).json({ error: 'URL is required' });
    try { new URL(longUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    const shortCode = await generateShortCode();
    await getPool().query('INSERT INTO links (shortcode, longurl) VALUES ($1, $2)', [shortCode, longUrl]);
    const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
    res.json({ shortCode, shortUrl, longUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const result = await getPool().query(
      'SELECT shortcode, longurl, clickscount, createdat FROM links ORDER BY createdat DESC'
    );
    const links = result.rows.map(row => ({
      shortCode: row.shortcode,
      longUrl: row.longurl,
      clicksCount: row.clickscount,
      createdAt: row.createdat
    }));
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const linkRes = await getPool().query('SELECT shortcode, longurl, clickscount, createdat FROM links WHERE shortcode = $1', [code]);
    if (linkRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const linkRow = linkRes.rows[0];
    const link = {
      shortCode: linkRow.shortcode,
      longUrl: linkRow.longurl,
      clicksCount: linkRow.clickscount,
      createdAt: linkRow.createdat
    };

    const dailyRes = await getPool().query(
      `SELECT DATE(clickedat) as date, COUNT(*) as count
       FROM clicks
       WHERE shortcode = $1 AND clickedat > NOW() - INTERVAL '30 days'
       GROUP BY DATE(clickedat)
       ORDER BY date ASC`,
      [code]
    );

    const referrerRes = await getPool().query(
      `SELECT COALESCE(NULLIF(referrer,''), 'Direct / Unknown') as referrer, COUNT(*) as count
       FROM clicks
       WHERE shortcode = $1
       GROUP BY referrer
       ORDER BY count DESC
       LIMIT 5`,
      [code]
    );

    const recentRes = await getPool().query(
      `SELECT clickedat, ip, useragent, referrer
       FROM clicks
       WHERE shortcode = $1
       ORDER BY clickedat DESC
       LIMIT 10`,
      [code]
    );

    res.json({
      ...link,
      dailyClicks: dailyRes.rows,
      topReferrers: referrerRes.rows,
      recentClicks: recentRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const linkRes = await getPool().query('SELECT longurl FROM links WHERE shortcode = $1', [code]);
    if (linkRes.rows.length === 0) return res.status(404).send('Short URL not found');
    const longUrl = linkRes.rows[0].longurl;

    await getPool().query('UPDATE links SET clickscount = clickscount + 1 WHERE shortcode = $1', [code]);
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referrer = req.headers['referer'] || '';
    await getPool().query(
      'INSERT INTO clicks (shortcode, ip, useragent, referrer) VALUES ($1, $2, $3, $4)',
      [code, ip, userAgent, referrer]
    );
    res.redirect(302, longUrl);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = app;
