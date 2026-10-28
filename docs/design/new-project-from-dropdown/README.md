# New project from the Project dropdown: design

Spec: `docs/specs/new-project-from-dropdown.md`. Mockup: `states.html` (ten numbered frames, opens from disk). Owner defaults applied: label `New project...`, no auto-suggested key.

## Options

There is no real choice here, so there is one design. Top bar A is unchanged (white native select with a pale "Project" label on the teal bar). The only addition is a separator option and a last option `New project...`. The modal is the existing `dialog.app-dialog` shell used by Edit project on `index.html` (teal band with title, body on the page colour, white foot). Fields and order come from the Projects list create form: Name, Key, Status.

Two small alternatives were considered and rejected: a custom dropdown widget with a styled "+ New project" row (breaks AC 4, native keyboard use, and costs a widget), and an inline form in the page instead of a modal (the spec asks for a modal). Recommendation: build the single design as mocked.

## UI contract (for developer and QA)

**Dropdown entry (frames 1, 2, 7, 8)**
- Only when `session.can('manage-projects')`. Otherwise the select is exactly as today.
- Option order: project options (and the archived-by-URL extra), then one disabled option `────────────` (box-drawing dashes, no value), then `<option value="__new__">New project...</option>`.
- With no current project (no active projects, project not found, failed list): first option is the placeholder `Choose a project`, then separator, then the entry. The separator is shown even when there are no projects.
- On "No active projects." the select appears in the top bar for users with the permission, between the brand and the session area, same markup and classes as the other pages (`.project-scope`, label "Project", `select.project-select`). The "Go to the Projects page" link stays in the page. Users without the permission see no dropdown (unchanged).
- The entry is never the selected option on load.

**Native-select limits (QA checks against these, not against a custom look)**
- The open list is drawn by the browser or OS. Colours, font weight, icons, and padding of options cannot be relied on; the highlight on hover or arrow is the browser's own.
- The separator is a disabled option; the dashes grey out by browser default. It cannot be chosen. Some browsers skip it with arrow keys, some show it as a grey row; both are acceptable.
- Option text is truncated by the browser if it is wider than the list; the closed select shows an ellipsis (existing).
- The entry cannot be made visually distinct from project rows beyond its text and the separator above it. No "+" prefix (owner chose the ellipsis wording).

**Dialog "Create project" (frames 3 to 10)**
- Markup: `dialog.app-dialog` > `form` (`novalidate`) > `.band > h2` ("Create project", no key chip) + `.dialog-body` + `.dialog-foot`. `aria-labelledby` points at the h2. Opened with `showModal()`, so Escape closes it and the page is inert.
- Fields (each a `label` wrapping the control, label text above, existing style):
  - `Name` text input, `maxlength="80"`, required. Receives focus on open.
  - `Key` text input, `maxlength="10"`, `placeholder="PROJ"`, required, `autocomplete="off"`, uppercased as the user types.
  - `Status` select from `GET /api/project-statuses`, default = the `isDefault` status (Planning), order Planning, In Progress, Completed.
  - No hint text, no extra fields.
- Foot (right aligned, existing): `p.error[role="alert"]` (empty = takes no space; full width above the buttons when filled), then `Cancel` (`type="button"`, secondary white/navy), then `Create` (`type="submit"`, `.primary` deep teal). No close "X".
- Width: 480px max, 95vw. Below 600px the band, body and foot use 14px side padding (one rule: `@media (max-width: 600px) { dialog.app-dialog .band, dialog.app-dialog .dialog-body, dialog.app-dialog .dialog-foot { padding-left: 14px; padding-right: 14px; } }`; add to `app.css` only if it is not there already).
- Errors: the server's message, unchanged, via `textContent`, in the foot error area. Dialog stays open, entered values kept. For a 409 or a message that starts with "Key", the developer may set `aria-invalid="true"` on Key (existing red 2px border); clear it on the next input or submit. Optional.
- In flight: `Create` is `disabled`, label changes to `Creating...`, dialog gets `aria-busy="true"`. After an error: label back to `Create`, enabled, `aria-busy` removed.
- Cancel, Escape, or any close without creating: dialog closes, select returns to the previous value (or the placeholder), focus goes back to the select.
- User text (names, server messages, project labels) is always set as text or as input value, never as HTML (frame 9).

**States to verify**: frame 1 closed (Admin, Viewer); 2 open; 3 default; 4 empty name and bad key; 5 duplicate key (409) and server 403; 6 in flight; 7 no active projects; 8 project not found and dialog over it; 9 long and hostile text; 10 narrow (380px).

## Styles

No new tokens or components, so `STYLE.md` only gets a short note (part 8). The dialog uses existing `app-dialog` rules, and the dropdown uses the existing `.project-scope` rules. The mockup-only classes in `states.html` (`.dim`, `.listbox`, `.stage`, `.narrow`) are not for `app.css`.

## Open questions for the owner

1. **Cancel during the request.** The spec lets any close happen. If the user presses Escape or Cancel while the request is in flight, the project may still be created and the page would not navigate. Recommendation: disable Cancel and ignore Escape (`cancel` event `preventDefault`) while in flight, for the short time the request takes. This needs a one-line spec tweak to AC 9 or 10.
2. **Wording of the in-flight label.** `Creating...` is proposed. Keep plain `Create` (disabled) if you prefer the spec's literal wording.
3. **403 text.** The mock uses a placeholder; the dialog shows whatever the server returns.
