// The single list of work item priorities, highest first. This order is also
// the order of the Priority swimlanes.
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const DEFAULT_PRIORITY = 'Medium';

function isValidPriority(name) {
  return PRIORITIES.includes(name);
}

module.exports = { PRIORITIES, DEFAULT_PRIORITY, isValidPriority };
