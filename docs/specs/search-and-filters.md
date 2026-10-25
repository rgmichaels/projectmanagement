# Search and Filters (Board)
Status: Approved for build
Date: 2026-10-25

**Builds on the implemented code and on `docs/specs/board-mvp.md`, `docs/specs/epic-view.md` and `docs/specs/permission-groups.md` (read-only references; this spec edits none of them).** Terminology follows the MVP ("work item"; the table and API may still be called `issues`). Acceptance criteria are numbered from 1 within this spec; references to other specs are written "MVP AC n".

Source of truth for the design: the approved plan at `/Users/robertmichaels/.claude/plans/sequential-knitting-frost.md`.

It reuses: `listIssues` (`server/data/issues.js`) which already returns every item of the project to the board; `state.items` and the meta lists already loaded into `state` (`types`, `statuses`, `priorities`, `resolutions`, `users`) in `public/js/board.js`; the Group by setting and its `GROUP_BY_STORAGE_KEY` localStorage pattern; `reloadItems()`; and the pure-module pattern of `public/js/historyFormat.js` and `public/js/time.js`, whose tests (`tests/historyFormat.test.js`, `tests/time.test.js`) load them under `node:test`.

## Problem

The board shows every work item in a project and the only way to narrow it is Group by. As items pile up the board becomes hard to scan. The owner wants to search by text and filter by the main attributes, on the board only, with the choices remembered.

## User stories

1. As a user, I type in a search box and the board shows only items whose key, title or description contains the text, ignoring case.
2. As a user, I filter by assignee (including Unassigned), type, priority, status and resolution using dropdowns that each default to "Any".
3. As a user, I combine search text and several filters and see only items that match all of them.
4. As a user, I see "Showing n of m" so I know the board is narrowed and by how much.
5. As a user, I press Clear to remove all search text and filters at once.
6. As a user, my search and filters are still there when I reload the page or come back to the project, and they do not leak into other projects.
7. As a user, I can still drag cards between columns while filtered, and the order is saved correctly relative to cards I cannot see.
8. As a user with Group by Epic, I still see an epic's lane when the epic itself is filtered out but its children match.
9. As a user who creates an item that the active filters would hide, I am told so instead of seeing it vanish.
10. As a Viewer, Member or Admin, and on an archived project, I can use search and filters exactly the same way (they are read-only UI).
11. As the owner, adding a status, type, priority or resolution needs no change to this feature.

## Decisions (confirmed by the owner; the developer does not need to ask)

1. **Board only:** no global or cross-project search page.
2. **Client-side only:** filters apply to the items the board already loaded. No new API, query parameter or schema.
3. **Text search** covers key, title and description, case-insensitive. It does not cover comments (Decision 10).
4. **Filters:** assignee (with an Unassigned choice), type, priority, status, resolution. Each is a single-select dropdown with an "Any" option.
5. **Combination:** all active criteria are ANDed.
6. **Persistence:** search text and filters are saved per project in the browser's localStorage, with a Clear button and a "Showing n of m" count.
7. **Not wanted:** epic, reporter and "assigned to me" filters, global search, URL parameters, multi-select.
8. **Single-select dropdowns now** (multi-select may come later).
9. **Resolution dropdown** offers the defined resolutions plus "Any" only; there is no "Unresolved" choice.
10. **Text search excludes comments** (key, title and description only).
11. **Drag while filtered:** only visible cards can be dragged, and ranks are computed from the unfiltered column. A created item that does not match the filters gets a notice, and the filters are not cleared automatically.

## Acceptance criteria

### Matching behavior

1. With no search text and every filter on "Any", all items are shown and "Showing n of m" has n equal to m.
2. Search text matches an item when it is a substring of the item's key, title or description, case-insensitively (`pm-1`, `PM-1` and `Pm-1` all find item `PM-1`; `LOGIN` finds a title "Fix login bug"). Leading and trailing spaces in the search box are ignored. An item with an empty or missing description does not error and can still match on key or title.
3. Each of assignee, type, priority, status and resolution, set alone, shows only items with exactly that value.
4. The assignee dropdown lists "Any", "Unassigned" and the users from the loaded users list. Choosing Unassigned shows only items with no assignee. "Unassigned" cannot be confused with a real user (it is not a user entry).
5. Search text and any set filters combine with AND: an item is shown only if it satisfies every active criterion. Selecting a combination that matches nothing shows an empty board with "Showing 0 of m" and no error.
6. Search text is matched literally, not as a pattern: text such as `.*`, `(` or `[` does not error and matches only items containing those characters.
7. The result updates as the user types or changes a dropdown, with no page reload and no server request.

### Toolbar UI

