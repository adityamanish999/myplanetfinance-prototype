/*
 * MyPlanetFinance chat widget.
 * Adds a floating launcher and a messenger-style panel to any page that loads
 * /css/chat-widget.css and this script. Talks only to the site's own /api/chat
 * endpoint; no API keys or provider details ever reach the browser.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MPFChat = api;
    var start = function () { api.createChatWidget(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MAX_MESSAGE_LENGTH = 1000;
  var MAX_HISTORY_ITEMS = 20;
  var REQUEST_TIMEOUT_MS = 20000;
  var NON_RETRYABLE_STATUSES = [400, 413, 415];
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var TEXT = {
    welcome: "Hi! I'm the MyPlanetFinance demo assistant. Ask me about our programmes or ICET mock tests.",
    disclaimer:
      "Automated assistant. Answers may be inaccurate and are not financial or admissions advice. Please don't share personal details.",
    network: "Couldn't reach the assistant. Check your connection and try again.",
    generic: 'Something went wrong. Please try again.',
    tooLong: 'Messages must be ' + MAX_MESSAGE_LENGTH + ' characters or fewer.',
  };
  var QUICK_REPLIES = ['Programmes', 'ICET mock tests', 'Talk to a person'];
  var ICONS = {
    chat: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
    close: ['M18 6 6 18', 'm6 6 12 12'],
    send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
  };

  function el(doc, tag, attrs, children) {
    var node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs.text;
      else if (key === 'hidden') node.hidden = attrs.hidden;
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function icon(doc, name) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    ICONS[name].forEach(function (d) {
      var path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function ChatRequestError(message, status) {
    this.message = message;
    this.status = status;
  }

  function createChatWidget(options) {
    options = options || {};
    var doc = options.document || document;
    var win = options.window || doc.defaultView;
    var fetchImpl = options.fetch || win.fetch.bind(win);
    var endpoint = options.endpoint || '/api/chat';
    var mount = options.mount || doc.body;
    var now = options.now || function () { return new Date(); };

    var state = { open: false, loading: false, history: [], lastFailed: null };

    // ---- DOM -------------------------------------------------------------
    var launcher = el(doc, 'button', {
      type: 'button',
      class: 'mpf-chat__launcher',
      'aria-label': 'Open chat with MyPlanetFinance assistant',
      'aria-expanded': 'false',
      'aria-controls': 'mpf-chat-panel',
    }, [
      el(doc, 'span', { class: 'mpf-chat__launcher-icon', 'aria-hidden': 'true' }, [icon(doc, 'chat')]),
      el(doc, 'span', { class: 'mpf-chat__launcher-label', 'aria-hidden': 'true', text: 'Ask me' }),
    ]);

    var closeButton = el(doc, 'button', { type: 'button', class: 'mpf-chat__close', 'aria-label': 'Close chat' }, [icon(doc, 'close')]);

    var header = el(doc, 'div', { class: 'mpf-chat__header' }, [
      el(doc, 'span', { class: 'mpf-chat__avatar', 'aria-hidden': 'true', text: 'AI' }),
      el(doc, 'div', { class: 'mpf-chat__titles' }, [
        el(doc, 'h2', { id: 'mpf-chat-title', class: 'mpf-chat__title', text: 'MyPlanetFinance Assistant' }),
        el(doc, 'p', { class: 'mpf-chat__subtitle', text: 'AI assistant · demo replies' }),
      ]),
      closeButton,
    ]);

    var messageList = el(doc, 'ol', { class: 'mpf-chat__messages', 'aria-live': 'polite', 'aria-label': 'Conversation' });
    var typing = el(doc, 'p', { class: 'mpf-chat__typing', role: 'status', hidden: true, text: 'Assistant is typing…' });

    var errorText = el(doc, 'span', { class: 'mpf-chat__error-text' });
    var retryButton = el(doc, 'button', { type: 'button', class: 'mpf-chat__retry', text: 'Retry' });
    var errorBox = el(doc, 'div', { class: 'mpf-chat__error', role: 'alert', hidden: true }, [errorText, retryButton]);

    var quickReplies = el(doc, 'div', { class: 'mpf-chat__quick' }, QUICK_REPLIES.map(function (label) {
      var chip = el(doc, 'button', { type: 'button', class: 'mpf-chat__chip', text: label });
      chip.addEventListener('click', function () { send(label); });
      return chip;
    }));

    var input = el(doc, 'textarea', {
      id: 'mpf-chat-input',
      class: 'mpf-chat__input',
      rows: '1',
      maxlength: String(MAX_MESSAGE_LENGTH),
      placeholder: 'Type a message…',
      'aria-describedby': 'mpf-chat-counter',
    });
    var sendButton = el(doc, 'button', { type: 'submit', class: 'mpf-chat__send', 'aria-label': 'Send message' }, [icon(doc, 'send')]);
    sendButton.disabled = true;
    var counter = el(doc, 'span', { id: 'mpf-chat-counter', class: 'mpf-chat__counter', text: '0/' + MAX_MESSAGE_LENGTH });
    var form = el(doc, 'form', { class: 'mpf-chat__form', novalidate: '' }, [
      el(doc, 'label', { for: 'mpf-chat-input', class: 'mpf-visually-hidden', text: 'Type your message' }),
      input,
      sendButton,
    ]);

    var panel = el(doc, 'section', {
      id: 'mpf-chat-panel',
      class: 'mpf-chat__panel',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'mpf-chat-title',
      hidden: true,
    }, [
      header,
      el(doc, 'p', { class: 'mpf-chat__disclaimer', text: TEXT.disclaimer }),
      messageList,
      typing,
      errorBox,
      quickReplies,
      form,
      counter,
    ]);

    var rootNode = el(doc, 'div', { class: 'mpf-chat' }, [panel, launcher]);
    mount.appendChild(rootNode);

    // ---- Rendering -------------------------------------------------------
    function appendMessage(role, text) {
      var item = el(doc, 'li', { class: 'mpf-chat__message mpf-chat__message--' + role }, [
        el(doc, 'span', { class: 'mpf-visually-hidden', text: role === 'user' ? 'You said: ' : 'Assistant said: ' }),
        el(doc, 'p', { class: 'mpf-chat__bubble', text: text }),
        el(doc, 'span', { class: 'mpf-chat__time', text: formatTime(now()) }),
      ]);
      messageList.appendChild(item);
      messageList.scrollTop = messageList.scrollHeight;
    }

    function updateComposer() {
      var length = input.value.length;
      counter.textContent = length + '/' + MAX_MESSAGE_LENGTH;
      sendButton.disabled = state.loading || !input.value.trim();
    }

    function setLoading(loading) {
      state.loading = loading;
      typing.hidden = !loading;
      messageList.setAttribute('aria-busy', loading ? 'true' : 'false');
      updateComposer();
    }

    function showError(message, retryable) {
      errorText.textContent = message;
      retryButton.hidden = !retryable;
      errorBox.hidden = false;
    }

    function hideError() {
      errorBox.hidden = true;
      errorText.textContent = '';
    }

    // ---- Behaviour -------------------------------------------------------
    function open() {
      state.open = true;
      panel.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      launcher.setAttribute('aria-label', 'Close chat');
      rootNode.classList.add('mpf-chat--open');
      input.focus();
    }

    function close() {
      state.open = false;
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      launcher.setAttribute('aria-label', 'Open chat with MyPlanetFinance assistant');
      rootNode.classList.remove('mpf-chat--open');
      launcher.focus();
    }

    function request(message) {
      setLoading(true);
      hideError();
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);

      return fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, history: state.history.slice(-MAX_HISTORY_ITEMS) }),
        signal: controller ? controller.signal : undefined,
      })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (data) {
            if (!res.ok || !data || typeof data.reply !== 'string') {
              var serverMessage = data && data.error && typeof data.error.message === 'string' ? data.error.message : TEXT.generic;
              throw new ChatRequestError(serverMessage, res.status);
            }
            return data.reply;
          });
        })
        .then(function (reply) {
          state.history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
          state.history = state.history.slice(-MAX_HISTORY_ITEMS);
          state.lastFailed = null;
          appendMessage('assistant', reply);
        })
        .catch(function (err) {
          state.lastFailed = message;
          if (err instanceof ChatRequestError) {
            showError(err.message, NON_RETRYABLE_STATUSES.indexOf(err.status) === -1);
          } else {
            showError(TEXT.network, true);
          }
        })
        .then(function () {
          clearTimeout(timer);
          setLoading(false);
        });
    }

    function send(raw) {
      var message = String(raw || '').trim();
      if (!message || state.loading) return Promise.resolve();
      if (message.length > MAX_MESSAGE_LENGTH) {
        showError(TEXT.tooLong, false);
        return Promise.resolve();
      }
      appendMessage('user', message);
      input.value = '';
      updateComposer();
      return request(message);
    }

    function retry() {
      if (!state.lastFailed || state.loading) return Promise.resolve();
      return request(state.lastFailed);
    }

    launcher.addEventListener('click', function () { if (state.open) close(); else open(); });
    closeButton.addEventListener('click', close);
    retryButton.addEventListener('click', retry);
    input.addEventListener('input', updateComposer);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(input.value);
      }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      send(input.value);
    });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    appendMessage('assistant', TEXT.welcome);

    return {
      root: rootNode,
      open: open,
      close: close,
      send: send,
      retry: retry,
      destroy: function () { rootNode.remove(); },
    };
  }

  return { createChatWidget: createChatWidget, MAX_MESSAGE_LENGTH: MAX_MESSAGE_LENGTH };
});
