// Validation for time entries and work item estimates
// (docs/specs/time-tracking.md AC 2-4, 35). Pure functions: hours are decimal
// numbers in quarter-hour steps and are stored as whole minutes. Nothing here
// touches the database.
const { ValidationError } = require('./validation');

const MAX_ENTRY_HOURS = 24;
const MAX_ESTIMATE_HOURS = 1000;
const NOTE_MAX_LENGTH = 500;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const HOURS_MESSAGE = `Hours must be a number greater than 0 and at most ${MAX_ENTRY_HOURS}, in steps of 0.25.`;
const ESTIMATE_MESSAGE = `Estimate must be a number greater than 0 and at most ${MAX_ESTIMATE_HOURS}, in steps of 0.25, or empty.`;
const DATE_MESSAGE = 'Date must be a real date as YYYY-MM-DD and not in the future.';
const NOTE_MESSAGE = `Note must be at most ${NOTE_MAX_LENGTH} characters.`;

// A JSON number, greater than 0, at most `max`, a multiple of 0.25.
const isQuarterHours = (value, max) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max && Number.isInteger(value * 4);

const toMinutes = (hours) => Math.round(hours * 60);

// Hours of one time entry, as whole minutes.
function checkEntryHours(value) {
  if (!isQuarterHours(value, MAX_ENTRY_HOURS)) throw new ValidationError(HOURS_MESSAGE);
  return toMinutes(value);
}

const pad = (n) => String(n).padStart(2, '0');

// Today as YYYY-MM-DD in the server's local time.
function localToday(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The work date: a real calendar date, not after `today`. Omitted (undefined)
// means today on create; the caller decides when it is required.
function checkWorkDate(value, today = localToday()) {
  if (value === undefined) return today;
  const m = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  const real = d && d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  if (!real || value > today) throw new ValidationError(DATE_MESSAGE);
  return value;
}

// Optional plain-text note: trimmed, at most 500 characters, empty -> null.
function checkNote(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('Note must be text.');
  const text = value.trim();
  if (text.length > NOTE_MAX_LENGTH) throw new ValidationError(NOTE_MESSAGE);
  return text || null;
}

// The fields of a create (all) or an edit (only those present).
// Returns { minutes?, work_date?, note? }.
function checkTimeEntry(body, { creating, today = localToday() } = {}) {
  const out = {};
  if (creating || body.hours !== undefined) out.minutes = checkEntryHours(body.hours);
  if (creating || body.date !== undefined) {
    if (!creating && body.date === null) throw new ValidationError(DATE_MESSAGE);
    out.work_date = checkWorkDate(body.date, today);
  }
  if (creating || body.note !== undefined) out.note = checkNote(body.note);
  return out;
}

// A work item's estimate: whole minutes, or null for null or '' (clears it).
function checkEstimate(value) {
  if (value === null || value === '') return null;
  if (!isQuarterHours(value, MAX_ESTIMATE_HOURS)) throw new ValidationError(ESTIMATE_MESSAGE);
  return toMinutes(value);
}

module.exports = {
  MAX_ENTRY_HOURS,
  MAX_ESTIMATE_HOURS,
  NOTE_MAX_LENGTH,
  HOURS_MESSAGE,
  ESTIMATE_MESSAGE,
  DATE_MESSAGE,
  localToday,
  checkEntryHours,
  checkWorkDate,
  checkNote,
  checkTimeEntry,
  checkEstimate,
};
