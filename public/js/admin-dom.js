/* Small DOM helpers shared by the admin scripts. Values are always set with textContent / properties, never as HTML. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MPFAdminDom = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function create(document) {
    function h(tag, props, children) {
      var node = document.createElement(tag);
      Object.keys(props || {}).forEach(function (key) {
        var value = props[key];
        if (key === 'text') node.textContent = value;
        else if (key === 'class') node.className = value;
        else if (key === 'on') Object.keys(value).forEach(function (evt) { node.addEventListener(evt, value[evt]); });
        else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'hidden') node[key] = value;
        else node.setAttribute(key, value);
      });
      (children || []).forEach(function (child) {
        if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
      return node;
    }

    function field(labelText, input, hint) {
      return h('label', {}, [labelText, input, hint ? h('p', { class: 'admin-hint', text: hint }) : null]);
    }

    return { h: h, field: field };
  }

  return { create: create };
});
