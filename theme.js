/* Light / dark toggle shared by both tabs. Opens in light mode by default; the choice lasts for the page session. Add ?theme=dark to the URL to open in dark mode. */
(function () {
  'use strict';
  const root = document.documentElement, btn = document.getElementById('themeBtn');
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const isLight = () => root.getAttribute('data-theme') === 'light';
  const paint = () => { if (btn) btn.innerHTML = isLight() ? MOON + 'Dark mode' : SUN + 'Light mode'; };
  if (btn) btn.addEventListener('click', () => {
    if (isLight()) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'light');
    paint();
    window.dispatchEvent(new Event('themechange'));
  });
  paint();
})();
