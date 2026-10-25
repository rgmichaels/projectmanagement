// Board search and filters (docs/specs/search-and-filters.md). Pure functions,
// loadable in the browser (global `boardFilters`) and from node:test
// (module.exports). No DOM and no storage here. The allowed values come from
// the lists the board loaded from the server; nothing here names a status,
// type, priority or resolution.
//
// A filter set is { text, assignee, type, priority, status, resolution }.
// An empty string means "Any" (no constraint). `assignee` holds a user id as
// a string, or UNASSIGNED for items with no assignee.
const boardFilters = (() => {
  const ANY = '';
  // Not a number, so it can never equal a user id.
  const UNASSIGNED = 'unassigned';
  const FIELDS = ['assignee', 'type', 'priority', 'status', 'resolution'];
  const TEXT_MAX_LENGTH = 200;

  function emptyFilters() {
    return { text: '', assignee: ANY, type: ANY, priority: ANY, status: ANY, resolution: ANY };
  }

  const needle = (text) => (typeof text === 'string' ? text.trim().toLowerCase() : '');
  const has = (value, n) => typeof value === 'string' && value.toLowerCase().includes(n);

  function isActive(filters) {
    if (!filters) return false;
    return needle(filters.text) !== '' || FIELDS.some((f) => filters[f] !== undefined && filters[f] !== null && filters[f] !== ANY);
  }

  // True when `item` satisfies every active criterion. The text is matched
  // literally (substring, ignoring case), never as a pattern.
  function matches(item, filters) {
    if (!filters) return true;
    const n = needle(filters.text);
    if (n && !(has(item.key, n) || has(item.title, n) || has(item.description, n))) return false;
    const a = filters.assignee;
    if (a === UNASSIGNED) {
      if (item.assignee_id !== null && item.assignee_id !== undefined) return false;
    } else if (a && String(item.assignee_id) !== a) {
      return false;
    }
    for (const f of ['type', 'priority', 'status', 'resolution']) {
      if (filters[f] && item[f] !== filters[f]) return false;
    }
    return true;
  }

  // Turns whatever was saved (possibly malformed or stale) into a valid
  // filter set: anything not in the current lists becomes "Any".
  // `meta` is { users: [ids], types, priorities, statuses, resolutions: [names] }.
  function sanitize(saved, meta) {
    const out = emptyFilters();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    if (typeof saved.text === 'string') out.text = saved.text.slice(0, TEXT_MAX_LENGTH);
    const allowed = {
      assignee: [UNASSIGNED, ...((meta && meta.users) || []).map(String)],
      type: (meta && meta.types) || [],
      priority: (meta && meta.priorities) || [],
      status: (meta && meta.statuses) || [],
      resolution: (meta && meta.resolutions) || [],
    };
    for (const f of FIELDS) {
      if (typeof saved[f] === 'string' && allowed[f].includes(saved[f])) out[f] = saved[f];
    }
    return out;
  }

  return { ANY, UNASSIGNED, FIELDS, TEXT_MAX_LENGTH, emptyFilters, isActive, matches, sanitize };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = boardFilters;
