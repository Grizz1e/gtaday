// Vercel Serverless Function: POST /api/push-subscribe
const { savePushSubscription } = require('../lib/push-subscribers');

module.exports = async function handler(req, res) {
  // CORS
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
    const subscription = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: 'Invalid push subscription. Must include endpoint and keys.'
      });
    }

    const result = await savePushSubscription(subscription);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
