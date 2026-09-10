// Persistent Subscriber Storage for Local & Vercel Deployments
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

// Resolve a writable local data path (falls back to /tmp on serverless Vercel)
const LOCAL_DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_FILE = path.join(LOCAL_DATA_DIR, 'subscribers.json');

function getWritableFilePath() {
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    return LOCAL_FILE;
  } catch (err) {
    // Vercel serverless environment is read-only outside of /tmp
    const tmpDir = path.join('/tmp', 'gtaclock');
    if (!fs.existsSync(tmpDir)) {
      try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
    }
    return path.join(tmpDir, 'subscribers.json');
  }
}

function readLocalSubscribers() {
  const filePath = getWritableFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read local subscribers file:', e.message);
  }
  return [];
}

function writeLocalSubscribers(list) {
  const filePath = getWritableFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  } catch (e) {
    console.warn('Could not write local subscribers file:', e.message);
  }
}

// 1. Upstash Redis / Vercel KV REST Integration (Zero external dependencies)
async function saveToUpstashKV(email, record) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    // Add email to subscribers set
    await fetch(`${url}/sadd/gtaclock:subscribers/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Save metadata hash
    await fetch(`${url}/set/gtaclock:sub:${encodeURIComponent(email)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(record))
    });

    // Get total count
    const countRes = await fetch(`${url}/scard/gtaclock:subscribers`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const countData = await countRes.json();
    return typeof countData.result === 'number' ? countData.result : null;
  } catch (err) {
    console.error('Error saving to Vercel KV / Upstash:', err.message);
    return null;
  }
}

async function getUpstashCount() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const countRes = await fetch(`${url}/scard/gtaclock:subscribers`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const countData = await countRes.json();
    return typeof countData.result === 'number' ? countData.result : null;
  } catch (_) {
    return null;
  }
}

// 2. Resend Cloud Integration
let resendClient = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Main handler for adding a subscriber
async function handleSubscribe(email, meta = {}) {
  const trimmedEmail = email.toLowerCase().trim();
  const record = {
    email: trimmedEmail,
    timestamp: new Date().toISOString(),
    platform: meta.platform || 'all',
    ip: meta.ip || null
  };

  let totalSubscribers = 0;
  let isNew = true;

  // Cloud Layer A: Vercel KV / Upstash Redis (if configured)
  const kvTotal = await saveToUpstashKV(trimmedEmail, record);
  if (kvTotal !== null) {
    totalSubscribers = kvTotal;
  }

  // Cloud Layer B: Resend Contacts & Audiences (Persistent Cloud CRM)
  // This permanently saves the subscriber in Resend cloud across all Vercel deploys
  const resend = getResend();
  let contactSavedInResend = false;

  if (resend) {
    try {
      const contactPayload = {
        email: trimmedEmail,
        unsubscribed: false
      };
      if (process.env.RESEND_AUDIENCE_ID) {
        contactPayload.audienceId = process.env.RESEND_AUDIENCE_ID;
      }
      await resend.contacts.create(contactPayload);
      contactSavedInResend = true;
    } catch (contactErr) {
      // If contact already exists, Resend may return 409 or message
      if (contactErr.message && contactErr.message.includes('already exists')) {
        isNew = false;
      } else {
        console.warn('Resend contact notice:', contactErr.message);
      }
    }
  }

  // Local / Fallback Layer:
  const localList = readLocalSubscribers();
  const existingIdx = localList.findIndex(s => s.email === trimmedEmail);
  if (existingIdx >= 0) {
    localList[existingIdx] = { ...localList[existingIdx], ...record, updated: true };
    isNew = false;
  } else {
    localList.push(record);
  }
  writeLocalSubscribers(localList);

  if (totalSubscribers === 0) {
    totalSubscribers = localList.length;
  }

  // Send Confirmation Email via Resend
  let emailSent = false;
  if (resend) {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'GTA Clock <onboarding@resend.dev>';
      await resend.emails.send({
        from: fromEmail,
        to: trimmedEmail,
        subject: 'GTA 6 Launch Alert Confirmed — GTA Clock',
        html: `
          <div style="background-color: #07040a; color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; text-align: center;">
            <div style="max-width: 520px; margin: 0 auto; background: linear-gradient(180deg, #180d26 0%, #0c0614 100%); border: 1px solid rgba(255, 42, 141, 0.3); border-radius: 16px; padding: 32px 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
              <h1 style="color: #ff2a8d; font-size: 26px; margin-bottom: 6px; letter-spacing: 2px;">GTA CLOCK</h1>
              <p style="color: #ff8e3c; font-weight: 600; font-size: 13px; margin-top: 0; letter-spacing: 1.5px;">gtaclock.com</p>
              <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />
              <h2 style="font-size: 20px; color: #ffffff; margin-bottom: 12px;">Launch Alert Confirmed</h2>
              <p style="color: #b5b2c8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                You are registered for the release of <strong>Grand Theft Auto VI</strong> on <strong>November 19, 2026 at 00:00 local time</strong>.
              </p>
              <div style="background: rgba(255,255,255,0.06); border-radius: 8px; padding: 14px; margin-bottom: 24px; display: inline-block;">
                <span style="color: #ff2a8d; font-weight: bold; font-size: 16px;">Target: November 19, 2026 • 00:00:00</span>
              </div>
              <p style="color: #8c89a0; font-size: 12.5px; margin-top: 16px;">
                We'll ping you before launch and right as the countdown reaches zero.
              </p>
            </div>
          </div>
        `
      });
      emailSent = true;
    } catch (sendErr) {
      console.warn('Resend email notice:', sendErr.message);
    }
  }

  return {
    success: true,
    isNew,
    emailSent,
    totalSubscribers,
    persistedToCloud: !!(kvTotal !== null || contactSavedInResend),
    message: isNew
      ? "You're locked in! We'll alert you right before launch."
      : "You're already registered! We have your reminder locked in."
  };
}

async function getTotalSubscribers() {
  const kvCount = await getUpstashCount();
  if (kvCount !== null) return kvCount;
  return readLocalSubscribers().length;
}

module.exports = {
  handleSubscribe,
  getTotalSubscribers
};
