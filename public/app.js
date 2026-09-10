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

    // If already subscribed for push, move the notification to the new timezone
    syncSubscriptionTimezone(resolvedTz);
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
  // Unit containers are cached: updateCountdown fires every second and the
  // old code re-ran getElementById + querySelectorAll on each tick.
  const unitSlotCache = new Map();
  function getUnitSlots(container, containerId) {
    let slots = unitSlotCache.get(containerId);
    if (!slots || slots.some(s => !s.isConnected)) {
      slots = Array.from(container.querySelectorAll('.char-slot'));
      unitSlotCache.set(containerId, slots);
    }
    return slots;
  }
  function updateUnitDigits(containerId, newStr) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const chars = newStr.split('');
    let slots = getUnitSlots(container, containerId);

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
      unitSlotCache.set(containerId, Array.from(container.querySelectorAll('.char-slot')));
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
      // Backup: if the tab is open at midnight but the server push failed,
      // the page itself validates the time and fires the same notification
      // (same tag, so it replaces rather than duplicates the server push).
      maybeFireLocalLaunchAlert();
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

    // Live browser tab title update (skipped when hidden — same string will
    // be written on the next visible tick, saves a layout-adjacent op/sec).
    if (!document.hidden) {
      document.title = `${daysStr}d ${hoursStr}h ${minsStr}m ${secsStr}s — GTA Clock`;
    }
  }

  // Aligned 1s ticker: setTimeout to the next second boundary instead of a
  // drifting setInterval, so digits flip exactly on the second.
  function scheduleCountdownTick() {
    const msToNextSecond = 1000 - (Date.now() % 1000) + 5;
    setTimeout(() => {
      updateCountdown();
      scheduleCountdownTick();
    }, msToNextSecond);
  }

  // 5. Zero-Lag Fast Timezone Search & Render
  let searchDebounceTimer = null;
  // Rendering ~400 timezone rows each with an Intl offset format blocks the
  // main thread on modal open. Render in small chunks and cap the initial
  // paint; offsets for off-screen rows resolve lazily.
  const TZ_INITIAL_RENDER = 60;
  const TZ_RENDER_CHUNK = 60;

  function makeTzButton(item, withOffset) {
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
    offsetSpan.textContent = withOffset ? getFastTzOffset(item.id) : '…';
    if (!withOffset) {
      offsetSpan.dataset.tzId = item.id;
    }

    btn.appendChild(nameSpan);
    btn.appendChild(offsetSpan);

    btn.addEventListener('click', () => {
      setTimezone(item.id);
      closeTimezoneModal();
      showStatus(`✓ Timezone set to ${item.name}`, 'success');
    });
    return btn;
  }

  function fillLazyOffsets(container) {
    const pending = container.querySelectorAll('.tz-item-offset[data-tz-id]');
    pending.forEach(el => {
      el.textContent = getFastTzOffset(el.dataset.tzId);
      el.removeAttribute('data-tz-id');
    });
  }

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

    // High performance DocumentFragment insertion, chunked so the modal
    // opens instantly even with 400+ zones.
    const fragment = document.createDocumentFragment();
    const first = filtered.slice(0, TZ_INITIAL_RENDER);
    const rest = filtered.slice(TZ_INITIAL_RENDER);

    first.forEach(item => fragment.appendChild(makeTzButton(item, true)));
    tzList.appendChild(fragment);

    if (rest.length === 0) return;
    let i = 0;
    const appendChunk = () => {
      // Modal closed mid-render: stop.
      if (!tzList || !tzList.isConnected || tzModal.classList.contains('hidden')) return;
      const chunkFrag = document.createDocumentFragment();
      const chunk = rest.slice(i, i + TZ_RENDER_CHUNK);
      // Offsets for below-the-fold rows are placeholders; filled on idle.
      chunk.forEach(item => chunkFrag.appendChild(makeTzButton(item, false)));
      tzList.appendChild(chunkFrag);
      i += TZ_RENDER_CHUNK;
      if (i < rest.length) {
        requestAnimationFrame(appendChunk);
      } else if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => fillLazyOffsets(tzList));
      } else {
        setTimeout(() => fillLazyOffsets(tzList), 50);
      }
    };
    requestAnimationFrame(appendChunk);
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
      }, 150);
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
  // Server sends the push at Nov 19 00:00 in YOUR chosen timezone via
  // Push Service -> Service Worker, so no open tab is required.
  const VAPID_PUBLIC_KEY = 'BFtiNKeHUlM4wpnNg7Bbn9zcvcz2N987mNjHNDkfDKYRVr95-YoHDPy6KPCBGIA1fKkYgzn_DmoNGhYnFkNfWIM';
  let swRegistration = null;
  let pushBusy = false;

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

  function setAlertUI(active) {
    if (!browserAlertBtn) return;
    if (active) {
      browserAlertBtn.classList.add('enabled');
      if (browserPillText) browserPillText.textContent = 'Alerts On ✓ (tap to cancel)';
      browserAlertBtn.title = 'Push alerts active for ' + (currentTimeZone || 'your timezone') + ' — click to cancel';
    } else {
      browserAlertBtn.classList.remove('enabled');
      if (browserPillText) browserPillText.textContent = 'Browser Alert';
      browserAlertBtn.title = 'Get browser notifications on launch day';
    }
  }

  async function getExistingSubscription() {
    if (!swRegistration) return null;
    try {
      return await swRegistration.pushManager.getSubscription();
    } catch (_) {
      return null;
    }
  }

  // Push the (possibly changed) timezone to the server so the timer follows it.
  async function syncSubscriptionTimezone(tz) {
    try {
      const sub = await getExistingSubscription();
      if (!sub) return;
      await fetch('/api/push-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, timezone: tz })
      });
    } catch (_) {
      // Non-fatal: next dispatch still uses the last saved timezone.
    }
  }

  async function subscribeForPush() {
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

    // Send subscription + chosen timezone to our server.
    // Server computes targetUtc = Nov 19 00:00 in that timezone.
    const response = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        timezone: currentTimeZone
      })
    });

    const result = await response.json();

    if (result.success) {
      setAlertUI(true);
      showStatus(`✓ Push alert set for midnight Nov 19 in ${result.timezone || currentTimeZone}! Works even with the tab closed.`, 'success');
    } else {
      // Roll back the browser subscription if the server save failed
      try { await subscription.unsubscribe(); } catch (_) {}
      showStatus('Could not save subscription. Please try again.', 'error');
    }
  }

  async function unsubscribeFromPush() {
    const sub = await getExistingSubscription();
    if (!sub) {
      setAlertUI(false);
      return;
    }
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch (_) {}
    try {
      await fetch('/api/push-unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint })
      });
    } catch (_) {}
    setAlertUI(false);
    showStatus('Push alerts cancelled. You will no longer receive the launch notification.', 'success');
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
    const subscription = await getExistingSubscription();
    setAlertUI(!!subscription);
    // If the stored timezone differs (user changed it while unsubscribed-state
    // was stale), re-sync so the server timer follows the current choice.
    if (subscription && currentTimeZone) {
      syncSubscriptionTimezone(currentTimeZone);
    }
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
      if (pushBusy) return;
      if (!swRegistration) {
        showStatus('Service Worker not ready. Please refresh the page.', 'error');
        return;
      }

      pushBusy = true;
      try {
        const existing = await getExistingSubscription();
        if (existing) {
          // Toggle behaviour: click again to cancel the notification.
          await unsubscribeFromPush();
        } else {
          await subscribeForPush();
        }
      } catch (err) {
        console.error('Push subscription error:', err);
        showStatus('Could not update push notifications. Please try again.', 'error');
      } finally {
        pushBusy = false;
      }
    });
  }

  // Backup path: page validates its own countdown and notifies directly.
  // Only fires when the tab is open at zero AND the user is subscribed.
  // Same 'gta6-launch' tag as the server push, so the two can never stack.
  let localAlertFired = false;
  async function maybeFireLocalLaunchAlert() {
    if (localAlertFired) return;
    try {
      if (localStorage.getItem('gtaclock_zero_notified') === '1') {
        localAlertFired = true;
        return;
      }
    } catch (_) {}
    localAlertFired = true;
    try {
      const sub = await getExistingSubscription();
      if (!sub || !swRegistration) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      await swRegistration.showNotification('GTA 6 is HERE! 🎮', {
        body: 'Grand Theft Auto VI has launched in your timezone — the countdown is over, go play!',
        icon: '/assets/gta-vi-logo.png',
        badge: '/assets/gta-vi-logo.png',
        tag: 'gta6-launch',
        renotify: true,
        requireInteraction: true,
        data: { url: 'https://gtaclock.com' }
      });
      try { localStorage.setItem('gtaclock_zero_notified', '1'); } catch (_) {}
    } catch (_) {}
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

  // 8. Appearance Customization (top-right panel, persisted in localStorage)
  // NOTE: soundBtn is intentionally inert for now (coming soon).
  const customBtn = document.getElementById('customBtn');
  const customPanel = document.getElementById('customPanel');
  const closeCustomPanel = document.getElementById('closeCustomPanel');
  const customResetBtn = document.getElementById('customResetBtn');

  const CUSTOM_KEY = 'gtaclock_custom';
  const CUSTOM_DEFAULTS = {
    bg: '01.jpg', // filename in public/backgrounds/, or 'none'
    slideshow: true, // GTA loading-screen style Ken Burns slideshow
    showEmblem: true,
    showMeta: true,
    showPlatforms: true,
    showLabels: true,
    showActions: true,
    showBloom: true,
    digitScale: 1,
    emblemScale: 1
  };
  // Filled dynamically from /api/backgrounds (fallback: manifest.json), so any
  // image added to public/backgrounds/ appears in the panel automatically.
  let availableBackgrounds = [];
  let backgroundsLoaded = false;
  const TOGGLE_TO_CLASS = {
    showEmblem: 'hide-emblem',
    showMeta: 'hide-meta',
    showPlatforms: 'hide-platforms',
    showLabels: 'hide-labels',
    showActions: 'hide-actions',
    showBloom: 'hide-bloom'
  };

  // One-tap looks, from bare digits to the full show. Each preset is a
  // complete mapping onto the customization settings above.
  const PRESETS = {
    'ultra-minimal': {
      name: 'Ultra Minimal',
      desc: 'Bare digits on solid black. Nothing else.',
      settings: { bg: 'none', slideshow: false, showEmblem: false, showMeta: false, showPlatforms: false, showLabels: false, showActions: false, showBloom: false, digitScale: 1.2, emblemScale: 1 }
    },
    'minimal': {
      name: 'Minimal',
      desc: 'Logo, digits and labels. Calm and clean.',
      settings: { bg: '01.jpg', slideshow: true, showEmblem: false, showMeta: false, showPlatforms: false, showLabels: true, showActions: false, showBloom: true, digitScale: 1, emblemScale: 1 }
    },
    'informative': {
      name: 'Informative',
      desc: 'The full experience, tastefully sized.',
      settings: { bg: '01.jpg', slideshow: true, showEmblem: false, showMeta: true, showPlatforms: false, showLabels: true, showActions: true, showBloom: true, digitScale: 1, emblemScale: 1 }
    },
    'extra-informative': {
      name: 'Extra Informative',
      desc: 'Everything on, digits turned up.',
      settings: { bg: '01.jpg', slideshow: true, showEmblem: true, showMeta: true, showPlatforms: true, showLabels: true, showActions: true, showBloom: true, digitScale: 1, emblemScale: 1 }
    }
  };
  const PRESET_KEYS = ['bg', 'slideshow', 'showEmblem', 'showMeta', 'showPlatforms', 'showLabels', 'showActions', 'showBloom', 'digitScale', 'emblemScale'];
  const ONBOARD_KEY = 'gtaclock_onboarded';

  function loadCustomSettings() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (!raw) return { ...CUSTOM_DEFAULTS };
      return { ...CUSTOM_DEFAULTS, ...JSON.parse(raw) };
    } catch (_) {
      return { ...CUSTOM_DEFAULTS };
    }
  }

  let customSettings = loadCustomSettings();

  function persistCustomSettings() {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(customSettings));
    } catch (_) {}
  }

  // Background entries are flat images ({kind:'flat', file, url}) or
  // parallax packs ({kind:'parallax', dir, background, foreground, full}).
  // Stored selection values: 'none' | filename | 'parallax:<dir>'.
  function entryId(entry) {
    if (!entry) return null;
    return entry.kind === 'parallax' ? 'parallax:' + entry.dir : entry.file;
  }

  function findBgEntry(value) {
    if (!value || value === 'none') return null;
    if (value.startsWith('parallax:')) {
      const dir = value.slice('parallax:'.length);
      return availableBackgrounds.find(e => e.kind === 'parallax' && e.dir === dir) || null;
    }
    return availableBackgrounds.find(e => e.kind !== 'parallax' && e.file === value) || null;
  }

  // Resolve a background file against the known list, falling back
  // gracefully when files were renamed or deleted.
  function sanitizeBgFile(file) {
    if (file === 'none') return 'none';
    if (!backgroundsLoaded) return file; // optimistic; loader validates later
    if (findBgEntry(file)) return file;
    if (findBgEntry(CUSTOM_DEFAULTS.bg)) return CUSTOM_DEFAULTS.bg;
    const first = availableBackgrounds[0];
    return first ? entryId(first) : 'none';
  }

  // Apply a full preset look.
  function applyPreset(key, opts = {}) {
    const preset = PRESETS[key];
    if (!preset) return;
    customSettings = { ...CUSTOM_DEFAULTS, ...preset.settings, bg: sanitizeBgFile(preset.settings.bg) };
    persistCustomSettings();
    if (customSettings.slideshow) {
      if (backgroundsLoaded) startSlideshow();
      // else: loadBackgroundPresets() starts it once the list arrives
    } else {
      stopSlideshow();
    }
    applyCustomSettings();
    if (!opts.silent) showStatus(`✓ "${preset.name}" style applied.`, 'success');
  }

  function presetMatches(key) {
    const preset = PRESETS[key];
    if (!preset) return false;
    return PRESET_KEYS.every(k => customSettings[k] === preset.settings[k]);
  }

  // Schematic mini preview of the page under a preset's settings.
  function buildPresetPreview(settings) {
    const wrap = document.createElement('span');
    wrap.className = 'preset-preview' + (settings.showBloom ? ' has-bloom' : '');

    if (settings.bg && settings.bg !== 'none') {
      const bgImg = document.createElement('img');
      bgImg.className = 'pv-bg';
      bgImg.src = `/backgrounds/${settings.bg}`;
      bgImg.alt = '';
      bgImg.loading = 'lazy';
      bgImg.decoding = 'async';
      wrap.appendChild(bgImg);
    }

    if (settings.showEmblem) {
      const logo = document.createElement('img');
      logo.className = 'pv-logo';
      logo.src = '/assets/gta-vi-logo.png';
      logo.alt = '';
      logo.loading = 'lazy';
      logo.decoding = 'async';
      wrap.appendChild(logo);
    }

    const digits = document.createElement('span');
    digits.className = 'pv-digits';
    digits.style.fontSize = Math.round(17 * (settings.digitScale || 1)) + 'px';
    ['214', '07', '33', '10'].forEach((d, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'pv-sep';
        sep.textContent = ':';
        digits.appendChild(sep);
      }
      const dd = document.createElement('span');
      dd.textContent = d;
      digits.appendChild(dd);
    });
    wrap.appendChild(digits);

    if (settings.showLabels) {
      const labels = document.createElement('span');
      labels.className = 'pv-labels';
      ['DAYS', 'HRS', 'MIN', 'SEC'].forEach(t => {
        const s = document.createElement('span');
        s.textContent = t;
        labels.appendChild(s);
      });
      wrap.appendChild(labels);
    }

    if (settings.showMeta) {
      wrap.appendChild(document.createElement('span')).className = 'pv-meta';
    }

    if (settings.showPlatforms) {
      const p = document.createElement('span');
      p.className = 'pv-platforms';
      p.appendChild(document.createElement('span'));
      p.appendChild(document.createElement('span'));
      wrap.appendChild(p);
    }

    if (settings.showActions) {
      const a = document.createElement('span');
      a.className = 'pv-actions';
      a.appendChild(document.createElement('span'));
      a.appendChild(document.createElement('span'));
      wrap.appendChild(a);
    }

    return wrap;
  }

  function renderPresetCards() {
    const wrap = document.getElementById('presetCards');
    if (!wrap) return;
    wrap.innerHTML = '';
    Object.keys(PRESETS).forEach(key => {
      const preset = PRESETS[key];
      const card = document.createElement('button');
      card.className = 'preset-card';
      card.dataset.preset = key;
      card.appendChild(buildPresetPreview(preset.settings));
      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = preset.name;
      const desc = document.createElement('span');
      desc.className = 'preset-desc';
      desc.textContent = preset.desc;
      card.appendChild(name);
      card.appendChild(desc);
      card.addEventListener('click', () => {
        applyPreset(key, { silent: true });
        hideOnboarding(true);
        showStatus(`✓ "${preset.name}" style applied.`, 'success');
      });
      wrap.appendChild(card);
    });
  }

  function hideOnboarding(mark) {
    const overlay = document.getElementById('onboardOverlay');
    if (overlay) overlay.classList.add('hidden');
    if (mark) {
      try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (_) {}
    }
  }

  function maybeShowOnboarding() {
    let seen = null;
    try { seen = localStorage.getItem(ONBOARD_KEY); } catch (_) {}
    if (seen) return;
    const overlay = document.getElementById('onboardOverlay');
    if (overlay) overlay.classList.remove('hidden');
    if (renderPresetCards._deferred) {
      renderPresetCards._deferred = false;
      renderPresetCards();
    }
  }
  function disableSlideshowIfOn() {
    if (customSettings.slideshow) {
      customSettings.slideshow = false;
      stopSlideshow();
    }
  }

  // Background grid shows a few presets; "show more" reveals the rest.
  const BG_COLLAPSED_COUNT = 6;
  let bgExpanded = false;

  function renderBgPresets() {
    const wrap = document.getElementById('bgPresets');
    if (!wrap) return;
    wrap.innerHTML = '';

    const visible = bgExpanded ? availableBackgrounds : availableBackgrounds.slice(0, BG_COLLAPSED_COUNT);
    visible.forEach(entry => {
      const id = entryId(entry);
      const isPx = entry.kind === 'parallax';
      const btn = document.createElement('button');
      btn.className = 'bg-preset' + (customSettings.bg === id ? ' active' : '');
      btn.dataset.bg = id;
      btn.title = entry.name;

      const img = document.createElement('img');
      img.src = entry.thumb || (isPx ? entry.thumb : entry.url);
      img.alt = entry.name + ' background';
      img.loading = 'lazy';
      img.decoding = 'async';

      const label = document.createElement('span');
      label.textContent = entry.name;

      btn.appendChild(img);
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        disableSlideshowIfOn();
        customSettings.bg = id;
        persistCustomSettings();
        applyCustomSettings();
      });
      wrap.appendChild(btn);
    });

    // "None" (solid color) is always available
    const noneBtn = document.createElement('button');
    noneBtn.className = 'bg-preset' + (customSettings.bg === 'none' ? ' active' : '');
    noneBtn.dataset.bg = 'none';
    noneBtn.title = 'None (solid color)';
    const thumb = document.createElement('span');
    thumb.className = 'bg-none-thumb';
    const noneLabel = document.createElement('span');
    noneLabel.textContent = 'None';
    noneBtn.appendChild(thumb);
    noneBtn.appendChild(noneLabel);
    noneBtn.addEventListener('click', () => {
      disableSlideshowIfOn();
      customSettings.bg = 'none';
      persistCustomSettings();
      applyCustomSettings();
    });
    wrap.appendChild(noneBtn);

    if (availableBackgrounds.length > BG_COLLAPSED_COUNT) {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'bg-more-btn';
      moreBtn.textContent = bgExpanded
        ? 'Show less'
        : `Show all ${availableBackgrounds.length}`;
      moreBtn.addEventListener('click', () => {
        bgExpanded = !bgExpanded;
        renderBgPresets();
      });
      wrap.appendChild(moreBtn);
    }
  }

  // Fetch the live list; validate the stored choice against it.
  async function loadBackgroundPresets() {
    let list = null;
    try {
      const res = await fetch('/api/backgrounds');
      const data = await res.json();
      if (data.success && Array.isArray(data.backgrounds)) list = data.backgrounds;
    } catch (_) {}
    if (!list) {
      try {
        const res = await fetch('/backgrounds/manifest.json');
        const data = await res.json();
        if (Array.isArray(data)) list = data;
      } catch (_) {}
    }
    availableBackgrounds = list || [];
    backgroundsLoaded = true;

    const clean = sanitizeBgFile(customSettings.bg);
    if (clean !== customSettings.bg) {
      customSettings.bg = clean;
      persistCustomSettings();
    }
    applyCustomSettings();
    // Resume the slideshow if it was on (persisted toggle).
    if (customSettings.slideshow) startSlideshow();
  }

  // GTA loading-screen style slideshow: each artwork holds ~10s with a slow
  // Ken Burns drift (12s zoom/pan), then crossfades into the next one drifting a
  // different way. Two stacked layers alternate front/back duty.
  const SLIDE_HOLD_MS = 10000;
  const KB_VARIANTS = ['kb-zoom-in', 'kb-zoom-out', 'kb-pan-left', 'kb-pan-right'];
  let slideshowTimer = null;
  let slideIndex = 0;
  let kbIndex = 0;
  let frontLayer = 0;

  function getBackdropLayers() {
    if (getBackdropLayers._cache && getBackdropLayers._cache.every(l => l.isConnected)) {
      return getBackdropLayers._cache;
    }
    getBackdropLayers._cache = Array.from(document.querySelectorAll('.backdrop-art'));
    return getBackdropLayers._cache;
  }

  // Decode the upcoming slide off-screen so the crossfade never reveals a
  // half-loaded frame (28MB of heroes otherwise flash on slow networks).
  function preloadSlideImage(entry) {
    if (!entry) return;
    const url = entry.kind === 'parallax' ? (entry.full || entry.background) : entry.url;
    if (!url || preloadSlideImage._seen?.has(url)) return;
    (preloadSlideImage._seen || (preloadSlideImage._seen = new Set())).add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  function preloadNextSlide() {
    if (availableBackgrounds.length < 2) return;
    const schedule = typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
      : (fn) => setTimeout(fn, 500);
    schedule(() => {
      preloadSlideImage(availableBackgrounds[(slideIndex + 1) % availableBackgrounds.length]);
    });
  }

  function setLayerImage(layer, url) {
    layer.classList.remove(...KB_VARIANTS);
    layer.style.backgroundImage = `url('${url}')`;
    // Double-RAF restart: avoids the forced sync layout of void offsetWidth.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!layer.isConnected) return;
      layer.classList.add(KB_VARIANTS[kbIndex++ % KB_VARIANTS.length]);
    }));
  }

  // Parallax stage for folder packs: background and foreground layers ease
  // in ONE direction per showing (drift right / left / push / pull), GTA-
  // loading-screen style — the front layer always covers ~2.4x the back
  // layer's travel so depth reads through rate alone, then holds the pose.
  // The whole stage fades as one unit; everything painted on the flat
  // crossfade layers beneath it is invisible while it is opaque.
  // The glide itself is one CSS transition on the compositor (no per-frame
  // JS), so it stays smooth regardless of main-thread load.
  const PX_FADE_MS = 1000;
  // One presentation = one direction, linear start pose -> end pose.
  // Depth reads through opposition: the foreground goes one way while the
  // background goes the opposite way slower — zooming (front in 1x while
  // back out 0.5x and vice versa) as well as panning. Nothing ever reverses
  // mid-show. Variants rotate per pack presentation.
  // (drift right / left / push / pull).
  // Absolute pacing matches the still-image Ken Burns drifts (~5px/s pans,
  // ~1%/s zooms over the 10s hold / 10s glide); the foreground only ever wins
  // on the opposition ratio, never on raw speed.
  const PX_DRIFT_MS = 10000;
  const PX_DIRECTIONS = [
    {
      back: { x0: 10, y0: 0, s0: 1.03, x1: -10, y1: 0, s1: 1.015 },
      front: { x0: -24, y0: 0, s0: 1.015, x1: 24, y1: 0, s1: 1.045 }
    },
    {
      back: { x0: -10, y0: 0, s0: 1.03, x1: 10, y1: 0, s1: 1.015 },
      front: { x0: 24, y0: 0, s0: 1.015, x1: -24, y1: 0, s1: 1.045 }
    },
    {
      back: { x0: 0, y0: -3, s0: 1.045, x1: 0, y1: 3, s1: 1.0 },
      front: { x0: 0, y0: 6, s0: 1.0, x1: 0, y1: -6, s1: 1.09 }
    },
    {
      back: { x0: 0, y0: 3, s0: 1.0, x1: 0, y1: -3, s1: 1.045 },
      front: { x0: 0, y0: -6, s0: 1.09, x1: 0, y1: 6, s1: 1.0 }
    }
  ];
  let parallaxStageVisible = false;
  let pxFadeTimer = null;
  let pxVariant = 0;
  let lastPxId = null;

  function pxStage() {
    return document.getElementById('pxStage');
  }

  function pxLayers() {
    return [document.getElementById('pxBack'), document.getElementById('pxFront')];
  }

  function pxReducedMotion() {
    try {
      return typeof window !== 'undefined' &&
        !!window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function pxPoseStyle(pose) {
    return `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.s})`;
  }

  // Drive one full glide on the compositor: snap to the start pose, then a
  // single 10s ease-out transition to the end pose — fast open, slowly
  // coming to a halt. No per-frame JS, so the motion stays smooth no matter
  // how busy the main thread gets — and it parks itself at the end pose
  // when done (no restart, no reversal).
  function drivePxMotion() {
    const d = PX_DIRECTIONS[pxVariant % PX_DIRECTIONS.length];
    const reduced = pxReducedMotion();
    const [back, front] = pxLayers();
    const pairs = [[back, d.back], [front, d.front]];
    pairs.forEach(([layer, pose]) => {
      if (!layer) return;
      layer.style.transition = 'none';
      layer.style.transform = reduced
        ? pxPoseStyle({ x: pose.x1, y: pose.y1, s: pose.s1 })
        : pxPoseStyle({ x: pose.x0, y: pose.y0, s: pose.s0 });
    });
    if (reduced) return;
    const stage = pxStage();
    if (stage) void stage.offsetWidth; // flush so the transition below animates
    pairs.forEach(([layer, pose]) => {
      if (!layer) return;
      layer.style.transition = `transform ${PX_DRIFT_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      layer.style.transform = pxPoseStyle({ x: pose.x1, y: pose.y1, s: pose.s1 });
    });
  }

  function setPxImages(entry) {
    const id = entryId(entry);
    if (id !== lastPxId) {
      lastPxId = id;
      pxVariant = (pxVariant + 1) % PX_DIRECTIONS.length;
    }
    const [back, front] = pxLayers();
    if (back && entry.background) back.style.backgroundImage = `url('${entry.background}')`;
    if (front) {
      if (entry.foreground) {
        front.style.backgroundImage = `url('${entry.foreground}')`;
        front.style.display = '';
      } else {
        front.style.backgroundImage = 'none';
        front.style.display = 'none';
      }
    }
  }

  // Paint entry.full on a flat layer with no drift (used beneath the stage).
  function prepStandardLayer(layer, url) {
    if (!layer) return;
    layer.classList.remove(...KB_VARIANTS);
    if (url) layer.style.backgroundImage = `url('${url}')`;
  }

  function setStageOpacity(visible) {
    const stage = pxStage();
    parallaxStageVisible = visible;
    if (stage) stage.classList.toggle('px-on', visible);
  }

  // Show a parallax pack: stage the start poses, fade the stage in over the
  // current slide, then drive the glide; sync the flat layer beneath
  // (invisibly) so later fades stay seamless.
  function presentParallax(entry) {
    setPxImages(entry);
    setStageOpacity(true);
    drivePxMotion();
    clearTimeout(pxFadeTimer);
    pxFadeTimer = setTimeout(() => {
      const layers = getBackdropLayers();
      prepStandardLayer(layers[frontLayer], entry.full);
    }, PX_FADE_MS + 300);
  }

  // Dip out and back in for parallax -> parallax slide changes: the new
  // glide starts under cover of the fade-in.
  function dipParallaxStage(entry) {
    const layers = getBackdropLayers();
    if (layers[frontLayer]) prepStandardLayer(layers[frontLayer], entry.full);
    setStageOpacity(false);
    clearTimeout(pxFadeTimer);
    pxFadeTimer = setTimeout(() => {
      setPxImages(entry);
      setStageOpacity(true);
      drivePxMotion();
    }, PX_FADE_MS);
  }

  function hideParallaxStage() {
    clearTimeout(pxFadeTimer);
    setStageOpacity(false);
  }

  function startSlideshow() {
    stopSlideshow(true);
    if (availableBackgrounds.length === 0) {
      customSettings.slideshow = false;
      persistCustomSettings();
      applyCustomSettings();
      showStatus('No backgrounds found in public/backgrounds/.', 'error');
      return;
    }
    document.body.classList.remove('bg-none');
    const layers = getBackdropLayers();
    if (layers.length < 2) return;
    layers.forEach(l => l.classList.add('crossfading'));

    let startIdx = availableBackgrounds.findIndex(e => entryId(e) === customSettings.bg);
    if (startIdx < 0) startIdx = 0;
    slideIndex = startIdx;
    frontLayer = 0;

    displaySlide(availableBackgrounds[slideIndex], true);
    preloadNextSlide();

    if (availableBackgrounds.length > 1) {
      scheduleNextSlide();
    }
  }

  // Paint one slide. Flat slides crossfade on the standard layers with a
  // Ken Burns drift; parallax slides fade the depth stage as a whole.
  function displaySlide(entry, isFirst) {
    const layers = getBackdropLayers();
    if (entry && entry.kind === 'parallax') {
      if (!isFirst && parallaxStageVisible) {
        dipParallaxStage(entry);
      } else {
        presentParallax(entry);
      }
      return;
    }
    hideParallaxStage();
    if (!entry) return;
    const back = layers[1 - frontLayer];
    const front = layers[frontLayer];
    if (isFirst) {
      setLayerImage(layers[0], entry.url);
      layers[0].classList.add('slide-visible');
      layers[0].classList.remove('slide-hidden');
      layers[1].classList.add('slide-hidden');
      layers[1].classList.remove('slide-visible');
      return;
    }
    setLayerImage(back, entry.url);
    back.classList.add('slide-visible');
    back.classList.remove('slide-hidden');
    front.classList.add('slide-hidden');
    front.classList.remove('slide-visible');
    frontLayer = 1 - frontLayer;
  }

  function advanceSlide() {
    if (availableBackgrounds.length < 2) return;
    const layers = getBackdropLayers();
    if (layers.length < 2) return;
    slideIndex = (slideIndex + 1) % availableBackgrounds.length;
    const entry = availableBackgrounds[slideIndex];
    if (entry.kind === 'parallax') {
      // Swap the flat layer beneath invisibly while the stage is opaque,
      // so the dip reveals the incoming scene instead of a stale frame.
      if (parallaxStageVisible) {
        const back = layers[1 - frontLayer];
        const front = layers[frontLayer];
        prepStandardLayer(back, entry.full);
        back.classList.add('slide-visible');
        back.classList.remove('slide-hidden');
        front.classList.add('slide-hidden');
        front.classList.remove('slide-visible');
        frontLayer = 1 - frontLayer;
      }
      displaySlide(entry, false);
    } else {
      hideParallaxStage();
      const back = layers[1 - frontLayer];
      const front = layers[frontLayer];
      setLayerImage(back, entry.url);
      back.classList.add('slide-visible');
      back.classList.remove('slide-hidden');
      front.classList.add('slide-hidden');
      front.classList.remove('slide-visible');
      frontLayer = 1 - frontLayer;
    }
    preloadNextSlide();
  }

  // setTimeout chain (not setInterval): skipped entirely while the tab is
  // hidden, so background tabs burn no CPU/network on invisible crossfades.
  function scheduleNextSlide() {
    clearTimeout(slideshowTimer);
    if (availableBackgrounds.length < 2) return;
    slideshowTimer = setTimeout(() => {
      if (!document.hidden && customSettings.slideshow) {
        advanceSlide();
      }
      scheduleNextSlide();
    }, SLIDE_HOLD_MS);
  }

  function stopSlideshow(silent) {
    if (slideshowTimer) {
      clearTimeout(slideshowTimer);
      slideshowTimer = null;
    }
    clearTimeout(pxFadeTimer);
    if (silent) return;
    hideParallaxStage();
    // Restore the static single-layer state; applyCustomSettings repaints it.
    getBackdropLayers().forEach((layer, i) => {
      layer.classList.remove('crossfading', 'slide-visible', 'slide-hidden', ...KB_VARIANTS);
      if (i > 0) layer.classList.add('slide-hidden');
    });
  }

  function applyCustomSettings() {
    // While the slideshow runs it owns the visuals; static bg is only
    // applied when the slideshow is off.
    if (!customSettings.slideshow) {
      const entry = findBgEntry(customSettings.bg);
      if (customSettings.bg === 'none') {
        hideParallaxStage();
        document.body.classList.add('bg-none');
      } else if (entry && entry.kind === 'parallax') {
        // Static pick: full composite only, no motion (motion lives in slideshow).
        hideParallaxStage();
        document.body.classList.remove('bg-none');
        const layerA = document.querySelector('.backdrop-art');
        if (layerA) layerA.style.backgroundImage = `url('${entry.full}')`;
      } else if (entry) {
        hideParallaxStage();
        document.body.classList.remove('bg-none');
        const layerA = document.querySelector('.backdrop-art');
        if (layerA) layerA.style.backgroundImage = `url('${entry.url}')`;
      }
      // else: unknown / list not loaded yet — leave first-paint CSS as-is
    } else {
      document.body.classList.remove('bg-none');
    }

    Object.keys(TOGGLE_TO_CLASS).forEach(key => {
      document.body.classList.toggle(TOGGLE_TO_CLASS[key], !customSettings[key]);
    });

    document.documentElement.style.setProperty('--digit-scale', customSettings.digitScale);
    document.documentElement.style.setProperty('--emblem-scale', customSettings.emblemScale);

    renderBgPresets();
    syncCustomPanelControls();
  }

  function syncCustomPanelControls() {
    if (!customPanel) return;
    customPanel.querySelectorAll('.bg-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bg === customSettings.bg);
    });
    customPanel.querySelectorAll('.preset-strip-btn').forEach(btn => {
      btn.classList.toggle('active', presetMatches(btn.dataset.preset));
    });
    customPanel.querySelectorAll('input[type="checkbox"][data-setting]').forEach(input => {
      input.checked = !!customSettings[input.dataset.setting];
    });
    customPanel.querySelectorAll('input[type="range"][data-setting]').forEach(input => {
      input.value = customSettings[input.dataset.setting];
    });
    const digitVal = document.getElementById('digitScaleVal');
    if (digitVal) digitVal.textContent = Math.round(customSettings.digitScale * 100) + '%';
    const emblemVal = document.getElementById('emblemScaleVal');
    if (emblemVal) emblemVal.textContent = Math.round(customSettings.emblemScale * 100) + '%';
  }

  function openCustomPanel() {
    if (!customPanel) return;
    if (renderPresetCards._deferred) {
      renderPresetCards._deferred = false;
      renderPresetCards();
    }
    syncCustomPanelControls();
    customPanel.classList.remove('hidden');
    if (customBtn) customBtn.classList.add('active');
  }

  function closeCustomPanelFn() {
    if (!customPanel) return;
    customPanel.classList.add('hidden');
    if (customBtn) customBtn.classList.remove('active');
  }

  if (customBtn) {
    customBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!customPanel) return;
      closeMusicPanelFn();
      if (customPanel.classList.contains('hidden')) {
        openCustomPanel();
      } else {
        closeCustomPanelFn();
      }
    });
  }

  if (closeCustomPanel) {
    closeCustomPanel.addEventListener('click', closeCustomPanelFn);
  }

  // Only one top-right panel open at a time; outside click closes both.
  function clickIsInsidePanelsOrButtons(target) {
    if (customPanel && !customPanel.classList.contains('hidden') && customPanel.contains(target)) return true;
    if (customBtn && customBtn.contains(target)) return true;
    const musicPanelEl = document.getElementById('musicPanel');
    const soundBtnEl = document.getElementById('soundBtn');
    if (musicPanelEl && !musicPanelEl.classList.contains('hidden') && musicPanelEl.contains(target)) return true;
    if (soundBtnEl && soundBtnEl.contains(target)) return true;
    return false;
  }

  document.addEventListener('click', (e) => {
    // If our own re-render (presets grid, track list, …) detached the
    // clicked element mid-click, it isn't an outside click — ignore it.
    if (e.target && e.target.isConnected === false) return;
    if (clickIsInsidePanelsOrButtons(e.target)) return;
    closeCustomPanelFn();
    closeMusicPanelFn();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCustomPanelFn();
      closeMusicPanelFn();
      const overlay = document.getElementById('onboardOverlay');
      if (overlay && !overlay.classList.contains('hidden')) hideOnboarding(true);
    }
  });

  if (customPanel) {
    // NOTE: .bg-preset buttons are rendered dynamically by renderBgPresets()
    // with their own click handlers (the list comes from /api/backgrounds).
    customPanel.querySelectorAll('.preset-strip-btn').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
    customPanel.querySelectorAll('input[type="checkbox"][data-setting]').forEach(input => {
      input.addEventListener('change', () => {
        customSettings[input.dataset.setting] = input.checked;
        persistCustomSettings();
        if (input.dataset.setting === 'slideshow') {
          if (input.checked) {
            startSlideshow();
            syncCustomPanelControls();
          } else {
            stopSlideshow();
            applyCustomSettings();
          }
        } else {
          applyCustomSettings();
        }
      });
    });

    customPanel.querySelectorAll('input[type="range"][data-setting]').forEach(input => {
      input.addEventListener('input', () => {
        customSettings[input.dataset.setting] = parseFloat(input.value);
        persistCustomSettings();
        applyCustomSettings();
      });
    });
  }

  if (customResetBtn) {
    customResetBtn.addEventListener('click', () => {
      customSettings = { ...CUSTOM_DEFAULTS };
      persistCustomSettings();
      stopSlideshow();
      applyCustomSettings();
      showStatus('✓ Appearance reset to default.', 'success');
    });
  }

  // 9. Music / OST player (speaker icon, persisted track + volume)
  // Tracks come from /api/ost (fallback: /ost/manifest.json), so any audio
  // added to public/ost/ appears automatically. Plays by default; if the
  // browser blocks autoplay it starts on the first tap/keypress.
  const soundBtn = document.getElementById('soundBtn');
  const musicPanel = document.getElementById('musicPanel');
  const closeMusicBtn = document.getElementById('closeMusicPanel');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const iconPlay = document.getElementById('iconPlay');
  const iconPause = document.getElementById('iconPause');
  const trackListEl = document.getElementById('trackList');
  const trackNameEl = document.getElementById('trackName');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeVal = document.getElementById('volumeVal');

  const MUSIC_KEY = 'gtaclock_music';
  const MUSIC_DEFAULTS = {
    track: 'GTA-VI-OST.mp3',
    volume: 0.7
  };

  function loadMusicSettings() {
    try {
      const raw = localStorage.getItem(MUSIC_KEY);
      if (!raw) return { ...MUSIC_DEFAULTS };
      const parsed = { ...MUSIC_DEFAULTS, ...JSON.parse(raw) };
      parsed.volume = Math.min(1, Math.max(0, Number(parsed.volume) || 0));
      return parsed;
    } catch (_) {
      return { ...MUSIC_DEFAULTS };
    }
  }

  let musicSettings = loadMusicSettings();
  let availableTracks = [];
  let audioEl = null;

  function persistMusicSettings() {
    try {
      localStorage.setItem(MUSIC_KEY, JSON.stringify(musicSettings));
    } catch (_) {}
  }

  function ensureAudio() {
    if (audioEl) return audioEl;
    audioEl = new Audio();
    audioEl.loop = true;
    // 'none' until the user actually wants music: the three OST files are
    // ~13MB and preload='auto' fetched one immediately on every page load.
    audioEl.preload = 'none';
    audioEl.volume = musicSettings.volume;
    audioEl.addEventListener('play', syncPlayUI);
    audioEl.addEventListener('pause', syncPlayUI);
    return audioEl;
  }

  function currentTrack() {
    return availableTracks.find(t => t.file === musicSettings.track) || null;
  }

  function syncPlayUI() {
    const playing = !!audioEl && !audioEl.paused;
    if (iconPlay) iconPlay.classList.toggle('hidden', playing);
    if (iconPause) iconPause.classList.toggle('hidden', !playing);
    if (soundBtn) soundBtn.classList.toggle('active', playing);
  }

  function renderTrackList() {
    if (!trackListEl) return;
    trackListEl.innerHTML = '';
    if (availableTracks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'track-empty';
      empty.textContent = 'No tracks found. Add audio files to public/ost/.';
      trackListEl.appendChild(empty);
      return;
    }
    const playingFile = audioEl && !audioEl.paused ? audioEl.dataset.file : null;
    availableTracks.forEach(track => {
      const btn = document.createElement('button');
      btn.className = 'track-item' + (musicSettings.track === track.file ? ' active' : '');
      btn.title = track.name;

      const state = document.createElement('span');
      state.className = 'track-play-state';
      state.textContent = playingFile === track.file ? '▶' : '♪';

      const label = document.createElement('span');
      label.className = 'track-item-name';
      label.textContent = track.name;

      btn.appendChild(state);
      btn.appendChild(label);
      btn.addEventListener('click', () => selectTrack(track.file, true));
      trackListEl.appendChild(btn);
    });
  }

  function applyTrack(autoplay) {
    const track = currentTrack();
    if (trackNameEl) trackNameEl.textContent = track ? track.name : '—';
    if (!track) return;
    const audio = ensureAudio();
    if (audio.dataset.file !== track.file) {
      const wasPlaying = !audio.paused && audio.dataset.file;
      audio.preload = 'auto';
      audio.src = track.url;
      audio.dataset.file = track.file;
      try { audio.load(); } catch (_) {}
      if (autoplay || wasPlaying) {
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } else if (autoplay) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    renderTrackList();
  }

  function selectTrack(file, autoplay) {
    musicSettings.track = file;
    persistMusicSettings();
    applyTrack(autoplay);
  }

  function syncVolumeUI() {
    if (volumeSlider) volumeSlider.value = Math.round(musicSettings.volume * 100);
    if (volumeVal) volumeVal.textContent = Math.round(musicSettings.volume * 100) + '%';
    if (audioEl) audioEl.volume = musicSettings.volume;
  }

  // Autoplay the default track. Browsers block audible autoplay until the
  // user has interacted with the page, so the first attempt is deferred
  // until the first tap/keypress — and the <audio> element itself isn't even
  // created (no bytes fetched) until then.
  function tryAutoplay() {
    const track = currentTrack();
    if (!track) return;
    const resume = () => {
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
      try {
        const audio = ensureAudio();
        if (audio.dataset.file !== track.file) {
          audio.src = track.url;
          audio.dataset.file = track.file;
          audio.preload = 'auto';
          try { audio.load(); } catch (_) {}
        }
        if (audio.paused) {
          const q = audio.play();
          if (q && typeof q.catch === 'function') q.catch(() => {});
        }
      } catch (_) {}
    };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);
  }

  async function loadTracks() {
    let list = null;
    try {
      const res = await fetch('/api/ost');
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) list = data.tracks;
    } catch (_) {}
    if (!list) {
      try {
        const res = await fetch('/ost/manifest.json');
        const data = await res.json();
        if (Array.isArray(data)) list = data;
      } catch (_) {}
    }
    availableTracks = list || [];

    if (!availableTracks.some(t => t.file === musicSettings.track)) {
      musicSettings.track = availableTracks.some(t => t.file === MUSIC_DEFAULTS.track)
        ? MUSIC_DEFAULTS.track
        : (availableTracks[0] ? availableTracks[0].file : null);
      persistMusicSettings();
    }
    ensureAudio().volume = musicSettings.volume;
    syncVolumeUI();
    applyTrack(false);
    tryAutoplay();
  }

  function openMusicPanel() {
    if (!musicPanel) return;
    renderTrackList();
    syncVolumeUI();
    musicPanel.classList.remove('hidden');
  }

  function closeMusicPanelFn() {
    if (!musicPanel) return;
    musicPanel.classList.add('hidden');
    if (soundBtn && (!audioEl || audioEl.paused)) soundBtn.classList.remove('active');
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!musicPanel) return;
      closeCustomPanelFn();
      if (musicPanel.classList.contains('hidden')) {
        openMusicPanel();
      } else {
        closeMusicPanelFn();
      }
    });
  }

  if (closeMusicBtn) {
    closeMusicBtn.addEventListener('click', closeMusicPanelFn);
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      const track = currentTrack();
      if (!track) return;
      const audio = ensureAudio();
      if (audio.dataset.file !== track.file) {
        selectTrack(track.file, true);
      } else if (audio.paused) {
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else {
        audio.pause();
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      musicSettings.volume = Math.min(100, Math.max(0, Number(volumeSlider.value) || 0)) / 100;
      persistMusicSettings();
      syncVolumeUI();
    });
  }

  // Initialization — critical path stays lean: countdown + static paint
  // first, everything else deferred to idle so LCP isn't blocked by the
  // preset-card previews, track manifest, or background list.
  initTimezoneDatabase();
  applyCustomSettings();
  loadBackgroundPresets();
  updateCountdown();
  scheduleCountdownTick();

  const deferIdle = (fn) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 2500 });
    else setTimeout(fn, 300);
  };
  deferIdle(() => {
    loadTracks();
    // Preset previews each embed a background image — only build them when
    // the onboarding overlay or customize panel is actually shown.
    if (!document.getElementById('onboardOverlay')?.classList.contains('hidden')) {
      renderPresetCards();
    } else {
      renderPresetCards._deferred = true;
    }
  });

  const onboardSkip = document.getElementById('onboardSkip');
  if (onboardSkip) {
    onboardSkip.addEventListener('click', () => hideOnboarding(true));
  }
  maybeShowOnboarding();

  const savedTz = localStorage.getItem('gtaclock_tz') || 'auto';
  setTimezone(savedTz);

  // Countdown ticker is driven by scheduleCountdownTick() (aligned to the
  // second boundary) — no setInterval here.

  // Register Service Worker and check push state
  registerServiceWorker().then(() => {
    updateBrowserAlertState();
    checkExistingSubscription();
  });

  setupCalendar();

})();
