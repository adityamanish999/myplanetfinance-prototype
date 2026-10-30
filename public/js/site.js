/* Homepage banner switcher. The slides are rendered by the server from Admin › Website content. */
(function () {
  'use strict';

  var slides = document.querySelectorAll('.hero__slide');
  var dots = document.querySelectorAll('.hero__dots .dot');
  if (slides.length < 2 || !dots.length) return;

  function show(index) {
    slides.forEach(function (slide, i) { slide.hidden = i !== index; });
    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === index);
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  dots.forEach(function (dot) {
    dot.addEventListener('click', function () { show(Number(dot.getAttribute('data-slide'))); });
  });
})();
