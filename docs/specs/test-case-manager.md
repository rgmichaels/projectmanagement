# Test case manager

Status: Draft for owner review; not approved for implementation
Date: 2026-10-27

## Purpose

Maintain reusable manual test cases independently of tickets, and attach them to tickets to describe and record how the work is verified. A tester can manage the library without opening a ticket; a developer can see the relevant tests from the ticket itself.

Terminology: “ticket” means the existing work item (`issues` in storage and APIs). A test case is a separate entity, not a new work item type.

## Requirements and proposed defaults

The owner requested two things: test cases can be added to a ticket, and the test case manager has its own tab. Everything below refines those requirements as proposed behavior for review.

- **Project library:** a Test Cases tab beside Board and Backlog (and Sprints when available). Each case belongs to one project and can exist without any ticket.
- **Reusable relationships:** a case can be linked to multiple tickets in its project, and a ticket can have multiple cases. Linking references the existing case rather than copying it.
- **Ticket access:** a Test Cases tab with a count inside the existing ticket dialog. Both existing cases and a newly created case can be added there.
- **Manual execution:** record Pass, Fail, Blocked or Not Run for a linked case. Execution history belongs to the ticket/case pair. A library case has no global pass/fail state.
- **Lifecycle:** Active or Archived. Archive preserves links and results; permanent case deletion is deferred.
- **Access:** reuse existing `write` permission for case changes, links and execution. All signed-in users can read. Archived projects remain read-only.

## User journeys

### Manage the library

Open Test Cases for the current project. Search cases, filter by lifecycle, open a case, or create one. A case detail editor contains its definition, audit metadata and linked tickets. Cases remain useful before a ticket exists.

### Add tests to a ticket

Open an existing ticket and select Test Cases. Choose **Add existing**, search the project's active cases and select one or more; already-linked cases are disabled. Alternatively choose **Create test case**, enter its definition, and save. The new case is created in the library and linked to this ticket atomically.

Removing a link leaves the case and other tickets' links untouched. Changing the ticket's type or status does not alter its cases. Linking tests does not automatically change ticket status or resolution.

### Verify a ticket

Open a linked case, follow its steps and choose **Record result**. Save an outcome and optional notes. The tester and UTC time come from the server. The ticket shows the latest result for each case, plus access to previous executions. Repeating a test creates another execution rather than overwriting evidence.

## Navigation and screens

1. Add `test-cases.html?project=<id>` to project sub-navigation. Keep the current project when moving between project pages. Integrate with the shared project selector described in `global-project-scope.md` if implemented; otherwise follow the existing explicit project URL convention. Do not assume that approved navigation specs have already been built.
2. The manager shows project name, archived/read-only indicator, **Create test case**, search, lifecycle filter, result count and a case list. Default lifecycle filter is Active; alternatives are Archived and All.
3. List columns: case key, title, lifecycle, linked-ticket count and last definition update. Sort by numeric case sequence ascending. Search matches key, title, preconditions, actions and expected results, ignoring case. Use explicit loading, error, no-cases and no-matches states.
4. Support direct links to a case using `?project=<id>&case=<id>`. Unknown or mismatched cases show an error; do not silently open another project or case.
5. Case details show the definition, creator, creation/update times and linked tickets. The ticket tab shows case key/title, lifecycle, latest execution outcome/time/tester and actions to open, record result or remove. Show **Not Run** when there is no execution.
6. Ticket tab count is the number of current links, including archived cases. Its summary counts each case once by its latest outcome, including Not Run; an older Pass never hides a newer Fail. Historical executions are not included in the summary count.
7. The ticket tab is available for every existing work item type, including epics. Epic tests and results are independent of child tickets; nothing is inherited or aggregated.
8. New unsaved tickets do not offer linking. Explain “Save this ticket before adding test cases.” Creating a case from a saved ticket is independent of unsaved ticket field edits and must preserve those edits.
9. Case and execution actions save immediately through their own controls, independently of the ticket's Save button. No nested HTML forms. Show inline errors and retain input on failure; disable duplicate submission while a request is pending.
10. Warn before discarding unsaved case definitions or result notes on close, case/project navigation or page exit. Cancel preserves the draft. Use accessible labels, keyboard controls, focus return and text labels for outcomes, not color alone. Render supplied text safely with preserved line breaks.

## Case definition and validation

