/*
 * Admission application form (demo). Checks the form in the browser and lists
 * any problems. Nothing is sent or stored: storing student details needs an
 * approved privacy policy and retention rule first.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    var start = function () { api.init({ document: document }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MIN_AGE = 15;

  function labelText(input) {
    var label = input.closest('label');
    if (!label) return input.name;
    // Text fields start with their label text; checkboxes put the text after the box.
    var first = label.firstChild;
    var text = first && first.nodeType === 3 && first.textContent.trim() ? first.textContent : label.textContent;
    return text.replace(/\*/g, '').trim();
  }

  /** Returns a list of { input, message } for every problem in the form. */
  function check(form, today) {
    var problems = [];
    Array.prototype.forEach.call(form.elements, function (input) {
      if (!input.name || input.type === 'submit') return;
      var name = labelText(input);
      var value = typeof input.value === 'string' ? input.value.trim() : '';
      if (input.type === 'checkbox') {
        if (input.required && !input.checked) problems.push({ input: input, message: 'Tick "' + name.replace(/\.$/, '') + '".' });
        return;
      }
      if (input.required && !value) return problems.push({ input: input, message: name + ' is required.' });
      if (!value) return;
      if (input.pattern && !new RegExp('^(?:' + input.pattern + ')$').test(value)) {
        return problems.push({ input: input, message: name + ' is not valid.' });
      }
      if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return problems.push({ input: input, message: 'Enter a valid email address.' });
      }
      if (input.type === 'number') {
        var n = Number(value);
        if (!Number.isInteger(n) || (input.min && n < Number(input.min)) || (input.max && n > Number(input.max))) {
          return problems.push({ input: input, message: name + ' must be a year between ' + input.min + ' and ' + input.max + '.' });
        }
      }
      if (input.type === 'date') {
        var dob = new Date(value + 'T00:00:00');
        var limit = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
        if (isNaN(dob.getTime()) || dob > limit) problems.push({ input: input, message: 'Check the date of birth (applicants must be at least ' + MIN_AGE + ').' });
      }
    });
    var programme = form.elements.programme;
    var degree = form.elements.degree;
    if (programme && degree && programme.value === 'PGDM / MBA' && !degree.value.trim()) {
      problems.push({ input: degree, message: 'Graduation degree is required for PGDM / MBA.' });
    }
    return problems;
  }

  function init(options) {
    var document = options.document;
    var today = options.today || function () { return new Date(); };
    var form = document.getElementById('apply-form');
    var summary = document.getElementById('apply-errors');
    var result = document.getElementById('apply-result');
    if (!form) return null;

    Array.prototype.forEach.call(form.elements, function (input) {
      if (input.name && !input.id) input.id = 'apply-' + input.name;
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (el) { el.removeAttribute('aria-invalid'); });
      result.textContent = '';
      summary.textContent = '';
      var problems = check(form, today());
      if (problems.length) {
        summary.appendChild(document.createElement('p')).textContent = 'Please fix ' + problems.length + (problems.length === 1 ? ' problem:' : ' problems:');
        var list = summary.appendChild(document.createElement('ul'));
        problems.forEach(function (p) {
          p.input.setAttribute('aria-invalid', 'true');
          var link = list.appendChild(document.createElement('li')).appendChild(document.createElement('a'));
          link.href = '#' + p.input.id;
          link.textContent = p.message;
        });
        summary.hidden = false;
        summary.focus();
        return;
      }
      summary.hidden = true;
      result.textContent = 'All details look complete. This is a demo, so your application was not sent or stored. Online applications will open once the admission process is confirmed.';
    });

    return { form: form };
  }

  return { init: init, check: check };
});
