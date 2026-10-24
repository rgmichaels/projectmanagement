// The single list of project statuses (from the owner's NYSBOE design).
// `archivable` marks the statuses in which a project may be archived; moving a
// project to a non-archivable status automatically unarchives it.
const PROJECT_STATUSES = [
  { name: 'Planning', isDefault: true },
  { name: 'In Progress' },
  { name: 'Completed', archivable: true },
  { name: 'Cancelled', archivable: true },
];

function isValidProjectStatus(name) {
  return PROJECT_STATUSES.some((s) => s.name === name);
}

function isArchivableStatus(name) {
  const s = PROJECT_STATUSES.find((x) => x.name === name);
  return Boolean(s && s.archivable);
}

function defaultProjectStatus() {
  return (PROJECT_STATUSES.find((s) => s.isDefault) || PROJECT_STATUSES[0]).name;
}

module.exports = { PROJECT_STATUSES, isValidProjectStatus, isArchivableStatus, defaultProjectStatus };