8. The board toolbar, next to Group by, shows a search box, then dropdowns for assignee, type, priority, status and resolution, then a Clear button and the count text. Every dropdown has "Any" as its first option and as its default.
9. Dropdown options for type, status, priority and resolution come from the lists already loaded into `state`, in their list order; assignee options come from the loaded users. No option name is hard-coded in the client.
10. The count reads "Showing n of m", where m is the number of items in the project and n is the number shown after search and filters. It is correct after create, edit, delete and drag.
11. Clear resets the search box and every dropdown to "Any", shows all items, and removes the saved entry for that project. Clear does not change Group by. The Clear button is disabled or hidden when nothing is active.
12. Column counts and any per-lane counts on the board reflect the filtered items.
13. When the resolution list has no applicable options (for example the project or installation defines none), the resolution dropdown is hidden or disabled rather than showing only "Any".
14. All toolbar buttons are `type="button"`. The search box and dropdowns have accessible labels. Pressing Enter in the search box does not submit anything or reload the page.

### Persistence

15. Search text and filters are saved to localStorage under a per-project key (`pm.filters.<projectId>`) whenever they change. Reloading the page restores the same search text, dropdown selections and filtered board.
16. Filters set in one project do not appear in another project, and returning to the first project restores them.
17. If localStorage is unavailable, throws, or holds malformed or stale data (for example a saved assignee, status or type that no longer exists), the board still loads with the unusable parts treated as "Any", and nothing throws to the user. Reads and writes are wrapped in try/catch like `GROUP_BY_STORAGE_KEY`.

### Traps (these must hold)

18. **Drag-and-drop ranking uses unfiltered columns.** While filtered, dropping a card between two visible cards computes its rank from the full, unfiltered column order, so it lands correctly relative to hidden cards. Verified by checking the stored ranks/order in the database after a drop with hidden cards between and around the drop target, then clearing the filter and seeing the dragged card in the expected position.
19. **Epic swimlanes are built from the unfiltered set.** With Group by Epic and a filter that excludes an epic item but matches some of its children, the epic's lane is still shown with those children. A lane with no matching items is hidden while any search or filter is active, and shown again (as before this feature) after Clear. Items with no epic still appear in their normal lane.
20. **Reloads re-apply filters.** After `reloadItems()` (after create, edit, delete, drag, or a dialog action) the active search and filters are applied to the fresh items and the count is updated. A change does not silently reset the filters.
21. **A created item that does not match gets a notice.** If the user creates an item that the active search or filters would hide, a short text notice says so (for example "Created PM-12, hidden by the current filters.") and the filters are left as they are. If the item matches, no notice is shown. The notice disappears on its own or when dismissed or when filters are cleared.
22. An item edited in its dialog so that it no longer matches (for example changing its priority while filtering by priority) is removed from view after the save without closing the filters, and no error occurs. The open dialog is not forcibly closed by the filter.

### Permissions and archived projects

23. Search and filters work the same for Admin, Member and Viewer. They never call a write endpoint, and no group has any filter control hidden or disabled.
24. On an archived project (read-only board) search, filters, Clear and the count all still work; they do not depend on write access.

### Source and extensibility

25. No status, type, priority or resolution name is hard-coded in `public/js/filters.js` or the new board code; `tests/source.test.js` rules continue to pass, with a new rule covering `filters.js`. Adding a value to one of the server lists and restarting makes it appear in the matching dropdown with no other change.
26. All values from items and from storage are inserted as text (`textContent`, `createTextNode`, or the existing `el(...)` helper), never parsed as HTML. A search string or item title such as `<img src=x onerror=alert(1)>` renders literally and executes nothing.
27. No server file, route or schema changes. `git diff` of the feature touches no file under `server/`.

## Data model changes

None. No new tables, columns, API endpoints or history fields. The only new stored state is a browser-side localStorage entry per project.

## Out of scope

- Global or cross-project search page.
- Filters for epic, reporter, created or updated date, labels, or "assigned to me".
- Multi-select dropdowns (Decision 8).
- Saved, named or shared filters.
- URL parameters or shareable links to a filtered board.
- Searching comments, history or attachment names (Decision 10).
- Full-text ranking, fuzzy matching, highlighting of matches, or server-side search.
- Any change to Group by behavior, permissions, or what the server returns.
- Keyboard shortcuts for focusing the search box.

## Open questions

None. The owner accepted all recommendations (Decisions 8-11).

## Implementation notes for the developer

Line references below were checked against `public/js/board.js` (1801 lines, after links, attachments, epic view and permission groups) on 2026-10-25; re-check if it changes before the build. Current code facts:

