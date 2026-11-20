# Daily report: design

Spec: `docs/specs/daily-report.md`. One design is offered (the spec is small and the owner asked for a single recommendation). CSS: the "NEW: Daily report" block of `src/report.css` (append to `public/css/app.css`; everything above it is a mockup copy of the existing base). No new tokens.

Mockups (open from disk):
- `main.html`: loaded report for project 3, with the "Copied" message. Yesterday is illustrative (see note below).
- `empty-yesterday.html`: the real state of project 3 today (no activity on Thu Nov 19).
- `email-preview.html`: the copied output: rendered HTML flavor, its source, and the plain-text flavor.
- `states.html`: copy failure, other date (Monday look-back, "as of now" notes), archived/Viewer, section load error, no active sprint, long and hostile text, loading and project states.

## Recommended design (the only one)

A single column, 860px max, under the standard shell (top bar, project dropdown, `.subnav` with Report after Timeline and before Test Cases). A white controls panel sits above one white report panel. The report panel is what gets copied: it looks like the email on purpose, so there are no surprises when pasting. Keys, titles and status are plain rows; Yesterday rows put the activity summary on a second line so long titles never push it off screen. Why: it reuses `.panel`, `.subnav`, `.badge`/pill, `.banner-warn`, `.n` and the Timeline page head, adds about 40 lines of CSS and needs no layout logic. Rejected: a three-column board-like layout (too wide for 13 items with long titles, and it breaks "paste what you see") and tabs for the sections (hides content that is going into the email).

## UI contract (what the developer builds, what QA checks)

**Page head.** `h1` "Report"; the existing `.badge.archived` "Archived (read-only)" only for archived projects. Sub-nav link "Report" (`id="nav-report"`, `aria-current="page"` here) on every project page.

**Controls panel** (`form.panel.report-controls`, submit prevented, nothing submits):
- `label` "Person" + `select#rp-person` (active users, signed-in user selected).
- `label` "Date" + `input type="date"#rp-date` (today, local), then `button type="button"` "Today" beside it.
- `button type="button".navy#rp-copy` "Copy for email", right-aligned. Focus stays on it after copying.
- `p.copy-status` on its own line under the controls, empty at rest. Success: `role="status"`, class `ok`, text "Copied. Paste into your email." with a leading check mark, cleared after about 4 seconds. Failure: `role="alert"`, class `fail`, text "Could not copy. Select the report and copy it by hand." (stays until the next copy or change).
- Controls are never disabled, including for Viewers and archived projects.

**Report panel** (`article.panel.report`, the element selected for the `execCommand` fallback):
- Title line `p.report-title` (not a heading, so the sections are the only `h2`s): "Daily report: EFS Automation, Robert Michaels, Fri Nov 20 2026" (person shown as the user's display name, same as the Person dropdown; the spec's example says "Robert", this follows the stored name; weekday and date as `Fri Nov 20 2026`).
- Three `section`s with `h2`, in order Yesterday, Today, Waiting. Rows are real `ul.rows > li`.
- **Yesterday** heading: `Yesterday` + `.h-note` "(Thu Nov 19)". Rows: `a.r-key` (mono, bold, opens the item like the Board), `.r-title`, then `.r-sum` summary line such as `Internal Testing -> Complete (Done); logged 2h`. Epics get `.epic-chip` "Epic" before the title. Below the list `p.total-line` "Total time logged: 3h" (always, "0h" when none). Empty: `p.empty-line` "No recorded activity on Thu Nov 19." plus the 0h total.
- **Today** heading `Today`; with `.h-note` "(current status as of now)" only when the date is not today. Rows: key, title, `.r-meta` with `.status-pill`, `.priority` and "remaining 4h" only when an estimate exists. Empty: "Nothing in progress."
- **Waiting** heading and note as Today. First `p.sprint-line` (white, 4px teal left edge) "EFS - File a disclosure report: 3 of 10 complete, ends Nov 27" (variants: "no end date", "no items"); omitted when there is no active sprint. Then two `h3` sub-headings each with a `.n` count: "In the active sprint" and "Backlog and other sprints". Rows show key, title, status pill, priority, assignee ("Unassigned" when none). Empty sub-list: "None."; no active sprint: "No active sprint." under the first sub-heading.
- Sections load independently: if the Yesterday request fails, show `.banner-warn[role="alert"]` "Could not load the report." with a Retry link button inside Yesterday only; Today and Waiting still render.
- Loading: `p.hint[role="status"]` "Loading...". Missing project and no active projects use the existing `.empty` messages.

**Copied output** (see `email-preview.html`). HTML flavor: one wrapper `div` with inline `font-family:Calibri,Arial,sans-serif;font-size:14px`; title as `h1` 18px bold black; section headings `h2` 16px bold `#0b5d66`; sub-headings 14px bold `#154973`; bulleted `ul`/`li` with inline margins; item key in `<b>`, not a link; "Total time logged" in `<b>`. No `class`, no `<style>`, no images, no controls or chrome. All text escaped. Row text: Yesterday `KEY Title: summary`; Today and Waiting `KEY Title - Status, Priority, remaining Xh` / `..., Assignee`. Plain-text flavor: same lines, headings as plain lines, `- ` bullets, `->` arrows (also in the preview).

**Do/Don't for QA.** Set all user text with `textContent`/escape (state F in `states.html`). Sections must not be omitted when empty. Visible focus on every control (existing ring). Layout must not scroll sideways at 360px width (state: controls stack, long titles wrap).

## Notes and questions

- Yesterday on the main mockup is illustrative; the real project 3 shows `empty-yesterday.html` today, matching AC 9.
- Keys are links on screen (AC 8) but plain bold text in the email. This is a deliberate refinement of AC 19-20 (a localhost link is dead for the reader). If the owner wants links in the email, it needs a configured base URL; not designed.
- No Today/Waiting loading error state beyond the shared page error is designed, since both reuse data the other pages already load.
