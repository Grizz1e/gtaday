// Vercel Serverless Function: GET/POST /api/cron/dispatch
// Triggered by Vercel Cron (daily on Hobby) or an external per-minute cron
// (recommended: cron-job.org / UptimeRobot hitting this URL every minute).
// Protect with CRON_SECRET env: Authorization: Bearer <secret> or ?secret=<secret>.
const { dispatchDuePush } = require('../../lib/dispatch');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'OPTIONS') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const headerAuth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const provided = headerAuth || req.query.secret || (req.body && req.body.secret);
      // Vercel Cron itself sends no secret, so allow it when the request comes
      // from Vercel's scheduler AND no external secret is enforced strictly.
      // If CRON_SECRET is set, external callers must provide it.
      const isVercelCron = req.headers['x-vercel-cron'] === '1';
      if (provided !== secret && !isVercelCron) {
        return res.status(401).json({ success: false, error: 'Unauthorized.' });
      }
    }

    const dryRun = req.query.dryRun === '1' || (req.body && req.body.dryRun === true);
    const result = await dispatchDuePush({ dryRun });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Cron dispatch error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