| Field | Rule |
|---|---|
| Key | Server-generated, immutable, unique within project; proposed display `PM-TC-1` using the project's key and a separate sequence |
| Title | Required; trim; 1–200 characters |
| Preconditions | Optional plain text; trim; maximum 10,000 characters |
| Steps | Ordered list of 1–100 steps |
| Step action | Required plain text; trim; 1–4,000 characters |
| Step expected result | Required plain text; trim; 1–4,000 characters |
| Lifecycle | Active by default; Active or Archived |
| Revision | Server-managed positive integer; initially 1 |
| Creator / timestamps | Server-managed identity and UTC ISO 8601 times |

Steps can be inserted, removed and reordered before saving. Display numbering is derived from order. Save the whole definition atomically; an invalid step prevents the entire save. Unknown fields and invalid enum values return 400. Do not accept project, key, actor or timestamp changes through an update.

A real definition or lifecycle change increments revision and updates `updated_at`; a no-op does neither. Updates submit the revision they were based on. If stale, return 409 without changes and prompt the user to reload before reconciling their draft.

The same concurrency rule applies to archive/restore. Archived cases remain readable and linked but cannot be edited, newly linked or executed until restored. Removing an existing link remains allowed. A stale picker cannot bypass this rule. Unarchiving a project does not restore its individually archived cases.

## Links, results and retained evidence

1. Link only existing cases and tickets from the same project. Reject cross-project links with 400, missing records with 404 and duplicate links with 409. A database uniqueness rule also enforces the pair.
2. Multi-select linking is all-or-nothing: validate every selected case and insert all links in one transaction. Selecting nothing is a validation error. A duplicate or archived case rejects the batch with no partial additions.
3. Creating a case from a ticket validates the definition, creates the case and adds the link in one transaction. Failure leaves neither an orphan case nor a partial link.
4. Record an overall outcome with optional plain-text notes (maximum 10,000 characters). Not Run is an explicit reset recorded as an execution too; it never erases previous outcomes. Per-step outcomes are deferred.
5. Each execution stores an immutable snapshot of the case key, title, preconditions, ordered steps and revision as tested. Case edits never rewrite previous results. Record requests include the revision displayed to the tester; if it is stale, return 409 and require review of the new definition before submitting.
6. If the latest result used an older revision, show “Case changed since this result” beside the outcome. Do not silently reset it or present it as evidence for the current revision. Summary counts still describe the recorded outcomes; separately show the number needing retest.
7. Removing a link asks for confirmation, makes it inactive and hides it from the ticket's current list. Retain its execution history. Re-adding the same pair reactivates the relationship and exposes its earlier results with a “Previous results retained” notice. A case detail includes a separate previous-links section for inactive links so evidence remains discoverable.
8. Execution history is newest first (`created_at DESC, id DESC`), with 50 rows per page and a cursor. Executions cannot be edited or deleted in this version; corrections are new executions with explanatory notes.
9. Link/unlink operations append ticket History events in the same transaction, attributed through `actorFrom(req)`, using case key/title snapshots. Definition edits and executions remain in the case/result views and do not produce ticket field-change events.
10. Deleting a ticket removes its case relationships and their executions in the ticket-delete transaction, while preserving reusable cases and other tickets' evidence. The delete confirmation discloses this consequence. No new project deletion behavior is introduced.

## Permissions and failures

Every endpoint uses existing sign-in enforcement (401 when signed out). All mutations require `assertCan(req, 'write')`; use permission checks rather than group names in server and client code. No creator-only ownership rule applies to shared cases or executions.

Resolve the affected project and apply `assertWritable` for every mutation, including execution, archive, restore and unlink (409 on archived projects). Reads continue to work. Follow the existing guard ordering and JSON error shape. Treat malformed IDs, unsupported fields, invalid text/steps and invalid outcomes as 400. Check constraints inside the mutation transaction so simultaneous archive, edit or duplicate-link requests cannot evade validation.

On a failed mutation, definitions, revisions, links, results, counters and History remain unchanged. The UI must show server errors even when controls were enabled using stale permission or archive state.

## Proposed persistence and API

Additive migration in `server/db.js`; existing projects start with an empty library. No existing ticket is changed or given a test case automatically. All SQL stays in `server/data/` and schema setup; route handlers handle guards/validation and call data functions.

- `test_cases`: id, project_id, project-local sequence, title, preconditions, lifecycle, revision, created_by_id, created_at, updated_at. Unique `(project_id, sequence)`; allocate sequence atomically without reuse.
- `test_case_steps`: id, test_case_id, position, action, expected_result. Unique `(test_case_id, position)`; replace/reorder in the definition-save transaction.
- `issue_test_cases`: id, issue_id, test_case_id, active, linked_by_id, linked_at, removed_by_id, removed_at. Unique `(issue_id, test_case_id)`; reactivation uses the same row.
- `test_case_executions`: id, issue_test_case_id, outcome, notes, tested_by_id, created_at, case_revision, definition_snapshot_json. Immutable; index by link/id for cursor pagination.
- Project-local sequence allocation and case snapshots must follow the existing project's key conventions. Foreign keys and explicit transactional cleanup follow the existing ticket-delete pattern. Index project library lookup and both relationship directions.

