# Test case manager verification

Date: 2026-10-27

Implementation covers the project library, definitions/steps, ticket linking and creation, manual outcomes, retained execution snapshots, archiving, permissions, and the shared project dropdown on Board, Backlog and Test Cases.

## Automated coverage

Run `npm test` (Node's built-in test runner). New API coverage is in `tests/test-cases.test.js`; pure project selection/storage tests are in `tests/projectScope.test.js`. Existing permission coverage includes every new route for all groups, and Viewer read coverage includes every new GET route. Source/schema/history expectations include the new tables, field and ticket tab.

Final full-suite result: **376 passed, 0 failed**. JavaScript syntax checks and `git diff --check` also passed.

Verified: definition validation and field limits; step order; additive setup/restart; stable per-project case keys; no-op saves; simultaneous stale edits; literal search and filtered cursor pagination; independent ticket results; atomic create/link and multi-select rollback; duplicate/cross-project protection; history attribution; immutable definition snapshots; stale execution rejection and retest flags; unlink/reactivation; archive/restore; authentication and permission changes; archived-project guards; explicit deletion cleanup without foreign-key cascades.

## Browser verification

Headless Chromium against the app with a temporary database and scratch files; no production data changed. Browser automation and screenshots were generated in the ignored `.playwright-mcp/` directory using the locally available Playwright installation.

- Create a library case with two ordered steps; reopen and inspect its definition.
- Open a ticket by URL on Backlog; select the Test Cases tab and link the library case.
- Record Pass with notes; inspect execution history and the tested definition.
- Create a second case directly from the ticket. Both result recording and case creation preserve an unsaved ticket title.
- Edit the reusable definition and reopen the ticket on Board; verify the retest warning.
- Inspect the definition dialog and ticket panel at desktop size and the ticket at a 390px mobile width; no document horizontal overflow.
- Switch projects using the header dropdown; page stays Test Cases and stale case parameters disappear.
- Switch to Backlog and verify project retention; open Board without a project and verify the remembered project resolves into the URL.
- Open an invalid project, see its error, and recover through the dropdown.
- Dismiss the ticket discard confirmation: dialog and unsaved title stay intact. Accept it: dialog closes.
- Open an archived project directly: read-only UI and an `(archived)` selected option. Switch away: archived project is no longer offered.
- Check for uncaught browser errors throughout these flows: none.

The browser pass exposed an ambiguous outcome selector label; an explicit accessible label was added and the flow passed after correction.

## Read-only detail refinement

Existing cases now open in a formatted read-only view from both the library and ticket panel. Browser checks verify no input/textarea fields in the detail view, Edit opens the existing editor, Save refreshes the underlying view, and discarding an edit preserves the saved title. The detail layout was inspected at desktop and 390px mobile widths. Archived projects retain the read-only view without an Edit action. The UI source regression suite passes (56 tests).

## Scope limits

Execution is manual. No CI integration, suites, per-step outcomes, permanent case deletion or automatic ticket status gates. The separately specified Sprints screen does not exist in the current app and was not introduced here. Cross-project test reuse is rejected. Concurrent-browser updates require reopening/reloading the relevant view; there is no live synchronization.
