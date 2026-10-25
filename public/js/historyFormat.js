// Text for the History tab. Pure functions, loadable in the browser (global
// `historyFormat`) and from node:test (module.exports). Field labels and kinds
// come from the server with each change; nothing here names a field or value.
const historyFormat = (() => {
  const NONE = 'None';

  const value = (v) => (v === null || v === undefined || v === '' ? NONE : String(v));

  // `changed Status from To Do to In Progress`; a long field has no values.
  // A file field reads `added <label> <name>` or `removed <label> <name>`.
  function changeLine(change) {
    if (change.kind === 'long') return `changed ${change.label}`;
    if (change.kind === 'file') {
      const label = change.label.toLowerCase();
      return change.new ? `added ${label} ${change.new}` : `removed ${label} ${value(change.old)}`;
    }
    return `changed ${change.label} from ${value(change.old)} to ${value(change.new)}`;
  }

  // The lines shown under an event's actor and time.
  function eventLines(event) {
    if (event.kind === 'created') return ['created this work item'];
    return event.changes.map(changeLine);
  }

  return { changeLine, eventLines };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = historyFormat;
