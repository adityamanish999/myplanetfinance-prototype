'use strict';

// Exam bodies, dates and patterns change each year and are [PENDING] verification
// against the official notification; only the exam names are fixed here.
const EXAMS = Object.freeze({
  'ap-icet': Object.freeze({ code: 'ap-icet', name: 'AP ICET', state: 'Andhra Pradesh' }),
  'tg-icet': Object.freeze({ code: 'tg-icet', name: 'TG ICET', state: 'Telangana' }),
});

function getExam(code) {
  return Object.prototype.hasOwnProperty.call(EXAMS, code) ? EXAMS[code] : null;
}

function listExams() {
  return Object.values(EXAMS);
}

module.exports = { EXAMS, getExam, listExams };
