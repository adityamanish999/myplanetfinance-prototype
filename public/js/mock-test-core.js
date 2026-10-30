/* Shared, DOM-free helpers for the mock-test pages (also used by tests). */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MPFMockTestCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var STATUS_LABELS = {
    'answered': 'Answered',
    'answered-marked': 'Answered and marked for review',
    'marked': 'Marked for review',
    'not-answered': 'Not answered',
    'not-visited': 'Not visited',
  };

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** "MM:SS", or "H:MM:SS" for an hour or more. Negative values show as 00:00. */
  function formatDuration(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function questionStatus(state) {
    if (state.answered && state.marked) return 'answered-marked';
    if (state.marked) return 'marked';
    if (state.answered) return 'answered';
    return state.visited ? 'not-answered' : 'not-visited';
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function summarize(questions, answers, marked) {
    var answered = 0;
    var markedCount = 0;
    questions.forEach(function (q) {
      if (has(answers, q.id)) answered++;
      if (marked[q.id]) markedCount++;
    });
    return { total: questions.length, answered: answered, unanswered: questions.length - answered, marked: markedCount };
  }

  /** Applies unsynced local changes ({ qid: { selectedOption?, marked? } }) on top of server state. */
  function applyPending(answers, marked, pending) {
    var nextAnswers = Object.assign({}, answers);
    var nextMarked = Object.assign({}, marked);
    Object.keys(pending || {}).forEach(function (qid) {
      var change = pending[qid];
      if (has(change, 'selectedOption')) {
        if (change.selectedOption === null) delete nextAnswers[qid];
        else nextAnswers[qid] = change.selectedOption;
      }
      if (has(change, 'marked')) {
        if (change.marked) nextMarked[qid] = true;
        else delete nextMarked[qid];
      }
    });
    return { answers: nextAnswers, marked: nextMarked };
  }

  function optionLetter(index) {
    return String.fromCharCode(65 + index);
  }

  return {
    STATUS_LABELS: STATUS_LABELS,
    formatDuration: formatDuration,
    questionStatus: questionStatus,
    summarize: summarize,
    applyPending: applyPending,
    optionLetter: optionLetter,
  };
});
