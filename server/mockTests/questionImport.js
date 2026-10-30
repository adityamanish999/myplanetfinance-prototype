'use strict';

const LETTERS = 'ABCDEF';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parses an owner-supplied question file:
 *   { "exam": "<title>", "totalQuestions"?: n, "questions": [
 *       { "id"?: n, "section" | "subject": "...", "question": "...", "options": [...], "answer": "A".."F", "explanation"?: "..." } ] }
 * Invalid questions are reported in `errors` and skipped; suspicious ones are
 * imported and reported in `warnings`. Nothing is invented or corrected.
 */
function parseQuestionBank(raw) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(raw)) return { title: '', sections: [], questions: [], errors: [{ number: null, message: 'File must contain a JSON object.' }], warnings };

  const title = typeof raw.exam === 'string' ? raw.exam.trim() : typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) errors.push({ number: null, message: 'Missing "exam" (test title).' });
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    errors.push({ number: null, message: 'Missing "questions" list.' });
    return { title, sections: [], questions: [], errors, warnings };
  }
  if (raw.totalQuestions !== undefined && raw.totalQuestions !== raw.questions.length) {
    warnings.push({ number: null, message: `"totalQuestions" says ${raw.totalQuestions}, but the file contains ${raw.questions.length} questions.` });
  }

  const sections = [];
  const questions = [];
  const seenText = new Map();

  raw.questions.forEach((q, index) => {
    const number = isPlainObject(q) && Number.isInteger(q.id) ? q.id : index + 1;
    const fail = (message) => errors.push({ number, message });
    if (!isPlainObject(q)) return fail('Question is not an object.');

    const section = typeof q.section === 'string' && q.section.trim() ? q.section.trim() : typeof q.subject === 'string' ? q.subject.trim() : '';
    const text = typeof q.question === 'string' ? q.question.trim() : '';
    if (!section) return fail('Missing "section" (or "subject").');
    if (!text) return fail('Missing "question" text.');
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > LETTERS.length) {
      return fail(`Needs between 2 and ${LETTERS.length} options.`);
    }
    if (q.options.some((o) => typeof o !== 'string' || !o.trim())) return fail('Every option must be non-empty text.');
    const answer = typeof q.answer === 'string' ? q.answer.trim().toUpperCase() : '';
    const correctOption = LETTERS.indexOf(answer);
    if (answer.length !== 1 || correctOption === -1 || correctOption >= q.options.length) {
      return fail(`Answer "${q.answer}" does not match any option (use ${LETTERS.slice(0, q.options.length).split('').join('/')}).`);
    }

    const normalized = q.options.map((o) => o.trim().toLowerCase());
    const duplicates = normalized.filter((o, i) => normalized.indexOf(o) !== i);
    if (duplicates.length) {
      const letters = normalized.map((o, i) => (duplicates.includes(o) ? LETTERS[i] : null)).filter(Boolean);
      warnings.push({ number, message: `Options ${letters.join(' and ')} are identical ("${q.options[normalized.indexOf(duplicates[0])].trim()}").` });
    }
    const key = text.toLowerCase();
    if (seenText.has(key)) warnings.push({ number, message: `Same question text as question ${seenText.get(key)}.` });
    else seenText.set(key, number);

    if (!sections.includes(section)) sections.push(section);
    questions.push({
      number,
      section,
      text,
      options: q.options.map((o) => o.trim()),
      correctOption,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
    });
  });

  return { title, sections, questions, errors, warnings };
}

/**
 * Creates a new test from a parsed bank. The test is created as a draft,
 * questions are added (each re-validated by the repository), then it is
 * published only if requested.
 */
function importQuestionBank(repository, bank, { exam, durationMinutes, marksPerQuestion = 1, negativeMarks = 0, instructions = '', publish = false }) {
  if (!bank.questions.length) throw new Error('No valid questions to import.');
  if (repository.listTests({ exam }).some((t) => t.title.toLowerCase() === bank.title.toLowerCase())) {
    throw new Error(`A ${exam} test called "${bank.title}" already exists. Rename it or delete the old one first.`);
  }
  const settings = {
    exam,
    title: bank.title,
    durationMinutes,
    instructions,
    sections: bank.sections.map((name) => ({ name })),
    marksPerQuestion,
    negativeMarks,
  };
  const test = repository.createTest({ ...settings, published: false });
  const sectionIds = new Map(test.sections.map((s) => [s.name, s.id]));
  for (const q of bank.questions) {
    repository.addQuestion(test.id, {
      sectionId: sectionIds.get(q.section),
      text: q.text,
      options: q.options,
      correctOption: q.correctOption,
      explanation: q.explanation,
    });
  }
  return publish ? repository.updateTest(test.id, { ...settings, sections: test.sections, published: true }) : repository.getTest(test.id);
}

module.exports = { parseQuestionBank, importQuestionBank };
