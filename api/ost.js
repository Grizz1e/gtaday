// Vercel Serverless Function: GET /api/ost
// Lists audio in public/ost/ so the speaker (music) panel picks up any added
// track automatically. Tries a live FS scan first, then the committed
// manifest.json (the client also falls back to fetching manifest.json
// directly, so this works even if the serverless FS can't see public/).
const fs = require('fs');
const path = require('path');

function tryScan(dir) {
  try {
    const exts = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac']);
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
        url: `/ost/${encodeURIComponent(file)}`
      }));
  } catch (_) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const candidates = [
    path.join(process.cwd(), 'public', 'ost'),
    path.join(__dirname, '..', 'public', 'ost')
  ];

  for (const dir of candidates) {
    const list = tryScan(dir);
    if (list && list.length > 0) {
      return res.status(200).json({ success: true, tracks: list, source: 'scan' });
    }
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
      return res.status(200).json({ success: true, tracks: manifest, source: 'manifest' });
    } catch (_) {}
  }

  return res.status(200).json({ success: true, tracks: [], source: 'empty' });
};
