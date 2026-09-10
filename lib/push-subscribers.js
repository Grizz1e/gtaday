// Push Subscription Storage — Upstash Redis / Local JSON fallback
const fs = require('fs');
const path = require('path');

const LOCAL_DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_FILE = path.join(LOCAL_DATA_DIR, 'push-subscribers.json');

// ---------- Local JSON Storage ----------

function getWritableFilePath() {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    return LOCAL_FILE;
  } catch (err) {
    // Vercel serverless: read-only FS outside /tmp
    const tmpDir = path.join('/tmp', 'gtaclock');
    if (!fs.existsSync(tmpDir)) {
      try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
    }
    return path.join(tmpDir, 'push-subscribers.json');
  }
}

function readLocalSubscriptions() {
  const filePath = getWritableFilePath();
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not read push subscribers file:', e.message);
  }
  return [];
}

function writeLocalSubscriptions(list) {
  const filePath = getWritableFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  } catch (e) {
    console.warn('Could not write push subscribers file:', e.message);
  }
}

// ---------- Upstash Redis Storage ----------

function getUpstashCredentials() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return (url && token) ? { url, token } : null;
}

async function saveToUpstash(subscription) {
  const creds = getUpstashCredentials();
  if (!creds) return false;

  try {
    const key = `gtaclock:push:${subscription.endpoint}`;
    await fetch(`${creds.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(subscription))
    });

    // Track endpoint in a set for easy enumeration
    await fetch(`${creds.url}/sadd/gtaclock:push-endpoints/${encodeURIComponent(subscription.endpoint)}`, {
      headers: { Authorization: `Bearer ${creds.token}` }
    });

    return true;
  } catch (err) {
    console.error('Upstash save error:', err.message);
    return false;
  }
}

async function getAllFromUpstash() {
  const creds = getUpstashCredentials();
  if (!creds) return null;

  try {
    // Get all tracked endpoints
    const res = await fetch(`${creds.url}/smembers/gtaclock:push-endpoints`, {
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    const data = await res.json();
    if (!data.result || !Array.isArray(data.result)) return null;

    const subscriptions = [];
    for (const endpoint of data.result) {
      const subRes = await fetch(`${creds.url}/get/${encodeURIComponent(`gtaclock:push:${endpoint}`)}`, {
        headers: { Authorization: `Bearer ${creds.token}` }
      });
      const subData = await subRes.json();
      if (subData.result) {
        try {
          subscriptions.push(JSON.parse(subData.result));
        } catch (_) {}
      }
    }
    return subscriptions;
  } catch (err) {
    console.error('Upstash read error:', err.message);
    return null;
  }
}

// ---------- Public API ----------

async function savePushSubscription(subscription) {
  const record = {
    ...subscription,
    subscribedAt: new Date().toISOString()
  };

  // Cloud storage (if configured)
  const savedToCloud = await saveToUpstash(record);

  // Local fallback (always)
  const localList = readLocalSubscriptions();
  const existingIdx = localList.findIndex(s => s.endpoint === subscription.endpoint);
  if (existingIdx >= 0) {
    localList[existingIdx] = record;
  } else {
    localList.push(record);
  }
  writeLocalSubscriptions(localList);

  return {
    success: true,
    persistedToCloud: savedToCloud,
    totalSubscriptions: localList.length
  };
}

async function getAllPushSubscriptions() {
  // Try cloud first
  const cloudSubs = await getAllFromUpstash();
  if (cloudSubs !== null && cloudSubs.length > 0) return cloudSubs;

  // Fallback to local
  return readLocalSubscriptions();
}

module.exports = {
  savePushSubscription,
  getAllPushSubscriptions
};
