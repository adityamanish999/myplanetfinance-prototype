/* Mock-test entry, instructions and result pages. All server text is inserted with textContent. */
(function (root, factory) {
  'use strict';
  var core = typeof module === 'object' && module.exports ? require('./mock-test-core') : root.MPFMockTestCore;
  var api = factory(core);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MPFMockTestPages = api;
    var start = function () { api.init({}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (core) {
  'use strict';

  function safeStorage(win) {
    try {
      var s = win.localStorage;
      s.getItem('mpf-probe');
      return s;
    } catch (e) {
      return null;
    }
  }

  function createContext(options) {
    var doc = options.document || document;
    var win = options.window || doc.defaultView;
    return {
      doc: doc,
      win: win,
      fetch: options.fetch || win.fetch.bind(win),
      storage: options.storage !== undefined ? options.storage : safeStorage(win),
      navigate: options.navigate || function (url) { win.location.assign(url); },
      param: function (name) { return new win.URLSearchParams(win.location.search).get(name); },
      $: function (id) { return doc.getElementById(id); },
      el: function (tag, className, text) {
        var node = doc.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      },
    };
  }

  async function getJson(ctx, url, init) {
    var res = await ctx.fetch(url, init);
    var body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return { ok: res.ok, status: res.status, body: body };
  }

  function errorMessage(result, fallback) {
    return result && result.body && result.body.error && result.body.error.message ? result.body.error.message : fallback;
  }

  function showError(ctx, id, message) {
    var box = ctx.$(id);
    box.textContent = message;
    box.hidden = false;
  }

  function examPage(examCode) {
    return '/mock-tests/' + examCode + '.html';
  }

  function minutes(n) {
    return n + ' minute' + (n === 1 ? '' : 's');
  }

  // ---- Exam entry page ----------------------------------------------------
  async function initExamPage(ctx) {
    var exam = ctx.doc.body.getAttribute('data-exam');
    var list = ctx.$('mt-tests');
    var status = ctx.$('mt-status');
    var result;
    try {
      result = await getJson(ctx, '/api/exams/' + exam + '/tests');
    } catch (e) {
      status.hidden = true;
      return showError(ctx, 'mt-error', "Couldn't load tests. Check your connection and refresh the page.");
    }
    status.hidden = true;
    if (!result.ok) return showError(ctx, 'mt-error', errorMessage(result, "Couldn't load tests. Please refresh the page."));
    var tests = result.body.tests;
    if (!tests.length) {
      list.appendChild(ctx.el('p', 'mt-lead', 'No tests are published yet. Please check back soon.'));
      return;
    }
    tests.forEach(function (test) {
      var card = ctx.el('article', 'mt-card');
      card.appendChild(ctx.el('h2', null, test.title));
      var meta = ctx.el('ul', 'mt-meta');
      meta.appendChild(ctx.el('li', null, minutes(test.durationMinutes)));
      meta.appendChild(ctx.el('li', null, test.questionCount + ' questions'));
      meta.appendChild(ctx.el('li', null, test.sections.length + ' section' + (test.sections.length === 1 ? '' : 's')));
      card.appendChild(meta);
      var link = ctx.el('a', 'btn btn--primary', 'View instructions');
      link.href = '/mock-tests/instructions.html?test=' + encodeURIComponent(test.id);
      card.appendChild(link);
      list.appendChild(card);
    });
  }

  // ---- Instructions page --------------------------------------------------
  async function findActiveAttempt(ctx, testId) {
    if (!ctx.storage) return null;
    var key = 'mpf-active-test:' + testId;
    var attemptId;
    try { attemptId = ctx.storage.getItem(key); } catch (e) { return null; }
    if (!attemptId) return null;
    try {
      var result = await getJson(ctx, '/api/attempts/' + encodeURIComponent(attemptId));
      if (result.ok && result.body.attempt.status === 'in_progress') return result.body.attempt;
    } catch (e) {
      return null;
    }
    try { ctx.storage.removeItem(key); } catch (e) { /* ignore */ }
    return null;
  }

  async function initInstructionsPage(ctx) {
    var testId = ctx.param('test');
    var status = ctx.$('mt-status');
    if (!testId) {
      status.hidden = true;
      return showError(ctx, 'mt-error', 'No test was selected. Please choose a test from the AP ICET or TG ICET page.');
    }
    var result;
    try {
      result = await getJson(ctx, '/api/tests/' + encodeURIComponent(testId));
    } catch (e) {
      status.hidden = true;
      return showError(ctx, 'mt-error', "Couldn't load this test. Check your connection and refresh the page.");
    }
    status.hidden = true;
    if (!result.ok) return showError(ctx, 'mt-error', errorMessage(result, "Couldn't load this test."));

    var test = result.body.test;
    var exam = result.body.exam;
    ctx.doc.title = test.title + ' — Instructions';
    ctx.$('mt-exam-link').textContent = exam.name;
    ctx.$('mt-exam-link').href = examPage(exam.code);
    ctx.$('mt-test-title').textContent = test.title;

    var meta = ctx.$('mt-test-meta');
    [
      ['Duration', minutes(test.durationMinutes)],
      ['Questions', String(test.questionCount)],
      ['Marks per correct answer', String(test.marksPerQuestion)],
      ['Negative marking', test.negativeMarks > 0 ? '−' + test.negativeMarks + ' per wrong answer' : 'None'],
    ].forEach(function (pair) {
      meta.appendChild(ctx.el('li', null, pair[0] + ': ' + pair[1]));
    });

    var sections = ctx.$('mt-sections');
    test.sections.forEach(function (s) {
      sections.appendChild(ctx.el('li', null, s.name + ' — ' + s.questionCount + ' question' + (s.questionCount === 1 ? '' : 's')));
    });

    var specific = ctx.$('mt-test-instructions');
    var lines = (test.instructions || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length) lines.forEach(function (line) { specific.appendChild(ctx.el('li', null, line)); });
    else ctx.$('mt-test-instructions-block').hidden = true;

    ctx.$('mt-confirm-duration').textContent = minutes(test.durationMinutes);
    ctx.$('mt-content').hidden = false;

    var active = await findActiveAttempt(ctx, test.id);
    if (active) {
      ctx.$('mt-resume').hidden = false;
      ctx.$('mt-resume-link').href = '/mock-tests/test.html?attempt=' + encodeURIComponent(active.id);
    }

    var agree = ctx.$('mt-agree');
    var startButton = ctx.$('mt-start');
    var modal = ctx.$('mt-confirm');
    var confirmButton = ctx.$('mt-confirm-start');
    var cancelButton = ctx.$('mt-confirm-cancel');
    var confirmError = ctx.$('mt-confirm-error');
    startButton.disabled = true;

    agree.addEventListener('change', function () { startButton.disabled = !agree.checked; });

    function closeModal() {
      modal.hidden = true;
      startButton.focus();
    }

    startButton.addEventListener('click', function () {
      if (!agree.checked) return;
      confirmError.textContent = '';
      modal.hidden = false;
      cancelButton.focus();
    });
    cancelButton.addEventListener('click', closeModal);
    modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !confirmButton.disabled) closeModal();
    });

    confirmButton.addEventListener('click', async function () {
      confirmButton.disabled = true;
      cancelButton.disabled = true;
      confirmError.textContent = '';
      var started;
      try {
        started = await getJson(ctx, '/api/tests/' + encodeURIComponent(test.id) + '/attempts', { method: 'POST' });
      } catch (e) {
        started = null;
      }
      if (!started || !started.ok) {
        confirmError.textContent = errorMessage(started, "Couldn't start the test. Check your connection and try again.");
        confirmButton.disabled = false;
        cancelButton.disabled = false;
        return;
      }
      var attemptId = started.body.attempt.id;
      try { if (ctx.storage) ctx.storage.setItem('mpf-active-test:' + test.id, attemptId); } catch (e) { /* ignore */ }
      ctx.navigate('/mock-tests/test.html?attempt=' + encodeURIComponent(attemptId));
    });
  }

  // ---- Result page --------------------------------------------------------
  async function initResultPage(ctx) {
    var attemptId = ctx.param('attempt');
    var status = ctx.$('mt-status');
    if (!attemptId) {
      status.hidden = true;
      return showError(ctx, 'mt-error', 'No result was selected.');
    }
    var result;
    try {
      result = await getJson(ctx, '/api/attempts/' + encodeURIComponent(attemptId) + '/result');
    } catch (e) {
      status.hidden = true;
      return showError(ctx, 'mt-error', "Couldn't load your result. Check your connection and refresh the page.");
    }
    status.hidden = true;
    if (result.status === 409) {
      showError(ctx, 'mt-error', 'This test is still in progress.');
      var link = ctx.el('a', null, 'Return to your test');
      link.href = '/mock-tests/test.html?attempt=' + encodeURIComponent(attemptId);
      ctx.$('mt-error').appendChild(ctx.doc.createTextNode(' '));
      ctx.$('mt-error').appendChild(link);
      return;
    }
    if (!result.ok) return showError(ctx, 'mt-error', errorMessage(result, "Couldn't load your result."));

    var r = result.body.result;
    if (ctx.storage) {
      try {
        ctx.storage.removeItem('mpf-attempt:' + r.attemptId);
        ctx.storage.removeItem('mpf-active-test:' + r.testId);
      } catch (e) { /* ignore */ }
    }

    ctx.doc.title = 'Result — ' + r.title;
    ctx.$('rs-title').textContent = r.title;
    ctx.$('rs-score').textContent = r.score + ' / ' + r.maxScore;
    ctx.$('rs-auto').hidden = !r.autoSubmitted;

    var counts = ctx.$('rs-counts');
    [['Correct', r.correct], ['Incorrect', r.incorrect], ['Not answered', r.unanswered]].forEach(function (pair) {
      var li = ctx.el('li');
      li.appendChild(ctx.el('strong', null, String(pair[1])));
      li.appendChild(ctx.doc.createTextNode(pair[0]));
      counts.appendChild(li);
    });

    var sectionBody = ctx.$('rs-sections');
    r.sections.forEach(function (s) {
      var row = ctx.el('tr');
      [s.name, s.correct + ' / ' + s.total, String(s.score)].forEach(function (cell, i) {
        row.appendChild(ctx.el(i === 0 ? 'th' : 'td', null, cell));
      });
      row.firstChild.setAttribute('scope', 'row');
      sectionBody.appendChild(row);
    });

    var review = ctx.$('rs-review');
    var outcomeLabels = { correct: 'Correct', incorrect: 'Incorrect', unanswered: 'Not answered' };
    r.review.forEach(function (item) {
      var li = ctx.el('li');
      var heading = ctx.el('h3', null, 'Question ' + item.number + ' · ' + item.sectionName);
      heading.appendChild(ctx.el('span', 'rs-badge rs-badge--' + item.outcome, outcomeLabels[item.outcome]));
      li.appendChild(heading);
      li.appendChild(ctx.el('p', 'tp-question__text', item.text));
      var options = ctx.el('ul', 'rs-options');
      item.options.forEach(function (text, i) {
        var label = core.optionLetter(i) + '. ' + text;
        if (i === item.correctOption) label += ' — correct answer';
        if (i === item.selectedOption && i !== item.correctOption) label += ' — your answer';
        if (i === item.selectedOption && i === item.correctOption) label += ' (your answer)';
        var opt = ctx.el('li', null, label);
        if (i === item.correctOption) opt.className = 'is-correct';
        else if (i === item.selectedOption) opt.className = 'is-wrong';
        options.appendChild(opt);
      });
      li.appendChild(options);
      li.appendChild(ctx.el('p', 'rs-explanation', 'Explanation: ' + (item.explanation || 'No explanation provided yet.')));
      review.appendChild(li);
    });

    ctx.$('rs-retake').href = '/mock-tests/instructions.html?test=' + encodeURIComponent(r.testId);
    ctx.$('rs-exam').href = examPage(r.exam);
    ctx.$('rs-content').hidden = false;
  }

  function init(options) {
    var ctx = createContext(options);
    var page = ctx.doc.body.getAttribute('data-page');
    if (page === 'exam') return initExamPage(ctx);
    if (page === 'instructions') return initInstructionsPage(ctx);
    if (page === 'result') return initResultPage(ctx);
    return Promise.resolve();
  }

  return { init: init };
});
