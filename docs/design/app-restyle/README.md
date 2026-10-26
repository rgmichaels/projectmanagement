# App restyle: make every screen match the work item dialog

Owner request: "Can the rest of the app be styled like the popup?" Yes. The dialog palette is promoted from `dialog#detail` to `:root`, so the shared rules in `app.css` pick it up and most screens change by editing variables, not markup. No HTML structure changes, no new JS. The dialog and its chevron status track stay exactly as built.

Mockups open from disk (`src/` holds the shared CSS and page fragments they were assembled from; not needed by the developer):

| Screen | Option A | Option B |
|---|---|---|
| Board (toolbar, filters, columns, cards, lane, drop indicator, 4 types, long and hostile text) | `a-teal-chrome-board.html` | `b-light-chrome-board.html` |
| Projects list (create panel with error, rows, archived row, empty state) | `a-teal-chrome-projects.html` | `b-light-chrome-projects.html` |
| Sign-in | `a-teal-chrome-login.html` | `b-light-chrome-login.html` |
| Users admin | `a-teal-chrome-users.html` | `b-light-chrome-users.html` |

## Options

**a-teal-chrome (recommended).** Solid dark teal top bar with white bold brand and a white-outlined Sign out button; page `#f8fafa`; board columns are pale teal `#e5eded` rounded 8px under teal uppercase column headers with a mid-teal rule; cards stay white with the type-colour left border. Sign-in card gets a teal title band like the dialog. This is the closest echo of the dialog band, so opening a work item feels like the same product.

**b-light-chrome.** White top bar with teal brand and a 3px teal bottom border; columns are white bordered boxes with a pale-teal header pill. Teal appears only as an accent. Quieter and more "document-like", and cards stand out less against white columns, but the dialog band becomes the only large teal surface, so it still looks a little foreign.

**Recommendation: A.** The owner's complaint is the clash between a bright blue bar and a teal dialog; A removes it most directly. Pale-teal columns give cards clear contrast (white on `#e5eded`), which B loses. B is the fallback if A feels heavy.

Common to both: same tokens, buttons, fields, tables, badges, cards, focus.

## UI contract (applies to the chosen option; A unless noted)

### Global (`public/css/app.css`)
1. Move the dialog tokens to `:root`: `--teal --teal-mid --teal-soft --page --navy --linkblue --gold --ink --muted:#62666a --line --line2 --danger:#c0300b --mono`. Re-point legacy names: `--bg:var(--page) --surface:#fff --column:var(--teal-soft) --border:var(--line) --text:var(--ink) --primary:var(--teal) --neutral:#62666a`. The `dialog#detail` block then no longer needs its own copy or its "re-pointed" variables (keep rules that are dialog-specific). Result: the old blues are gone everywhere.
2. Font stack becomes the dialog stack (Proxima Nova if installed, otherwise system). Body 14px, unchanged sizes.
3. h1 teal bold 20px; h2 teal bold 16px. Labels bold `--ink` 12px (as in the dialog). Links `--linkblue`.
4. Buttons: white, 1px navy border, navy bold text, 4px radius. `.primary` teal fill; `.navy` navy fill (new global); `.danger` red text with `--line` border; `.link` as in dialog. Disabled: opacity .6.
5. Inputs, selects, textareas: 1px navy border, 4px radius, white.
6. Focus: `:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px }` everywhere; gold inside the top bar (option A) and the dialog band.
7. Panels: white, 1px `--line`, radius 8px. `.empty`: dashed `--teal-mid` border, radius 8px. Error text `--danger`. `.message`: white, 1px danger border, 4px left border, bold danger text. `.notice`: `--teal-soft` with `--teal-mid` border (replaces the pale blue).
8. `.badge`: pill (10px radius), `--teal-soft` bg, 1px `--teal-mid` border, black 11px bold uppercase. `.badge.archived`: `#fff0b3` with `#c9a800` border.
9. Dialogs in general: any `<dialog>` (project create/edit if it becomes one) uses the same shell as `#detail`: 8px radius, `--page` background, teal band header with white bold title, footer with 1px `--line` rule and buttons right-aligned (Cancel secondary, action `.primary`). Today project create is an inline `.panel` form; restyle it as above and keep it inline.

### Top bar (all pages)
- A: background `--teal`, 10px 20px padding, brand white 700 15px, crumb `#cfe3e5`, Users link white bold underlined, session name white, Sign out transparent with 1px white border and white text (hover: white fill, teal text). Gold focus ring.
- B: white background, 3px teal bottom border, brand teal, Users link `--linkblue`, default button style.
- Same markup as today; no logo, no extra nav.

