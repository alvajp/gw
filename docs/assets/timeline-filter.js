// Chronologie chart (war/season/index pages, see render_chronologie_section/
// render_activity_curve_svg in generate_site.py): the player chip row above
// the chart reveals that player's timeline-player-mark lines (hidden by
// default, see .timeline-player-mark in style.css) over the aggregate
// activity curve. Multi-select, independent per chip -- unlike the
// single-active metric chips elsewhere on the site (see chart-toggle.js),
// any number of players can be shown at once here, so this is its own small
// handler rather than reusing that one.
// Delegated on document, same idiom as chart-toggle.js/active-toggle.js, so
// it needs no re-init after page-transition.js swaps content on client-side
// nav.
(function () {
  document.addEventListener("click", function (e) {
    const chip = e.target.closest(".timeline-player-chips .chip[data-uid]");
    if (!chip) return;
    const wrap = chip.closest(".timeline-player-chips");
    const chart = wrap ? wrap.nextElementSibling : null;
    if (!chart) return;
    const active = chip.classList.toggle("active");
    chart.querySelectorAll('.timeline-player-mark[data-uid="' + chip.dataset.uid + '"]').forEach(function (el) {
      el.classList.toggle("active", active);
    });
  });
})();
