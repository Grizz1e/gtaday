// Push Subscription Storage — Upstash Redis / Local JSON fallback
// Schema per record:
// {
//   endpoint, keys: { p256dh, auth }, expirationTime,
//   timezone: 'Asia/Kathmandu', targetUtc: 179... (ms epoch for Nov 19 2026 00:00 in that tz),
//   subscribedAt: ISO, updatedAt: ISO, notifiedAt: ISO|null
// }
const fs = require('fs');
const path = require('path');
const { normalizeTimeZone, calculateTargetUtc } = require('./launch-time');

const LOCAL_DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_FILE = path.join(LOCAL_DATA_DIR, 'push-subscribers.json');

// ---------- Local JSON Storage ----------

// In-memory cache: the old code ran mkdirSync + accessSync + readFileSync on
// EVERY subscribe/update/dispatch tick. Cache for 5s; writes refresh it.
const _localCache = { at: 0, list: null };
const LOCAL_CACHE_TTL_MS = 5000;

function getWritableFilePath() {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    // Probe writability (Vercel = read-only outside /tmp)
    fs.accessSync(LOCAL_DATA_DIR, fs.constants.W_OK);
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
  const now = Date.now();
  if (_localCache.list && now - _localCache.at < LOCAL_CACHE_TTL_MS) return _localCache.list;
  const filePath = getWritableFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      _localCache.list = Array.isArray(parsed) ? parsed : [];
      _localCache.at = now;
      return _localCache.list;
    }
  } catch (e) {
    console.warn('Could not read push subscribers file:', e.message);
  }
  _localCache.list = [];
  _localCache.at = now;
  return [];
}

function writeLocalSubscriptions(list) {
  _localCache.list = list;
  _localCache.at = Date.now();
  const filePath = getWritableFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  } catch (e) {
    console.warn('Could not write push subscribers file:', e.message);
  }
}

// Backfill old records that predate timezone support.
function migrateRecord(sub) {
  if (!sub || !sub.endpoint) return sub;
  if (typeof sub.targetUtc !== 'number') {
    const tz = normalizeTimeZone(sub.timezone || 'UTC');
    return {
      ...sub,
      timezone: tz,
      targetUtc: calculateTargetUtc(tz),
      notifiedAt: sub.notifiedAt || null,
      updatedAt: sub.updatedAt || sub.subscribedAt || new Date().toISOString()
    };
  }
  return sub;
}

// ---------- Upstash Redis Storage ----------

function getUpstashCredentials() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return (url && token) ? { url: url.replace(/\/$/, ''), token } : null;
}

function recordKey(endpoint) {
  return `gtaclock:push:${endpoint}`;
}

