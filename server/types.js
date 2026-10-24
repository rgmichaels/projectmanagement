// The single source of truth for work item types.
// Each entry carries its display metadata (label, colour, icon) and flags:
//   isDefault - the type preselected for new work items (exactly one)
//   isEpic    - the grouping type: it can be chosen as another item's epic,
//               it drives the Epic swimlanes, and it cannot have an epic itself
// To add a type, append an entry and restart. `color` and `icon` are optional;
// the board falls back to neutral styling when they are missing.
const TYPES = [
  { name: 'Defect', label: 'Defect', color: '#e5493a', icon: '●' },
  { name: 'Task', label: 'Task', color: '#4bade8', icon: '✓', isDefault: true },
  { name: 'Issue', label: 'Issue', color: '#f5a623', icon: '!' },
  { name: 'Epic', label: 'Epic', color: '#904ee2', icon: '⚡', isEpic: true },
];

function findType(name) {
  return TYPES.find((t) => t.name === name);
}

function isValidType(name) {
  return Boolean(findType(name));
}

function isEpicType(name) {
  const t = findType(name);
  return Boolean(t && t.isEpic);
}

function defaultType() {
  const t = TYPES.find((x) => x.isDefault) || TYPES[0];
  return t.name;
}

function epicTypeNames() {
  return TYPES.filter((t) => t.isEpic).map((t) => t.name);
}

module.exports = { TYPES, findType, isValidType, isEpicType, defaultType, epicTypeNames };
