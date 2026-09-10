// GTA CLOCK — Launch time helper (shared server-side)
// Single source of truth: Nov 19, 2026 at 00:00:00 in the subscriber's IANA timezone,
// converted to an absolute UTC timestamp (ms since epoch).

const LAUNCH_YEAR = 2026;
const LAUNCH_MONTH_INDEX = 10; // November (0-based)
const LAUNCH_DAY = 19;

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

// Resolve client-sent timezone to a canonical IANA zone, falling back to UTC.
function normalizeTimeZone(tz, fallback = 'UTC') {
  if (isValidTimeZone(tz)) return tz;
  if (tz === 'Asia/Katmandu') return 'Asia/Kathmandu';
  return fallback;
}

// Compute the UTC timestamp for Nov 19 2026 00:00:00 wall-clock time in `timeZone`.
function calculateTargetUtc(timeZone) {
  const tz = normalizeTimeZone(timeZone);
  const desiredUtc = Date.UTC(LAUNCH_YEAR, LAUNCH_MONTH_INDEX, LAUNCH_DAY, 0, 0, 0);
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
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
    const localAsUtc = Date.UTC(
      parseInt(p.year, 10),
      parseInt(p.month, 10) - 1,
      parseInt(p.day, 10),
      hour,
      parseInt(p.minute, 10),
      parseInt(p.second, 10)
    );
    const diff = localAsUtc - desiredUtc;
    return desiredUtc - diff;
  } catch (_) {
    return desiredUtc;
  }
}

module.exports = {
  LAUNCH_YEAR,
  LAUNCH_MONTH_INDEX,
  LAUNCH_DAY,
  isValidTimeZone,
  normalizeTimeZone,
  calculateTargetUtc
};
