// Timestamp formatting for the Discussion thread. Pure functions, loadable in
// the browser (global `timeFormat`) and from node:test (module.exports).
const timeFormat = (() => {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY; // 30-day months
  const YEAR = 365 * DAY; // 365-day years

  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

  // Relative text for `then` as seen at `now` (both Date, ms or ISO string),
  // using the largest unit that fits, rounded down. Future times (clock skew)
  // read "just now".
  function relativeTime(then, now = Date.now()) {
    const diff = new Date(now).getTime() - new Date(then).getTime();
    if (diff < MINUTE) return 'just now';
    if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute');
    if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour');
    if (diff < MONTH) return plural(Math.floor(diff / DAY), 'day');
    if (diff < YEAR) return plural(Math.floor(diff / MONTH), 'month');
    return plural(Math.floor(diff / YEAR), 'year');
  }

  const pad = (n) => String(n).padStart(2, '0');

  // `YYYY-MM-DD HH:mm` in the local time zone, 24-hour clock.
  function localDateTime(value) {
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // `2026-10-24 14:05 (2 hours ago)`
  function timestamp(value, now = Date.now()) {
    return `${localDateTime(value)} (${relativeTime(value, now)})`;
  }

  return { relativeTime, localDateTime, timestamp };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = timeFormat;
