// The shared comment/description renderer (docs/specs/attachments-and-pasted-images.md AC 33-37).
const test = require('node:test');
const assert = require('node:assert/strict');
const { REMOVED, tokenIds, segments, previewUrl, render } = require('../public/js/richText');

const token = (id) => `![image](attachment:${id})`;
// Attachment 1 and 2 are images of this work item, 3 belongs to another one,
// anything else was deleted (or never existed).
const resolve = (id) => (id === 1 || id === 2 ? 'image' : id === 3 ? 'raw' : 'removed');

test('text with no token is one text segment', () => {
  assert.deepEqual(segments('Hello\nworld', resolve), [{ type: 'text', text: 'Hello\nworld' }]);
  assert.deepEqual(segments('', resolve), []);
  assert.deepEqual(tokenIds('nothing here'), []);
});

test('one token becomes an image at its position', () => {
  assert.deepEqual(segments(`before ${token(1)} after`, resolve), [
    { type: 'text', text: 'before ' },
    { type: 'image', id: 1 },
    { type: 'text', text: ' after' },
  ]);
});

test('several and adjacent tokens', () => {
  assert.deepEqual(segments(`a${token(1)}b\n${token(2)}`, resolve), [
    { type: 'text', text: 'a' },
    { type: 'image', id: 1 },
    { type: 'text', text: 'b\n' },
    { type: 'image', id: 2 },
  ]);
  assert.deepEqual(segments(`${token(1)}${token(2)}${token(1)}`, resolve), [
    { type: 'image', id: 1 },
    { type: 'image', id: 2 },
    { type: 'image', id: 1 },
  ]);
  assert.deepEqual(tokenIds(`${token(2)} ${token(1)} ${token(2)}`), [2, 1]);
});

test('a token with a non-numeric id stays literal text', () => {
  for (const bad of ['![image](attachment:abc)', '![image](attachment:1x)', '![image](attachment:)', '![image](attachment:-1)',
    '![image](attachment:javascript:alert(1))', '![image](https://evil.example/x.png)', '![image](attachment:0)']) {
    assert.deepEqual(segments(bad, resolve), [{ type: 'text', text: bad }], bad);
  }
});

test('text containing <script> stays literal text', () => {
  const text = `<script>alert(1)</script>${token(1)}<img src=x onerror=alert(1)>`;
  assert.deepEqual(segments(text, resolve), [
    { type: 'text', text: '<script>alert(1)</script>' },
    { type: 'image', id: 1 },
    { type: 'text', text: '<img src=x onerror=alert(1)>' },
  ]);
});

test('a removed attachment shows [image removed]; another item\'s stays raw (AC 35, 37)', () => {
  assert.equal(REMOVED, '[image removed]');
  assert.deepEqual(segments(`x ${token(99)} y`, resolve), [{ type: 'text', text: 'x [image removed] y' }]);
  assert.deepEqual(segments(`x ${token(3)} y`, resolve), [{ type: 'text', text: `x ${token(3)} y` }]);
});

test('render builds text nodes and preview images, never HTML (AC 33, 35)', () => {
  // A tiny stand-in for the browser document.
  const doc = {
    createTextNode: (text) => ({ nodeType: 3, text }),
    createElement: (tag) => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } }),
  };
  const nodes = render(doc, `<b>hi</b>${token(2)}`, resolve);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[0], { nodeType: 3, text: '<b>hi</b>' });
  const [link] = nodes.slice(1);
  assert.equal(link.tag, 'a');
  assert.equal(link.attrs.href, '/api/attachments/2/preview');
  assert.equal(link.attrs.target, '_blank');
  assert.equal(link.children[0].tag, 'img');
  assert.equal(link.children[0].attrs.src, '/api/attachments/2/preview');
  assert.equal(previewUrl('7'), '/api/attachments/7/preview');
});