async function saveToUpstash(record) {
  const creds = getUpstashCredentials();
  if (!creds) return false;

  try {
    const key = recordKey(record.endpoint);
    await fetch(`${creds.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(record))
    });

    // Track endpoint in a set for easy enumeration
    await fetch(`${creds.url}/sadd/gtaclock:push-endpoints/${encodeURIComponent(record.endpoint)}`, {
      headers: { Authorization: `Bearer ${creds.token}` }
    });

    return true;
  } catch (err) {
    console.error('Upstash save error:', err.message);
    return false;
  }
}

async function deleteFromUpstash(endpoint) {
  const creds = getUpstashCredentials();
  if (!creds) return false;
  try {
    await fetch(`${creds.url}/del/${encodeURIComponent(recordKey(endpoint))}`, {
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    await fetch(`${creds.url}/srem/gtaclock:push-endpoints/${encodeURIComponent(endpoint)}`, {
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    return true;
  } catch (err) {
    console.error('Upstash delete error:', err.message);
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
    if (!data.result || !Array.isArray(data.result)) return [];

    // Batched fetch: the old sequential per-endpoint GET took N round-trips.
    const CONCURRENCY = 20;
    const subscriptions = [];
    for (let i = 0; i < data.result.length; i += CONCURRENCY) {
      const chunk = data.result.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (endpoint) => {
          try {
            const subRes = await fetch(`${creds.url}/get/${encodeURIComponent(recordKey(endpoint))}`, {
              headers: { Authorization: `Bearer ${creds.token}` }
            });
            const subData = await subRes.json();
            if (subData.result) {
              try {
                return migrateRecord(JSON.parse(subData.result));
              } catch (_) {
                return null;
              }
            }
          } catch (_) {}
          return null;
        })
      );
      for (const sub of results) {
        if (sub) subscriptions.push(sub);
      }
    }
    return subscriptions;
  } catch (err) {
    console.error('Upstash read error:', err.message);
    return null;
  }
}

// ---------- Public API ----------

function buildRecord(subscription, timezone) {
  const tz = normalizeTimeZone(timezone || subscription.timezone || 'UTC');
  const now = new Date().toISOString();
  return {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    expirationTime: subscription.expirationTime ?? null,
    timezone: tz,
    targetUtc: calculateTargetUtc(tz),
    subscribedAt: subscription.subscribedAt || now,
    updatedAt: now,
    notifiedAt: null
  };
}

async function savePushSubscription(subscription, timezone) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error('Invalid push subscription. Must include endpoint and keys.');
  }

  const localList = readLocalSubscriptions().map(migrateRecord);
  const existing = localList.find(s => s.endpoint === subscription.endpoint);

  const record = buildRecord(subscription, timezone || (existing && existing.timezone));
  // Preserve original subscribedAt on re-subscribe
  if (existing) record.subscribedAt = existing.subscribedAt;
  // If re-subscribing after a previous send, allow re-arming
  if (existing && existing.notifiedAt) record.notifiedAt = null;

  // Cloud storage (if configured)
  const savedToCloud = await saveToUpstash(record);

  // Local fallback (always)
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
    timezone: record.timezone,
    targetUtc: record.targetUtc,
    totalSubscriptions: localList.length
  };
}

async function updatePushSubscriptionTimezone(endpoint, timezone) {
  const tz = normalizeTimeZone(timezone);
  const targetUtc = calculateTargetUtc(tz);
  const now = new Date().toISOString();

  // Cloud
  const cloudSubs = await getAllFromUpstash();
  let cloudUpdated = false;
  if (cloudSubs !== null) {
    const found = cloudSubs.find(s => s.endpoint === endpoint);
    if (found) {
      const updated = { ...migrateRecord(found), timezone: tz, targetUtc, updatedAt: now, notifiedAt: null };
      await saveToUpstash(updated);
      cloudUpdated = true;
    }
  }

  // Local
  const localList = readLocalSubscriptions().map(migrateRecord);
  const idx = localList.findIndex(s => s.endpoint === endpoint);
  if (idx < 0 && !cloudUpdated) return null;
  if (idx >= 0) {
    localList[idx] = { ...localList[idx], timezone: tz, targetUtc, updatedAt: now, notifiedAt: null };
    writeLocalSubscriptions(localList);
    return localList[idx];
  }
  return { endpoint, timezone: tz, targetUtc, updatedAt: now };
}

async function removePushSubscription(endpoint) {
  if (!endpoint) throw new Error('Missing endpoint.');
  await deleteFromUpstash(endpoint);
  const localList = readLocalSubscriptions().map(migrateRecord);
  const filtered = localList.filter(s => s.endpoint !== endpoint);
  writeLocalSubscriptions(filtered);
  return { success: true, removed: localList.length !== filtered.length };
}

async function getAllPushSubscriptions() {
  // Try cloud first
  const cloudSubs = await getAllFromUpstash();
  if (cloudSubs !== null && cloudSubs.length > 0) return cloudSubs.map(migrateRecord);

  // Fallback to local
  return readLocalSubscriptions().map(migrateRecord);
}

async function getDuePushSubscriptions(nowMs = Date.now()) {
  const all = await getAllPushSubscriptions();
  return all.filter(s => !s.notifiedAt && typeof s.targetUtc === 'number' && s.targetUtc <= nowMs);
}

async function markPushNotified(endpoint, notifiedAt = new Date().toISOString()) {
  const cloudSubs = await getAllFromUpstash();
  if (cloudSubs !== null) {
    const found = cloudSubs.find(s => s.endpoint === endpoint);
    if (found) await saveToUpstash({ ...migrateRecord(found), notifiedAt });
  }
  const localList = readLocalSubscriptions().map(migrateRecord);
  const idx = localList.findIndex(s => s.endpoint === endpoint);
  if (idx >= 0) {
    localList[idx] = { ...localList[idx], notifiedAt };
    writeLocalSubscriptions(localList);
  }
}

async function prunePushSubscription(endpoint) {
  // Permanently drop invalid/expired endpoints (410/404 from push service)
  return removePushSubscription(endpoint);
}

module.exports = {
  savePushSubscription,
  getAllPushSubscriptions,
  getDuePushSubscriptions,
  updatePushSubscriptionTimezone,
  removePushSubscription,
  markPushNotified,
  prunePushSubscription
};
