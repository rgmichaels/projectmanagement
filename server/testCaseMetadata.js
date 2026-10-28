// Single source for test case lifecycle and execution outcomes.
const lifecycles = [
  { name: 'active', label: 'Active', initial: true },
  { name: 'archived', label: 'Archived', archived: true },
];
const outcomes = [
  { name: 'not-run', label: 'Not Run', initial: true },
  { name: 'pass', label: 'Pass' },
  { name: 'fail', label: 'Fail' },
  { name: 'blocked', label: 'Blocked' },
];
module.exports = { lifecycles, outcomes };
