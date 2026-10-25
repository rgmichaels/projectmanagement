// The single list of work item resolutions (why a work item reached the
// terminal status), in display order. The same list applies to every type.
//   isDefault - the resolution set automatically when an item moves to the
//               terminal status without one (exactly one entry)
// To add a resolution, append an entry and restart. `color` is optional
// display metadata; the board falls back to neutral styling without it.
const RESOLUTIONS = [
  { name: 'Fixed', isDefault: true },
  { name: "Won't Do" },
  { name: 'Duplicate' },
  { name: 'Cannot Reproduce' },
];

function isValidResolution(name) {
  return RESOLUTIONS.some((r) => r.name === name);
}

function defaultResolution() {
  return (RESOLUTIONS.find((r) => r.isDefault) || RESOLUTIONS[0]).name;
}

module.exports = { RESOLUTIONS, isValidResolution, defaultResolution };
