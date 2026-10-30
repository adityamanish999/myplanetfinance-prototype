/*
 * Mock-test player. The server owns the timer and the scoring; this script
 * shows questions, saves every change to the server straight away, keeps an
 * on-device backup of unsaved changes, and submits automatically at time-up.
 */
(function (root, factory) {
  'use strict';
  var core = typeof module === 'object' && module.exports ? require('./mock-test-core') : root.MPFMockTestCore;
  var api = factory(core);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MPFTestPlayer = api;
    var start = function () {
      if (document.body.getAttribute('data-page') === 'test') api.createTestPlayer({});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (core) {
  'use strict';

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var FIVE_MINUTES = 5 * 60 * 1000;
  var ONE_MINUTE = 60 * 1000;
  var FLUSH_BEFORE_SUBMIT_MS = 5000;

  function safeStorage(win) {
    try {
      var s = win.localStorage;
      s.getItem('mpf-probe');
      return s;
    } catch (e) {
      return null;
    }
  }

  function delay(win, ms) {
    return new Promise(function (resolve) { win.setTimeout(resolve, ms); });
  }

  function createTestPlayer(options) {
    var doc = options.document || document;
    var win = options.window || doc.defaultView;
    var fetchImpl = options.fetch || win.fetch.bind(win);
    var storage = options.storage !== undefined ? options.storage : safeStorage(win);
    var now = options.now || Date.now;
    var navigate = options.navigate || function (url) { win.location.assign(url); };
    var retryDelays = options.retryDelays || [2000, 5000, 10000];
    var attemptId = options.attemptId || new win.URLSearchParams(win.location.search).get('attempt');

    function $(id) { return doc.getElementById(id); }
    var els = {
      app: $('tp-app'), loading: $('tp-loading'), loadError: $('tp-error'),
      title: $('tp-title'), timer: $('tp-timer'), save: $('tp-save'), submit: $('tp-submit'), warning: $('tp-warning'),
      section: $('tp-section'), number: $('tp-number'), text: $('tp-text'), options: $('tp-options'),
      mark: $('tp-mark'), clear: $('tp-clear'), prev: $('tp-prev'), next: $('tp-next'),
      palette: $('tp-palette-body'), answered: $('tp-count-answered'), marked: $('tp-count-marked'), unanswered: $('tp-count-unanswered'),
      modal: $('tp-modal'), modalSummary: $('tp-modal-summary'), modalNote: $('tp-modal-note'), modalError: $('tp-modal-error'),
      modalConfirm: $('tp-modal-confirm'), modalCancel: $('tp-modal-cancel'),
    };

    var state = {
      status: 'loading',
      attempt: null,
      answers: {},
      marked: {},
      visited: {},
      pending: {},
      current: 0,
      offset: 0,
      saveStatus: 'saved',
      warned: {},
      submitting: null,
      leaving: false,
      destroyed: false,
    };
    var backupKey = 'mpf-attempt:' + attemptId;
    var inflight = null;
    var retryTimer = null;
    var retryCount = 0;
    var interval = null;

    // ---- Storage -----------------------------------------------------------
    function readBackup() {
      if (!storage) return {};
      try { return JSON.parse(storage.getItem(backupKey)) || {}; } catch (e) { return {}; }
    }

    function writeBackup() {
      if (!storage) return;
      try {
        storage.setItem(backupKey, JSON.stringify({ pending: state.pending, visited: state.visited, current: state.current, savedAt: now() }));
      } catch (e) { /* storage full or blocked: server saving still works */ }
    }

    function clearBackup() {
      if (!storage) return;
      try {
        storage.removeItem(backupKey);
        if (state.attempt) storage.removeItem('mpf-active-test:' + state.attempt.testId);
      } catch (e) { /* ignore */ }
    }

    // ---- Rendering ---------------------------------------------------------
    function question() {
      return state.attempt.questions[state.current];
    }

    function sectionName(sectionId) {
      var s = state.attempt.sections.filter(function (x) { return x.id === sectionId; })[0];
      return s ? s.name : '';
    }

    function setSaveStatus(status) {
      state.saveStatus = status;
      var text = { saved: 'All answers saved', saving: 'Saving…', offline: 'Offline — answers kept on this device, retrying…' }[status];
      els.save.textContent = text;
      els.save.classList.toggle('tp-save--offline', status === 'offline');
    }

    function renderQuestion(moveFocus) {
      var q = question();
      state.visited[q.id] = true;
      els.section.textContent = sectionName(q.sectionId);
      els.number.textContent = 'Question ' + (state.current + 1) + ' of ' + state.attempt.questions.length;
      els.text.textContent = q.text;

      while (els.options.lastChild && els.options.lastChild.tagName !== 'LEGEND') els.options.removeChild(els.options.lastChild);
      q.options.forEach(function (optionText, i) {
        var input = doc.createElement('input');
        input.type = 'radio';
        input.name = 'answer';
        input.value = String(i);
        input.checked = state.answers[q.id] === i;
        input.addEventListener('change', function () { selectOption(i); });
        var letter = doc.createElement('span');
        letter.className = 'tp-option__letter';
        letter.textContent = core.optionLetter(i);
        var label = doc.createElement('span');
        label.textContent = optionText;
        var wrapper = doc.createElement('label');
        wrapper.className = 'tp-option';
        wrapper.appendChild(input);
        wrapper.appendChild(letter);
        wrapper.appendChild(label);
        els.options.appendChild(wrapper);
      });

      var isMarked = !!state.marked[q.id];
      els.mark.textContent = isMarked ? 'Unmark review' : 'Mark for review';
      els.mark.setAttribute('aria-pressed', isMarked ? 'true' : 'false');
      els.prev.disabled = state.current === 0;
      els.next.disabled = state.current === state.attempt.questions.length - 1;
      if (moveFocus) els.text.focus();
      renderPalette();
      writeBackup();
    }

    function renderPalette() {
      var questions = state.attempt.questions;
      while (els.palette.firstChild) els.palette.removeChild(els.palette.firstChild);
      state.attempt.sections.forEach(function (section) {
        var heading = doc.createElement('p');
        heading.className = 'tp-palette__section';
        heading.textContent = section.name;
        var grid = doc.createElement('div');
        grid.className = 'tp-palette__grid';
        questions.forEach(function (q, index) {
          if (q.sectionId !== section.id) return;
          var status = core.questionStatus({
            answered: Object.prototype.hasOwnProperty.call(state.answers, q.id),
            marked: !!state.marked[q.id],
            visited: !!state.visited[q.id],
          });
          var button = doc.createElement('button');
          button.type = 'button';
          button.className = 'tp-pal tp-pal--' + status;
          button.textContent = String(index + 1);
          button.setAttribute('aria-label', 'Question ' + (index + 1) + ': ' + core.STATUS_LABELS[status]);
          button.setAttribute('data-status', status);
          if (index === state.current) button.setAttribute('aria-current', 'true');
          button.addEventListener('click', function () { goTo(index); });
          grid.appendChild(button);
        });
        els.palette.appendChild(heading);
        els.palette.appendChild(grid);
      });
      var summary = core.summarize(questions, state.answers, state.marked);
      els.answered.textContent = String(summary.answered);
      els.marked.textContent = String(summary.marked);
      els.unanswered.textContent = String(summary.unanswered);
    }

    // ---- Saving ------------------------------------------------------------
    function scheduleRetry() {
      if (retryTimer || state.destroyed) return;
      var wait = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
      retryCount++;
      retryTimer = win.setTimeout(function () {
        retryTimer = null;
        flush();
      }, wait);
    }

    function flush() {
      if (inflight) return inflight;
      inflight = (async function () {
        for (;;) {
          var ids = Object.keys(state.pending);
          if (!ids.length || state.status !== 'in_progress') break;
          var qid = ids[0];
          var change = state.pending[qid];
          setSaveStatus('saving');
          var res;
          try {
            res = await fetchImpl('/api/attempts/' + attemptId + '/answers/' + encodeURIComponent(qid), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(change),
              keepalive: true,
            });
          } catch (e) {
            setSaveStatus('offline');
            scheduleRetry();
            return;
          }
          if (res.status === 409) {
            // Time ran out or the test was submitted elsewhere.
            state.pending = {};
            finish();
            return;
          }
          if (res.ok || res.status === 400 || res.status === 404) {
            if (state.pending[qid] === change) delete state.pending[qid];
            retryCount = 0;
            writeBackup();
            continue;
          }
          setSaveStatus('offline');
          scheduleRetry();
          return;
        }
        if (!Object.keys(state.pending).length) setSaveStatus('saved');
      })().finally(function () { inflight = null; });
      return inflight;
    }

    function queueChange(qid, change) {
      state.pending[qid] = Object.assign({}, state.pending[qid], change);
      writeBackup();
      setSaveStatus('saving');
      flush();
    }

    // ---- Actions -----------------------------------------------------------
    function canEdit() {
      return state.status === 'in_progress' && !state.submitting;
    }

    function selectOption(index) {
      if (!canEdit()) return;
      var q = question();
      state.answers[q.id] = index;
      queueChange(q.id, { selectedOption: index });
      renderQuestion(false);
    }

    function clearAnswer() {
      if (!canEdit()) return;
      var q = question();
      if (!Object.prototype.hasOwnProperty.call(state.answers, q.id)) return;
      delete state.answers[q.id];
      queueChange(q.id, { selectedOption: null });
      renderQuestion(false);
    }

    function toggleMark() {
      if (!canEdit()) return;
      var q = question();
      var marked = !state.marked[q.id];
      if (marked) state.marked[q.id] = true;
      else delete state.marked[q.id];
      queueChange(q.id, { marked: marked });
      renderQuestion(false);
    }

    function goTo(index) {
      if (!state.attempt || index < 0 || index >= state.attempt.questions.length) return;
      state.current = index;
      renderQuestion(true);
    }

    function leave(url) {
      state.leaving = true;
      navigate(url);
    }

    function finish() {
      state.status = 'submitted';
      clearBackup();
      stop();
      leave('/mock-tests/result.html?attempt=' + encodeURIComponent(attemptId));
    }

    function setBusy(busy) {
      [els.submit, els.modalConfirm, els.mark, els.clear].forEach(function (el) { el.disabled = busy; });
      els.options.disabled = busy;
    }

    function submit(opts) {
      var auto = !!(opts && opts.auto);
      if (state.submitting) return state.submitting;
      if (state.status !== 'in_progress') return Promise.resolve();
      state.submitting = (async function () {
        setBusy(true);
        if (auto) {
          closeDialog();
          els.warning.textContent = 'Time is up. Submitting your answers…';
        }
        await Promise.race([flush(), delay(win, FLUSH_BEFORE_SUBMIT_MS)]);
        if (!auto && Object.keys(state.pending).length) {
          els.modalError.textContent = "Some answers haven't been saved yet. Check your connection and try again — nothing has been lost.";
          setBusy(false);
          state.submitting = null;
          return;
        }
        var attemptNo = 0;
        while (!state.destroyed) {
          try {
            var res = await fetchImpl('/api/attempts/' + attemptId + '/submit', { method: 'POST', keepalive: true });
            if (res.ok || res.status === 409) {
              finish();
              return;
            }
            throw new Error('submit failed: ' + res.status);
          } catch (e) {
            if (!auto) {
              els.modalError.textContent = "Couldn't submit right now. Check your connection and try again — your saved answers are safe.";
              setBusy(false);
              state.submitting = null;
              return;
            }
            els.warning.textContent = "Time is up. We can't reach the server — retrying. Your saved answers will be submitted automatically.";
            await delay(win, retryDelays[Math.min(attemptNo++, retryDelays.length - 1)]);
          }
        }
      })();
      return state.submitting;
    }

    // ---- Submit dialog -----------------------------------------------------
    function openDialog() {
      if (!canEdit()) return;
      var summary = core.summarize(state.attempt.questions, state.answers, state.marked);
      var items = [['Answered', summary.answered], ['Not answered', summary.unanswered], ['Marked for review', summary.marked]];
      while (els.modalSummary.firstChild) els.modalSummary.removeChild(els.modalSummary.firstChild);
      items.forEach(function (item) {
        var li = doc.createElement('li');
        var strong = doc.createElement('strong');
        strong.textContent = String(item[1]);
        li.appendChild(strong);
        li.appendChild(doc.createTextNode(item[0]));
        els.modalSummary.appendChild(li);
      });
      els.modalNote.textContent = summary.unanswered > 0
        ? 'You have ' + summary.unanswered + ' unanswered question' + (summary.unanswered === 1 ? '' : 's') + '. You cannot change answers after submitting.'
        : 'You cannot change answers after submitting.';
      els.modalError.textContent = '';
      els.modal.hidden = false;
      els.modalCancel.focus();
    }

    function closeDialog() {
      if (els.modal.hidden) return;
      els.modal.hidden = true;
      els.submit.focus();
    }

    // ---- Timer -------------------------------------------------------------
    function tick() {
      if (state.status !== 'in_progress' || !state.attempt) return;
      var remaining = Date.parse(state.attempt.expiresAt) - (now() + state.offset);
      els.timer.textContent = core.formatDuration(remaining);
      els.timer.classList.toggle('tp-timer--low', remaining <= FIVE_MINUTES);
      if (remaining <= FIVE_MINUTES && remaining > ONE_MINUTE && !state.warned.five) {
        state.warned.five = true;
        els.warning.textContent = '5 minutes left.';
      }
      if (remaining <= ONE_MINUTE && remaining > 0 && !state.warned.one) {
        state.warned.one = true;
        els.warning.textContent = '1 minute left. Your test will be submitted automatically when time runs out.';
      }
      if (remaining <= 0) submit({ auto: true });
    }

    // ---- Loading -----------------------------------------------------------
    function showLoadError(message) {
      els.loading.hidden = true;
      els.loadError.textContent = message;
      els.loadError.hidden = false;
    }

    async function load() {
      if (!attemptId || !UUID.test(attemptId)) {
        showLoadError('This test link is incomplete. Please start the test again from the instructions page.');
        return;
      }
      var res;
      try {
        res = await fetchImpl('/api/attempts/' + attemptId);
      } catch (e) {
        showLoadError("Couldn't load your test. Check your connection and refresh the page — your answers are safe.");
        return;
      }
      if (res.status === 404) {
        showLoadError("We couldn't find this test attempt. Please start the test again.");
        return;
      }
      if (!res.ok) {
        showLoadError('Something went wrong while loading your test. Please refresh the page.');
        return;
      }
      var attempt = (await res.json()).attempt;
      state.attempt = attempt;
      if (attempt.status !== 'in_progress') {
        finish();
        return;
      }
      state.offset = Date.parse(attempt.serverNow) - now();
      var backup = readBackup();
      state.pending = backup.pending || {};
      var merged = core.applyPending(attempt.answers, attempt.marked, state.pending);
      state.answers = merged.answers;
      state.marked = merged.marked;
      state.visited = backup.visited || {};
      state.current = Math.min(Math.max(0, backup.current | 0), attempt.questions.length - 1);
      state.status = 'in_progress';

      els.title.textContent = attempt.title;
      els.loading.hidden = true;
      els.app.hidden = false;
      setSaveStatus(Object.keys(state.pending).length ? 'saving' : 'saved');
      renderQuestion(false);
      tick();
      if (Object.keys(state.pending).length) flush();
    }

    // ---- Wiring ------------------------------------------------------------
    function onBeforeUnload(event) {
      if (state.status === 'in_progress' && !state.leaving) {
        event.preventDefault();
        event.returnValue = '';
      }
    }

    function onOnline() {
      if (retryTimer) {
        win.clearTimeout(retryTimer);
        retryTimer = null;
      }
      flush();
    }

    function stop() {
      if (interval) win.clearInterval(interval);
      interval = null;
    }

    els.mark.addEventListener('click', toggleMark);
    els.clear.addEventListener('click', clearAnswer);
    els.prev.addEventListener('click', function () { goTo(state.current - 1); });
    els.next.addEventListener('click', function () { goTo(state.current + 1); });
    els.submit.addEventListener('click', openDialog);
    els.modalCancel.addEventListener('click', closeDialog);
    els.modalConfirm.addEventListener('click', function () { submit({ auto: false }); });
    els.modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !state.submitting) closeDialog();
    });
    win.addEventListener('beforeunload', onBeforeUnload);
    win.addEventListener('online', onOnline);

    if (options.autoTick !== false) interval = win.setInterval(tick, 1000);

    var ready = load();

    return {
      ready: ready,
      tick: tick,
      selectOption: selectOption,
      clearAnswer: clearAnswer,
      toggleMark: toggleMark,
      goTo: goTo,
      flush: flush,
      submit: submit,
      openSubmitDialog: openDialog,
      get state() { return state; },
      destroy: function () {
        state.destroyed = true;
        stop();
        if (retryTimer) win.clearTimeout(retryTimer);
        win.removeEventListener('beforeunload', onBeforeUnload);
        win.removeEventListener('online', onOnline);
      },
    };
  }

  return { createTestPlayer: createTestPlayer };
});
