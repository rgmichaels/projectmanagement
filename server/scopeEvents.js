// The single source of truth for sprint scope-change events
// (docs/specs/sprint-scope-change.md AC 5): the kinds, in display order.
//   key     - stored in sprint_scope_events.kind
//   label   - shown in the Scope change log
//   effect  - how the event moves the sprint total: 'add' (+estimate),
//             'remove' (-estimate) or 'delta' (+estimate - old estimate)
//   membership - true for the kinds that put an item into or out of the
//             sprint (the "Added after start" badge looks at these only)
// Code refers to a kind through SCOPE (SCOPE.added, ...), never by a string,
// and the client reads GET /api/scope-event-kinds. To add a kind, add an
// entry here and restart.
const SCOPE_EVENT_KINDS = [
  { key: 'added', label: 'Added', effect: 'add', membership: true },
  { key: 'removed', label: 'Removed', effect: 'remove', membership: true },
  { key: 'estimate_changed', label: 'Estimate changed', effect: 'delta', membership: false },
];

// Kind keys by name, for the code that records and sums events.
const SCOPE = Object.freeze(Object.fromEntries(SCOPE_EVENT_KINDS.map((k) => [k.key, k.key])));

function getScopeKind(key) {
  return SCOPE_EVENT_KINDS.find((k) => k.key === key) || null;
}

// The kinds that change membership, as keys.
function membershipKinds() {
  return SCOPE_EVENT_KINDS.filter((k) => k.membership).map((k) => k.key);
}

// The public shape for GET /api/scope-event-kinds: key, label and effect,
// so the client formats a log row without naming a kind.
function publicScopeEventKinds() {
  return SCOPE_EVENT_KINDS.map(({ key, label, effect }) => ({ key, label, effect }));
}

module.exports = { SCOPE_EVENT_KINDS, SCOPE, getScopeKind, membershipKinds, publicScopeEventKinds };
