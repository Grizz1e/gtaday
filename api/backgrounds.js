// Vercel Serverless Function: GET /api/backgrounds
// Lists images in public/backgrounds/ so the Customize panel picks up any
// added image automatically. Tries a live FS scan first, then the committed
// manifest.json (the client also falls back to fetching manifest.json
// directly, so this works even if the serverless FS can't see public/).
const fs = require('fs');
const path = require('path');

function tryScan(dir) {
  try {
    const exts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
    return fs
      .readdirSync(dir)
      .filter(f => exts.has(path.extname(f).toLowerCase()))
      .filter(f => f.toLowerCase() !== 'manifest.json')
      .sort((a, b) => a.localeCompare(b))
      .map(file => ({
        file,
        name: file
          .replace(/\.[^.]+$/, '')
          .split(/[-_]+/)
          .filter(Boolean)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ') || file,
        url: `/backgrounds/${file}`
      }));
  } catch (_) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const candidates = [
    path.join(process.cwd(), 'public', 'backgrounds'),
    path.join(__dirname, '..', 'public', 'backgrounds')
  ];

  for (const dir of candidates) {
    const list = tryScan(dir);
    if (list && list.length > 0) {
      return res.status(200).json({ success: true, backgrounds: list, source: 'scan' });
    }
    // Empty-but-readable dir + manifest fallback below
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
      return res.status(200).json({ success: true, backgrounds: manifest, source: 'manifest' });
    } catch (_) {}
  }

  return res.status(200).json({ success: true, backgrounds: [], source: 'empty' });
};
