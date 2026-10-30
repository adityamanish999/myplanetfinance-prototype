'use strict';

/*
 * Builds the programme brochure PDF from content/brochure.json.
 *
 *   npm run build-brochure        → writes public/brochure.pdf
 *
 * A small PDF writer with no dependencies: A4 pages, the built-in Helvetica
 * fonts, headings, paragraphs and two-column tables, with automatic page breaks.
 * Edit content/brochure.json (fees, duration, semesters, grading, dates) and run it again.
 */
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = path.join(__dirname, '..', 'content', 'brochure.json');
const OUTPUT = path.join(__dirname, '..', 'public', 'brochure.pdf');

const PAGE = { width: 595, height: 842, margin: 50 };
const COLORS = { brand: [0.043, 0.373, 0.647], ink: [0.06, 0.106, 0.176], muted: [0.32, 0.38, 0.46], rule: [0.86, 0.89, 0.93], notice: [1, 0.957, 0.839] };
// Characters outside Latin-1 that have a WinAnsi code; anything else becomes "?".
const WIN_ANSI = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function encode(text) {
  let out = '';
  for (const ch of String(text).replace(/₹/g, 'Rs.')) {
    let code = ch.codePointAt(0);
    if (code > 255) code = WIN_ANSI[ch] || 0x3f;
    if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(code);
  }
  return out;
}

/** Approximate Helvetica text width (good enough for wrapping). */
function textWidth(text, size, bold) {
  let units = 0;
  for (const ch of text) {
    if (' il.,:;|!\'[]()'.includes(ch)) units += 0.28;
    else if ('mwMW@'.includes(ch)) units += 0.85;
    else if (ch >= 'A' && ch <= 'Z') units += 0.67;
    else units += 0.54;
  }
  return units * size * (bold ? 1.06 : 1);
}

function wrap(text, size, width, bold) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function rgb([r, g, b], op) {
  return `${r} ${g} ${b} ${op}`;
}

function createDocument() {
  const pages = [];
  let ops;
  let y;

  function newPage() {
    ops = [];
    pages.push(ops);
    y = PAGE.height - PAGE.margin;
  }

  function ensure(height) {
    if (y - height < PAGE.margin + 20) newPage();
  }

  function text(str, x, baseline, { size = 11, bold = false, color = COLORS.ink } = {}) {
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color, 'rg')} ${x} ${baseline} Td (${encode(str)}) Tj ET`);
  }

  function rect(x, top, w, h, color) {
    ops.push(`${rgb(color, 'rg')} ${x} ${top - h} ${w} ${h} re f`);
  }

  newPage();
  const contentWidth = PAGE.width - PAGE.margin * 2;

  return {
    banner(title, subtitle) {
      rect(0, PAGE.height, PAGE.width, 120, COLORS.brand);
      text(title, PAGE.margin, PAGE.height - 62, { size: 28, bold: true, color: [1, 1, 1] });
      text(subtitle, PAGE.margin, PAGE.height - 92, { size: 12, color: [1, 1, 1] });
      y = PAGE.height - 150;
    },
    notice(str) {
      const lines = wrap(str, 10, contentWidth - 24, true);
      const h = lines.length * 14 + 16;
      ensure(h);
      rect(PAGE.margin, y, contentWidth, h, COLORS.notice);
      lines.forEach((line, i) => text(line, PAGE.margin + 12, y - 20 - i * 14, { size: 10, bold: true, color: [0.36, 0.24, 0] }));
      y -= h + 18;
    },
    heading(str) {
      ensure(80); // keep the heading with at least its first row
      text(str, PAGE.margin, y - 16, { size: 16, bold: true, color: COLORS.brand });
      y -= 26;
      rect(PAGE.margin, y, contentWidth, 1.2, COLORS.brand);
      y -= 14;
    },
    paragraph(str, { color = COLORS.ink } = {}) {
      for (const line of wrap(str, 11, contentWidth)) {
        ensure(16);
        text(line, PAGE.margin, y - 11, { size: 11, color });
        y -= 16;
      }
      y -= 8;
    },
    table(rows) {
      const keyWidth = 190;
      for (const [key, value] of rows) {
        const keyLines = wrap(key, 10.5, keyWidth - 12, true);
        const valueLines = wrap(value, 10.5, contentWidth - keyWidth);
        const h = Math.max(keyLines.length, valueLines.length) * 14 + 12;
        ensure(h);
        keyLines.forEach((line, i) => text(line, PAGE.margin, y - 16 - i * 14, { size: 10.5, bold: true }));
        valueLines.forEach((line, i) => text(line, PAGE.margin + keyWidth, y - 16 - i * 14, { size: 10.5 }));
        y -= h;
        rect(PAGE.margin, y, contentWidth, 0.6, COLORS.rule);
      }
      y -= 20;
    },
    toBuffer({ title, footer }) {
      const objects = [];
      const add = (body) => objects.push(body) && objects.length;
      const catalog = add(null);
      const pagesObj = add(null);
      const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const kids = pages.map((pageOps, i) => {
        const footerOps = [
          `BT /F1 8 Tf ${rgb(COLORS.muted, 'rg')} ${PAGE.margin} 30 Td (${encode(footer)}) Tj ET`,
          `BT /F1 8 Tf ${rgb(COLORS.muted, 'rg')} ${PAGE.width - PAGE.margin - 40} 30 Td (${encode(`Page ${i + 1} of ${pages.length}`)}) Tj ET`,
        ];
        const stream = [...pageOps, ...footerOps].join('\n');
        const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
        return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`);
      });
      objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
      objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
      const info = add(`<< /Title (${encode(title)}) /Producer (MyPlanetFinance prototype) >>`);

      let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
      const offsets = objects.map((body, i) => {
        const offset = Buffer.byteLength(out, 'latin1');
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
        return offset;
      });
      const xref = Buffer.byteLength(out, 'latin1');
      out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
      out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Buffer.from(out, 'latin1');
    },
  };
}

/** Renders brochure data (see content/brochure.json) to a PDF buffer. */
function renderBrochure(data) {
  const doc = createDocument();
  doc.banner(data.title, data.subtitle);
  if (data.notice) doc.notice(data.notice);
  if (data.intro) doc.paragraph(data.intro);
  for (const programme of data.programmes || []) {
    doc.heading(programme.name);
    doc.table(programme.rows);
  }
  if (data.grading) {
    doc.heading(data.grading.heading);
    doc.paragraph(data.grading.text);
  }
  if (data.dates) {
    doc.heading(data.dates.heading);
    doc.table(data.dates.rows);
  }
  if (data.contact) {
    doc.heading(data.contact.heading);
    for (const line of data.contact.lines) doc.paragraph(line);
  }
  return doc.toBuffer({ title: `${data.title} — Programme brochure`, footer: data.footer || '' });
}

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  fs.writeFileSync(OUTPUT, renderBrochure(data));
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)} from ${path.relative(process.cwd(), SOURCE)}.`);
}

module.exports = { renderBrochure, encode, wrap };
