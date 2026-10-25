// The single list of work item link types, in display order. Each entry is
// { name, outward, inward }:
//   name      - the value stored on each link
//   outward   - how the link reads on its source ("A blocks B" on A)
//   inward    - how it reads on its target ("B is blocked by A" on B)
//   symmetric - both ends read the same; only `outward` is given and the
//               lower work item id is stored as the source
// To add a link type, append an entry and restart; the API and the board
// pick it up with no other change.
const LINK_TYPES = [
  { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' },
  { name: 'Relates', outward: 'relates to', symmetric: true },
  { name: 'Duplicates', outward: 'duplicates', inward: 'is duplicated by' },
];

const DIRECTIONS = ['outward', 'inward'];

function getLinkType(name) {
  return LINK_TYPES.find((t) => t.name === name);
}

function isValidLinkType(name) {
  return Boolean(getLinkType(name));
}

// The label of one end of a link. A symmetric type reads the same both ways;
// a type since removed from the list falls back to its stored name.
function labelFor(name, direction) {
  const t = getLinkType(name);
  if (!t) return name;
  if (t.symmetric || direction === 'outward') return t.outward;
  return t.inward || t.outward;
}

// The list as selectable options for GET /api/link-types, in display order:
// two per type (outward first), one for a symmetric type.
function linkOptions() {
  return LINK_TYPES.flatMap((t) =>
    (t.symmetric ? ['outward'] : DIRECTIONS).map((direction) => ({
      link_type: t.name,
      direction,
      label: labelFor(t.name, direction),
    }))
  );
}

module.exports = { LINK_TYPES, DIRECTIONS, getLinkType, isValidLinkType, labelFor, linkOptions };
