// Backlog bulk move (docs/specs/backlog-bulk-move.md AC 15, 21-25): the
// order of a run, the sequential best-effort loop and the result text. Pure
// functions (the PATCH is passed in), loadable in the browser (global
// `bulkMoveUtil`) and from node:test (module.exports). js/backlog.js draws
// the controls and the result; nothing here names a sprint state, status or
// type, and every string is for the caller to insert as text.
const bulkMoveUtil = (() => {
  const FAIL_LIST_MAX = 5; // failed keys listed before "and K more" (AC 22)

  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // Backlog order (AC 15): ascending sprint_rank, then id; never tick order.
  const order = (items) => [...items].sort((a, b) => (a.sprint_rank ?? 0) - (b.sprint_rank ?? 0) || a.id - b.id);

  // Responses whose cause is project-wide or sprint-wide (signed out, lost
  // write permission, project archived, target sprint completed): every
  // remaining item would fail the same way, so the run stops (AC 23).
  const isAbortStatus = (status) => status === 401 || status === 403 || status === 409;

  // Moves `items` one at a time, in Backlog order (AC 21). `patch(item)`
  // sends one PATCH and resolves with the saved item or rejects with an
  // Error carrying `status` (none for a network error). A 400 may mean the
  // target sprint was deleted: `targetGone()` (optional) is asked then, and
  // a true answer stops the run like an abort status (AC 24). Any other
  // failure is recorded and the run goes on (AC 22). The item that stopped
  // the run counts as not attempted, with the rest after it.
  async function run(items, { patch, targetGone = async () => false }) {
    const list = order(items);
    const result = { total: list.length, moved: [], failed: [], notAttempted: [], stopMessage: '' };
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      try {
        result.moved.push({ item, saved: await patch(item) });
      } catch (err) {
        const message = (err && err.message) || 'Request failed.';
        let stop = isAbortStatus(err && err.status);
        if (!stop && err && err.status === 400) {
          try {
            stop = Boolean(await targetGone());
          } catch {
            stop = false; // cannot tell; treat it as this item's failure
          }
        }
        if (stop) {
          result.notAttempted = list.slice(i);
          result.stopMessage = message;
          break;
        }
        result.failed.push({ item, message });
      }
    }
    return result;
  }

  // The result message (AC 12, 22, 23; design states S6-S12). kind:
  // 'success' (role status), 'partial' or 'stopped' (role alert). `label`
  // is the bold word that keeps the state from being colour alone.
  function summary(result, sprintName) {
    const n = result.total;
    const x = result.moved.length;
    const failures = result.failed.slice(0, FAIL_LIST_MAX).map((f) => ({ key: f.item.key, message: f.message }));
    const more = Math.max(0, result.failed.length - FAIL_LIST_MAX);
    if (!result.failed.length && !result.notAttempted.length) {
      return { kind: 'success', label: '', lead: `Moved ${count(x, 'work item')} to ${sprintName}.`, failures: [], more: 0, hint: '' };
    }
    if (result.notAttempted.length) {
      const k = result.notAttempted.length;
      const left = k + result.failed.length;
      return {
        kind: 'stopped',
        label: 'Stopped.',
        lead: `Moved ${x} of ${count(n, 'work item')} to ${sprintName}. ${k} not attempted. ${result.stopMessage}`,
        failures,
        more,
        hint: left === 1 ? 'The 1 work item that was not moved is still ticked.' : `The ${left} work items that were not moved are still ticked.`,
      };
    }
    return {
      kind: 'partial',
      label: x === 0 ? 'Not moved.' : 'Partly moved.',
      lead: `Moved ${x} of ${count(n, 'work item')} to ${sprintName}. Could not move:`,
      failures,
      more,
      hint: 'The items that could not be moved are still ticked. Press Move to try again.',
    };
  }

  return { FAIL_LIST_MAX, order, isAbortStatus, run, summary, count };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = bulkMoveUtil;
