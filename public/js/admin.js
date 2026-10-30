/* Admin UI: navigation, sign-in, mock tests and question banks. Website content lives in admin-content.js. All values are inserted with textContent / value. */
(function () {
  'use strict';

  var app = document.getElementById('admin-app');
  var notice = document.getElementById('admin-notice');
  var alertBox = document.getElementById('admin-alert');
  var userLabel = document.getElementById('admin-user');
  var logoutButton = document.getElementById('admin-logout');
  var nav = document.getElementById('admin-nav');
  var MAX_OPTIONS = 6;
  var MIN_OPTIONS = 2;
  var LETTERS = 'ABCDEF';

  var state = { exams: [], dirty: false };

  // ---- Helpers ------------------------------------------------------------
  var dom = window.MPFAdminDom.create(document);
  var h = dom.h;
  var field = dom.field;

  function show(view) {
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(view);
    window.scrollTo(0, 0);
  }

  function say(message) {
    notice.textContent = message || '';
  }

  function warn(message) {
    alertBox.textContent = message || '';
    alertBox.hidden = !message;
  }

  function markDirty() {
    state.dirty = true;
  }

  function confirmDiscard() {
    return !state.dirty || window.confirm('You have unsaved changes. Discard them?');
  }

  function ApiError(message, status, code) {
    this.message = message;
    this.status = status;
    this.code = code;
  }

  // opts.contentType sends `body` as-is (used for image uploads); otherwise it is sent as JSON.
  async function api(method, url, body, opts) {
    var init = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined && opts && opts.contentType) {
      init.headers['Content-Type'] = opts.contentType;
      init.body = body;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new ApiError("Couldn't reach the server. Check that it is running and try again.", 0);
    }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var message = data && data.error ? data.error.message : 'Something went wrong. Please try again.';
      var err = new ApiError(message, res.status, data && data.error ? data.error.code : '');
      if (res.status === 401 && url !== '/api/admin/login' && url !== '/api/admin/session') {
        state.dirty = false;
        showLogin(message);
      }
      throw err;
    }
    return data;
  }

  function examName(code) {
    var exam = state.exams.filter(function (e) { return e.code === code; })[0];
    return exam ? exam.name : code;
  }

  // ---- Views --------------------------------------------------------------
  function showDisabled(message) {
    show(h('section', { class: 'mt-panel' }, [
      h('h1', { class: 'mt-title', text: 'Admin is not set up' }),
      h('p', { text: message }),
      h('p', { class: 'admin-hint', text: 'Run "npm run admin:hash-password", add ADMIN_USERNAME and ADMIN_PASSWORD_HASH to .env, then restart the server.' }),
    ]));
  }

  function showLogin(message) {
    userLabel.textContent = '';
    logoutButton.hidden = true;
    nav.hidden = true;
    say('');
    warn(message && message !== 'Please sign in.' ? message : '');
    var username = h('input', { type: 'text', autocomplete: 'username', required: 'required' });
    var password = h('input', { type: 'password', autocomplete: 'current-password', required: 'required' });
    var submit = h('button', { type: 'submit', class: 'btn btn--primary', text: 'Sign in' });
    var form = h('form', { class: 'admin-form mt-panel', novalidate: 'novalidate' }, [
      h('h1', { class: 'mt-title', text: 'Admin sign in' }),
      field('Username', username),
      field('Password', password),
      submit,
    ]);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      submit.disabled = true;
      warn('');
      try {
        var data = await api('POST', '/api/admin/login', { username: username.value.trim(), password: password.value });
        password.value = '';
        await enter(data.username);
      } catch (err) {
        warn(err.message);
        submit.disabled = false;
        password.focus();
      }
    });
    show(form);
    username.focus();
  }

  async function enter(username) {
    userLabel.textContent = 'Signed in as ' + username;
    logoutButton.hidden = false;
    nav.hidden = false;
    var exams = await api('GET', '/api/admin/exams');
    state.exams = exams.exams;
    await showContent();
  }

  function setNav(current) {
    Array.prototype.forEach.call(nav.querySelectorAll('button'), function (b) {
      if (b.dataset.view === current) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  var contentEditor = window.MPFAdminContent.createContentEditor({
    document: document,
    window: window,
    container: app,
    h: h,
    field: field,
    api: api,
    say: say,
    warn: warn,
    markDirty: markDirty,
    clearDirty: function () { state.dirty = false; },
    isDirty: function () { return state.dirty; },
  });

  async function showContent() {
    state.dirty = false;
    warn('');
    say('');
    setNav('content');
    await contentEditor.load();
    window.scrollTo(0, 0);
  }

  async function showDashboard(message) {
    state.dirty = false;
    setNav('tests');
    warn('');
    say(message || '');
    var data = await api('GET', '/api/admin/tests');
    var view = h('div', {}, [h('h1', { class: 'mt-title', text: 'Mock tests' })]);
    state.exams.forEach(function (exam) {
      var tests = data.tests.filter(function (t) { return t.exam === exam.code; });
      var rows = tests.map(function (t) {
        return h('tr', {}, [
          h('th', { scope: 'row', text: t.title }),
          h('td', { text: String(t.questionCount) }),
          h('td', { text: t.durationMinutes + ' min' }),
          h('td', {}, [h('span', { class: 'admin-pill' + (t.published ? ' admin-pill--live' : ''), text: t.published ? 'Published' : 'Draft' })]),
          h('td', {}, [h('button', { type: 'button', class: 'btn btn--secondary', text: 'Edit', 'aria-label': 'Edit ' + t.title, on: { click: function () { showTestEditor(t.id); } } })]),
        ]);
      });
      view.appendChild(h('section', { class: 'mt-panel' }, [
        h('h2', { text: exam.name + ' (' + exam.state + ')' }),
        tests.length
          ? h('div', { class: 'table-scroll' }, [h('table', { class: 'admin-table' }, [
              h('thead', {}, [h('tr', {}, ['Title', 'Questions', 'Duration', 'Status', ''].map(function (c) { return h('th', { scope: 'col', text: c }); }))]),
              h('tbody', {}, rows),
            ])])
          : h('p', { class: 'mt-status', text: 'No tests yet.' }),
        h('button', { type: 'button', class: 'btn btn--primary', text: 'New ' + exam.name + ' test', on: { click: function () { showTestEditor(null, exam.code); } } }),
      ]));
    });
    show(view);
  }

  // ---- Test editor --------------------------------------------------------
  async function showTestEditor(testId, examCode) {
    if (!confirmDiscard()) return;
    state.dirty = false;
    warn('');
    var test = testId
      ? (await api('GET', '/api/admin/tests/' + encodeURIComponent(testId))).test
      : { exam: examCode, title: '', durationMinutes: 60, instructions: '', sections: [{ name: 'Section A' }], marksPerQuestion: 1, negativeMarks: 0, published: false, questions: [] };

    var exam = h('select', {}, state.exams.map(function (e) {
      var opt = h('option', { value: e.code, text: e.name });
      if (e.code === test.exam) opt.selected = true;
      return opt;
    }));
    var title = h('input', { type: 'text', value: test.title, maxlength: '120' });
    var duration = h('input', { type: 'number', value: String(test.durationMinutes), min: '1', max: '300', step: '1' });
    var marks = h('input', { type: 'number', value: String(test.marksPerQuestion), min: '0.25', max: '10', step: '0.25' });
    var negative = h('input', { type: 'number', value: String(test.negativeMarks), min: '0', max: '10', step: '0.25' });
    var instructions = h('textarea', { rows: '5', maxlength: '5000', value: test.instructions });
    var published = h('input', { type: 'checkbox', checked: !!test.published });

    var sectionList = h('div', { class: 'admin-form' });
    function addSectionRow(section) {
      var input = h('input', { type: 'text', value: section.name, maxlength: '80', 'aria-label': 'Section name' });
      var row = h('div', { class: 'admin-inline' }, [
        input,
        h('button', { type: 'button', class: 'btn btn--secondary', text: 'Remove', on: { click: function () { row.remove(); markDirty(); } } }),
      ]);
      row.dataset.sectionId = section.id || '';
      sectionList.appendChild(row);
    }
    test.sections.forEach(addSectionRow);

    var save = h('button', { type: 'submit', class: 'btn btn--primary', text: testId ? 'Save test' : 'Create test' });
    var form = h('form', { class: 'admin-form mt-panel', novalidate: 'novalidate', on: { input: markDirty, change: markDirty } }, [
      h('h2', { text: 'Test details' }),
      field('Exam', exam),
      field('Title', title),
      h('div', { class: 'admin-row' }, [
        field('Duration (minutes)', duration),
        field('Marks per correct answer', marks),
        field('Negative marks per wrong answer', negative, '0 for no negative marking'),
      ]),
      field('Instructions for this test', instructions, 'One instruction per line. Use wording from the official notification.'),
      h('div', { class: 'admin-field' }, [
        'Sections',
        sectionList,
        h('button', { type: 'button', class: 'btn btn--secondary', text: 'Add section', on: { click: function () { addSectionRow({ name: '' }); markDirty(); } } }),
      ]),
      h('label', { class: 'admin-check' }, [published, 'Published (visible to students — needs at least one question)']),
      save,
    ]);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      warn('');
      var body = {
        exam: exam.value,
        title: title.value,
        durationMinutes: Number(duration.value),
        marksPerQuestion: Number(marks.value),
        negativeMarks: Number(negative.value),
        instructions: instructions.value,
        published: published.checked,
        sections: Array.prototype.map.call(sectionList.children, function (row) {
          var s = { name: row.querySelector('input').value };
          if (row.dataset.sectionId) s.id = row.dataset.sectionId;
          return s;
        }),
      };
      save.disabled = true;
      try {
        var saved = testId
          ? await api('PUT', '/api/admin/tests/' + encodeURIComponent(testId), body)
          : await api('POST', '/api/admin/tests', body);
        state.dirty = false;
        await showTestEditor(saved.test.id);
        say(testId ? 'Test saved.' : 'Test created. Now add questions.');
      } catch (err) {
        warn(err.message);
        save.disabled = false;
      }
    });

    var view = h('div', {}, [
      h('p', { class: 'mt-breadcrumb' }, [h('button', { type: 'button', class: 'btn btn--secondary', text: '← All tests', on: { click: function () { if (confirmDiscard()) showDashboard(); } } })]),
      h('h1', { class: 'mt-title', text: testId ? test.title : 'New ' + examName(examCode) + ' test' }),
      form,
    ]);
    if (testId) view.appendChild(questionsPanel(test));
    show(view);
  }

  // ---- Questions ----------------------------------------------------------
  function questionsPanel(test) {
    var editorSlot = h('div');
    var list = h('ol', { class: 'admin-questions' });
    var sectionNames = {};
    test.sections.forEach(function (s) { sectionNames[s.id] = s.name; });

    test.questions.forEach(function (q, index) {
      var del = h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete', 'aria-label': 'Delete question ' + (index + 1) });
      var armed = false;
      del.addEventListener('click', async function () {
        if (!armed) {
          armed = true;
          del.textContent = 'Confirm delete';
          setTimeout(function () { armed = false; del.textContent = 'Delete'; }, 5000);
          return;
        }
        try {
          await api('DELETE', '/api/admin/tests/' + encodeURIComponent(test.id) + '/questions/' + encodeURIComponent(q.id));
          await showTestEditor(test.id);
          say('Question deleted.');
        } catch (err) {
          warn(err.message);
        }
      });
      list.appendChild(h('li', {}, [
        h('span', { class: 'admin-q-text' }, [h('strong', { text: 'Q' + (index + 1) + ' · ' + (sectionNames[q.sectionId] || '') + ' — ' }), q.text]),
        h('span', { class: 'admin-actions' }, [
          h('button', { type: 'button', class: 'btn btn--secondary', text: 'Edit', 'aria-label': 'Edit question ' + (index + 1), on: { click: function () { openQuestionEditor(editorSlot, test, q); } } }),
          del,
        ]),
      ]));
    });

    return h('section', { class: 'mt-panel' }, [
      h('h2', { text: 'Questions (' + test.questions.length + ')' }),
      test.questions.length ? list : h('p', { class: 'mt-status', text: 'No questions yet.' }),
      h('button', { type: 'button', class: 'btn btn--primary', text: 'Add question', on: { click: function () { openQuestionEditor(editorSlot, test, null); } } }),
      editorSlot,
    ]);
  }

  function openQuestionEditor(slot, test, question) {
    if (!confirmDiscard()) return;
    state.dirty = false;
    warn('');
    var q = question || { sectionId: test.sections[0].id, text: '', options: ['', '', '', ''], correctOption: 0, explanation: '' };
    var section = h('select', {}, test.sections.map(function (s) {
      var opt = h('option', { value: s.id, text: s.name });
      if (s.id === q.sectionId) opt.selected = true;
      return opt;
    }));
    var text = h('textarea', { rows: '4', maxlength: '2000', value: q.text });
    var explanation = h('textarea', { rows: '3', maxlength: '3000', value: q.explanation || '' });
    var optionList = h('div', { class: 'admin-form' });
    var groupName = 'correct-' + Date.now();

    function relabel() {
      Array.prototype.forEach.call(optionList.children, function (row, i) {
        row.querySelector('.admin-letter').textContent = LETTERS[i];
        row.querySelector('input[type=text]').setAttribute('aria-label', 'Option ' + LETTERS[i]);
        row.querySelector('input[type=radio]').setAttribute('aria-label', 'Option ' + LETTERS[i] + ' is correct');
      });
      addOption.disabled = optionList.children.length >= MAX_OPTIONS;
    }

    function addOptionRow(value, isCorrect) {
      var row = h('div', { class: 'admin-inline' }, [
        h('input', { type: 'radio', name: groupName, checked: !!isCorrect }),
        h('strong', { class: 'admin-letter' }),
        h('input', { type: 'text', value: value, maxlength: '500' }),
        h('button', { type: 'button', class: 'btn btn--secondary', text: 'Remove', on: { click: function () {
          if (optionList.children.length <= MIN_OPTIONS) return warn('A question needs at least ' + MIN_OPTIONS + ' options.');
          row.remove();
          relabel();
          markDirty();
        } } }),
      ]);
      optionList.appendChild(row);
    }

    var addOption = h('button', { type: 'button', class: 'btn btn--secondary', text: 'Add option', on: { click: function () {
      if (optionList.children.length < MAX_OPTIONS) { addOptionRow('', false); relabel(); markDirty(); }
    } } });
    q.options.forEach(function (o, i) { addOptionRow(o, i === q.correctOption); });
    relabel();

    var save = h('button', { type: 'submit', class: 'btn btn--primary', text: question ? 'Save question' : 'Add question' });
    var form = h('form', { class: 'admin-form mt-panel', novalidate: 'novalidate', on: { input: markDirty, change: markDirty } }, [
      h('h3', { text: question ? 'Edit question' : 'New question' }),
      field('Section', section),
      field('Question', text),
      h('div', { class: 'admin-field' }, ['Options (select the correct answer)', optionList, addOption]),
      field('Explanation (shown after the test)', explanation),
      h('div', { class: 'btn-row' }, [
        save,
        h('button', { type: 'button', class: 'btn btn--secondary', text: 'Cancel', on: { click: function () {
          if (confirmDiscard()) { state.dirty = false; slot.textContent = ''; }
        } } }),
      ]),
    ]);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      warn('');
      var rows = Array.prototype.slice.call(optionList.children);
      var correct = rows.findIndex(function (row) { return row.querySelector('input[type=radio]').checked; });
      if (correct === -1) return warn('Select the correct answer.');
      var body = {
        sectionId: section.value,
        text: text.value,
        options: rows.map(function (row) { return row.querySelector('input[type=text]').value; }),
        correctOption: correct,
        explanation: explanation.value,
      };
      save.disabled = true;
      var base = '/api/admin/tests/' + encodeURIComponent(test.id) + '/questions';
      try {
        if (question) await api('PUT', base + '/' + encodeURIComponent(question.id), body);
        else await api('POST', base, body);
        state.dirty = false;
        await showTestEditor(test.id);
        say(question ? 'Question saved.' : 'Question added.');
      } catch (err) {
        warn(err.message);
        save.disabled = false;
      }
    });

    slot.textContent = '';
    slot.appendChild(form);
    text.focus();
  }

  // ---- Boot ---------------------------------------------------------------
  nav.addEventListener('click', async function (event) {
    var button = event.target.closest('button[data-view]');
    if (!button || !confirmDiscard()) return;
    try {
      if (button.dataset.view === 'content') await showContent();
      else await showDashboard();
    } catch (err) {
      warn(err.message);
    }
  });

  logoutButton.addEventListener('click', async function () {
    if (!confirmDiscard()) return;
    try { await api('POST', '/api/admin/logout', {}); } catch (e) { /* ignore */ }
    showLogin('');
    say('Signed out.');
  });

  window.addEventListener('beforeunload', function (event) {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  (async function boot() {
    try {
      var session = await api('GET', '/api/admin/session');
      await enter(session.username);
    } catch (err) {
      if (err.code === 'ADMIN_DISABLED') showDisabled(err.message);
      else if (err.status === 401) showLogin('');
      else warn(err.message);
    }
  })();
})();