| Endpoint | Behavior |
|---|---|
| `GET /api/test-case-metadata` | Lifecycle/outcome values and labels from single-source server modules |
| `GET /api/projects/:id/test-cases` | Search/lifecycle-filtered library, linked-ticket counts; paginated, default 50, max 200 |
| `POST /api/projects/:id/test-cases` | Create definition; 201 |
| `GET /api/test-cases/:id` | Definition, revision, metadata and current/previous linked tickets |
| `PATCH /api/test-cases/:id` | Full editable definition or lifecycle change, with expected revision; 200 |
| `GET /api/issues/:id/test-cases` | Active relationships, latest result and revision mismatch flags; summary |
| `POST /api/issues/:id/test-cases` | Either `{ test_case_ids: [...] }` or `{ new_case: {...} }`, mutually exclusive; atomic create/link; 201 |
| `DELETE /api/issues/:id/test-cases/:caseId` | Soft unlink; 204; missing/inactive relationship returns 404 |
| `GET /api/issues/:id/test-cases/:caseId/executions` | Cursor-paginated history, including inactive relationships |
| `POST /api/issues/:id/test-cases/:caseId/executions` | `{ outcome, notes, case_revision }`; active link and case required; 201 |

For the library, use ascending sequence cursor pagination; for execution history use descending execution ID. Return `{ items, has_more, next_cursor }`. Validate cursors and limits. Apply library search/filter before pagination; return matching total separately. The case linked-ticket lists can be separately paginated if needed during API refinement. Never depend on the board's currently loaded sprint or filtered tickets to find cases or linked tickets.

## Acceptance and verification

1. Create a case without any ticket, reload the manager, and find its full definition and ordered steps.
2. Link that case to two tickets. Editing the definition updates both views; their independent executions retain the definitions originally tested.
3. Create from a ticket and verify exactly one library case and one link. Failed creation/link batches leave no partial records.
4. Remove and re-add a link; the case and other ticket remain unchanged, retained results are visible, and ticket History records both actions.
5. Reject duplicate, cross-project, missing, malformed and archived-case links; verify batch rollback and concurrent duplicate protection.
6. Record every outcome, including Not Run, and repeat executions. Verify latest selection when timestamps tie, pagination without repeats, tester attribution and immutable snapshots.
7. Edit a tested case: old evidence remains intact, the mismatch notice appears, and recording against the stale revision fails with no execution created.
8. Validate field boundaries, step order, empty/whitespace input, unknown fields, no-op saves and stale updates. HTML/script content renders as text.
9. Verify signed-out, Viewer, Member and Admin behavior and archived-project guards for every endpoint. Group changes apply on the next request.
10. Archive/restore cases: existing links/history stay readable, new links and executions fail while archived, and removing a link still works in a live project.
11. Delete one ticket: its relationships/results disappear with no orphans; library cases and another ticket's results survive. Verify rollback if cleanup fails.
12. Manually verify navigation/project switching, direct links, empty/error/loading states, keyboard/focus behavior, unsaved-draft protection and preservation of ticket edits during test actions on Board and Backlog, plus Sprints when implemented.
13. Automated coverage uses the existing `node:test` API helpers and temporary databases. Add meaningful tests for transactions, permissions, concurrency and snapshots; run existing regression checks. Keep SQL separation and metadata extensibility consistent with existing source checks. This draft adds no executable code.

## Deferred scope

Automated test imports or execution, CI integration, Gherkin, suites/folders, release test plans, scheduled runs, environments, attachments, per-step results, defect creation, test ownership/assignments, cross-project sharing, bulk import/export, notifications, case revision browsing, permanent deletion and mandatory test gates on ticket transitions.

## Decisions to confirm during review

- Project-scoped library versus an organization-wide library. This draft proposes project scope to match existing navigation and permissions.
- Whether manual execution tracking belongs in the first delivery. It is specified here; a smaller first delivery could ship definitions and linking first.
- Whether the proposed fields (preconditions and action/expected-result steps) match the tests the team writes.
- Whether reusable cases, soft unlink with retained results, and archive instead of deletion fit the intended workflow.

These are product choices, not owner approvals already obtained. Implementation should follow review of this draft.
