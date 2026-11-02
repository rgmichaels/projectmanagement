// The Scope change panel texts (public/js/scope.js;
// docs/specs/sprint-scope-change.md AC 20-23, 28; design README "UI
// contract"). No browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../public/js/scope');

test('hours with signs: at most two decimals and the " h" unit (AC 20)', () => {
  assert.equal(f.signed(3), '+3 h');
  assert.equal(f.signed(-1.5), '-1.5 h');
  assert.equal(f.signed(0), '0 h');
  assert.equal(f.signed(1 / 3), '+0.33 h');
  assert.equal(f.plus(14), '+14 h');
  assert.equal(f.plus(0), '+0 h');
  assert.equal(f.plus(-2), '-2 h');
  assert.equal(f.minus(4), '-4 h');
  assert.equal(f.minus(0), '-0 h');
});

test('counts and growth wording never rely on colour (AC 20, design)', () => {
  assert.equal(f.count(1, 'item'), '1 item');
  assert.equal(f.count(3, 'change'), '3 changes');
  assert.equal(f.count(0, 'item'), '0 items');
  assert.equal(f.growthText(32.5), '+32.5% growth');
  assert.equal(f.growthText(-5), '-5.0% shrink');
  assert.equal(f.growthText(0), '0.0% (no change)');
  assert.equal(f.growthText(null), 'n/a');
  assert.equal(f.growthText(100), '+100.0% growth');
});

test('the equation, baseline and grace lines (AC 21, design option A)', () => {
  assert.equal(f.equation({ planned_hours: 40, net_change_hours: 13, current_total_hours: 53 }, false), '40 h planned + 13 h net change = 53 h current total');
  assert.equal(f.equation({ planned_hours: 30, net_change_hours: 4, current_total_hours: 34 }, true), '30 h planned + 4 h net change = 34 h final total');
  assert.equal(f.equation({ planned_hours: 10, net_change_hours: -2.5, current_total_hours: 7.5 }, false), '10 h planned - 2.5 h net change = 7.5 h current total');
  assert.equal(f.baselineText({ item_count: 12, hours: 38 }), '12 items, 38 h');
  assert.equal(f.baselineText({ item_count: 1, hours: 0 }), '1 item, 0 h');
  const grace = { added: { count: 1, hours: 2 }, removed: { count: 1, hours: 1 }, estimate_change: { count: 1, hours: 0.5 } };
  assert.equal(f.graceText(grace), '+2 h added, -1 h removed, +0.5 h estimate changes');
  assert.equal(f.graceText({ added: { hours: 2 }, removed: { hours: 0 }, estimate_change: { hours: -1 } }), '+2 h added, -0 h removed, -1 h estimate changes');
  assert.equal(f.hasGrace({ events: [{ in_grace: false }, { in_grace: true }] }), true);
  assert.equal(f.hasGrace({ events: [{ in_grace: false }] }), false);
  assert.equal(f.unestimatedText(2), '2 added items have no estimate.');
  assert.equal(f.unestimatedText(1), '1 added item has no estimate.');
});

test('log hours by the kind effect, never by kind name (AC 23)', () => {
  assert.equal(f.eventHours({ hours: 4 }, 'add'), '+4 h');
  assert.equal(f.eventHours({ hours: null }, 'add'), '+0 h');
  assert.equal(f.eventHours({ hours: 4 }, 'remove'), '-4 h');
  assert.equal(f.eventHours({ old_hours: 5, hours: 8 }, 'delta'), '5 h to 8 h (+3 h)');
  assert.equal(f.eventHours({ old_hours: 4, hours: 3 }, 'delta'), '4 h to 3 h (-1 h)');
  assert.equal(f.eventHours({ old_hours: null, hours: 2 }, 'delta'), 'none to 2 h (+2 h)');
  assert.equal(f.eventHours({ old_hours: 6, hours: null }, 'delta'), '6 h to none (-6 h)');
  assert.equal(f.eventHours({ hours: 1 }, null), '1 h', 'an unknown kind shows its hours');
});

test('dates and the dialog hint use the viewer\'s local date (AC 21, 28)', () => {
  const at = new Date(2026, 9, 14, 9, 12).toISOString(); // 2026-10-14 09:12 local
  assert.equal(f.localDate(at), '2026-10-14');
  assert.equal(f.addedHint(at), 'Added to this sprint on 2026-10-14.');
  assert.equal(f.addedHint(null), "Added after the sprint's first 24 hours.");
});

test('the figure labels follow the design (design README, Figures)', () => {
  assert.deepEqual(Object.values(f.TILE_LABELS), ['Planned', 'Added', 'Removed', 'Estimate changes', 'Current total', 'Final total', 'Growth']);
});
