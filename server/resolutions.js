// The single list of work item resolutions (why a work item reached the
// terminal status), in display order. The same list applies to every type.
//   isDefault - the resolution set automatically when an item moves to the
//               terminal status without one (exactly one entry)
// To add a resolution, append an entry and restart. `color` is optional
// display metadata; the board falls back to neutral styling without it.
// The board shows the label as white text on `color`, so a colour must keep
// at least 4.5:1 contrast with white (WCAG AA); tests/resolutions.test.js
// checks every entry.
const RESOLUTIONS = [
  { name: 'Fixed', isDefault: true, color: '#2f6b3f' },
  { name: "Won't Do", color: '#62666a' },
  { name: 'Duplicate', color: '#5243aa' },
  { name: 'Cannot Reproduce', color: '#8a4b08' },
];

function isValidResolution(name) {
  return RESOLUTIONS.some((r) => r.name === name);
}

function defaultResolution() {
  return (RESOLUTIONS.find((r) => r.isDefault) || RESOLUTIONS[0]).name;
}

module.exports = { RESOLUTIONS, isValidResolution, defaultResolution };
