const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const { savePushSubscription } = require('./lib/push-subscribers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Push subscription endpoint
app.post('/api/push-subscribe', async (req, res) => {
  try {
    const subscription = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: 'Invalid push subscription. Must include endpoint and keys.'
      });
    }

    const result = await savePushSubscription(subscription);
    return res.json(result);
  } catch (error) {
    console.error('Push subscription error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`GTA Clock running on http://localhost:${PORT}`);
});
