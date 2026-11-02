// The texts of the Sprints page's Scope change panel
// (docs/specs/sprint-scope-change.md AC 20-24; design
// docs/design/sprint-scope-change, option A). Pure functions, loadable in
// the browser (global `scopeFormat`) and from node:test (module.exports).
// No event kind is named here: a log row is formatted by its kind's
// `effect` from GET /api/scope-event-kinds ('add', 'remove' or 'delta').
// Hours use timeFormat.hours (at most two decimals, " h").
const scopeFormat = (() => {
  // The figure labels of the panel (design README "Figures (exact labels)").
  // These are hour totals, not sprint states or event kinds, although the
  // first reads like a state name and the second like a kind label.
  const TILE_LABELS = Object.freeze({
    planned: 'Planned',
    added: 'Added',
    removed: 'Removed',
    estimate: 'Estimate changes',
    current: 'Current total',
    final: 'Final total',
    growth: 'Growth',
  });

  const hoursText = typeof timeFormat !== 'undefined' ? timeFormat.hours : require('./time').hours;
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // `+3 h`, `-1 h`, `0 h`.
  function signed(value) {
    const n = round2(value);
    if (n > 0) return `+${hoursText(n)}`;
    if (n < 0) return `-${hoursText(-n)}`;
    return hoursText(0);
  }

  // Always with a sign, zero included: `+0 h`, `+2 h`, `-1 h` (the added
  // tile and the "Adjusted in first 24h" line).
  const plus = (value) => (round2(value) < 0 ? signed(value) : `+${hoursText(value)}`);
  const minus = (value) => `-${hoursText(Math.abs(Number(value) || 0))}`;

  // `1 item` / `3 items`, `1 change` / `3 changes`.
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // `+32.5% growth`, `-5.0% shrink`, `0.0% (no change)`, or `n/a` when the
  // planned total is 0 (growth_percent null).
  function growthText(percent) {
    if (percent === null || percent === undefined) return 'n/a';
    const n = Number(percent);
    if (n > 0) return `+${n.toFixed(1)}% growth`;
    if (n < 0) return `${n.toFixed(1)}% shrink`;
    return '0.0% (no change)';
  }

  // `40 h planned + 13 h net change = 53 h current total` (`final total`
  // for a completed sprint).
  function equation(summary, final) {
    const net = round2(summary.net_change_hours);
    const op = net < 0 ? '-' : '+';
    return `${hoursText(summary.planned_hours)} planned ${op} ${hoursText(Math.abs(net))} net change = ${hoursText(summary.current_total_hours)} ${final ? 'final' : 'current'} total`;
  }

  // `12 items, 38 h`.
  const baselineText = (baseline) => `${count(baseline.item_count, 'item')}, ${hoursText(baseline.hours)}`;

  // True when any event is in the grace period.
  const hasGrace = (summary) => (summary.events || []).some((e) => e.in_grace);

  // `+2 h added, -0 h removed, +0.5 h estimate changes`.
  function graceText(grace) {
    return `${plus(grace.added.hours)} added, ${minus(grace.removed.hours)} removed, ${plus(grace.estimate_change.hours)} estimate changes`;
  }

  // The hours of one log row by its kind's effect: `+4 h`, `-4 h`,
  // `5 h to 8 h (+3 h)` (no estimate reads `none`).
  function eventHours(event, effect) {
    if (effect === 'add') return plus(event.hours || 0);
    if (effect === 'remove') return minus(event.hours || 0);
    if (effect === 'delta') {
      const v = (h) => (h === null || h === undefined ? 'none' : hoursText(h));
      return `${v(event.old_hours)} to ${v(event.hours)} (${signed((event.hours || 0) - (event.old_hours || 0))})`;
    }
    return event.hours === null || event.hours === undefined ? '' : hoursText(event.hours);
  }

  // `2 added items have no estimate.` (AC 22).
  const unestimatedText = (n) => `${n} added ${n === 1 ? 'item has' : 'items have'} no estimate.`;

  const pad = (n) => String(n).padStart(2, '0');

  // YYYY-MM-DD in the viewer's time zone.
  function localDate(value) {
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // The work item dialog's hint under the Sprint field.
  function addedHint(addedAt) {
    return addedAt ? `Added to this sprint on ${localDate(addedAt)}.` : "Added after the sprint's first 24 hours.";
  }

  return { TILE_LABELS, signed, plus, minus, count, growthText, equation, baselineText, hasGrace, graceText, eventHours, unestimatedText, localDate, addedHint };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = scopeFormat;
