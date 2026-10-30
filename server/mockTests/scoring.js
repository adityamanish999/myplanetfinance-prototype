'use strict';

function round(value) {
  return Math.round(value * 100) / 100;
}

/** Scores a submitted attempt from its question snapshot. Unanswered questions score zero. */
function scoreAttempt(attempt) {
  const { questions, sections, answers, marksPerQuestion, negativeMarks } = attempt;
  const bySection = new Map(sections.map((s) => [s.id, { id: s.id, name: s.name, total: 0, correct: 0, incorrect: 0, unanswered: 0, score: 0 }]));
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;

  const review = questions.map((q, index) => {
    const selected = Object.prototype.hasOwnProperty.call(answers, q.id) ? answers[q.id] : null;
    const section = bySection.get(q.sectionId);
    section.total += 1;
    let outcome;
    if (selected === null) {
      outcome = 'unanswered';
      unanswered += 1;
      section.unanswered += 1;
    } else if (selected === q.correctOption) {
      outcome = 'correct';
      correct += 1;
      section.correct += 1;
      section.score += marksPerQuestion;
    } else {
      outcome = 'incorrect';
      incorrect += 1;
      section.incorrect += 1;
      section.score -= negativeMarks;
    }
    return {
      number: index + 1,
      questionId: q.id,
      sectionName: section.name,
      text: q.text,
      options: q.options,
      selectedOption: selected,
      correctOption: q.correctOption,
      explanation: q.explanation,
      outcome,
    };
  });

  const sectionResults = [...bySection.values()].map((s) => ({ ...s, score: round(s.score), maxScore: round(s.total * marksPerQuestion) }));
  return {
    score: round(correct * marksPerQuestion - incorrect * negativeMarks),
    maxScore: round(questions.length * marksPerQuestion),
    total: questions.length,
    correct,
    incorrect,
    unanswered,
    marksPerQuestion,
    negativeMarks,
    sections: sectionResults,
    review,
  };
}

module.exports = { scoreAttempt };
