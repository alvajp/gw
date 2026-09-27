// Chip toggle shared by every chart-wrap on the page ("Moyenne"/"Efficience"/
// etc on the points histogram, "Scores" alone for now on the box-plot chart
// below it) -- matched by class (.chart-wrap), not a single id, since a page
// can have more than one of these wraps at once, each with its own
// independent chip/metric state.
// Every metric is pre-rendered as a static SVG; this just shows/hides them.
// On index.html each metric also has an "active players only" variant
// (data-active-filter="active", see render_average_chart/render_score_chart
// in generate_site.py) alongside the full one (data-active-filter="all") for
// the header's roster toggle (active-toggle.js) to switch between -- so
// showing the right chart-scroll means matching BOTH the selected metric
// AND the current filter state, not just the metric alone.
// Delegated on document so it keeps working after page-transition.js swaps
// a chart-wrap's contents on client-side navigation (no re-init needed).
(function () {
  function showMatchingScroll(wrap) {
    const activeChip = wrap.querySelector(".chip.active[data-metric]");
    const metric = activeChip ? activeChip.dataset.metric : null;
    const filter = wrap.dataset.activeFilter || "all";
    wrap.querySelectorAll(".chart-scroll[data-metric]").forEach(function (el) {
      const matchesMetric = el.dataset.metric === metric;
      const matchesFilter = !el.dataset.activeFilter || el.dataset.activeFilter === filter;
      el.style.display = matchesMetric && matchesFilter ? "" : "none";
    });
  }
  window.showMatchingScroll = showMatchingScroll;

  document.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip[data-metric]");
    if (!chip) return;
    const wrap = chip.closest(".chart-wrap");
    if (!wrap) return;
    wrap.querySelectorAll(".chip").forEach(function (c) {
      c.classList.toggle("active", c === chip);
    });
    showMatchingScroll(wrap);
    const legend = wrap.querySelector(".chart-legend");
    if (legend) legend.textContent = chip.dataset.legend || "";
  });
})();
