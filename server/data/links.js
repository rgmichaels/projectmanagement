// Data access for work item links (table `issue_links`). All link SQL lives
// here. One row per link: `source_id` reads the type's outward label,
// `target_id` its inward one; the other end's view is
// derived at read time. Every add or remove records a `link` history change
// on both work items in the same transaction. Validation (types, directions,
// same project, archived guard) happens in the route.
const { LINK_TYPES, getLinkType, labelFor } = require('../linkTypes');
const history = require('./history');

// A symmetric type is stored with the lower work item id as the source, so
// the unique key (link_type, source_id, target_id) also rejects the reversed pair.
function normalise(linkType, source, target) {
  const t = getLinkType(linkType);
  return t && t.symmetric && source.id > target.id ? [target, source] : [source, target];
}

// How a link reads from one of its ends: `<label> <other key>`.
const sourceText = (linkType, target) => `${labelFor(linkType, 'outward')} ${target.key}`;
const targetText = (linkType, source) => `${labelFor(linkType, 'inward')} ${source.key}`;

function getLink(db, linkId) {
  return db
    .prepare('SELECT id, link_type, source_id, target_id, created_by_id, created_at FROM issue_links WHERE id = ?')
    .get(linkId);
}

const keyOf = (db, id) => db.prepare('SELECT id, key FROM issues WHERE id = ?').get(id);

// Creates a link "source <outward label> target" and returns its id. A
// duplicate is refused with 409 and writes nothing (the insert and both
// history events commit or roll back together).
function addLink(db, source, target, linkType, actor, when = new Date().toISOString()) {
  const [from, to] = normalise(linkType, source, target);
  return db.transaction(() => {
    let id;
    try {
      id = db
        .prepare(
          'INSERT INTO issue_links (link_type, source_id, target_id, created_by_id, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(linkType, from.id, to.id, actor && actor.id ? actor.id : null, when).lastInsertRowid;
    } catch (err) {
      if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
      // Required here, not at the top: validation.js loads data/issues.js, which loads this file.
      const { ValidationError } = require('../validation');
      throw new ValidationError('These work items are already linked this way.', 409);
    }
    history.recordLinkChange(db, from.id, actor, { newText: sourceText(linkType, to), newId: to.id }, when);
    history.recordLinkChange(db, to.id, actor, { newText: targetText(linkType, from), newId: from.id }, when);
    return id;
  })();
}

// Removes a link and records the removal on both of its work items.
function removeLink(db, linkId, actor, when = new Date().toISOString()) {
  db.transaction(() => {
    const link = getLink(db, linkId);
    if (!link) return;
    const source = keyOf(db, link.source_id);
    const target = keyOf(db, link.target_id);
    db.prepare('DELETE FROM issue_links WHERE id = ?').run(linkId);
    history.recordLinkChange(db, source.id, actor, { oldText: sourceText(link.link_type, target), oldId: target.id }, when);
    history.recordLinkChange(db, target.id, actor, { oldText: targetText(link.link_type, source), oldId: source.id }, when);
  })();
}

// Removes every link of a work item that is being deleted, writing a removal
// event on each former partner (the item's own history goes with it). Runs in
// the caller's transaction (deleteIssue); opens none of its own.
function deleteLinksFor(db, issueId, actor, when = new Date().toISOString()) {
  const rows = db
    .prepare('SELECT id, link_type, source_id, target_id FROM issue_links WHERE source_id = ? OR target_id = ?')
    .all(issueId, issueId);
  const self = keyOf(db, issueId);
  for (const link of rows) {
    if (link.source_id === issueId) {
      history.recordLinkChange(db, link.target_id, actor, { oldText: targetText(link.link_type, self), oldId: self.id }, when);
    } else {
      history.recordLinkChange(db, link.source_id, actor, { oldText: sourceText(link.link_type, self), oldId: self.id }, when);
    }
  }
  db.prepare('DELETE FROM issue_links WHERE source_id = ? OR target_id = ?').run(issueId, issueId);
}

// The links of a work item from its point of view:
// [{ id, link_type, direction, label, other: { id, key, title, type, status } }],
// ordered by link type display order, then direction (outward first), then
// the other item's key. A symmetric link reads `outward` from both ends.
function listLinks(db, issueId) {
  const rows = db
    .prepare(
      `SELECT l.id, l.link_type, 'outward' AS direction, o.id AS other_id, o.key, o.title, o.type, o.status
         FROM issue_links l JOIN issues o ON o.id = l.target_id WHERE l.source_id = ?
       UNION ALL
       SELECT l.id, l.link_type, 'inward' AS direction, o.id AS other_id, o.key, o.title, o.type, o.status
         FROM issue_links l JOIN issues o ON o.id = l.source_id WHERE l.target_id = ?`
    )
    .all(issueId, issueId);
  const order = (name) => {
    const i = LINK_TYPES.findIndex((t) => t.name === name);
    return i === -1 ? LINK_TYPES.length : i;
  };
  return rows
    .map((r) => {
      const t = getLinkType(r.link_type);
      const direction = t && t.symmetric ? 'outward' : r.direction;
      return {
        id: r.id,
        link_type: r.link_type,
        direction,
        label: labelFor(r.link_type, direction),
        other: { id: r.other_id, key: r.key, title: r.title, type: r.type, status: r.status },
      };
    })
    .sort(
      (a, b) =>
        order(a.link_type) - order(b.link_type) ||
        (a.direction === b.direction ? 0 : a.direction === 'outward' ? -1 : 1) ||
        a.other.key.localeCompare(b.other.key, undefined, { numeric: true }) ||
        a.id - b.id
    );
}

module.exports = { getLink, addLink, removeLink, deleteLinksFor, listLinks };
