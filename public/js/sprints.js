// Sprint helpers shared by the board and the Backlog page
// (docs/specs/sprints-and-backlog.md). Pure functions, loadable in the
// browser (global `sprintUtil`) and from node:test (module.exports). No
// sprint state, event kind, status or type is named here: states come from
// GET /api/sprint-states and event labels from GET /api/sprint-event-kinds.
const sprintUtil = (() => {
  const pad = (n) => String(n).padStart(2, '0');

  // The viewer's local calendar date as YYYY-MM-DD (Decision 19).
  function localToday(now = new Date()) {
    const d = new Date(now);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Whole days from date `a` to date `b` (both YYYY-MM-DD), calendar days.
  function daysBetween(a, b) {
    const day = (iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      return Date.UTC(y, m - 1, d) / 86400000;
    };
    return Math.round(day(b) - day(a));
  }

  // The one overdue rule (Decision 19): the active sprint, with an end date,
  // when today (the viewer's local date) is after it. The end date itself is
  // not overdue.
  function isOverdue(sprint, activeState, today = localToday()) {
    return Boolean(sprint && sprint.state === activeState && sprint.end_date && today > sprint.end_date);
  }

  // `3 days ago`, or `yesterday` for one day.
  function agoText(endDate, today = localToday()) {
    const n = daysBetween(endDate, today);
    return n === 1 ? 'yesterday' : `${n} days ago`;
  }

  // `2026-10-12 to 2026-10-23`, `from 2026-10-12`, `until 2026-10-23` or ''.
  function datesText(sprint) {
    if (sprint.start_date && sprint.end_date) return `${sprint.start_date} to ${sprint.end_date}`;
    if (sprint.start_date) return `from ${sprint.start_date}`;
    if (sprint.end_date) return `until ${sprint.end_date}`;
    return '';
  }

  // `1 item`, `3 items`.
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // The Sprint history sentence as parts: { text } and { strong } (sprint
  // names), for the caller to insert as text. `kindLabel` is the event kind's
  // label from the server; the rest follows from the event's own data.
  function historyParts(event, kindLabel) {
    const parts = [{ text: `${event.actor_name} ${String(kindLabel || event.kind).toLowerCase()} ` }, { strong: event.sprint_name }];
    if (event.disposition) {
      const moved = event.item_count || 0;
      let target = 'the Backlog';
      if (event.target_sprint_name && event.disposition === 'new-sprint') target = `new sprint ${event.target_sprint_name}`;
      else if (event.target_sprint_name) target = event.target_sprint_name;
      parts.push({ text: `: ${event.done_count || 0} done, ${moved === 0 ? 'none unfinished' : `${moved} unfinished moved to ${target}`}` });
    } else if (event.item_count !== null && event.item_count !== undefined) {
      parts.push({ text: `: ${count(event.item_count, 'item')} returned to the Backlog` });
    }
    return parts;
  }

  // `End date: 2026-10-16 to 2026-10-23`; an empty value reads `none`.
  function changeLine(change) {
    const v = (x) => (x === null || x === undefined || x === '' ? 'none' : x);
    return `${change.label}: ${v(change.old)} to ${v(change.new)}`;
  }

  return { localToday, daysBetween, isOverdue, agoText, datesText, count, historyParts, changeLine };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = sprintUtil;
