#!/usr/bin/env node
// GTA CLOCK — Build minified frontend assets (public/app.min.js, style.min.css).
// Uses esbuild + clean-css when installed; falls back to a whitespace-only
// pass so `npm run build` never fails on hosts without devDependencies.
// Server + index.html prefer the .min files automatically with fallback to
// the unminified originals (works on both Render and Vercel).
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

function simpleMinifyJs(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,()\[\]=+\-*/<>!&|?])\s*/g, '$1')
    .trim();
}

function simpleMinifyCss(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

async function minifyJs() {
  const src = path.join(PUBLIC, 'app.js');
  const out = path.join(PUBLIC, 'app.min.js');
  const code = fs.readFileSync(src, 'utf-8');
  try {
    const { transform } = require('esbuild');
    const result = await transform(code, { minify: true, target: 'es2019', sourcemap: false });
    fs.writeFileSync(out, result.code);
    console.log(`wrote ${out} (${code.length} -> ${result.code.length} bytes)`);
  } catch (e) {
    const min = simpleMinifyJs(code);
    fs.writeFileSync(out, min);
    console.log(`wrote ${out} via fallback minifier (${code.length} -> ${min.length} bytes): ${e.message}`);
  }
}

async function minifyCss() {
  const src = path.join(PUBLIC, 'style.css');
  const out = path.join(PUBLIC, 'style.min.css');
  const code = fs.readFileSync(src, 'utf-8');
  try {
    const CleanCSS = require('clean-css');
    const result = new CleanCSS({ level: 2 }).minify(code);
    if (result.errors && result.errors.length) throw new Error(result.errors.join('; '));
    fs.writeFileSync(out, result.styles);
    console.log(`wrote ${out} (${code.length} -> ${result.styles.length} bytes)`);
  } catch (e) {
    const min = simpleMinifyCss(code);
    fs.writeFileSync(out, min);
    console.log(`wrote ${out} via fallback minifier (${code.length} -> ${min.length} bytes): ${e.message}`);
  }
}

(async () => {
  await minifyJs();
  await minifyCss();
})().catch((err) => {
  console.error('minify failed:', err.message);
  process.exit(1);
});
