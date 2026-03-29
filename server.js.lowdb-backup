const express = require('express');
const path = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Setup lowdb with default data
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const defaultData = { links: [], clicks: [] };
const db = new Low(adapter, defaultData);

// Initialize database
async function initDb() {
  await db.read();
  // If file was empty, defaultData is already set, but ensure it
  if (!db.data) db.data = defaultData;
  await db.write();
}
initDb();

// Helper: Generate unique short code
function generateShortCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (db.data.links.some(link => link.shortCode === code));
  return code;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
}

// API: Shorten URL
app.post('/api/shorten', async (req, res) => {
  const { longUrl } = req.body;
  if (!longUrl) return res.status(400).json({ error: 'URL is required' });
  try {
    new URL(longUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  const shortCode = generateShortCode();
  db.data.links.push({
    shortCode,
    longUrl,
    createdAt: new Date().toISOString(),
    clicksCount: 0
  });
  await db.write();
  const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
  res.json({ shortCode, shortUrl, longUrl });
});

// API: Get all links
app.get('/api/links', async (req, res) => {
  await db.read();
  res.json(db.data.links.map(l => ({
    shortCode: l.shortCode,
    longUrl: l.longUrl,
    clicksCount: l.clicksCount,
    createdAt: l.createdAt
  })));
});

// API: Get detailed stats for a short code
app.get('/api/stats/:code', async (req, res) => {
  const { code } = req.params;
  await db.read();
  const link = db.data.links.find(l => l.shortCode === code);
  if (!link) return res.status(404).json({ error: 'Not found' });

  const clicksForCode = db.data.clicks.filter(c => c.shortCode === code);

  // Daily clicks (last 30 days)
  const dailyMap = new Map();
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  clicksForCode.forEach(c => {
    const dateStr = c.clickedAt.slice(0, 10);
    if (dailyMap.has(dateStr)) dailyMap.set(dateStr, dailyMap.get(dateStr) + 1);
  });
  const dailyClicks = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top referrers
  const referrerCount = new Map();
  clicksForCode.forEach(c => {
    const ref = c.referrer && c.referrer !== '' ? c.referrer : 'Direct / Unknown';
    referrerCount.set(ref, (referrerCount.get(ref) || 0) + 1);
  });
  const topReferrers = Array.from(referrerCount.entries())
    .map(([referrer, count]) => ({ referrer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Recent clicks
  const recentClicks = clicksForCode
    .sort((a, b) => new Date(b.clickedAt) - new Date(a.clickedAt))
    .slice(0, 10)
    .map(c => ({
      clickedAt: c.clickedAt,
      ip: c.ip,
      userAgent: c.userAgent,
      referrer: c.referrer
    }));

  res.json({
    shortCode: link.shortCode,
    longUrl: link.longUrl,
    clicksCount: link.clicksCount,
    createdAt: link.createdAt,
    dailyClicks,
    topReferrers,
    recentClicks
  });
});

// Redirect endpoint
app.get('/:code', async (req, res) => {
  const { code } = req.params;
  await db.read();
  const linkIndex = db.data.links.findIndex(l => l.shortCode === code);
  if (linkIndex === -1) return res.status(404).send('Short URL not found');

  // Increment click count
  db.data.links[linkIndex].clicksCount += 1;

  // Record click
  db.data.clicks.push({
    shortCode: code,
    clickedAt: new Date().toISOString(),
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || 'unknown',
    referrer: req.headers['referer'] || ''
  });

  await db.write();
  res.redirect(302, db.data.links[linkIndex].longUrl);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
