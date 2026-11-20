// The Timeline page's pure logic (docs/specs/gantt-chart.md AC 9-17, 20-24;
// design docs/design/gantt-chart): calendar-day arithmetic on YYYY-MM-DD
// strings, the zoom scales, the visible range, date-to-pixel and back, drag
// snapping, the axis columns, the row groups and the texts of bars and
// tooltips. Loadable in the browser (global `timelineMath`) and from
// node:test (module.exports). Durations are plain calendar days (AC 17); all
// arithmetic is in UTC day numbers so time zones and DST never shift a date.
// No status, type or sprint state is named here: the caller passes them.
const timelineMath = (() => {
  const DAY_MS = 86400000;
  // Pixels per day for each zoom (design README "Axis"; Month 4px/day is the
  // owner's default). Week columns are 7 days, Month columns a calendar month.
  const ZOOMS = { day: 36, week: 12, month: 4 };
  const DEFAULT_ZOOM = 'week';
  const DROP_DAYS = 7; // a dropped Unscheduled item gets start + 6 (AC 24)
  const CLICK_SLOP = 3; // movement under 3px is a click (AC 27)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const pad = (n) => String(n).padStart(2, '0');
  const isZoom = (z) => Object.prototype.hasOwnProperty.call(ZOOMS, z);
  const pxPerDay = (zoom) => ZOOMS[isZoom(zoom) ? zoom : DEFAULT_ZOOM];

  // YYYY-MM-DD <-> whole days since 1970-01-01.
  function toDay(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }
  function fromDay(n) {
    const d = new Date(n * DAY_MS);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const addDays = (iso, n) => fromDay(toDay(iso) + n);
  const daysBetween = (a, b) => toDay(b) - toDay(a);
  const parts = (iso) => String(iso).split('-').map(Number);

  // The viewer's local calendar date (the Today marker, AC 16).
  function localToday(now = new Date()) {
    const d = new Date(now);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Calendar months forward or back, clamped to the month's last day.
  function addMonths(iso, n) {
    const [y, m, d] = parts(iso);
    const index = y * 12 + (m - 1) + n;
    const year = Math.floor(index / 12);
    const month = index - year * 12;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
  }
  const weekday = (iso) => new Date(toDay(iso) * DAY_MS).getUTCDay(); // 0 = Sunday
  const startOfWeek = (iso) => addDays(iso, -((weekday(iso) + 6) % 7)); // Monday
  const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
  const endOfMonth = (iso) => addDays(addMonths(startOfMonth(iso), 1), -1);
  const isWeekend = (iso) => weekday(iso) === 0 || weekday(iso) === 6;

  // `Nov 2`, `Nov 2026`, `Th 5`.
  const shortDate = (iso) => `${MONTHS[parts(iso)[1] - 1]} ${parts(iso)[2]}`;
  const monthLabel = (iso) => `${MONTHS[parts(iso)[1] - 1]} ${parts(iso)[0]}`;
  const dayLabel = (iso) => `${WEEKDAYS[weekday(iso)]} ${parts(iso)[2]}`;

  // The span a dated item occupies: { start, due } (inclusive), the one date
  // for both when only one is set (AC 11), or null with no dates.
  function span(item) {
    const start = (item && item.start_date) || null;
    const due = (item && item.due_date) || null;
    if (!start && !due) return null;
    return { start: start || due, due: due || start };
  }
  const isScheduled = (item) => span(item) !== null;

  // The axis range (AC 15): one month before the earliest date to one month
  // after the latest, always including today and at least three months
  // forward; with no dates today -1 month to today +3 months. Then widened to
  // whole columns of the zoom (Monday-start weeks, calendar months).
  // `dates` is every YYYY-MM-DD on the page (falsy entries are ignored).
  function visibleRange(dates, today, zoom) {
    const list = (dates || []).filter(Boolean).sort();
    const earliest = list.length && list[0] < today ? list[0] : today;
    const latest = list.length ? list[list.length - 1] : today;
    let start = addMonths(earliest, -1);
    let end = addMonths(today, 3);
    const after = addMonths(latest, 1);
    if (after > end) end = after;
    if (zoom === 'week') {
      start = startOfWeek(start);
      end = addDays(startOfWeek(end), 6);
    } else if (zoom === 'month') {
      start = startOfMonth(start);
      end = endOfMonth(end);
    }
    return { start, end, days: daysBetween(start, end) + 1 };
  }

  // Pixels from the range start to the start of `iso`, and back (a pixel
  // inside a day maps to that day).
  const dateToX = (iso, rangeStart, zoom) => daysBetween(rangeStart, iso) * pxPerDay(zoom);
  const xToDate = (x, rangeStart, zoom) => addDays(rangeStart, Math.floor(x / pxPerDay(zoom)));
  // A drag of `dx` pixels as whole days (AC 20, 21: snaps at every zoom).
  const snapDays = (dx, zoom) => Math.round(dx / pxPerDay(zoom)) || 0;
  const isClick = (dx, dy = 0) => Math.hypot(dx, dy) < CLICK_SLOP;

  // A bar's left and width in pixels: start to due inclusive (AC 11).
  function barBox(s, rangeStart, zoom) {
    return { left: dateToX(s.start, rangeStart, zoom), width: (daysBetween(s.start, s.due) + 1) * pxPerDay(zoom) };
  }

  // The axis cells (design README "Axis"): Day one per day ("Th 5", the month
  // over the first day of each month and the first cell), Week one per
  // Monday ("Nov 2", the month over a month's first Monday), Month one per
  // month ("Nov 2026"). Each is { date, x, width, t1, t2, weekend }.
  function columns(range, zoom) {
    const out = [];
    const ppd = pxPerDay(zoom);
    let date = range.start;
    while (date <= range.end) {
      let next;
      let cell;
      if (zoom === 'day') {
        next = addDays(date, 1);
        const first = parts(date)[2] === 1 || date === range.start;
        cell = { t1: first ? monthLabel(date) : null, t2: dayLabel(date), weekend: isWeekend(date) };
      } else if (zoom === 'month') {
        next = addMonths(startOfMonth(date), 1);
        cell = { t1: monthLabel(date), t2: null, weekend: false };
      } else {
        next = addDays(date, 7);
        cell = { t1: parts(date)[2] <= 7 ? monthLabel(date) : null, t2: shortDate(date), weekend: false };
      }
      const last = next > range.end ? addDays(range.end, 1) : next;
      out.push({ date, x: dateToX(date, range.start, zoom), width: daysBetween(date, last) * ppd, ...cell });
      date = next;
    }
    return out;
  }

  // New dates after moving a bar by `delta` days (AC 20): both dates shift;
  // a one-date item shifts only the date it has.
  function moveDates(item, delta) {
    const out = { start_date: item.start_date || null, due_date: item.due_date || null };
    if (out.start_date) out.start_date = addDays(out.start_date, delta);
    if (out.due_date) out.due_date = addDays(out.due_date, delta);
    return out;
  }

  // New dates after dragging an edge by `delta` days (AC 21): the left edge
  // sets start_date, the right edge due_date; the edges cannot cross
  // (minimum one day). A one-date item gains the other date this way.
  function resizeDates(item, edge, delta) {
    const s = span(item);
    const out = { start_date: item.start_date || null, due_date: item.due_date || null };
    if (!s) return out;
    if (edge === 'left') {
      const start = addDays(s.start, delta);
      out.start_date = start > s.due ? s.due : start;
      if (!item.due_date) out.due_date = s.due; // keep the right edge where it was
    } else {
      const due = addDays(s.due, delta);
      out.due_date = due < s.start ? s.start : due;
      if (!item.start_date) out.start_date = s.start;
    }
    return out;
  }

  // Only the date fields that differ (the PATCH body of AC 22).
  function changedDates(before, after) {
    const out = {};
    for (const k of ['start_date', 'due_date']) {
      if ((before[k] || null) !== (after[k] || null)) out[k] = after[k] || null;
    }
    return out;
  }

  // The dates a dropped Unscheduled item gets (AC 24).
  const dropDates = (day) => ({ start_date: day, due_date: addDays(day, DROP_DAYS - 1) });

  const dayCount = (s) => {
    const n = daysBetween(s.start, s.due) + 1;
    return `${n} day${n === 1 ? '' : 's'}`;
  };
  // `Oct 26 to Nov 13`, or `Dec 4 (one day)`.
  function rangeText(s) {
    if (!s) return '';
    return s.start === s.due ? `${shortDate(s.start)} (one day)` : `${shortDate(s.start)} to ${shortDate(s.due)}`;
  }
  // The drag tooltips (design README "Drag and resize").
  function moveTip(key, s) {
    return `${key} · Start ${shortDate(s.start)} – Due ${shortDate(s.due)} (${dayCount(s)})`;
  }
  function resizeTip(key, edge, s) {
    return edge === 'left'
      ? `${key} · Start ${shortDate(s.start)} (Due ${shortDate(s.due)} unchanged)`
      : `${key} · Due ${shortDate(s.due)} (Start ${shortDate(s.start)} unchanged)`;
  }
  const dropTip = (key, day) => {
    const s = { start: day, due: addDays(day, DROP_DAYS - 1) };
    return `${key} · ${shortDate(s.start)} – ${shortDate(s.due)} (${dayCount(s)})`;
  };

  // A status's bar colour (AC 11): the first status is 'todo', the terminal
  // one 'done', anything else 'prog'.
  function statusCategory(status, statuses, terminal) {
    if (status === terminal) return 'done';
    if ((statuses || [])[0] === status) return 'todo';
    return 'prog';
  }

  // The earliest start and latest due of the scheduled items, or null.
  function rollup(items) {
    const spans = (items || []).map(span).filter(Boolean);
    if (!spans.length) return null;
    return {
      start: spans.map((s) => s.start).sort()[0],
      due: spans.map((s) => s.due).sort().slice(-1)[0],
    };
  }

  // The number at the end of a key: PM-10 -> 10.
  const keyNumber = (key) => {
    const m = /(\d+)\s*$/.exec(String(key || ''));
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  };
  const byKey = (a, b) => keyNumber(a.key) - keyNumber(b.key) || a.id - b.id;
  const byStart = (a, b) => (span(a).start < span(b).start ? -1 : span(a).start > span(b).start ? 1 : byKey(a, b));

  // The rows (AC 9, 10, 13): one group per epic (in key order) with its
  // scheduled children by start date, its own span or the rollup of its
  // children; the "No epic" group of scheduled non-epics without an epic;
  // and the Unscheduled list (every item without dates, and epics with
  // neither dates nor scheduled children; design timeline.html).
  // `isEpic(item)` tells epics apart. A child whose epic is not in the list
  // counts as having no epic.
  function buildGroups(items, isEpic) {
    const list = items || [];
    const epics = list.filter(isEpic).sort(byKey);
    const epicIds = new Set(epics.map((e) => e.id));
    const others = list.filter((i) => !isEpic(i));
    const groups = epics.map((epic) => {
      const children = others.filter((i) => i.epic_id === epic.id && isScheduled(i)).sort(byStart);
      const own = span(epic);
      return { epic, children, own, rollup: own ? null : rollup(children) };
    });
    const noEpic = others.filter((i) => !(i.epic_id && epicIds.has(i.epic_id)) && isScheduled(i)).sort(byStart);
    // An undated epic with scheduled children has its rollup bar instead.
    const rolledUp = new Set(groups.filter((g) => g.rollup).map((g) => g.epic.id));
    const unscheduled = list.filter((i) => !isScheduled(i) && !rolledUp.has(i.id)).sort(byKey);
    return { groups, noEpic: { children: noEpic, rollup: rollup(noEpic) }, unscheduled };
  }

  // Every date on the page, for visibleRange: item dates and dated sprints.
  function pageDates(items, sprints) {
    const out = [];
    for (const i of items || []) out.push(i.start_date, i.due_date);
    for (const s of sprints || []) if (s.start_date && s.end_date) out.push(s.start_date, s.end_date);
    return out.filter(Boolean);
  }

  // The scrollLeft that centres `x` (track pixels) in a viewport of
  // `viewWidth` whose first `labelWidth` pixels are the sticky labels.
  function scrollFor(x, viewWidth, labelWidth) {
    return Math.max(0, Math.round(x - (viewWidth - labelWidth) / 2));
  }

  // The stored zoom if valid, else Week (AC 14).
  const parseZoom = (raw) => (isZoom(raw) ? raw : DEFAULT_ZOOM);

  return {
    ZOOMS,
    DEFAULT_ZOOM,
    DROP_DAYS,
    CLICK_SLOP,
    pxPerDay,
    parseZoom,
    toDay,
    fromDay,
    addDays,
    addMonths,
    daysBetween,
    localToday,
    startOfWeek,
    startOfMonth,
    endOfMonth,
    isWeekend,
    shortDate,
    monthLabel,
    dayLabel,
    span,
    isScheduled,
    visibleRange,
    dateToX,
    xToDate,
    snapDays,
    isClick,
    barBox,
    columns,
    moveDates,
    resizeDates,
    changedDates,
    dropDates,
    rangeText,
    moveTip,
    resizeTip,
    dropTip,
    statusCategory,
    rollup,
    buildGroups,
    pageDates,
    scrollFor,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = timelineMath;
