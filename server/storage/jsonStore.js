'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Small JSON-file store for the prototype (database choice is pending, D4).
 * Each update works on a copy and is written atomically (temp file + rename),
 * so a failed update or crash never leaves a half-written file.
 */
function createJsonStore(filePath, { initial }) {
  function persist(value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, filePath);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Could not read ${path.basename(filePath)}: ${err.message}`);
    data = typeof initial === 'function' ? initial() : structuredClone(initial);
    persist(data);
  }

  return {
    read() {
      return data;
    },
    update(mutator) {
      const draft = structuredClone(data);
      const result = mutator(draft);
      persist(draft);
      data = draft;
      return result;
    },
  };
}

module.exports = { createJsonStore };
