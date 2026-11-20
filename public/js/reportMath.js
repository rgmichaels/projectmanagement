// The Report page's pure logic (docs/specs/daily-report.md; design
// docs/design/daily-report, README.md is the UI contract): the date window
// (the Yesterday window, local days to a UTC range), the date and duration
// texts, the Yesterday summary line, the Today and Waiting selections, and
// the report model with its two clipboard flavors (plain text and HTML with
// inline styles only, every user text escaped). Loadable in the browser
// (global `reportMath`) and from node:test (module.exports). No status, type
// or sprint state is named here: the caller passes the server's lists.
const reportMath = (() => {
  const DAY_MS = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  const AS_OF_NOW = '(current status as of now)';

  const pad = (n) => String(n).padStart(2, '0');

  // ---------- dates ----------

  // A real calendar date written as YYYY-MM-DD.
  function isDay(value) {
    const m = typeof value === 'string' ? DAY_PATTERN.exec(value) : null;
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }

  // Calendar arithmetic in UTC day numbers, so DST never shifts a date.
  const toUtc = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const fromUtc = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const addDays = (day, n) => fromUtc(new Date(toUtc(day).getTime() + n * DAY_MS));

  // Today as YYYY-MM-DD in the browser's local time (AC 2).
  function localToday(now = new Date()) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  // The Yesterday window of report date `day` as its first and last local
  // days, inclusive (AC 5, Amendment 1): a Monday looks back over Fri, Sat
  // and Sun; Saturday and Sunday look back to Friday only; any other day to
  // the day before. Public holidays are not considered.
  function yesterdayWindow(day) {
    const wd = toUtc(day).getUTCDay();
    if (wd === 1) return { first: addDays(day, -3), last: addDays(day, -1) };
    const prev = addDays(day, wd === 0 ? -2 : -1); // Sun -> Fri, Sat (and the rest) -> the day before
    return { first: prev, last: prev };
  }

  // The local days `first` through `last` (default: `first` alone) as a UTC
  // range [from, to) of ISO instants, from the first day's local midnight to
  // the local midnight after the last day (AC 7). DST is left to the
  // platform, so a window can be an hour short or long.
  function localDayRange(first, last = first) {
    const [y1, m1, d1] = first.split('-').map(Number);
    const [y2, m2, d2] = last.split('-').map(Number);
    return { from: new Date(y1, m1 - 1, d1).toISOString(), to: new Date(y2, m2 - 1, d2 + 1).toISOString() };
  }

  // `Thu Nov 19`, `Fri Nov 20 2026` and `Nov 27`.
  function shortDay(day) {
    const d = toUtc(day);
    return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  const longDay = (day) => `${shortDay(day)} ${toUtc(day).getUTCFullYear()}`;
  // `Thu Nov 19` for one day, `Fri Nov 13 – Sun Nov 15` (en dash) for a range (AC 5).
  const windowText = (w) => (w.first === w.last ? shortDay(w.first) : `${shortDay(w.first)} – ${shortDay(w.last)}`);
  function monthDay(day) {
    const d = toUtc(day);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }

  // ---------- durations ----------

  // Whole minutes as `0h`, `45m`, `2h`, `1h 30m` (the design's examples).
  function duration(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!m) return `${h}h`;
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  const hoursToMinutes = (hours) => Math.round((Number(hours) || 0) * 60);

  // ---------- Yesterday ----------

  // The summary of one activity item (AC 8), joined with semicolons: the net
  // status change (first old to last new; omitted when it ends where it
  // started) with the resolution when it ends in the terminal status,
  // `created`, `commented` (`commented x2`), `logged 1h 30m`. A round trip
  // with nothing else shows its path, `Ready -> In Progress -> Ready`
  // (defect D1, Amendment 1).
  function activitySummary(item, terminalStatus) {
    const parts = [];
    const changes = item.status_changes || [];
    let path = null;
    if (changes.length) {
      const from = changes[0].from;
      const to = changes[changes.length - 1].to;
      if (from !== to) {
        const resolution = to === terminalStatus && item.resolution ? ` (${item.resolution})` : '';
        parts.push(`${from} -> ${to}${resolution}`);
      } else {
        path = [from, ...changes.map((c) => c.to)].join(' -> ');
      }
    }
    if (item.created) parts.push('created');
    if (item.comments > 0) parts.push(item.comments > 1 ? `commented x${item.comments}` : 'commented');
    if (item.minutes > 0) parts.push(`logged ${duration(item.minutes)}`);
    if (!parts.length && path) return path;
    return parts.join('; ');
  }

  // ---------- Today and Waiting ----------

  // The status ranges from the server's order (AC 12, 16): `waiting` before
  // the started status, `active` from it up to (not including) the terminal one.
  function statusRanges(statuses, startedStatus, terminalStatus) {
    const start = statuses.indexOf(startedStatus);
    const end = statuses.indexOf(terminalStatus);
    if (start === -1) return { waiting: [], active: [] };
    return { waiting: statuses.slice(0, start), active: statuses.slice(start, end === -1 ? undefined : end) };
  }

  // The person's items in active work, in the Board's order: status column,
  // then rank (AC 12, 13). Epics included.
  function todayItems(items, personId, statuses, ranges) {
    const order = (s) => statuses.indexOf(s);
    return items
      .filter((i) => i.assignee_id === personId && ranges.active.includes(i.status))
      .sort((a, b) => order(a.status) - order(b.status) || a.rank - b.rank || a.id - b.id);
  }

  const bySprintRank = (a, b) => {
    const ra = a.sprint_rank === null || a.sprint_rank === undefined ? Infinity : a.sprint_rank;
    const rb = b.sprint_rank === null || b.sprint_rank === undefined ? Infinity : b.sprint_rank;
    return ra === rb ? a.id - b.id : ra < rb ? -1 : 1;
  };

  // Not-started items of the whole project, epics excluded, split into the
  // active sprint and everything else, each by sprint rank (AC 16, 17).
  function waitingItems(items, activeSprintId, ranges, isEpic) {
    const waiting = items.filter((i) => ranges.waiting.includes(i.status) && !isEpic(i));
    const inSprint = activeSprintId === null || activeSprintId === undefined ? [] : waiting.filter((i) => i.sprint_id === activeSprintId);
    const other = waiting.filter((i) => !inSprint.includes(i));
    return { inSprint: inSprint.sort(bySprintRank), other: other.sort(bySprintRank) };
  }

  // `Sprint 4: 6 of 13 complete, ends Nov 27` (AC 18), from the sprint
  // list's non-epic item_count and terminal-status done_count.
  function sprintLine(sprint) {
    const ends = sprint.end_date ? `ends ${monthDay(sprint.end_date)}` : 'no end date';
    const count = sprint.item_count || 0;
    return count ? `${sprint.name}: ${sprint.done_count || 0} of ${count} complete, ${ends}` : `${sprint.name}: no items, ${ends}`;
  }

  // ---------- the report model ----------

  // Everything the page shows and copies, as plain data. `input` is
  // { projectName, personId, personName, date, today, activity (the
  // endpoint's answer, or null), activityError (text or null), items,
  // sprints, users, statuses, startedStatus, terminalStatus, sprintStates,
  // types }.
  function buildReport(input) {
    const { statuses, terminalStatus } = input;
    const types = input.types || [];
    const typeOf = (name) => types.find((t) => t.name === name);
    const epicLabelOf = (name) => {
      const t = typeOf(name);
      return t && t.isEpic ? t.label || t.name : null;
    };
    const isEpic = (item) => Boolean(epicLabelOf(item.type));
    const userName = (id) => {
      if (id === null || id === undefined) return 'Unassigned';
      const u = (input.users || []).find((x) => x.id === id);
      return u ? u.name : 'Unknown user';
    };
    const ranges = statusRanges(statuses, input.startedStatus, terminalStatus);
    const note = input.date === input.today ? '' : AS_OF_NOW;
    const win = yesterdayWindow(input.date);
    const winText = windowText(win);
    const empty = win.first === win.last ? `No recorded activity on ${winText}.` : `No recorded activity ${winText}.`;

    const yesterday = { id: 'yesterday', heading: 'Yesterday', note: `(${winText})`, rows: [], empty, total: null, error: null };
    if (input.activityError) {
      yesterday.error = input.activityError;
    } else if (input.activity) {
      yesterday.rows = input.activity.items.map((a) => ({
        issueId: a.issue_id,
        key: a.key,
        title: a.title,
        epic: epicLabelOf(a.type),
        summary: activitySummary(a, terminalStatus),
        meta: [],
      }));
      yesterday.total = `Total time logged: ${duration(input.activity.total_minutes)}`;
    }

    const today = {
      id: 'today',
      heading: 'Today',
      note,
      empty: 'Nothing in progress.',
      rows: todayItems(input.items, input.personId, statuses, ranges).map((i) => {
        const meta = [{ kind: 'status', text: i.status }, { kind: 'priority', text: i.priority }];
        if (i.remaining_hours !== null && i.remaining_hours !== undefined) {
          const m = hoursToMinutes(i.remaining_hours);
          meta.push({ kind: 'text', text: m < 0 ? `over ${duration(-m)}` : `remaining ${duration(m)}` });
        }
        return { issueId: i.id, key: i.key, title: i.title, epic: epicLabelOf(i.type), meta };
      }),
    };

    const activeState = (input.sprintStates || []).find((s) => s.active);
    const activeSprint = activeState ? (input.sprints || []).find((s) => s.state === activeState.name) : null;
    const split = waitingItems(input.items, activeSprint ? activeSprint.id : null, ranges, isEpic);
    const waitingRow = (i) => ({
      issueId: i.id,
      key: i.key,
      title: i.title,
      epic: null,
      meta: [{ kind: 'status', text: i.status }, { kind: 'priority', text: i.priority }, { kind: 'text', text: userName(i.assignee_id) }],
    });
    const waiting = {
      id: 'waiting',
      heading: 'Waiting',
      note,
      sprintLine: activeSprint ? sprintLine(activeSprint) : null,
      groups: [
        { heading: 'In the active sprint', rows: split.inSprint.map(waitingRow), empty: activeSprint ? 'None.' : 'No active sprint.' },
        { heading: 'Backlog and other sprints', rows: split.other.map(waitingRow), empty: 'None.' },
      ],
    };

    return {
      title: `Daily report: ${input.projectName}, ${input.personName}, ${longDay(input.date)}`,
      sections: [yesterday, today, waiting],
    };
  }

  // ---------- the clipboard flavors ----------

  const headingText = (section) => (section.note ? `${section.heading} ${section.note}` : section.heading);
  const titleText = (row) => `${row.epic ? `[${row.epic}] ` : ''}${row.title}`;
  // `KEY` and the rest of a row's line: `Title: summary` (just `Title` when
  // the summary is empty, never a dangling colon) or `Title - Status, Priority, ...`.
  function rowRest(row) {
    if (row.summary !== undefined) return row.summary ? `${titleText(row)}: ${row.summary}` : titleText(row);
    return `${titleText(row)} - ${row.meta.map((m) => m.text).join(', ')}`;
  }
  const LOAD_ERROR = 'Could not load the report.';

  // The plain-text flavor (AC 19): headings as plain lines, `- ` bullets.
  function toPlainText(model) {
    const lines = [model.title];
    const rows = (list, empty) => {
      if (list.length) for (const r of list) lines.push(`- ${r.key} ${rowRest(r)}`);
      else lines.push(empty);
    };
    for (const s of model.sections) {
      lines.push('', headingText(s));
      if (s.error) {
        lines.push(LOAD_ERROR);
        continue;
      }
      if (s.groups) {
        if (s.sprintLine) lines.push(s.sprintLine);
        for (const g of s.groups) {
          lines.push(g.heading);
          rows(g.rows, g.empty);
        }
      } else {
        rows(s.rows, s.empty);
      }
      if (s.total) lines.push(s.total);
    }
    return lines.join('\n');
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Inline styles of the HTML flavor (design email-preview.html).
  const FONT = 'font-family:Calibri,Arial,sans-serif;';
  const STYLE = {
    wrap: `${FONT}font-size:14px;color:#000000;`,
    h1: `${FONT}font-size:18px;font-weight:bold;color:#000000;margin:0 0 4px 0;`,
    h2: `${FONT}font-size:16px;font-weight:bold;color:#0b5d66;margin:18px 0 6px 0;`,
    sub: `${FONT}font-size:14px;font-weight:bold;color:#154973;margin:10px 0 4px 0;`,
    ul: 'margin:0 0 8px 0;padding-left:22px;',
    li: 'margin:0 0 4px 0;',
    p: 'margin:0 0 4px 0;',
    total: 'margin:0 0 8px 0;',
  };

  // The HTML flavor (AC 19, 20): one wrapper div, inline styles only, no
  // class, no style block, no images, no links; item keys in <b>.
  function toHtml(model) {
    const out = [`<div style="${STYLE.wrap}">`, `<h1 style="${STYLE.h1}">${escapeHtml(model.title)}</h1>`];
    const para = (text, style = STYLE.p) => out.push(`<p style="${style}">${escapeHtml(text)}</p>`);
    const rows = (list, empty) => {
      if (!list.length) return para(empty);
      out.push(`<ul style="${STYLE.ul}">`);
      for (const r of list) out.push(`<li style="${STYLE.li}"><b>${escapeHtml(r.key)}</b> ${escapeHtml(rowRest(r))}</li>`);
      out.push('</ul>');
    };
    for (const s of model.sections) {
      out.push(`<h2 style="${STYLE.h2}">${escapeHtml(headingText(s))}</h2>`);
      if (s.error) {
        para(LOAD_ERROR);
        continue;
      }
      if (s.groups) {
        if (s.sprintLine) para(s.sprintLine);
        for (const g of s.groups) {
          para(g.heading, STYLE.sub);
          rows(g.rows, g.empty);
        }
      } else {
        rows(s.rows, s.empty);
      }
      if (s.total) out.push(`<p style="${STYLE.total}"><b>${escapeHtml(s.total)}</b></p>`);
    }
    out.push('</div>');
    return out.join('\n');
  }

  return {
    AS_OF_NOW,
    LOAD_ERROR,
    isDay,
    addDays,
    localToday,
    yesterdayWindow,
    localDayRange,
    shortDay,
    longDay,
    windowText,
    monthDay,
    duration,
    hoursToMinutes,
    activitySummary,
    statusRanges,
    todayItems,
    waitingItems,
    sprintLine,
    buildReport,
    headingText,
    titleText,
    toPlainText,
    escapeHtml,
    toHtml,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = reportMath;