### Sign-in (`login.html`)
- `.login` panel 420px, white, radius 8. A: the `h1` becomes the teal band (white 22px bold, padded 14px 24px, negative margins to fill the panel top). B: plain teal h1.
- User options: rows with 8px padding, radius 4, hover `--teal-soft`; username muted 12px. Radios keep native look, focus ring visible. Sign in `.primary`, disabled until a user is chosen. Hint text `--muted` 12px stays.

### Projects list (`index.html`)
- Toolbar: h1 left, Show archived toggle, Create project `.primary` (hidden without permission, as today).
- Create panel: white panel, labels bold, error line below fields, Create `.primary` + Cancel.
- Table: white, 1px `--line` border, radius 8, overflow hidden. Header row `--teal-soft` background, teal bold 12px text, 1px `--teal-mid` bottom border. Rows 9px 12px padding, `--line2` separators, hover `--page`. Archived rows muted text on `--page` plus Archived badge. Row action buttons use the standard secondary style, 6px apart.
- Empty state per item 7.

### Board (`board.html`)
- Toolbar: h1, status badge, Archived badge, Group by (right), Create work item `.primary`.
- Filter bar becomes one white card (1px `--line`, radius 8, 8px 12px padding) holding Search, Assignee, Type, Priority, Status, Resolution, Clear, count. Labels bold 13px. Clear disabled at 0.6 opacity. Count `--muted`, `aria-live` kept.
- Column header: uppercase 12px bold teal, count muted. A: transparent with a 2px `--teal-mid` bottom rule over the column; B: `--teal-soft` rounded pill.
- Column body: A `--teal-soft`, radius 8; B white with 1px `--line`, radius 8. Gap 6px, padding 6px.
- Lane header: teal bold, count muted; caret and `aria-expanded` unchanged.
- Card: white, 1px `--line` border, 4px left border in the type colour (unchanged), radius 4, shadow `0 1px 2px rgba(9,30,40,.12)`, hover border `--teal-mid`. Key is mono 12px bold black. Meta text `--muted`.
- Type badge: white chip with 1px `--line` border, black 11px text and a 8px type-colour dot (replaces white text on the type colour, which fails contrast for Task `#4bade8`, Issue `#f5a623`). Matches the dialog key chip.
- Epic chip keeps `#eae6ff` / `#403294`, bold. Resolution label white on `#2f6b3f` (or the server colour if it passes 4.5:1; otherwise fall back). Priority outlined `--line`. Avatar teal circle with white initials; unassigned `--muted`.
- Drop indicator: 4px `--navy`. Dragging card opacity .4 (unchanged).
- Notice (filter restored) and message (error) per item 7.

### Users admin (`users.html`)
- Same top bar, h1, table as the Projects list. Group select standard. "Saved" status text `--muted`; errors `--danger`.

### Epic view, tabs, work item dialog
- No change. The Children tab and dark summary panel already use these tokens; they now sit on a matching page.

### Accessibility checks (WCAG AA, computed)
- White on teal `#0b5d66` 7.6:1. Teal on `--teal-soft` 6.4:1. `--muted` `#62666a` on white 5.9:1, on `--page` 5.6:1, on `--teal-soft` 4.9:1. Danger `#c0300b` on white 5.9:1. Link blue on white 7.4:1.
- Gold is only a focus ring on dark teal. `--teal-mid` is only a border or rule.
- Not met today and fixed here: white text on type colours (see type badge), `--neutral #8993a4` as avatar background (now `#62666a`).
- All interactive elements keep visible focus; no colour-only meaning (type is also text, archived is also a badge).

### QA checklist
Top bar is not `#0052cc` on any page; computed `--primary` is `#0b5d66`; tab through each page and see the focus ring; board cards show black type text with a coloured dot; table header is pale teal; sign-in works unchanged; dialog looks identical to before; mobile width 375px has no horizontal page scroll except the board's own scroller.

## Open questions for the owner
1. A (teal bar) or B (white bar)?
2. Should the type badge lose its solid colour fill? It fixes contrast and matches the dialog, but the board gets less colourful (the 4px card edge still carries the type).
3. Is it fine for the whole app to use the Proxima Nova font stack (falls back to system fonts when not installed)?
4. Project edit: there is no edit control in the current HTML. The mockup shows Edit/Archive row buttons only as a style example; confirm whether an edit dialog is wanted (separate spec).
5. Resolution label colours come from the server; some may fail contrast. Should the developer darken them?
