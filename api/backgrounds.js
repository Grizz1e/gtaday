// Vercel Serverless Function: GET /api/backgrounds
// Lists images in public/backgrounds/ so the Customize panel picks up any
// added image automatically — plus parallax packs (subdirectories holding
// background.* / foreground.* / full.* layers). Tries a live FS scan first,
// then the committed manifest.json (the client also falls back to fetching
// manifest.json directly, so this works even if the serverless FS can't see
// public/).
const fs = require('fs');
const path = require('path');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function prettyName(file) {
  return (
    file
      .replace(/\.[^.]+$/, '')
      .split(/[-_]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || file
  );
}

function pickLayerFile(dir, prefix) {
  try {
    const match = fs
      .readdirSync(dir)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && f.toLowerCase().startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
    return match[0] || null;
  } catch (_) {
    return null;
  }
}

function scanParallaxDir(dirName, dirPath) {
  const bg = pickLayerFile(dirPath, 'background');
  const fg = pickLayerFile(dirPath, 'foreground');
  const full = pickLayerFile(dirPath, 'full');
  if (!bg && !fg && !full) return null;
  const hero = full || bg || fg;
  const urlFor = (f) => (f ? `/backgrounds/${dirName}/${f}` : null);
  return {
    kind: 'parallax',
    dir: dirName,
    name: prettyName(dirName),
    background: urlFor(bg),
    foreground: urlFor(fg),
    full: urlFor(hero),
    thumb: urlFor(hero)
  };
}

function tryScan(dir) {
  try {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const entries = [];
    for (const ent of dirents) {
      if (ent.isDirectory()) {
        const px = scanParallaxDir(ent.name, path.join(dir, ent.name));
        if (px) entries.push(px);
      } else if (
        IMAGE_EXTS.has(path.extname(ent.name).toLowerCase()) &&
        ent.name.toLowerCase() !== 'manifest.json'
      ) {
        entries.push({
          kind: 'flat',
          file: ent.name,
          name: prettyName(ent.name),
          url: `/backgrounds/${ent.name}`
        });
      }
    }
    entries.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return entries;
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
