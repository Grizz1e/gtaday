#!/usr/bin/env node
// GTA CLOCK — Send Push Notifications to All Subscribers
// Usage: node scripts/send-push.js [--message "Custom message"]
//
// Run this script at launch time (Nov 19, 2026 00:00) to blast notifications
// to all saved push subscribers. Can be triggered manually, via Vercel Cron,
// GitHub Actions, or any scheduler.

require('dotenv').config();
const webpush = require('web-push');
const { getAllPushSubscriptions } = require('../lib/push-subscribers');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@gtaclock.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('ERROR: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in .env');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Parse optional custom message from CLI args
const args = process.argv.slice(2);
let customMessage = null;
const msgIdx = args.indexOf('--message');
if (msgIdx !== -1 && args[msgIdx + 1]) {
  customMessage = args[msgIdx + 1];
}

const payload = JSON.stringify({
  title: 'GTA 6 is HERE! 🎮',
  body: customMessage || 'Grand Theft Auto VI has launched! The countdown is over — go play!',
  icon: '/assets/gta-vi-logo.png',
  badge: '/assets/gta-vi-logo.png',
  url: 'https://gtaclock.com'
});

async function sendToAll() {
  const subscriptions = await getAllPushSubscriptions();

  if (!subscriptions || subscriptions.length === 0) {
    console.log('No push subscribers found.');
    return;
  }

  console.log(`Sending push notification to ${subscriptions.length} subscriber(s)...`);

  let success = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      success++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`  Subscription expired/invalid: ${sub.endpoint.slice(0, 60)}...`);
      } else {
        console.error(`  Failed: ${err.message}`);
      }
    }
  }

  console.log(`\nDone! Sent: ${success}, Failed: ${failed}`);
}

sendToAll().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
