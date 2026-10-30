'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderBrochure, encode, wrap } = require('../../scripts/build-brochure');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'brochure.json'), 'utf8'));

test('renders a structurally valid PDF with correct cross-reference offsets', () => {
  const pdf = renderBrochure(CONTENT);
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.endsWith('%%EOF\n'));
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const entries = text.slice(startxref).match(/^\d{10} 00000 n $/gm);
  entries.forEach((entry, i) => {
    const offset = Number(entry.slice(0, 10));
    assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1}`);
  });
  assert.ok((text.match(/\/Type \/Page /g) || []).length >= 1);
});

test('includes every programme and the fee, duration, semester, grading and date fields', () => {
  const text = renderBrochure(CONTENT).toString('latin1');
  for (const p of CONTENT.programmes) assert.ok(text.includes(`(${encode(p.name)})`), p.name);
  for (const field of ['Course duration', 'Number of semesters', 'Total course fee', 'Last date of application', 'Grading scheme', 'Important dates']) {
    assert.ok(text.includes(`(${field})`), field);
  }
  assert.match(text, /PLACEHOLDER BROCHURE/);
});

test('escapes PDF string syntax and maps typographic characters', () => {
  assert.equal(encode('Fee (per year) \\ total'), 'Fee \\(per year\\) \\\\ total');
  assert.equal(encode('A — B'), 'A \\227 B');
  assert.equal(encode('₹50'), 'Rs.50');
  assert.equal(encode('日本'), '??', 'characters the font cannot show become ?');
  assert.deepEqual(wrap('one two three four five six', 11, 60), ['one two', 'three four', 'five six']);
});

test('long content flows onto more pages', () => {
  const long = { ...CONTENT, programmes: Array.from({ length: 8 }, (_, i) => ({ ...CONTENT.programmes[0], name: `Programme ${i + 1}` })) };
  const text = renderBrochure(long).toString('latin1');
  assert.ok((text.match(/\/Type \/Page /g) || []).length >= 3);
  assert.match(text, /Page 1 of \d/);
});

test('public/brochure.pdf is up to date with content/brochure.json (run "npm run build-brochure")', () => {
  assert.deepEqual(fs.readFileSync(path.join(ROOT, 'public', 'brochure.pdf')), renderBrochure(CONTENT));
});
