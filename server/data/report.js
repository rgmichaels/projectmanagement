// Data access for the daily report (docs/specs/daily-report.md AC 6-8, 22,
// 24, 25): the Yesterday activity of one person in one project. Read-only.
// The history, comment and time entry queries live with their tables
// (./history, ./comments, ./timeEntries); each is one date-bounded query
// joined to issues by project, never one request per item. Validation happens
// in the route; these functions assume valid input.
const history = require('./history');
const comments = require('./comments');
const timeEntries = require('./timeEntries');

// What `userId` did in project `projectId` inside [fromIso, toIso), with time
// entries matched on work date `day`: { items, total_minutes }, items ordered
// by work item number, each { issue_id, key, title, type, status_changes:
// [{ from, to }] (oldest first), resolution (the item's current one),
// created, comments, minutes }.
function activityFor(db, projectId, userId, fromIso, toIso, day) {
  const byIssue = new Map();
  const entry = (issueId) => {
    if (!byIssue.has(issueId)) byIssue.set(issueId, { status_changes: [], created: false, comments: 0, minutes: 0 });
    return byIssue.get(issueId);
  };
  for (const row of history.reportActivity(db, projectId, userId, fromIso, toIso)) {
    const e = entry(row.issue_id);
    if (row.kind === 'created') e.created = true;
    if (row.old_value !== null || row.new_value !== null) e.status_changes.push({ from: row.old_value, to: row.new_value });
  }
  for (const row of comments.countByAuthorInRange(db, projectId, userId, fromIso, toIso)) entry(row.issue_id).comments = row.n;
  let total = 0;
  for (const row of timeEntries.minutesByUserOnDay(db, projectId, userId, day)) {
    entry(row.issue_id).minutes = row.minutes;
    total += row.minutes;
  }
  const ids = [...byIssue.keys()];
  if (!ids.length) return { items: [], total_minutes: 0 };
  const rows = db
    .prepare(
      `SELECT id, number, key, title, type, resolution FROM issues
       WHERE project_id = ? AND id IN (${ids.map(() => '?').join(', ')}) ORDER BY number`
    )
    .all(projectId, ...ids);
  const items = rows.map((r) => {
    const e = byIssue.get(r.id);
    return {
      issue_id: r.id,
      key: r.key,
      title: r.title,
      type: r.type,
      status_changes: e.status_changes,
      resolution: r.resolution,
      created: e.created,
      comments: e.comments,
      minutes: e.minutes,
    };
  });
  return { items, total_minutes: total };
}

module.exports = { activityFor };
