// Vercel Serverless Function: GET /api/stats
const { getTotalSubscribers } = require('../lib/subscribers');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const total = await getTotalSubscribers();
    return res.status(200).json({
      totalSubscribers: total,
      targetDate: '2026-11-19T00:00:00'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
