// Vercel Serverless Function: POST /api/push-update
// Called when a subscribed user changes timezone — re-arms the notification.
const { updatePushSubscriptionTimezone } = require('../lib/push-subscribers');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { endpoint, timezone } = req.body || {};
    if (!endpoint || !timezone) {
      return res.status(400).json({ success: false, error: 'endpoint and timezone are required.' });
    }
    const updated = await updatePushSubscriptionTimezone(endpoint, timezone);
    if (!updated) return res.status(404).json({ success: false, error: 'Subscription not found.' });
    return res.status(200).json({ success: true, timezone: updated.timezone, targetUtc: updated.targetUtc });
  } catch (error) {
    console.error('Push update error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
