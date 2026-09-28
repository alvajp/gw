// Light/dark theme toggle (index page only, see #header-extra in
// generate_site.py). The actual theme is applied as early as possible by a
// tiny inline script in <head> (see PAGE_TEMPLATE) so every page reflects
// the stored preference before first paint, even pages with no toggle
// button on them -- this file only wires up the button itself and keeps it
// in sync with that state, both on a fresh load and after page-transition.js
// swaps a freshly server-rendered (always-"off"-looking) button into
// #header-extra on client-side nav back to index.
(function () {
  function syncButton() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    var light = document.documentElement.getAttribute("data-theme") === "light";
    btn.classList.toggle("active", light);
    btn.setAttribute("aria-pressed", light ? "true" : "false");
    var label = btn.querySelector(".toggle-label");
    if (label) label.textContent = light ? btn.dataset.labelOn : btn.dataset.labelOff;
  }
  window.syncThemeToggle = syncButton;

  document.addEventListener("click", function (e) {
    if (!e.target.closest("#theme-toggle")) return;
    var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (err) {}
    syncButton();
  });

  syncButton();
})();
