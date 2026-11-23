// The Board's "Copy board" builder (docs/specs/copy-board-as-table.md; design
// docs/design/copy-board-as-table, README.md is the UI contract and
// email-preview.html the reference markup): a model of what the board draws,
// and its two clipboard flavors, an email-safe HTML table (inline styles and
// table attributes only, every user text escaped) and plain text. Loadable
// in the browser (global `boardCopy`) and from node:test (module.exports).
// No status, type, priority or group is named here: the caller passes the
// server's status list, the lanes it drew and the label functions.
// The heading's date uses the Daily Report's style (reportMath.longDay), so
// js/reportMath.js loads before this file in the browser.
const boardCopy = (() => {
  const M = typeof reportMath !== 'undefined' ? reportMath : require('./reportMath');
  const NO_MATCHES = 'No work items match the current filters.';

  const workItems = (n) => `${n} work item${n === 1 ? '' : 's'}`;

  // ---------- the model ----------

  // `input` is { project: { name, key }, sprint: { name }, now (a Date; the
  // heading shows its local day as `Mon Nov 23 2026`), groupByLabel (null when not grouped), statuses (the
  // server's order), lanes ([{ label (null when not grouped), items }], as
  // drawn on screen, items in card order), shown, total, filtersActive,
  // typeLabel(typeName), userName(assigneeId) (null when none) }.
  // Items whose status is not in the list are not drawn, so not copied.
  function buildModel(input) {
    const statuses = input.statuses || [];
    const card = (item) => {
      const name = item.assignee_id === null || item.assignee_id === undefined ? null : input.userName(item.assignee_id);
      return {
        key: item.key,
        title: item.title,
        meta: [input.typeLabel(item.type), item.priority, name || 'Unassigned'].join(', '),
      };
    };
    const empty = Boolean(input.filtersActive) && input.shown === 0;
    const lanes = empty
      ? []
      : (input.lanes || []).map((lane) => {
          const cells = statuses.map((s) => lane.items.filter((i) => i.status === s).map(card));
          return { label: lane.label, count: cells.reduce((n, c) => n + c.length, 0), cells };
        });
    const columns = statuses.map((name, index) => ({ name, count: lanes.reduce((n, lane) => n + lane.cells[index].length, 0) }));
    const lines = [];
    if (input.groupByLabel) lines.push(`Grouped by ${input.groupByLabel}`);
    if (input.filtersActive) lines.push(`Filtered: showing ${input.shown} of ${input.total} work items`);
    return {
      title: `Board: ${input.project.name} (${input.project.key}), ${input.sprint.name}, ${M.longDay(M.localToday(input.now || new Date()))}`,
      lines,
      columns,
      lanes,
      empty,
      emptyText: empty ? NO_MATCHES : null,
    };
  }

  // ---------- plain text ----------

  // Heading lines; per lane its `Label (N work items)` (when grouped), then
  // per status `Status (count)` and `- KEY Title (meta)` lines or `None`.
  function toPlainText(model) {
    const lines = [model.title, ...model.lines];
    if (model.empty) {
      lines.push('', model.emptyText);
      return lines.join('\n');
    }
    for (const lane of model.lanes) {
      lines.push('');
      if (lane.label !== null && lane.label !== undefined) lines.push(`${lane.label} (${workItems(lane.count)})`);
      model.columns.forEach((column, index) => {
        const cards = lane.cells[index];
        lines.push(`${column.name} (${cards.length})`);
        if (!cards.length) lines.push('None');
        for (const c of cards) lines.push(`- ${c.key} ${c.title} (${c.meta})`);
      });
    }
    return lines.join('\n');
  }

  // ---------- HTML ----------

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Inline styles of the HTML flavor (design email-preview.html). Colours
  // are the Report email's: no CSS variables, no flex or grid.
  const FONT = 'font-family:Calibri,Arial,sans-serif;';
  const STYLE = {
    wrap: `${FONT}font-size:14px;color:#000000;`,
    h1: `${FONT}font-size:18px;font-weight:bold;color:#000000;margin:0 0 4px 0;`,
    line: `${FONT}font-size:13px;color:#62666a;margin:0 0 2px 0;`,
    table: `${FONT}width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid #8d9499;margin:10px 0 0 0;`,
    th: (w) => `${FONT}width:${w}%;background-color:#e5eded;color:#0b5d66;font-size:13px;font-weight:bold;text-align:left;padding:6px 8px;border:1px solid #8d9499;`,
    lane: `${FONT}background-color:#154973;color:#ffffff;font-size:13px;font-weight:bold;padding:6px 8px;border:1px solid #154973;`,
    td: `${FONT}background-color:#f8fafa;padding:6px;border:1px solid #8d9499;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;`,
    stack: 'width:100%;table-layout:fixed;border-collapse:separate;border:0;',
    card: `${FONT}background-color:#ffffff;border:1px solid #8d9499;padding:5px 6px;font-size:13px;color:#000000;word-wrap:break-word;overflow-wrap:break-word;`,
    spacer: 'height:10px;line-height:10px;font-size:10px;border:0;padding:0;',
    meta: `${FONT}font-size:12px;color:#62666a;margin:2px 0 0 0;`,
    normal: 'font-weight:normal;',
    empty: `${FONT}font-size:14px;color:#000000;margin:8px 0 0 0;`,
  };

  // One <table>: a header row (status and count), then per lane an optional
  // full-width heading row and one row of status cells. Empty cells hold
  // &nbsp; so every row has a cell per status.
  function toHtml(model) {
    const n = model.columns.length;
    const width = n ? Math.floor(100 / n) : 100;
    const out = [`<div style="${STYLE.wrap}">`, `<h1 style="${STYLE.h1}">${escapeHtml(model.title)}</h1>`];
    for (const line of model.lines) out.push(`<p style="${STYLE.line}">${escapeHtml(line)}</p>`);
    out.push(`<table border="1" cellpadding="0" cellspacing="0" width="100%" bordercolor="#8d9499" style="${STYLE.table}">`, '<tr>');
    for (const c of model.columns) {
      out.push(
        `<th width="${width}%" align="left" valign="top" bgcolor="#e5eded" style="${STYLE.th(width)}">${escapeHtml(c.name)} <span style="${STYLE.normal}">(${c.count})</span></th>`
      );
    }
    out.push('</tr>');
    // Mail clients (Outlook, dark-mode webmail) drop the border, background
    // and margin of a styled <div>, so cards ran together. Each status cell
    // holds one nested table instead: a bordered one-cell row per card and a
    // fixed-height spacer row between cards.
    const cardRow = (c) =>
      `<tr><td bgcolor="#ffffff" style="${STYLE.card}"><b>${escapeHtml(c.key)}</b> ${escapeHtml(c.title)}<div style="${STYLE.meta}">${escapeHtml(c.meta)}</div></td></tr>`;
    const spacerRow = `<tr><td height="10" style="${STYLE.spacer}">&nbsp;</td></tr>`;
    const cardsHtml = (cards) =>
      `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="${STYLE.stack}">${cards.map(cardRow).join(spacerRow)}</table>`;
    for (const lane of model.lanes) {
      if (lane.label !== null && lane.label !== undefined) {
        out.push(
          `<tr><td colspan="${n}" bgcolor="#154973" style="${STYLE.lane}">${escapeHtml(lane.label)} <span style="${STYLE.normal}">- ${workItems(lane.count)}</span></td></tr>`
        );
      }
      out.push('<tr>');
      for (const cards of lane.cells) {
        out.push(`<td valign="top" bgcolor="#f8fafa" style="${STYLE.td}">${cards.length ? cardsHtml(cards) : '&nbsp;'}</td>`);
      }
      out.push('</tr>');
    }
    out.push('</table>');
    if (model.empty) out.push(`<p style="${STYLE.empty}">${escapeHtml(model.emptyText)}</p>`);
    out.push('</div>');
    return out.join('\n');
  }

  return { NO_MATCHES, workItems, buildModel, toPlainText, escapeHtml, toHtml };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = boardCopy;
