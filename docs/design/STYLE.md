# Style guide

Part 1 records what `public/css/app.css` already does. Part 2 lists only the new tokens and components the recommended work item dialog (task-modal-v2, option A) needs.

## 1. Current styles (as built)

**Palette (`:root` variables).** `--bg #f4f5f7` page, `--surface #fff`, `--column #ebecf0` (board columns, badges), `--border #dfe1e6`, `--text #172b4d`, `--muted #5e6c84`, `--primary #0052cc` (topbar, primary button, links, tabs), `--danger #de350b`, `--neutral #8993a4` (fallback type and unassigned colour). Other fixed colours: epic chip `#eae6ff` / `#403294` (hover `#c0b6f2`), archived badge `#fff0b3`, notice `#deebff` with `#4c9aff` border, error message `#ffebe6`, progress fill `#36b37e`. Type colours come from the server (`server/types.js`): Defect `#e5493a`, Task `#4bade8`, Issue `#f5a623`, Epic `#904ee2`.

**Type.** System stack `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`, 14px base. h1 20px, h2 16px, section h3 14px, labels 12px muted, hints 12px, badges 11px uppercase 600, card meta 12px.

**Spacing and shape.** Page padding 20px; panels 16px padding, 4px radius, 1px `--border`; controls 6px 8px padding, 3px radius; form rows are flex with 12px gap; dialog 560px wide (95vw max), 20px padding, 4px radius, shadow `0 8px 24px rgba(9,30,66,.3)`. Sections in the dialog are separated by a 1px top border with 10px padding.

**Components.**
- Buttons: white with 1px border, 3px radius, 6px 12px; `.primary` filled blue, `.danger` red text, `.link` blue text-only 12px. Hidden state via `[hidden]`.
- Fields: stacked `label` (12px muted) above the input or select.
- Badges: `.badge`, `.badge.archived`; `.type-badge` (coloured), `.resolution-label`, `.priority` (outlined), `.avatar` (24px circle, initials), `.epic-chip`.
- Card: white, 4px left border in the type colour, light shadow.
- Dialog sections: Discussion (thread, composer), tabs (`.tabs` / `.tab`, active = blue with 2px underline), History list, Links, Attachments, Epic view (progress bar 8px), image strip.
- Messages: `.error` red line with `role="alert"`; `.message` red box; `.notice` blue box; `.empty` dashed box; `.hint` / `.thread-empty` muted lines.
- Read-only: controls `disabled`; Add/Remove/Post buttons hidden; archived shown with an Archived badge.
- Focus: browser default only. No custom ring.

## 2. New in task-modal-v2 (recommended option A)

**Scope.** The palette below comes from the owner's reference site (palette and feel only: no logo, seal, branding, wording or layout; the app must not look like an official site). It is dialog-scoped: add the tokens under a `dialog` or `.detail` selector, not `:root`, until the owner decides to apply it app-wide (open question 6).

**New tokens.** `--teal #0b5d66` (band, headings, primary button, selected tab, progress, current step), `--teal-mid #65999e` (borders and hover only), `--teal-soft #e5eded` (rail, finished steps, read-only fields, banner), `--page #f8fafa` (dialog background), `--navy #154973` (input borders, action and secondary buttons), `--linkblue #004dd1` (inline links), `--gold #face00` (only on dark teal), `--ink #000`, `--muted #62666a`, `--line #d0d0ce`, `--line2 #e4e4e4`, `--danger #c0300b` (dialog text; the app's `#de350b` is 4.34:1 on `#f8fafa`), `--mono ui-monospace, "SF Mono", Menlo, Consolas, monospace`. Font stack for the dialog: `"Proxima Nova", "Helvetica Neue", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (the brand fonts are licensed; they apply only if installed). Headings, labels, tabs, buttons and the title are weight 700, body 400. Sizes are unchanged.

**New components.**
- Top band (`.band`): dark teal, white bold title (20 to 22px), key chip and epic link; gold 2px focus ring inside it.
- Key chip (`.keychip`): white, black mono 12px/600, type-coloured dot.
- Epic link in the band (`.epicchip`): gold, uppercase, bold 12px, underlined, trailing arrow.
- Status track (`fieldset.track > .steps > label.step`): equal steps, radio inside, `.past` pale teal, `.now` solid teal with white text and a dot, `.locked` when read-only. Use for Status only.
- Dark summary panel (`.darkpanel`): teal, 16px radius, 1px mid-teal border, bold white heading, gold progress fill. Use for the epic progress summary only.
- Details rail (`aside.rail`): 260px, pale teal, left border, label/select stacks, collapsed `details.acc` cards with a count pill.
- Count pill (`.n`): 11px, `--line2` background, black text.
- Navy button (`button.navy`): navy fill, white bold text; for Post, Add, Add link, Add files. Secondary buttons are white with a navy border and navy text; Save is `.primary` deep teal.
- Read-only banner (`.banner`): pale teal, mid-teal border, `role="status"`. Read-only fields keep black text on pale teal.
- Focus ring: `:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px }` (gold on the band).

**Contrast.** Every text/background pair was checked against WCAG AA; the list is in `docs/design/task-modal-v2/README.md`.

**Do.** Use gold only on dark teal. Use `#65999e` only for borders and hover. Use link blue only for inline links. Show counts on every secondary section. Write empty states that say what to do. Insert user text with `textContent`.

**Don't.** Don't use gold or `#65999e` as text on light backgrounds. Don't tint the dialog by type. Don't add a logo, seal, nav bar or official-site wording. Don't use external fonts or icons.
