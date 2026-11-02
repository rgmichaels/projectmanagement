# User admin: design

Spec: `docs/specs/user-admin.md`. Open the HTML files straight from disk (they link `public/css/app.css` and `src/user-admin.css`).

- `a-inline-form.html`: the Users page, default list (recommended).
- `b-collapsed-form.html`: option B, Add user collapsed behind a button.
- `states.html`: every state (add errors, editing, deactivated, refusals, confirm dialogs, loading and errors, no permission, hostile and long text, narrow frame).
- `src/user-admin.css`: the CSS to append to `public/css/app.css`. No new colours or tokens.

## The one real choice: where Add user lives

**Option A (recommended): always-visible panel above the table.** Name, Username ("Leave blank to generate"), Group, Add, in one row; errors sit directly under it. One step fewer for the most common action, no hidden state to build, and errors keep what was typed without a re-open. Cost: about 130px of height above the table.

**Option B: collapsed.** A teal "Add user" button beside the h1 opens the same panel (`details`) with a Cancel button; the table is first on screen. Better when the list is long and adding is rare; costs an extra click and a focus move.

Recommendation: A. This is a small team where adding is occasional but the list is short; the form being visible also documents the username rule. Everything below applies to both.

## Page layout (top to bottom)

1. h1 "Users", then `p.error#users-error[role=alert]` and `p.notice[role=status]` (hidden until used).
2. Add user panel (`section.panel.add-user`, h2 "Add user").
3. `.list-tools`: count text (`role=status`, "4 users" or "5 users (1 deactivated)") and checkbox "Show deactivated users" (off by default).
4. Users table.
5. "What each group can do" matrix.

Non-Admin: only the error line "Your group (<group>) is not allowed to manage users." (no panel, toggle, table or matrix).

## Add user form (UI contract)

- Fields, in order: `Name` (text, maxlength 100, required), `Username` (maxlength 30, placeholder exactly `Leave blank to generate`, hint "Username: letters, digits, . _ - (1 to 30). Blank = first word of the name."), `Group` (select, preselected with the default group from the API), button `Add` (primary, `type=submit`). All labels are real `label` elements.
- Enter in any field submits. While the request runs: fields and button disabled, button text `Adding...`.
- Client check only for a blank name: show `Name is required.`, set `aria-invalid`, focus Name. All other validation is the server's text, shown verbatim in `p.error[role=alert]` under the form; the offending field gets `aria-invalid="true"` (Name for name messages, Username for username messages, otherwise none); typed values stay.
- Success: new row appears in name order, form cleared, Group reset to the default, focus returns to Name, notice `Added <name> (<username>).` (username from the response).

## Users table

Columns: `Name`, `Username` (monospace), `Group`, `Status`, and an unlabelled (visually hidden "Actions") column.

