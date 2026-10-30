'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { init } = require('../../public/js/apply');

const HTML = fs.readFileSync(path.join(__dirname, '../../public/apply.html'), 'utf8');
const TODAY = new Date(2026, 9, 29);

// Placeholder applicant — not a real person.
const VALID = {
  programme: 'PGDM / MBA', fullName: 'Test Applicant', dob: '2003-05-14', gender: 'Female', email: 'applicant@example.test',
  mobile: '9876543210', guardianName: 'Test Guardian', guardianMobile: '9123456780', address: 'Placeholder street 1', city: 'Placeholder city',
  state: 'Telangana', pin: '500001', tenthBoard: 'Placeholder board', tenthYear: '2018', tenthScore: '90', twelfthBoard: 'Placeholder board',
  twelfthYear: '2020', twelfthScore: '88', degree: 'B.Com', university: 'Placeholder university', degreeStatus: 'Completed', degreeYear: '2023', degreeScore: '8.1',
};

function setup() {
  const dom = new JSDOM(HTML, { url: 'http://127.0.0.1/apply.html' });
  const { document } = dom.window;
  const fetchCalls = [];
  dom.window.fetch = (...args) => { fetchCalls.push(args); };
  init({ document, today: () => TODAY });
  const form = document.getElementById('apply-form');
  function fill(values) {
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.elements.declaration.checked = true;
    form.elements.consent.checked = true;
  }
  function submit() {
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  }
  const errors = () => Array.from(document.querySelectorAll('#apply-errors li')).map((li) => li.textContent);
  return { dom, document, form, fill, submit, errors, fetchCalls, storage: dom.window.localStorage };
}

test('every field has a label and the page says nothing is sent', () => {
  const { document, form } = setup();
  const fields = Array.from(form.elements).filter((el) => el.name);
  assert.ok(fields.length >= 25, 'collects programme, personal, address, education and exam details');
  for (const el of fields) assert.ok(el.closest('label'), `${el.name} has a label`);
  assert.match(document.querySelector('.apply__notice').textContent, /nothing you type here is sent or stored/);
});

test('an empty form lists every required field and marks them invalid', () => {
  const ui = setup();
  ui.submit();
  const errors = ui.errors();
  assert.ok(errors.includes('Full name (as on certificates) is required.'));
  assert.ok(errors.includes('Mobile number is required.'));
  assert.ok(errors.includes('Tick "I declare that the information given above is true and complete".'));
  assert.equal(ui.form.elements.fullName.getAttribute('aria-invalid'), 'true');
  assert.equal(ui.document.activeElement.id, 'apply-errors', 'focus moves to the error summary');
  const link = ui.document.querySelector('#apply-errors a');
  assert.equal(link.getAttribute('href'), `#${ui.form.elements.programme.id}`);
});

test('checks formats: mobile, email, PIN, years, date of birth and degree for PGDM / MBA', () => {
  const ui = setup();
  ui.fill({ ...VALID, mobile: '12345', email: 'not-an-email', pin: '012345', tenthYear: '1890', dob: '2020-01-01', degree: '' });
  ui.submit();
  assert.deepEqual(ui.errors().sort(), [
    'Check the date of birth (applicants must be at least 15).',
    'Class 10 year of passing must be a year between 1990 and 2030.',
    'Enter a valid email address.',
    'Graduation degree is required for PGDM / MBA.',
    'Mobile number is not valid.',
    'PIN code is not valid.',
  ]);
});

test('a complete form passes but nothing is sent or stored', () => {
  const ui = setup();
  ui.fill(VALID);
  ui.submit();
  assert.deepEqual(ui.errors(), []);
  assert.equal(ui.document.getElementById('apply-errors').hidden, true);
  assert.match(ui.document.getElementById('apply-result').textContent, /was not sent or stored/);
  assert.equal(ui.fetchCalls.length, 0);
  assert.equal(ui.storage.length, 0);
  assert.equal(ui.form.getAttribute('action'), null, 'the form has no submission target');
});
