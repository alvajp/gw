// Chronologie chart (war/season/index pages, see render_chronologie_section/
// render_activity_curve_svg in generate_site.py): the player chip row above
// the chart reveals that player's timeline-player-mark lines (hidden by
// default, see .timeline-player-mark in style.css) over the aggregate
// activity curve. Single-select: picking a chip clears any other chip
// already active in the same row first, so only one player's marks show at
// once (overlaying several players' marks read as noise) -- clicking the
// already-active chip again clears it back to none.
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

    const wasActive = chip.classList.contains("active");
    wrap.querySelectorAll(".chip.active").forEach(function (c) {
      c.classList.remove("active");
    });
    chart.querySelectorAll(".timeline-player-mark.active").forEach(function (el) {
      el.classList.remove("active");
    });

    if (wasActive) return;
    chip.classList.add("active");
    chart.querySelectorAll('.timeline-player-mark[data-uid="' + chip.dataset.uid + '"]').forEach(function (el) {
      el.classList.add("active");
    });
  });
})();