- **Normal row:** name (with a muted "(you)" after the signed-in user's name), username, Group dropdown (saves at once, as today; `Saving...` / `Saved: <group>` in `.save-status`), `Active` badge, buttons `Edit` and `Deactivate` (red text).
- **Editing row:** only that row. Name and Username become inputs (aria-labels "Name of <name>" and "Username of <name>", same maxlengths), buttons become `Save` (primary) and `Cancel`. Enter saves, Escape cancels, focus starts in Name. Only changed fields are sent. A server error appears in a row directly beneath (`tr.row-error`, `role=alert`): `Could not save <name>: <message>`; the row stays in edit mode and the field is `aria-invalid`. While saving, Save is disabled and reads `Saving...`. After save: row returns to normal, status text `Saved`. An unchanged Save just closes the editor.
- **Deactivated row** (only when "Show deactivated users" is on): `tr.is-inactive`, muted text on the page colour, badge `Deactivated` (the yellow `.badge.archived` look: the word carries the meaning, not the colour), buttons `Edit` and `Reactivate` (plain). Group dropdown stays enabled (AC 15).
- **Own row:** `Deactivate` is `disabled` and described (`aria-describedby`) by a visible hint "You cannot deactivate yourself." under the button, and the same text as `title`. The title alone is not enough on touch or keyboard.
- **Busy row:** while a request for the row runs, its buttons are disabled.
- Toggle on/off only filters the list (it refetches with `?include=inactive` when turned on). After Deactivate with the toggle off, the row disappears and the notice `Deactivated <name>.` is shown; Reactivate shows `Reactivated <name>.`.
- Empty/no result: with the toggle on and no deactivated users the table is unchanged and the count reads "N users"; no extra empty state is needed. The table is never empty for an Admin (they are in it).
- Names and usernames always set with `textContent`; names wrap (`overflow-wrap: anywhere`), the row grows, nothing is truncated.

## Confirm dialogs (`dialog.app-dialog`, band + body + foot)

| Trigger | Title (band) | Body text | Buttons (Cancel is initial focus) |
|---|---|---|---|
| Deactivate | `Deactivate user` | `Deactivate <name>? They will be signed out and cannot sign in until reactivated. Their work stays.` | `Cancel`, `Deactivate` (red text) |
| Reactivate | `Reactivate user` | `Reactivate <name>? They can sign in again. Their previous sign-ins are not restored.` | `Cancel`, `Reactivate` (primary) |
| Own group change | `Change your own group` | `You are changing your own group. Continue?` | `Cancel`, `Continue` (primary) |

Escape and Cancel close with no request; on the self-demotion dialog they also restore the dropdown. The foot `p.error[role=alert]` holds a server refusal if a dialog is kept open on failure; the spec says refusals use the page error line, so by default close the dialog and show the line (section 3 of `states.html`). Self-demotion triggers only when the changed row is the signed-in user's and the group differs; no group name is hard-coded, so it does not matter whether the new group is lower.

## Server refusals

Existing `#users-error` line, text `Could not <change <name>'s group | deactivate <name> | reactivate <name>>: <server message>`. The row is left as it was (dropdown restored). Last-Admin and self messages come from the server; the client does not pre-check the last Admin.

## Permission matrix

`section.matrix-wrap`, h2 `What each group can do`, hint "&#10003; = allowed, &mdash; = not allowed. Read only: groups are set in server/groups.js." (hint wording can be shortened). `table.projects.matrix`: first column header `Permission`, then one `th` per group in API order; one row per permission with `th[scope=row]` showing the label from the API. Cells: `&#10003;` (teal, bold) with hidden text `Allowed`, or `&mdash;` (muted) with hidden text `Not allowed`; the glyphs are `aria-hidden`. Meaning never depends on colour. No controls. If it fails to load: `Could not load the permission table: <message>` with a Retry link button; the user table keeps working. While loading: `Loading...`.

## Loading and errors

Loading the list: one table row "Loading users..." (`role=status`). Load failure: error line `Could not load users: <message>` plus Retry; table and panel stay hidden. Narrow width: below 700px the table becomes stacked cards (header hidden, each cell shows its column label from `data-label`, actions left-aligned, add form fields full width). No sideways scroll. The developer must set `data-label` on every `td` ("Name", "Username", "Group", "Status", "Actions").

## Accessibility

Visible focus is the global teal ring. Every input has a label or aria-label; icon-only controls: none. All buttons `type="button"` except Add and Save (inside forms). Errors `role=alert`, success `role=status`.

## Questions for the owner

1. The spec's own-row rule says Deactivate is disabled; the mockup adds a visible hint line, not just a `title`. OK?
2. Deactivated user shown with the yellow Archived badge colour: reuse, or a plain outlined badge to avoid implying "archived"?
3. Success notices for Deactivate/Reactivate ("Deactivated Sam.") are not in the spec; recommended, since with the toggle off the row simply vanishes. Add as AC 20 wording?
4. Spec AC 18 says the Edit control covers name and username only; Group stays an immediate dropdown even on a row being edited. Fine?
