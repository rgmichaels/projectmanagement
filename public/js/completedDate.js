// The completed-date texts (docs/specs/completed-date-on-cards.md AC 13-14;
// design docs/design/completed-date/README.md). Pure functions in the
// viewer's local time zone, loadable in the browser (global `completedDate`)
// and from node:test (module.exports). Nothing here names a status.
const completedDate = (() => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // A Date for an ISO timestamp, or null when missing or unreadable (never
  // "Invalid Date" on screen).
  function parse(iso) {
    if (typeof iso !== 'string' || !iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // `Nov 20` in the current year (local), `Nov 20, 2025` otherwise; null
  // without a date. `now` is for tests.
  function dateText(iso, now = new Date()) {
    const d = parse(iso);
    if (!d) return null;
    const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return d.getFullYear() === now.getFullYear() ? day : `${day}, ${d.getFullYear()}`;
  }

  // `3:42 PM` (local).
  function timeText(d) {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // `Completed Nov 20, 2026 at 3:42 PM by Dana Lee`; no `by` without a
  // completer. The year is always shown. Null without a date.
  function tooltip(iso, by) {
    const d = parse(iso);
    if (!d) return null;
    const when = `Completed ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${timeText(d)}`;
    return by ? `${when} by ${by}` : when;
  }

  // The card line: `✓ Completed Nov 20`.
  function cardText(iso, now = new Date()) {
    const text = dateText(iso, now);
    return text ? `✓ Completed ${text}` : null;
  }

  // The item dialog is the same markup on every page, but its Completed
  // field is shown only on the Board and Backlog (AC 19, 22); it stays
  // hidden on Sprints and Timeline. `page` is body[data-page] ('board' when
  // absent, as in board.js).
  const DIALOG_PAGES = ['board', 'backlog'];
  function showInDialog(page) {
    return DIALOG_PAGES.includes(page);
  }

  return { dateText, tooltip, cardText, showInDialog };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = completedDate;
