const { ValidationError } = require('./validation');
const { lifecycles, outcomes } = require('./testCaseMetadata');

const fail = (message, status = 400) => { throw new ValidationError(message, status); };
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a JSON object.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unknown field: ${key}.`);
  return value;
}
function integer(value, label = 'id') {
  if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) fail(`${label} must be a positive integer.`);
  return Number(value);
}
function text(value, label, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`${label} must be ${required ? '1' : '0'}–${max} characters.`);
  return value.trim();
}
function definition(body, update = false) {
  object(body, update ? ['title', 'preconditions', 'steps', 'lifecycle', 'revision'] : ['title', 'preconditions', 'steps']);
  const result = {};
  if (!update || 'title' in body || 'preconditions' in body || 'steps' in body) {
    result.title = text(body.title, 'Title', 200, true);
    result.preconditions = text(body.preconditions, 'Preconditions', 10000);
    if (!Array.isArray(body.steps) || body.steps.length < 1 || body.steps.length > 100) fail('Provide 1–100 steps.');
    result.steps = body.steps.map((step) => {
      object(step, ['action', 'expected_result']);
      return { action: text(step.action, 'Step action', 4000, true), expected_result: text(step.expected_result, 'Expected result', 4000, true) };
    });
  }
  if (update) {
    result.revision = integer(body.revision, 'revision');
    if ('lifecycle' in body) {
      if (!lifecycles.some((x) => x.name === body.lifecycle)) fail('Unknown lifecycle.');
      result.lifecycle = body.lifecycle;
    }
    if (!result.steps && !result.lifecycle) fail('Provide a definition or lifecycle change.');
  }
  return result;
}
function execution(body) {
  object(body, ['outcome', 'notes', 'case_revision']);
  if (!outcomes.some((x) => x.name === body.outcome)) fail('Unknown outcome.');
  return { outcome: body.outcome, notes: text(body.notes, 'Notes', 10000), case_revision: integer(body.case_revision, 'case_revision') };
}
function page(query) {
  const limit = query.limit === undefined ? 50 : integer(query.limit, 'limit');
  if (limit > 200) fail('limit must not exceed 200.');
  return { limit, cursor: query.cursor === undefined ? null : integer(query.cursor, 'cursor') };
}
module.exports = { fail, object, integer, text, definition, execution, page };
