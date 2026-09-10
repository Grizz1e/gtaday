// GTA CLOCK - APP ENGINE (gtaclock.com)
// High-Performance Dynamic Timezone Engine & Per-Digit Independent Sliding Numbers

(function () {
  'use strict';

  // State
  let currentTimeZone = null;
  let targetUtcTimestamp = 0;

  // DOM Elements
  const tzBtn = document.getElementById('tzBtn');
  const tzLabel = document.getElementById('tzLabel');
  const tzModal = document.getElementById('tzModal');
  const closeTzModal = document.getElementById('closeTzModal');
  const tzSearchInput = document.getElementById('tzSearchInput');
  const tzList = document.getElementById('tzList');
  const tzChips = document.querySelectorAll('.tz-chip');

  // Calendar Elements
  const calPillBtn = document.getElementById('calPillBtn');
  const calModal = document.getElementById('calModal');
  const closeCalModal = document.getElementById('closeCalModal');
  const gCalLink = document.getElementById('gCalLink');
  const icsBtn = document.getElementById('icsBtn');

  // Browser Alerts
  const browserAlertBtn = document.getElementById('browserAlertBtn');
  const browserPillText = document.getElementById('browserPillText');
  const statusMsg = document.getElementById('statusMsg');

  // Comprehensive list of popular / canonical timezones + aliases
  const POPULAR_AND_ALIASES = [
    { id: 'Asia/Kathmandu', name: 'Asia / Kathmandu', keywords: 'kathmandu katmandu nepal +05:45' },
    { id: 'America/New_York', name: 'America / New York', keywords: 'new york nyc est edt united states usa +04:00 -05:00 -04:00' },
    { id: 'America/Los_Angeles', name: 'America / Los Angeles', keywords: 'los angeles la pst pdt california sf san francisco -08:00 -07:00' },
    { id: 'America/Chicago', name: 'America / Chicago', keywords: 'chicago cst cdt central -06:00 -05:00' },
    { id: 'America/Denver', name: 'America / Denver', keywords: 'denver mst mdt mountain -07:00 -06:00' },
    { id: 'America/Toronto', name: 'America / Toronto', keywords: 'toronto canada ontario -05:00' },
    { id: 'America/Vancouver', name: 'America / Vancouver', keywords: 'vancouver canada bc -08:00' },
    { id: 'Europe/London', name: 'Europe / London', keywords: 'london uk united kingdom gmt bst +00:00 +01:00' },
    { id: 'Europe/Paris', name: 'Europe / Paris', keywords: 'paris france cet cest +01:00 +02:00' },
    { id: 'Europe/Berlin', name: 'Europe / Berlin', keywords: 'berlin germany cet cest +01:00 +02:00' },
    { id: 'Europe/Madrid', name: 'Europe / Madrid', keywords: 'madrid spain cet +01:00' },
    { id: 'Europe/Rome', name: 'Europe / Rome', keywords: 'rome italy cet +01:00' },
    { id: 'Europe/Amsterdam', name: 'Europe / Amsterdam', keywords: 'amsterdam netherlands +01:00' },
    { id: 'Asia/Tokyo', name: 'Asia / Tokyo', keywords: 'tokyo japan jst +09:00' },
    { id: 'Asia/Seoul', name: 'Asia / Seoul', keywords: 'seoul south korea kst +09:00' },
    { id: 'Asia/Shanghai', name: 'Asia / Shanghai', keywords: 'shanghai beijing china cst +08:00' },
    { id: 'Asia/Hong_Kong', name: 'Asia / Hong Kong', keywords: 'hong kong hkt +08:00' },
    { id: 'Asia/Singapore', name: 'Asia / Singapore', keywords: 'singapore sgt +08:00' },
    { id: 'Asia/Dubai', name: 'Asia / Dubai', keywords: 'dubai uae united arab emirates gst +04:00' },
    { id: 'Asia/Kolkata', name: 'Asia / Kolkata (Calcutta)', keywords: 'kolkata calcutta delhi mumbai bangalore india ist +05:30' },
    { id: 'Asia/Dhaka', name: 'Asia / Dhaka', keywords: 'dhaka bangladesh bst +06:00' },
    { id: 'Asia/Bangkok', name: 'Asia / Bangkok', keywords: 'bangkok thailand indochina ict +07:00' },
    { id: 'Asia/Jakarta', name: 'Asia / Jakarta', keywords: 'jakarta indonesia wib +07:00' },
    { id: 'Asia/Riyadh', name: 'Asia / Riyadh', keywords: 'riyadh saudi arabia ast +03:00' },
    { id: 'Australia/Sydney', name: 'Australia / Sydney', keywords: 'sydney melbourne nsw aest aedt +10:00 +11:00' },
    { id: 'Australia/Perth', name: 'Australia / Perth', keywords: 'perth western australia awst +08:00' },
    { id: 'Pacific/Auckland', name: 'Pacific / Auckland', keywords: 'auckland wellington new zealand nzst nzdt +12:00 +13:00' },
    { id: 'America/Sao_Paulo', name: 'America / Sao Paulo', keywords: 'sao paulo brazil brt -03:00' },
    { id: 'America/Mexico_City', name: 'America / Mexico City', keywords: 'mexico city cst -06:00' },
    { id: 'America/Buenos_Aires', name: 'America / Buenos Aires', keywords: 'buenos aires argentina art -03:00' },
    { id: 'Africa/Cairo', name: 'Africa / Cairo', keywords: 'cairo egypt eest +02:00' },
    { id: 'Africa/Johannesburg', name: 'Africa / Johannesburg', keywords: 'johannesburg south africa sast +02:00' },
    { id: 'UTC', name: 'UTC (Coordinated Universal Time)', keywords: 'utc gmt universal coordinated +00:00' }
  ];

  // Build the complete database of all available timezones
  let ALL_TIMEZONES = [];
  const tzOffsetCache = new Map();

  function initTimezoneDatabase() {
    let rawList = [];
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        rawList = Intl.supportedValuesOf('timeZone');
      }
    } catch (e) {}

    const seen = new Set();
    const result = [];

    // Add popular ones first
    POPULAR_AND_ALIASES.forEach(item => {
      seen.add(item.id.toLowerCase());
      result.push(item);
    });

    // Add remaining IANA timezones
    rawList.forEach(id => {
      const lower = id.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        const name = id.replace(/_/g, ' ').replace(/\//g, ' / ');
        const city = id.split('/').pop().replace(/_/g, ' ').toLowerCase();
        result.push({
          id: id,
          name: name,
          keywords: `${city} ${id.toLowerCase()}`
        });
      }
    });

    ALL_TIMEZONES = result;
  }

  // Fast Memoized Offset Formatter (Zero-lag)
  function getFastTzOffset(tz) {
    if (tzOffsetCache.has(tz)) {
      return tzOffsetCache.get(tz);
    }

    try {
      const now = new Date();
      // Fast format using shortOffset (e.g. GMT+5:45 or GMT-5)
      const str = now.toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
      const match = str.match(/GMT([+-]\d+(?::\d+)?)/);
      let offset = 'UTC';
      if (match) {
        offset = 'UTC' + match[1];
      }
      tzOffsetCache.set(tz, offset);
      return offset;
    } catch (e) {
      tzOffsetCache.set(tz, 'UTC');
      return 'UTC';
    }
  }

  // 1. Calculate UTC Target Timestamp for November 19, 2026 at 00:00:00 in target timeZone
  function calculateTargetUtc(timeZone) {
    try {
      const desiredUtc = Date.UTC(2026, 10, 19, 0, 0, 0);
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const parts = fmt.formatToParts(new Date(desiredUtc));
      const p = {};
      parts.forEach(({ type, value }) => { p[type] = value; });

      const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
      const localAsUtc = Date.UTC(parseInt(p.year, 10), parseInt(p.month, 10) - 1, parseInt(p.day, 10), hour, parseInt(p.minute, 10), parseInt(p.second, 10));
      const diff = localAsUtc - desiredUtc;
      return desiredUtc - diff;
    } catch (e) {
      return Date.UTC(2026, 10, 19, 0, 0, 0);
    }
  }

  // 2. Set Active Timezone
  function setTimezone(tz) {
    let resolvedTz = tz;
    if (tz === 'auto' || !tz) {
      try {
        resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kathmandu';
        // Normalize Katmandu spelling if returned by browser
        if (resolvedTz === 'Asia/Katmandu') resolvedTz = 'Asia/Kathmandu';
      } catch (e) {
        resolvedTz = 'Asia/Kathmandu';
      }
      localStorage.removeItem('gtaclock_tz');
    } else {
      localStorage.setItem('gtaclock_tz', tz);
    }

    currentTimeZone = resolvedTz;
    targetUtcTimestamp = calculateTargetUtc(resolvedTz);

    const offsetStr = getFastTzOffset(resolvedTz);
    if (tzLabel) {
      tzLabel.textContent = `${resolvedTz} (${offsetStr})`;
    }

    // Recalculate countdown immediately
    updateCountdown();

    // Update highlight states
    highlightActiveTz(resolvedTz);
  }

  function highlightActiveTz(activeTz) {
    if (!tzList) return;
    const items = tzList.querySelectorAll('.tz-item');
    items.forEach(btn => {
      if (btn.dataset.tz.toLowerCase() === activeTz.toLowerCase()) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    tzChips.forEach(chip => {
      const chipTz = chip.dataset.tz;
      if ((chipTz === 'auto' && !localStorage.getItem('gtaclock_tz')) || chipTz.toLowerCase() === activeTz.toLowerCase()) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  // 3. Per-Digit Independent Sliding Engine
  function updateUnitDigits(containerId, newStr) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const chars = newStr.split('');
    let slots = Array.from(container.querySelectorAll('.char-slot'));

    // First render or length change
    if (slots.length !== chars.length) {
      container.innerHTML = '';
      chars.forEach((ch) => {
        const slot = document.createElement('div');
        slot.className = 'char-slot';
        const span = document.createElement('span');
        span.className = 'char-val current';
        span.textContent = ch;
        slot.appendChild(span);
        container.appendChild(slot);
      });
      return;
    }

    // Inspect each character slot independently
    chars.forEach((targetChar, idx) => {
      const slot = slots[idx];
      const currentSpan = slot.querySelector('.char-val.current');
      const currentChar = currentSpan ? currentSpan.textContent : '';

      // If unchanged, do NOT animate at all
      if (currentChar === targetChar) {
        return;
      }

      // Digit changed: slide out old, slide in new
      const nextSpan = document.createElement('span');
      nextSpan.className = 'char-val slide-in-start';
      nextSpan.textContent = targetChar;
      slot.appendChild(nextSpan);

      void nextSpan.offsetWidth;

      if (currentSpan) {
        currentSpan.classList.remove('current');
        currentSpan.classList.add('slide-out');
      }

      nextSpan.classList.remove('slide-in-start');
      nextSpan.classList.add('current');

      setTimeout(() => {
        if (currentSpan && currentSpan.parentNode === slot) {
          slot.removeChild(currentSpan);
        }
      }, 750);
    });
  }

  // 4. Countdown Ticking Engine
  function updateCountdown() {
    const now = Date.now();
    const diff = targetUtcTimestamp - now;

    if (diff <= 0) {
      updateUnitDigits('unit-days', '00');
      updateUnitDigits('unit-hours', '00');
      updateUnitDigits('unit-minutes', '00');
      updateUnitDigits('unit-seconds', '00');
      document.title = 'GTA VI is OUT! — GTA Clock';
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const daysStr = String(days);
    const hoursStr = String(hours).padStart(2, '0');
    const minsStr = String(minutes).padStart(2, '0');
    const secsStr = String(seconds).padStart(2, '0');

    updateUnitDigits('unit-days', daysStr);
    updateUnitDigits('unit-hours', hoursStr);
    updateUnitDigits('unit-minutes', minsStr);
    updateUnitDigits('unit-seconds', secsStr);

    // Live browser tab title update
    document.title = `${daysStr}d ${hoursStr}h ${minsStr}m ${secsStr}s — GTA Clock`;
  }

  // 5. Zero-Lag Fast Timezone Search & Render
  let searchDebounceTimer = null;

  function renderTimezoneList(query = '') {
    if (!tzList) return;
    const cleanQ = query.toLowerCase().trim();

    const filtered = cleanQ
      ? ALL_TIMEZONES.filter(item => {
          return item.keywords.includes(cleanQ) || item.name.toLowerCase().includes(cleanQ);
        })
      : ALL_TIMEZONES;

    tzList.innerHTML = '';

    if (filtered.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '18px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'rgba(255,255,255,0.4)';
      emptyMsg.style.fontSize = '13px';
      emptyMsg.textContent = `No timezone found matching "${query}"`;
      tzList.appendChild(emptyMsg);
      return;
    }

    // High performance DocumentFragment insertion
    const fragment = document.createDocumentFragment();

    filtered.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'tz-item';
      btn.dataset.tz = item.id;
      if (currentTimeZone && item.id.toLowerCase() === currentTimeZone.toLowerCase()) {
        btn.classList.add('active');
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tz-item-name';
      nameSpan.textContent = item.name;

      const offsetSpan = document.createElement('span');
      offsetSpan.className = 'tz-item-offset';
      offsetSpan.textContent = getFastTzOffset(item.id);

      btn.appendChild(nameSpan);
      btn.appendChild(offsetSpan);

      btn.addEventListener('click', () => {
        setTimezone(item.id);
        closeTimezoneModal();
        showStatus(`✓ Timezone set to ${item.name}`, 'success');
      });

      fragment.appendChild(btn);
    });

    tzList.appendChild(fragment);
  }

  function openTimezoneModal() {
    if (!tzModal) return;
    tzModal.classList.remove('hidden');
    if (tzSearchInput) {
      tzSearchInput.value = '';
      setTimeout(() => tzSearchInput.focus(), 50);
    }
    renderTimezoneList('');
    highlightActiveTz(currentTimeZone);
  }

  function closeTimezoneModal() {
    if (!tzModal) return;
    tzModal.classList.add('hidden');
  }

  if (tzBtn) {
    tzBtn.addEventListener('click', openTimezoneModal);
  }

  if (closeTzModal) {
    closeTzModal.addEventListener('click', closeTimezoneModal);
  }

  if (tzModal) {
    tzModal.addEventListener('click', (e) => {
      if (e.target === tzModal) {
        closeTimezoneModal();
      }
    });
  }

  if (tzSearchInput) {
    tzSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const query = e.target.value;
      searchDebounceTimer = setTimeout(() => {
        renderTimezoneList(query);
      }, 50);
    });
  }

  tzChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const chosenTz = chip.dataset.tz;
      setTimezone(chosenTz);
      closeTimezoneModal();
      showStatus(chosenTz === 'auto' ? '✓ Auto-detected your timezone' : `✓ Timezone set to ${chosenTz}`, 'success');
    });
  });

  // 6. Calendar Handlers
  if (calPillBtn && calModal) {
    calPillBtn.addEventListener('click', () => {
      calModal.classList.remove('hidden');
    });
  }

  if (closeCalModal && calModal) {
    closeCalModal.addEventListener('click', () => {
      calModal.classList.add('hidden');
    });

    calModal.addEventListener('click', (e) => {
      if (e.target === calModal) {
        calModal.classList.add('hidden');
      }
    });
  }

  function setupCalendar() {
    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Grand Theft Auto VI Release')}&dates=20261119T000000/20261119T040000&details=${encodeURIComponent('Grand Theft Auto VI releases today at midnight local time! Live countdown at gtaclock.com')}&location=${encodeURIComponent('Worldwide')}`;
    if (gCalLink) gCalLink.href = gCalUrl;

    if (icsBtn) {
      icsBtn.addEventListener('click', () => {
        const icsData = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//GTA Clock//gtaclock.com//EN',
          'BEGIN:VEVENT',
          'UID:gta6-launch-20261119@gtaclock.com',
          'DTSTAMP:20260906T120000Z',
          'DTSTART:20261119T000000',
          'DTEND:20261119T040000',
          'SUMMARY:Grand Theft Auto VI Release',
          'DESCRIPTION:Grand Theft Auto VI releases today at midnight! Tracked via gtaclock.com',
          'LOCATION:Worldwide',
          'STATUS:CONFIRMED',
          'BEGIN:VALARM',
          'TRIGGER:-PT1H',
          'ACTION:DISPLAY',
          'DESCRIPTION:GTA 6 releases in 1 hour!',
          'END:VALARM',
          'END:VEVENT',
          'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'GTA-6-Release-gtaclock.ics');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showStatus('✓ Calendar file (.ics) downloaded!', 'success');
        if (calModal) calModal.classList.add('hidden');
      });
    }
  }

  // 7. Web Push Notifications (works even when the tab is closed)
  const VAPID_PUBLIC_KEY = 'BFtiNKeHUlM4wpnNg7Bbn9zcvcz2N987mNjHNDkfDKYRVr95-YoHDPy6KPCBGIA1fKkYgzn_DmoNGhYnFkNfWIM';
  let swRegistration = null;

  // Convert URL-safe base64 VAPID key to Uint8Array for PushManager
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      swRegistration = registration;
      return registration;
    } catch (err) {
      console.error('Service Worker registration failed:', err);
      return null;
    }
  }

  async function checkExistingSubscription() {
    if (!swRegistration) return;
    try {
      const subscription = await swRegistration.pushManager.getSubscription();
      if (subscription) {
        if (browserAlertBtn) browserAlertBtn.classList.add('enabled');
        if (browserPillText) browserPillText.textContent = 'Alerts Active ✓';
      }
    } catch (_) {}
  }

  function updateBrowserAlertState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (browserAlertBtn) browserAlertBtn.disabled = true;
      if (browserPillText) browserPillText.textContent = 'Push unsupported';
      return;
    }

    if (Notification.permission === 'denied') {
      if (browserPillText) browserPillText.textContent = 'Alerts Blocked';
      if (browserAlertBtn) browserAlertBtn.disabled = true;
    }
  }

  if (browserAlertBtn) {
    browserAlertBtn.addEventListener('click', async () => {
      if (!swRegistration) {
        showStatus('Service Worker not ready. Please refresh the page.', 'error');
        return;
      }

      // Check if already subscribed
      try {
        const existing = await swRegistration.pushManager.getSubscription();
        if (existing) {
          showStatus('✓ Push notifications are already active! You\'ll be notified at launch.', 'success');
          return;
        }
      } catch (_) {}

      // Request permission and subscribe
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          updateBrowserAlertState();
          showStatus('Notification permission was denied. Enable it in your browser settings.', 'error');
          return;
        }

        // Subscribe to push via the Service Worker
        const subscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        // Send subscription to our server
        const response = await fetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON())
        });

        const result = await response.json();

        if (result.success) {
          if (browserAlertBtn) browserAlertBtn.classList.add('enabled');
          if (browserPillText) browserPillText.textContent = 'Alerts Active ✓';
          showStatus('✓ Push notification locked in! You\'ll be notified even with the tab closed.', 'success');
        } else {
          showStatus('Could not save subscription. Please try again.', 'error');
        }
      } catch (err) {
        console.error('Push subscription error:', err);
        showStatus('Could not enable push notifications. Please try again.', 'error');
      }
    });
  }

  function showStatus(text, type) {
    if (!statusMsg) return;
    statusMsg.textContent = text;
    statusMsg.className = 'action-feedback ' + (type || '');
    setTimeout(() => {
      if (statusMsg.textContent === text) {
        statusMsg.textContent = '';
        statusMsg.className = 'action-feedback';
      }
    }, 4500);
  }

  // Initialization
  initTimezoneDatabase();

  const savedTz = localStorage.getItem('gtaclock_tz') || 'auto';
  setTimezone(savedTz);

  // 1-second countdown interval
  setInterval(updateCountdown, 1000);

  // Register Service Worker and check push state
  registerServiceWorker().then(() => {
    updateBrowserAlertState();
    checkExistingSubscription();
  });

  setupCalendar();

})();
