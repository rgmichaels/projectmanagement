// The single source of truth for permission groups and what each may do
// (docs/specs/permission-groups.md). Every user is in exactly one group,
// stored as users.group_name. Nothing else names a group: routes ask
// can(group, permission) through assertCan in server/routes/guards.js, and
// the client only sees the permission names of the signed-in user's group.
// To add a group or change what one may do, edit GROUPS here and restart.

// The fixed set of permissions, with the words used in the 403 message
// "Your group (<group>) is not allowed to <action>."
const PERMISSIONS = [
  // Create, edit and move work items, comment, link and attach files.
  { name: 'write', action: 'edit work items' },
  { name: 'delete-item', action: 'delete work items' },
  { name: 'manage-projects', action: 'manage projects' },
  { name: 'manage-users', action: 'manage users' },
];

// In display order (the Users page dropdown).
const GROUPS = [
  { name: 'Admin', permissions: ['write', 'delete-item', 'manage-projects', 'manage-users'] },
  { name: 'Member', permissions: ['write'] },
  { name: 'Viewer', permissions: [] },
];

// The group of new users and of existing users when groups are first added.
const DEFAULT_GROUP = 'Member';
// The group of the first (lowest-id) user on a new or upgraded database.
const INITIAL_ADMIN_GROUP = 'Admin';

const findGroup = (name) => GROUPS.find((g) => g.name === name);

function groupNames() {
  return GROUPS.map((g) => g.name);
}

function isValidGroup(name) {
  return typeof name === 'string' && Boolean(findGroup(name));
}

function defaultGroup() {
  return DEFAULT_GROUP;
}

function initialAdminGroup() {
  return INITIAL_ADMIN_GROUP;
}

function isPermission(permission) {
  return PERMISSIONS.some((p) => p.name === permission);
}

// The only place that decides. An unknown group (for example one removed
// from this file while users are still in it) may do nothing.
function can(group, permission) {
  const g = findGroup(group);
  return Boolean(g) && g.permissions.includes(permission);
}

// The permission names of a group, in PERMISSIONS order.
function permissionsOf(group) {
  return PERMISSIONS.map((p) => p.name).filter((p) => can(group, p));
}

function actionOf(permission) {
  const p = PERMISSIONS.find((x) => x.name === permission);
  return p ? p.action : permission;
}

// The groups that may manage users. At least one user must stay in one of
// them, or nobody could change groups any more.
function managerGroups() {
  return GROUPS.filter((g) => g.permissions.includes('manage-users')).map((g) => g.name);
}

module.exports = {
  PERMISSIONS,
  GROUPS,
  groupNames,
  isValidGroup,
  defaultGroup,
  initialAdminGroup,
  isPermission,
  can,
  permissionsOf,
  actionOf,
  managerGroups,
};
