// The one renderer for comment bodies and work item descriptions: plain text
// in which the image token `![image](attachment:<id>)` (written when an image
// is pasted) becomes an inline image. Tokens are the only markup: everything
// else stays literal text and is never parsed as HTML. Loadable in the
// browser (global `richText`) and from node:test (module.exports).
const richText = (() => {
  // Only a numeric id makes a token; anything else stays literal text.
  const TOKEN = /!\[image\]\(attachment:(\d{1,15})\)/g;
  const REMOVED = '[image removed]';

  const validId = (id) => Number.isSafeInteger(id) && id > 0;

  // The attachment ids referenced by tokens in `text`, in order, once each.
  function tokenIds(text) {
    const ids = [];
    for (const m of String(text || '').matchAll(TOKEN)) {
      const id = Number(m[1]);
      if (validId(id) && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  // Splits `text` into [{ type: 'text', text }, { type: 'image', id }].
  // resolve(id) says what a token becomes: 'image' (an inline image of this
  // work item), 'removed' (the literal text `[image removed]`) or anything
  // else (the token's own text, unchanged). Adjacent text is merged.
  function segments(text, resolve) {
    const out = [];
    const pushText = (t) => {
      if (!t) return;
      const last = out[out.length - 1];
      if (last && last.type === 'text') last.text += t;
      else out.push({ type: 'text', text: t });
    };
    const source = String(text || '');
    let at = 0;
    for (const m of source.matchAll(TOKEN)) {
      pushText(source.slice(at, m.index));
      at = m.index + m[0].length;
      const id = Number(m[1]);
      const kind = validId(id) ? resolve(id) : 'raw';
      if (kind === 'image') out.push({ type: 'image', id });
      else pushText(kind === 'removed' ? REMOVED : m[0]);
    }
    pushText(source.slice(at));
    return out;
  }

  // Always built here from the numeric id, so a token can never point an
  // image at an arbitrary URL.
  const previewUrl = (id) => `/api/attachments/${Number(id)}/preview`;

  // DOM nodes for `text` (see segments), created with `doc` (the page's
  // document): text nodes for text, and for each image a link that opens the
  // full image in a new tab around an <img class="inline-image">.
  function render(doc, text, resolve) {
    return segments(text, resolve).map((s) => {
      if (s.type === 'text') return doc.createTextNode(s.text);
      const link = doc.createElement('a');
      link.setAttribute('href', previewUrl(s.id));
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
      link.className = 'inline-image-link';
      const img = doc.createElement('img');
      img.setAttribute('src', previewUrl(s.id));
      img.setAttribute('alt', 'Pasted image');
      img.className = 'inline-image';
      link.appendChild(img);
      return link;
    });
  }

  return { REMOVED, tokenIds, segments, previewUrl, render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = richText;
