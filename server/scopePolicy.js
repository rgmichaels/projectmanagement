// The grace rule of sprint scope-change tracking
// (docs/specs/sprint-scope-change.md Decision 3, AC 13). Events are stored
// as they happen; this is the only place that decides, at read time, which
// of them count as scope change. Changing the rule here changes every report
// with no data change. Times are absolute instants (ISO 8601 strings), so
// the server's time zone and daylight saving play no part.
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // a rolling 24 hours

// The instant the grace period of `sprint` ends (ISO string), or null when
// the sprint is not tracked (no baseline_at).
function graceEndsAt(sprint) {
  if (!sprint || !sprint.baseline_at) return null;
  return new Date(Date.parse(sprint.baseline_at) + GRACE_PERIOD_MS).toISOString();
}

// True when `event` happened within the grace period: its created_at is
// earlier than the sprint's baseline_at + GRACE_PERIOD_MS. An event at
// exactly that instant, or later, counts as scope change.
function isInGrace(event, sprint) {
  if (!sprint || !sprint.baseline_at) return false;
  return Date.parse(event.created_at) < Date.parse(sprint.baseline_at) + GRACE_PERIOD_MS;
}

module.exports = { GRACE_PERIOD_MS, graceEndsAt, isInGrace };
