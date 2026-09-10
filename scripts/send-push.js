#!/usr/bin/env node
// GTA CLOCK — Send due push notifications (timezone-aware)
// Usage:
//   node scripts/send-push.js                  # send only due (targetUtc <= now, not yet notified)
//   node scripts/send-push.js --all            # force-send to ALL subscribers (ignores due/notified)
//   node scripts/send-push.js --dry-run        # show what would be sent, send nothing
//   node scripts/send-push.js --message "..."  # (with --all) custom body for manual blast
//
// In production you don't need this script: the in-process scheduler
// (server.js, Render) and /api/cron/dispatch (Vercel Cron / external cron)
// call the same dispatcher automatically every minute.

require('dotenv').config();
const webpush = require('web-push');
const { getAllPushSubscriptions, getDuePushSubscriptions, markPushNotified, prunePushSubscription } = require('../lib/push-subscribers');
const { ensureVapid } = require('../lib/dispatch');

const args = process.argv.slice(2);
const forceAll = args.includes('--all');
const dryRun = args.includes('--dry-run');
let customMessage = null;
const msgIdx = args.indexOf('--message');
if (msgIdx !== -1 && args[msgIdx + 1]) customMessage = args[msgIdx + 1];

if (!ensureVapid()) process.exit(1);

function buildPayload(sub) {
  return JSON.stringify({
    title: 'GTA 6 is HERE! 🎮',
    body: customMessage || 'Grand Theft Auto VI has launched in your timezone — the countdown is over, go play!',
    icon: '/assets/gta-vi-logo.png',
    badge: '/assets/gta-vi-logo.png',
    url: 'https://gtaclock.com',
    timezone: sub.timezone || undefined,
    targetUtc: sub.targetUtc || undefined
  });
}

async function main() {
  const list = forceAll ? await getAllPushSubscriptions() : await getDuePushSubscriptions(Date.now());

  if (!list || list.length === 0) {
    console.log(forceAll ? 'No push subscribers found.' : 'No due push subscribers found (all timers in the future or already notified).');
    return;
  }

  console.log(`${dryRun ? '[DRY RUN] Would send' : 'Sending push notification'} to ${list.length} subscriber(s)...`);
  for (const s of list) {
    console.log(`  - ${s.timezone || '?'} target=${s.targetUtc ? new Date(s.targetUtc).toISOString() : '?'} notified=${s.notifiedAt || 'no'} :: ${String(s.endpoint).slice(0, 60)}...`);
  }
  if (dryRun) return;

  let success = 0;
  let failed = 0;
  let pruned = 0;

  for (const sub of list) {
    try {
      await webpush.sendNotification(sub, buildPayload(sub));
      await markPushNotified(sub.endpoint);
      success++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`  Pruned expired: ${String(sub.endpoint).slice(0, 60)}...`);
        await prunePushSubscription(sub.endpoint);
        pruned++;
      } else {
        failed++;
        console.error(`  Failed: ${err.message}`);
      }
    }
  }

  console.log(`\nDone! Sent: ${success}, Failed: ${failed}, Pruned: ${pruned}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