- `state` is at line 19; `groupBy` is read from `localStorage` at line 33 and `GROUP_BY_STORAGE_KEY` is declared at line 12 (that one is global, not per project, and has no try/catch; the new filter storage must be per project and wrapped in try/catch).
- `computeLanes()` (line 186) builds lanes from all of `state.items` and assigns each lane its items; the Epic lanes are at lines 195-201 (epics with children, plus a "No epic" lane). `renderColumn()` (323) and `render()` (334) draw cards; the column header count at line 338 uses `state.items`, and the lane header count at line 354 uses `lane.items.length`.
- Drag and drop: `onDrop()` (411) takes the next visible `.card` in the DOM as `beforeId`; `computeRank()` (426) already reads the full column from `state.items`, and its end-of-lane branch (line 437) uses `lane.items`; `moveItem()` is at 445.
- `reloadItems()` is at line 1744 (fetch, then `render()`); `renderHeader()` (373) fills the Group by dropdown.

Suggested order, each step testable alone:

1. **`public/js/filters.js` (new, pure module).** Same loading pattern as `public/js/historyFormat.js` (works in the browser and under `node:test`, no DOM, no `localStorage`). Public functions: `matches(item, filters, userNamesById)`, `isActive(filters)`, and an `emptyFilters()` helper; optionally `sanitize(saved, meta)` that drops stale saved values (AC 17). `filters` is a plain object such as `{ text, assignee, type, priority, status, resolution }` where an empty value or an "Any" sentinel means no constraint. Match text against key, title and description with a case-insensitive substring test (use `String.prototype.includes` on lowercased strings, never a RegExp built from user input, AC 6). Include no status, type, priority or resolution names.
2. **`tests/filters.test.js` (new).** Cover: no filter returns all (AC 1); text over key, title and description, case-insensitivity, trimming, empty/missing description (AC 2); each filter alone (AC 3); Unassigned (AC 4); combined filters and a no-match combination (AC 5); regex-looking text (AC 6); `isActive`; `sanitize` with stale values. Add rules in `tests/source.test.js`: no hard-coded names in `filters.js`, toolbar buttons are `type="button"`, text-only DOM in the new board code (AC 25-26).
3. **`public/board.html`.** Add the toolbar next to Group by: search input, five selects, Clear button, count element, and a notice element for AC 21. Use `type="button"` on buttons and a label for each control.
4. **`public/js/board.js` state and persistence.** Add `filters` to `state`, a `FILTERS_STORAGE_PREFIX` of `pm.filters.`, and load/save helpers wrapped in try/catch (model on `GROUP_BY_STORAGE_KEY`). Load per project when the board opens; sanitize against the loaded meta lists. Fill dropdown options from the existing `state` lists.
5. **Apply the filter in the render path.** Compute `visibleItems = state.items.filter(i => matches(...))` just before lanes and columns are built and use it for cards, column counts and the "Showing n of m" text. Keep `state.items` itself unfiltered.
6. **Handle the traps.**
   - Drag-and-drop (AC 18): `computeRank()` already finds neighbours in the full column from `state.items`, so keep it that way; do not pass it filtered data. `onDrop()` supplies the next visible card as `beforeId`, so the dropped card lands just before that card and after any hidden cards ahead of it, which is acceptable. The end-of-lane branch (line 437) uses `lane.items`; when lanes hold only visible items, make sure the "last card in lane" logic still yields a valid rank (it falls back to the end of the column).
   - Epic lanes (AC 19): in `computeLanes()` compute `used` and `epics` (lines 196-197) from the unfiltered `state.items`, then fill each lane with only matching items, and skip lanes with zero visible items when `isActive(filters)`. Likewise the Assignee and Priority lane lists should come from the unfiltered set so lane order does not jump, with empty lanes hidden while a filter is active. Column header counts (line 338) and lane counts (line 354) use the filtered items.
   - `reloadItems()` (AC 20): after fetching, re-render through the same filtered path. After a create (AC 21), compare the new item with `matches` and show the notice if it fails. After a dialog save (AC 22), simply re-render.
7. **`public/css/app.css`.** Toolbar layout (wrap on narrow screens), notice style, disabled Clear style.
8. **`README.md`.** One short paragraph: board search and filters, client-side, remembered per project in the browser.
9. **Do not touch `server/`** (AC 27). Run `npm test`.
10. **QA (browser, scratch DB copy, spare port, not 3001, never 3000):** each filter narrows cards and counts; combined filters; no-match state; Clear; persistence across reload and across two projects; stale saved filter data; Group by Epic with a filtered-out epic; drag a card between filtered columns and check its rank in the scratch DB; create an item that does not match and one that does; edit an item out of the filter; do the same checks as Admin, Member and Viewer and on an archived project; hostile text in a title and in the search box renders literally.
