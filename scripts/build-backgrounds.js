#!/usr/bin/env node
// GTA CLOCK — Rebuild media manifests by scanning folders.
// Run: npm run backgrounds
// - Any image in public/backgrounds/ (*.jpg, *.jpeg, *.png, *.webp, *.gif,
//   *.avif) automatically appears in the Customize panel.
// - Any audio in public/ost/ (*.mp3, *.ogg, *.wav, *.m4a, *.flac) automatically
//   appears in the speaker (music) panel.
// The server also runs this on every boot, and /api/backgrounds + /api/ost
// scan live, so on Render/local no manual step is needed. For Vercel static
// deploys, run this before committing so the manifests ship with new files.
const fs = require('fs');
const path = require('path');

const BACKGROUNDS_DIR = path.join(__dirname, '..', 'public', 'backgrounds');
const BACKGROUNDS_MANIFEST = path.join(BACKGROUNDS_DIR, 'manifest.json');
const OST_DIR = path.join(__dirname, '..', 'public', 'ost');
const OST_MANIFEST = path.join(OST_DIR, 'manifest.json');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac']);

function prettyName(file) {
  const base = file.replace(/\.[^.]+$/, '');
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || file;
}

function scanBackgrounds() {
  let names = [];
  try {
    names = fs.readdirSync(BACKGROUNDS_DIR, { withFileTypes: true });
  } catch (_) {
    return [];
  }

  const entries = [];
  for (const ent of names) {
    const fullPath = path.join(BACKGROUNDS_DIR, ent.name);
    if (ent.isDirectory()) {
      const px = scanParallaxDir(ent.name, fullPath);
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
}

// A subdirectory holding layer files becomes one parallax entry.
// Convention (case-insensitive prefix, any image extension):
//   background.* / foreground.* / full.*
// Missing layers degrade gracefully (hero falls back full -> background -> foreground).
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

function scanOst() {
  return scanDir(OST_DIR, AUDIO_EXTS, '/ost');
}

function scanDir(dir, exts, urlPrefix) {
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }

  return files
    .filter(f => exts.has(path.extname(f).toLowerCase()))
    .filter(f => f.toLowerCase() !== 'manifest.json')
    .sort((a, b) => a.localeCompare(b))
    .map(file => ({
      file,
      name: prettyName(file),
      url: `${urlPrefix}/${file}`
    }));
}

function writeManifest(manifestPath, entries) {
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + '\n');
  } catch (err) {
    console.warn('Could not write manifest:', manifestPath, err.message);
    return false;
  }
  return true;
}

function buildManifest() {
  const backgrounds = scanBackgrounds();
  if (writeManifest(BACKGROUNDS_MANIFEST, backgrounds)) {
    console.log(`wrote ${BACKGROUNDS_MANIFEST} (${backgrounds.length} background(s))`);
  }
  const tracks = scanOst();
  if (writeManifest(OST_MANIFEST, tracks)) {
    console.log(`wrote ${OST_MANIFEST} (${tracks.length} track(s))`);
  }
  return backgrounds;
}

if (require.main === module) {
  buildManifest();
}

module.exports = { buildManifest, scanBackgrounds, scanOst, BACKGROUNDS_DIR };
