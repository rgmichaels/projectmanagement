// The single list of file types that may be attached to a work item (files
// and pasted images alike), plus the size and per-item limits. Each entry is
// { extension, mime, inline, signature }:
//   extension - lower-case, without the dot; decides whether a file is allowed
//   mime      - the type stored and served (the browser's Content-Type is ignored)
//   inline    - may be previewed in the browser and shown inline in text
//   signature - for inline types only: the leading bytes the file must start
//               with, as alternatives of { offset, hex } parts (all must match)
// SVG, HTML, JavaScript and executables are deliberately absent. To allow a
// new type, add an entry here and restart; the API and the board pick it up.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_ATTACHMENTS_PER_ITEM = 25;

const PNG = [[{ offset: 0, hex: '89504e470d0a1a0a' }]];
const JPEG = [[{ offset: 0, hex: 'ffd8ff' }]];
const GIF = [[{ offset: 0, hex: '474946383761' }], [{ offset: 0, hex: '474946383961' }]]; // GIF87a, GIF89a
const WEBP = [[{ offset: 0, hex: '52494646' }, { offset: 8, hex: '57454250' }]]; // RIFF....WEBP

const ATTACHMENT_TYPES = [
  { extension: 'png', mime: 'image/png', inline: true, signature: PNG },
  { extension: 'jpg', mime: 'image/jpeg', inline: true, signature: JPEG },
  { extension: 'jpeg', mime: 'image/jpeg', inline: true, signature: JPEG },
  { extension: 'gif', mime: 'image/gif', inline: true, signature: GIF },
  { extension: 'webp', mime: 'image/webp', inline: true, signature: WEBP },
  { extension: 'pdf', mime: 'application/pdf', inline: false },
  { extension: 'txt', mime: 'text/plain', inline: false },
  { extension: 'md', mime: 'text/markdown', inline: false },
  { extension: 'csv', mime: 'text/csv', inline: false },
  { extension: 'log', mime: 'text/plain', inline: false },
  { extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
  { extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false },
  { extension: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false },
  { extension: 'zip', mime: 'application/zip', inline: false },
];

// The entry for a file name, by its last extension (case-insensitive), or
// undefined when the type is not allowed.
function typeForFilename(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return undefined;
  const ext = filename.slice(dot + 1).toLowerCase();
  return ATTACHMENT_TYPES.find((t) => t.extension === ext);
}

// Whether stored files of this MIME type may be previewed inline.
function isInlineMime(mime) {
  return ATTACHMENT_TYPES.some((t) => t.mime === mime && t.inline);
}

// The number of leading bytes needed to check a type's signature (0 if none).
function signatureLength(type) {
  if (!type.signature) return 0;
  return Math.max(...type.signature.flat().map((p) => p.offset + p.hex.length / 2));
}

// Whether `buf` (the file's first bytes) matches the type's signature. Types
// without a signature always match.
function matchesSignature(type, buf) {
  if (!type.signature) return true;
  return type.signature.some((parts) =>
    parts.every((p) => {
      const want = Buffer.from(p.hex, 'hex');
      return buf.length >= p.offset + want.length && buf.subarray(p.offset, p.offset + want.length).equals(want);
    })
  );
}

// The public shape for GET /api/attachment-types.
function publicTypes() {
  return {
    types: ATTACHMENT_TYPES.map(({ extension, mime, inline }) => ({ extension, mime, inline })),
    max_bytes: MAX_FILE_BYTES,
    max_per_item: MAX_ATTACHMENTS_PER_ITEM,
  };
}

module.exports = {
  ATTACHMENT_TYPES,
  MAX_FILE_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  typeForFilename,
  isInlineMime,
  signatureLength,
  matchesSignature,
  publicTypes,
};
