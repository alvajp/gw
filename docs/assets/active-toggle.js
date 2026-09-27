// "Joueurs actifs seulement" header toggle (index page only, see #header-extra
// in generate_site.py) — hides table rows AND chart bars for players who
// weren't on the guild's roster in the most recently recorded war.
// Delegated on document, same pattern as chart-toggle.js, so it keeps
// working after page-transition.js replaces #header-extra/#table-wrap on
// client-side navigation (button always starts back in its "off" state on
// a freshly swapped-in page, matching its default markup).
(function () {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("#active-toggle");
    if (!btn) return;
    const active = btn.classList.toggle("active");
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    // Only the label span's text changes -- btn.textContent would also wipe
    // out the .toggle-track/.toggle-thumb switch markup sitting alongside it.
    const label = btn.querySelector(".toggle-label");
    if (label) label.textContent = active ? btn.dataset.labelOn : btn.dataset.labelOff;

    const tableWrap = document.getElementById("table-wrap");
    if (tableWrap) {
      tableWrap.querySelectorAll("tbody tr[data-active]").forEach(function (tr) {
        tr.style.display = active && tr.dataset.active === "false" ? "none" : "";
      });
    }

    // Every chart-wrap's "all"/"active" SVG variants are pre-rendered
    // server-side (see render_average_chart in
    // generate_site.py) -- just flip which variant is visible for each
    // wrap's currently-selected metric chip, matching chart-toggle.js's own
    // dimension-crossing logic. There can be more than one chart-wrap on the
    // page (the points histogram and the score box-plot below it), each with
    // independent chip state, so this loops rather than targeting a single id.
    document.querySelectorAll(".chart-wrap").forEach(function (chartWrap) {
      chartWrap.dataset.activeFilter = active ? "active" : "all";
      if (window.showMatchingScroll) window.showMatchingScroll(chartWrap);
    });
  });
})();
