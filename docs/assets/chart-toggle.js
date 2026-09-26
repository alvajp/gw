// Chip toggle for the average-points chart ("Moyenne" vs "Efficience").
// Both metrics are pre-rendered as static SVGs; this just shows/hides them.
// Delegated on document so it keeps working after page-transition.js swaps
// #chart-wrap's contents on client-side navigation (no re-init needed).
(function () {
  document.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip[data-metric]");
    if (!chip) return;
    const wrap = chip.closest("#chart-wrap");
    if (!wrap) return;
    wrap.querySelectorAll(".chip").forEach(function (c) {
      c.classList.toggle("active", c === chip);
    });
    wrap.querySelectorAll(".chart-scroll[data-metric]").forEach(function (el) {
      el.style.display = el.dataset.metric === chip.dataset.metric ? "" : "none";
    });
  });
})();
