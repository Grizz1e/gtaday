# GTA Clock (gtaclock.com)

A minimal, high-impact single-page countdown web application for **Grand Theft Auto VI** launching on **November 19, 2026 at 00:00 local time**.

---

## Deploying to Vercel (Persistent Database)

Because Vercel serverless functions run in an ephemeral, read-only filesystem, local JSON files reset on each new deployment. 

To ensure your subscriber database **persists forever** across every deployment and update, two zero-maintenance options are built in:

### Option 1: Resend Audiences & Contacts (Recommended — 0 Extra Setup)
Since you're already using **Resend**, every visitor who signs up is automatically added as a contact to your Resend account in the cloud via `resend.contacts.create()`.
1. Go to your [Resend Dashboard](https://resend.com/api-keys) and copy your **API Key**.
2. In your Vercel Project Settings (`Settings` -> `Environment Variables`), add:
   - `RESEND_API_KEY`: `re_your_api_key`
   - `RESEND_FROM_EMAIL`: `GTA Clock <onboarding@resend.dev>` (or your custom domain like `alerts@gtaclock.com`)
   - `RESEND_AUDIENCE_ID` *(optional)*: Found under Resend Audiences. If omitted, contacts are added to your primary audience.
3. Every subscriber is permanently stored in Resend, exportable as CSV anytime, and ready for broadcast emails!

### Option 2: Vercel KV (Redis) Storage (1-Click)
If you want an independent cloud database directly on Vercel:
1. In your Vercel Project dashboard, go to the **Storage** tab.
2. Click **Create Database** -> select **KV**.
3. Link it to your project. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. GTA Clock automatically detects these variables and saves every subscriber to persistent Redis cloud storage!

---

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Run locally:
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000).

---

## Custom Backgrounds

Drop any image (`.jpg`, `.png`, `.webp`, `.gif`, `.avif`) into `public/backgrounds/` and it appears automatically in the Customize panel (top-right sliders icon) — no code changes needed. Display names are generated from the filename (`neon-streets.jpg` → "Neon Streets").

- Local / Render: picked up live via `GET /api/backgrounds` (rescanned on every server boot too).
- Vercel static deploy: run `npm run backgrounds` before committing so `manifest.json` ships with your new images.
- The **Artwork slideshow** toggle in the same panel cycles all backgrounds with a slow Ken Burns zoom/pan crossfade, like the GTA loading screens (8s per artwork).

## Parallax Packs

For a depth effect, create a **subfolder** inside `public/backgrounds/` (e.g. `public/backgrounds/Boobie-Ike/`) holding layer files named by prefix (any image extension):

- `background.*` — back layer (moves least)
- `foreground.*` — front layer, ideally transparent PNG (moves most)
- `full.*` — composite used for thumbnails and as the flat fallback

The folder appears in the panel like any other background. Picking it shows the flat `full` composite statically; in slideshow mode its show plays a slow one-direction drift (pan right / left / push in / pull out, rotating per showing), GTA-loading-screen style — the foreground goes one way while the background goes the opposite way slower, on both pan and zoom (front in 1x while back out 0.5x and vice versa), so depth reads through opposition alone. Each show runs once and parks at its end pose (direction never changes mid-show). The glide is a single compositor transition, so it stays smooth regardless of page load. Missing layers degrade gracefully (`full` → `background` → `foreground`). Honors `prefers-reduced-motion`.

## Style Presets

First-time visitors get a picker with five looks — **Ultra Minimal** (bare digits), **Minimal**, **Balanced** (the default), **Informative**, and **Ultra Informative**. Each card shows a schematic preview of exactly what that preset enables. The same presets are re-appliable anytime from the Preset row at the top of the Customize panel.

## Radio (OST)

Drop audio files (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac`) into `public/ost/` and they appear automatically in the speaker-icon Radio panel — pick a track (default: GTA VI OST) and adjust volume. Track + volume persist across visits; playback starts by default, or on the first tap if the browser blocks autoplay.

- Local / Render: picked up live via `GET /api/ost`.
- Vercel static deploy: run `npm run backgrounds` before committing so `ost/manifest.json` ships with your new tracks.

---

## Architecture for Vercel

```
gtaclock/
├── api/
│   ├── subscribe.js         # Vercel Serverless Function (POST /api/subscribe)
│   └── stats.js             # Vercel Serverless Function (GET /api/stats)
├── lib/
│   └── subscribers.js       # Cloud persistence (Resend Contacts + Vercel KV)
├── public/
│   ├── assets/              # High-res GTA VI, PS5, Xbox logos & art
│   ├── app.js               # Countdown engine & notification handlers
│   ├── index.html           # Minimal centered layout
│   └── style.css            # Dark Vice City twilight aesthetic
├── server.js                # Express server for local development
├── vercel.json              # Vercel routing & rewrites configuration
├── .env.example             # Config template
└── package.json
```
