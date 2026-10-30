/*
 * Admin › Website content: banners, section text, social links and the image
 * library. Edits are saved as a draft, previewed, then published. All values
 * are inserted with textContent / value. The server validates everything again.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MPFAdminContent = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MAX_SLIDES = 5;
  var MAX_STATS = 3;
  var MAX_PROGRAMMES = 6;
  var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  var IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var PREVIEW_URL = '/api/admin/content/preview';
  var SECTIONS = [
    { key: 'programmes', name: 'Programmes', lead: 'Introduction' },
    { key: 'mockTests', name: 'ICET mock tests', lead: 'Introduction (shown after the fixed "not affiliated" disclaimer)' },
    { key: 'highlights', name: 'Why study with us' },
    { key: 'videos', name: 'Videos' },
    { key: 'contact', name: 'Enquiry', lead: 'Introduction' },
  ];

  function blankSlide() {
    return {
      label: '',
      heading: '',
      highlight: '',
      text: '',
      imageId: null,
      imageAlt: '',
      primaryButton: { label: '', href: '' },
      secondaryButton: { label: '', href: '' },
      active: true,
    };
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
  }

  function kb(bytes) {
    return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
  }

  /**
   * options: { document, window, container, h, field, api(method, url, body, opts),
   *            say(msg), warn(msg), markDirty(), clearDirty(), isDirty(), confirmDiscard() }
   */
  function createContentEditor(o) {
    var h = o.h;
    var field = o.field;
    var state = { content: null, media: [], draft: null };

    function mediaById(id) {
      return state.media.filter(function (m) { return m.id === id; })[0] || null;
    }

    function edit(mutate) {
      return function (event) {
        mutate(event.target);
        o.markDirty();
      };
    }

    function textInput(value, maxlength, onChange, attrs) {
      var props = { type: 'text', value: value || '', maxlength: String(maxlength), on: { input: edit(onChange) } };
      Object.keys(attrs || {}).forEach(function (k) { props[k] = attrs[k]; });
      return h('input', props);
    }

    function textArea(value, maxlength, onChange) {
      return h('textarea', { rows: '3', maxlength: String(maxlength), value: value || '', on: { input: edit(onChange) } });
    }

    async function load(message) {
      var data = await o.api('GET', '/api/admin/content');
      state.content = data.content;
      state.media = data.media;
      useDraft(data.content.draft);
      o.clearDirty();
      render();
      if (message) o.say(message);
    }

    function useDraft(draft) {
      state.draft = JSON.parse(JSON.stringify(draft));
      if (!state.draft.hero.stats) state.draft.hero.stats = [];
      if (!state.draft.programmes) state.draft.programmes = [];
      if (!state.draft.highlights) state.draft.highlights = [];
      state.draft.programmes.forEach(function (p) {
        ['subtitle', 'tagline', 'imageAlt', 'duration', 'eligibility'].forEach(function (k) { if (p[k] === undefined) p[k] = ''; });
        if (p.imageId === undefined) p.imageId = null;
        if (!p.features) p.features = [];
        if (!p.cta) p.cta = { label: '', href: '' };
      });
    }

    function apply(content, message) {
      state.content = content;
      useDraft(content.draft);
      o.clearDirty();
      render();
      o.say(message);
    }

    async function refreshMedia() {
      state.media = (await o.api('GET', '/api/admin/media')).media;
    }

    // ---- Actions ----------------------------------------------------------
    async function saveDraft() {
      var data = await o.api('PUT', '/api/admin/content/draft', state.draft);
      await refreshMedia();
      apply(data.content, 'Draft saved. Preview it, then publish when ready.');
    }

    function busy(button, task) {
      return async function () {
        o.warn('');
        button.disabled = true;
        try {
          await task();
        } catch (err) {
          o.warn(err.message);
        } finally {
          button.disabled = false;
        }
      };
    }

    function confirmButton(label, confirmLabel, className, task) {
      var button = h('button', { type: 'button', class: 'btn ' + className, text: label });
      var armed = false;
      var timer = null;
      button.addEventListener('click', busy(button, async function () {
        if (!armed) {
          armed = true;
          button.textContent = confirmLabel;
          timer = o.window.setTimeout(function () { armed = false; button.textContent = label; }, 5000);
          return;
        }
        o.window.clearTimeout(timer);
        armed = false;
        button.textContent = label;
        await task();
      }));
      return button;
    }

    async function uploadFile(file) {
      if (IMAGE_TYPES.indexOf(file.type) === -1) throw new Error('Upload a JPEG, PNG or WebP image.');
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('Images must be 5 MB or smaller.');
      var data = await o.api('POST', '/api/admin/media', file, { contentType: file.type });
      state.media.push(data.media);
      return data.media;
    }

    function fileInput(onFile, label) {
      var input = h('input', { type: 'file', accept: IMAGE_TYPES.join(','), class: 'admin-file', 'aria-label': label });
      input.addEventListener('change', busy(input, async function () {
        var file = input.files && input.files[0];
        input.value = '';
        if (file) await onFile(file);
      }));
      return input;
    }

    // ---- Views ------------------------------------------------------------
    function statusPanel() {
      var c = state.content;
      var lines = [
        c.publishedAt ? 'Live version published ' + formatDate(c.publishedAt) + (c.publishedBy ? ' by ' + c.publishedBy : '') + '.' : 'Live version: starting content (not yet published from admin).',
        c.hasUnpublishedChanges ? 'The saved draft has changes that are not live yet.' : 'The saved draft matches the live website.',
      ];
      var save = h('button', { type: 'button', class: 'btn btn--primary', text: 'Save draft' });
      save.addEventListener('click', busy(save, saveDraft));
      var preview = h('a', { class: 'btn btn--secondary', href: PREVIEW_URL, target: '_blank', rel: 'noopener', text: 'Preview draft' });
      preview.addEventListener('click', function (event) {
        if (o.isDirty()) {
          event.preventDefault();
          o.warn('Save the draft first. The preview shows the saved draft.');
        }
      });
      var publish = confirmButton('Publish', 'Confirm publish', 'btn--accent', async function () {
        if (o.isDirty()) await saveDraft();
        var data = await o.api('POST', '/api/admin/content/publish', {});
        await refreshMedia();
        apply(data.content, 'Published. The website now shows these changes.');
      });
      var discard = confirmButton('Discard draft changes', 'Confirm discard', 'btn--danger', async function () {
        var data = await o.api('POST', '/api/admin/content/discard', {});
        await refreshMedia();
        apply(data.content, 'Draft reset to the live version.');
      });
      return h('section', { class: 'mt-panel admin-status', 'aria-label': 'Publishing' }, [
        h('p', { class: 'admin-status__text', 'data-status': c.hasUnpublishedChanges ? 'draft' : 'live', text: lines.join(' ') }),
        h('div', { class: 'btn-row' }, [save, preview, publish, discard]),
        h('p', { class: 'admin-hint', text: 'Visitors only see published content. Save, preview, then publish.' }),
      ]);
    }

    /** Image choice for `target` (a banner or programme card); `name` is e.g. "banner 1". */
    function imagePicker(target, name) {
      var slide = target;
      var thumb = h('div', { class: 'admin-thumb' });
      function drawThumb() {
        thumb.textContent = '';
        var item = mediaById(slide.imageId);
        if (item) thumb.appendChild(h('img', { src: item.url, alt: '', width: String(item.width), height: String(item.height) }));
        else thumb.appendChild(h('span', { text: 'No image (a placeholder box is shown)' }));
      }
      var select = h('select', { 'aria-label': name.charAt(0).toUpperCase() + name.slice(1) + ' image' }, [h('option', { value: '', text: 'No image' })].concat(
        state.media.map(function (m, i) {
          var opt = h('option', { value: m.id, text: 'Image ' + (i + 1) + ' — ' + m.width + '×' + m.height + ', ' + kb(m.size) });
          if (m.id === slide.imageId) opt.selected = true;
          return opt;
        }),
      ));
      select.addEventListener('change', function () {
        slide.imageId = select.value || null;
        drawThumb();
        o.markDirty();
      });
      drawThumb();
      var upload = fileInput(async function (file) {
        var item = await uploadFile(file);
        slide.imageId = item.id;
        o.markDirty();
        render();
        o.say('Image uploaded and selected for ' + name + '. Add a description, then save the draft.');
      }, 'Upload a new image for ' + name);
      return h('div', { class: 'admin-field' }, [
        'Image',
        h('div', { class: 'admin-image-pick' }, [thumb, h('div', { class: 'admin-form' }, [select, h('span', { class: 'admin-hint', text: 'Or upload a new one (JPEG, PNG or WebP, up to 5 MB):' }), upload])]),
      ]);
    }

    function buttonFields(slide, key, title) {
      var b = slide[key];
      return h('div', { class: 'admin-row' }, [
        field(title + ' text', textInput(b.label, 60, function (t) { b.label = t.value; }), 'Leave empty to hide this button.'),
        field(title + ' link', textInput(b.href, 300, function (t) { b.href = t.value; }, { placeholder: '#programmes, /mock-tests.html or https://…' })),
      ]);
    }

    function slidePanel(slide, index, slides) {
      function move(delta) {
        var target = index + delta;
        slides.splice(target, 0, slides.splice(index, 1)[0]);
        o.markDirty();
        render();
      }
      var active = h('input', { type: 'checkbox', checked: !!slide.active, on: { change: edit(function (t) { slide.active = t.checked; }) } });
      return h('fieldset', { class: 'admin-slide' }, [
        h('legend', { text: 'Banner ' + (index + 1) }),
        h('label', { class: 'admin-check' }, [active, 'Show this banner on the website']),
        field('Label (optional)', textInput(slide.label, 40, function (t) { slide.label = t.value; }), 'A short tag above the heading, e.g. "Admissions".'),
        field('Heading', textInput(slide.heading, 120, function (t) { slide.heading = t.value; }, { required: 'required' })),
        field('Highlighted line (optional)', textInput(slide.highlight, 60, function (t) { slide.highlight = t.value; }), 'Shown in the accent colour under the heading.'),
        field('Text', textArea(slide.text, 300, function (t) { slide.text = t.value; })),
        imagePicker(slide, 'banner ' + (index + 1)),
        field('Image description (alt text)', textInput(slide.imageAlt, 150, function (t) { slide.imageAlt = t.value; }), 'Describe what the image shows for people using screen readers. Required when an image is selected.'),
        buttonFields(slide, 'primaryButton', 'First button'),
        buttonFields(slide, 'secondaryButton', 'Second button'),
        h('div', { class: 'admin-actions' }, [
          h('button', { type: 'button', class: 'btn btn--secondary', text: 'Move up', disabled: index === 0, 'aria-label': 'Move banner ' + (index + 1) + ' up', on: { click: function () { move(-1); } } }),
          h('button', { type: 'button', class: 'btn btn--secondary', text: 'Move down', disabled: index === slides.length - 1, 'aria-label': 'Move banner ' + (index + 1) + ' down', on: { click: function () { move(1); } } }),
          h('button', { type: 'button', class: 'btn btn--danger', text: 'Remove', disabled: slides.length === 1, 'aria-label': 'Remove banner ' + (index + 1), on: { click: function () { slides.splice(index, 1); o.markDirty(); render(); } } }),
        ]),
      ]);
    }

    function bannersPanel() {
      var slides = state.draft.hero.slides;
      return h('section', { class: 'mt-panel' }, [
        h('h2', { text: 'Homepage banners' }),
        h('div', { class: 'admin-form' }, slides.map(function (s, i) { return slidePanel(s, i, slides); })),
        h('button', { type: 'button', class: 'btn btn--secondary', text: 'Add banner', disabled: slides.length >= MAX_SLIDES, on: { click: function () { slides.push(blankSlide()); o.markDirty(); render(); } } }),
      ]);
    }

    function statsPanel() {
      var stats = state.draft.hero.stats;
      var rows = stats.map(function (stat, i) {
        return h('fieldset', { class: 'admin-slide' }, [
          h('legend', { text: 'Figure ' + (i + 1) }),
          h('div', { class: 'admin-row' }, [
            field('Value', textInput(stat.value, 20, function (t) { stat.value = t.value; }), 'e.g. a verified number with its unit.'),
            field('Label', textInput(stat.label, 40, function (t) { stat.label = t.value; })),
          ]),
          h('div', { class: 'admin-actions' }, [
            h('button', { type: 'button', class: 'btn btn--danger', text: 'Remove', 'aria-label': 'Remove figure ' + (i + 1), on: { click: function () { stats.splice(i, 1); o.markDirty(); render(); } } }),
          ]),
        ]);
      });
      return h('section', { class: 'mt-panel' }, [
        h('h2', { text: 'Figures under the banners' }),
        h('p', { class: 'admin-hint', text: 'Optional, up to ' + MAX_STATS + '. Only publish figures you can verify.' }),
        stats.length ? h('div', { class: 'admin-form' }, rows) : h('p', { class: 'mt-status', text: 'No figures. The cards are hidden.' }),
        h('button', { type: 'button', class: 'btn btn--secondary', text: 'Add figure', disabled: stats.length >= MAX_STATS, on: { click: function () { stats.push({ value: '', label: '' }); o.markDirty(); render(); } } }),
      ]);
    }

    function programmesPanel() {
      var list = state.draft.programmes;
      var rows = list.map(function (p, i) {
        return h('fieldset', { class: 'admin-slide' }, [
          h('legend', { text: 'Programme ' + (i + 1) }),
          h('div', { class: 'admin-row' }, [
            field('Programme name', textInput(p.name, 80, function (t) { p.name = t.value; })),
            field('Subtitle', textInput(p.subtitle, 120, function (t) { p.subtitle = t.value; }), 'Shown under the name, e.g. "Master of Business Administration".'),
          ]),
          imagePicker(p, 'programme ' + (i + 1)),
          field('Image description (alt text)', textInput(p.imageAlt, 150, function (t) { p.imageAlt = t.value; }), 'Required when an image is selected.'),
          field('Tagline', textInput(p.tagline, 120, function (t) { p.tagline = t.value; }), 'Shown in the bar under the image.'),
          h('div', { class: 'admin-row' }, [
            field('Duration', textInput(p.duration, 120, function (t) { p.duration = t.value; }), 'Leave empty to hide.'),
            field('Eligibility', textInput(p.eligibility, 120, function (t) { p.eligibility = t.value; }), 'Leave empty to hide.'),
          ]),
          field('Feature points (one per line, up to 6)', h('textarea', { rows: '5', value: p.features.join('\n'), on: { input: edit(function (t) {
            p.features = t.value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
          }) } })),
          buttonFields(p, 'cta', 'Card button'),
          h('div', { class: 'admin-actions' }, [
            h('button', { type: 'button', class: 'btn btn--danger', text: 'Remove', 'aria-label': 'Remove programme ' + (i + 1), on: { click: function () { list.splice(i, 1); o.markDirty(); render(); } } }),
          ]),
        ]);
      });
      return h('section', { class: 'mt-panel' }, [
        h('h2', { text: 'Programme cards' }),
        list.length ? h('div', { class: 'admin-form' }, rows) : h('p', { class: 'mt-status', text: 'No programmes. The cards are hidden.' }),
        h('button', { type: 'button', class: 'btn btn--secondary', text: 'Add programme', disabled: list.length >= MAX_PROGRAMMES, on: { click: function () { list.push({ name: '', subtitle: '', tagline: '', imageId: null, imageAlt: '', duration: '', eligibility: '', features: [], cta: { label: '', href: '' } }); o.markDirty(); render(); } } }),
      ]);
    }

    function highlightsPanel() {
      return h('section', { class: 'mt-panel' }, [
        h('h2', { text: '"Why study with us" boxes' }),
        h('div', { class: 'admin-form' }, [
          field('Boxes (one per line, up to 8)', h('textarea', { rows: '6', value: state.draft.highlights.join('\n'), on: { input: edit(function (t) {
            state.draft.highlights = t.value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
          }) } })),
        ]),
      ]);
    }

    function sectionsPanel() {
      var sections = state.draft.sections;
      return h('section', { class: 'mt-panel' }, [
        h('h2', { text: 'Section headings and text' }),
        h('div', { class: 'admin-form' }, SECTIONS.map(function (spec) {
          var s = sections[spec.key];
          return h('fieldset', { class: 'admin-slide' }, [
            h('legend', { text: spec.name }),
            field('Heading', textInput(s.heading, 80, function (t) { s.heading = t.value; })),
            spec.lead ? field(spec.lead, textArea(s.lead, 400, function (t) { s.lead = t.value; })) : null,
          ]);
        })),
      ]);
    }

    function socialPanel() {
      var social = state.draft.social;
      return h('section', { class: 'mt-panel' }, [
        h('h2', { text: 'Social media links' }),
        h('div', { class: 'admin-form' }, [
          field('LinkedIn URL', textInput(social.linkedin, 300, function (t) { social.linkedin = t.value; }, { type: 'url', placeholder: 'https://www.linkedin.com/…' }), 'Official profile link only. Leave empty to hide the icon.'),
          field('Instagram URL', textInput(social.instagram, 300, function (t) { social.instagram = t.value; }, { type: 'url', placeholder: 'https://www.instagram.com/…' }), 'Official profile link only. Leave empty to hide the icon.'),
        ]),
      ]);
    }

    function libraryPanel() {
      var items = state.media.map(function (m, i) {
        var del = confirmButton('Delete', 'Confirm delete', 'btn--danger', async function () {
          await o.api('DELETE', '/api/admin/media/' + encodeURIComponent(m.id));
          await refreshMedia();
          render();
          o.say('Image deleted.');
        });
        del.setAttribute('aria-label', 'Delete image ' + (i + 1));
        del.disabled = m.inUse;
        return h('li', { class: 'admin-media__item' }, [
          h('img', { src: m.url, alt: '', width: String(m.width), height: String(m.height) }),
          h('span', { text: 'Image ' + (i + 1) + ' · ' + m.width + '×' + m.height + ' · ' + kb(m.size) }),
          m.inUse ? h('span', { class: 'admin-pill admin-pill--live', text: 'In use' }) : null,
          del,
        ]);
      });
      var upload = fileInput(async function (file) {
        await uploadFile(file);
        render();
        o.say('Image uploaded. Select it in a banner to use it.');
      }, 'Upload an image to the library');
      return h('section', { class: 'mt-panel' }, [
        h('h2', { text: 'Image library' }),
        items.length ? h('ul', { class: 'admin-media' }, items) : h('p', { class: 'mt-status', text: 'No images uploaded yet.' }),
        h('div', { class: 'admin-field' }, ['Upload an image (JPEG, PNG or WebP, up to 5 MB)', upload]),
        h('p', { class: 'admin-hint', text: 'Images in use by a saved or published banner cannot be deleted. Uploaded images stay private until a published banner uses them.' }),
      ]);
    }

    function render() {
      o.container.textContent = '';
      o.container.appendChild(h('div', {}, [
        h('h1', { class: 'mt-title', text: 'Website content' }),
        statusPanel(),
        bannersPanel(),
        statsPanel(),
        sectionsPanel(),
        programmesPanel(),
        highlightsPanel(),
        socialPanel(),
        libraryPanel(),
        statusPanel(),
      ]));
    }

    return { load: load, state: state };
  }

  return { createContentEditor: createContentEditor };
});
