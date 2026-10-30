'use strict';

/*
 * Imports an owner-supplied question file as a new mock test.
 *
 *   npm run import-questions -- --exam tg-icet --file data/question-banks/<file>.json --duration 45 [--publish]
 *       [--marks 1] [--negative 0] [--check]
 *
 * --check validates the file and prints problems without importing.
 * Stop the server first (it keeps tests in memory), then restart it afterwards.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../server/config');
const { createJsonStore } = require('../server/storage/jsonStore');
const { createTestRepository } = require('../server/mockTests/testRepository');
const { parseQuestionBank, importQuestionBank } = require('../server/mockTests/questionImport');
const { getExam } = require('../server/mockTests/exams');

const SEED_FILE = path.join(__dirname, '..', 'data', 'seed', 'mock-tests.json');

function parseArgs(argv) {
  const args = { publish: false, check: false, marks: 1, negative: 0 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--publish') args.publish = true;
    else if (key === '--check') args.check = true;
    else if (key.startsWith('--')) args[key.slice(2)] = argv[++i];
  }
  return args;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (!args.file) fail('Pass --file <path to question JSON>.');

let raw;
try {
  raw = JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
} catch (err) {
  fail(`Could not read ${args.file}: ${err.message}`);
}

const bank = parseQuestionBank(raw);
console.log(`"${bank.title}": ${bank.questions.length} valid question(s) in ${bank.sections.length} section(s): ${bank.sections.join(', ')}`);
for (const e of bank.errors) console.log(`  ERROR   ${e.number ? `Q${e.number}: ` : ''}${e.message} (skipped)`);
for (const w of bank.warnings) console.log(`  WARNING ${w.number ? `Q${w.number}: ` : ''}${w.message}`);
if (args.check) process.exit(bank.errors.length ? 1 : 0);

if (!getExam(args.exam)) fail('Pass --exam ap-icet or --exam tg-icet.');
const duration = Number(args.duration);
if (!Number.isInteger(duration) || duration < 1) fail('Pass --duration <minutes>.');

const config = loadConfig();
const store = createJsonStore(path.join(config.dataDir, 'mock-tests.json'), {
  initial: () => JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')),
});
const repository = createTestRepository(store);
const marks = Number(args.marks);
const negative = Number(args.negative);
const instructions = [
  `This practice set has ${bank.questions.length} multiple-choice questions in ${bank.sections.length} section${bank.sections.length === 1 ? '' : 's'}: ${bank.sections.join(', ')}.`,
  `Each correct answer carries ${marks} mark${marks === 1 ? '' : 's'}. ${negative > 0 ? `${negative} mark${negative === 1 ? '' : 's'} will be deducted for each wrong answer.` : 'There is no negative marking.'}`,
].join('\n');

try {
  const test = importQuestionBank(repository, bank, {
    exam: args.exam,
    durationMinutes: duration,
    marksPerQuestion: marks,
    negativeMarks: negative,
    instructions,
    publish: args.publish,
  });
  console.log(`Imported "${test.title}" into ${getExam(args.exam).name}: ${test.questions.length} questions, ${duration} minutes, ${test.published ? 'PUBLISHED' : 'draft (not visible to students)'}.`);
  console.log(`Test id: ${test.id}`);
} catch (err) {
  fail(err.publicMessage || err.message);
}
