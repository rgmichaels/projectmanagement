// Timestamp formatting for the Discussion thread, and the hours texts of time
// tracking (docs/specs/time-tracking.md AC 21, 45, 53), shared by the Board,
// Backlog and Sprints pages so the figures read the same everywhere. Pure
// functions, loadable in the browser (global `timeFormat`) and from
// node:test (module.exports).
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

  // Hours with up to two decimals and no trailing zeros: 1.5 -> `1.5 h`,
  // 37 -> `37 h`, 0.25 -> `0.25 h`.
  function hours(value) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    return `${Object.is(n, -0) ? 0 : n} h`;
  }

  // The sprint figure (AC 53) as { main, note, over }: main is
  // `L h logged / E h est.` when E > 0, else `L h logged`; note holds
  // ` (over)` when L > E > 0 and ` (n not estimated)` when n > 0 and E > 0
  // (the Board passes no n). `over` drives the danger style.
  function sprintFigureParts(logged, estimated, unestimated = 0) {
    const L = Number(logged) || 0;
    const E = Number(estimated) || 0;
    const main = E > 0 ? `${hours(L)} logged / ${hours(E)} est.` : `${hours(L)} logged`;
    const over = E > 0 && L > E;
    const notes = [];
    if (over) notes.push('(over)');
    if (E > 0 && unestimated > 0) notes.push(`(${unestimated} not estimated)`);
    return { main, note: notes.length ? ` ${notes.join(' ')}` : '', over };
  }

  // The same figure as one string: sprintFigure(12, 20) is `12 h logged / 20 h est.`.
  function sprintFigure(logged, estimated, unestimated = 0) {
    const parts = sprintFigureParts(logged, estimated, unestimated);
    return parts.main + parts.note;
  }

  // A work item's estimate against its logged hours (AC 45): with an
  // estimate, the balance text (`1.5 h remaining`, `2.5 h over`, `0 h
  // remaining` when equal) and the percentage logged; without one, null.
  function itemBalance(estimate, logged) {
    if (estimate === null || estimate === undefined) return null;
    const E = Number(estimate);
    const L = Number(logged) || 0;
    const over = L > E;
    return {
      over,
      text: over ? `${hours(L - E)} over` : `${hours(E - L)} remaining`,
      percent: E > 0 ? Math.round((L / E) * 100) : 0,
    };
  }

  return { relativeTime, localDateTime, timestamp, hours, sprintFigureParts, sprintFigure, itemBalance };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = timeFormat;
