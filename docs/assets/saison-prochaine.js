// "Saison prochaine": the chips at the top (the boss's map with its logo) show one boss only; "Toutes" (or the chip again) shows the five.
(function () {
  const bar = document.querySelector(".ns-filter");
  if (!bar) return;
  bar.addEventListener("click", function (e) {
    const chip = e.target.closest(".ns-chip");
    if (!chip) return;
    const target = chip.getAttribute("aria-pressed") === "true" ? "" : chip.dataset.boss;  // the chip already chosen goes back to all
    bar.querySelectorAll(".ns-chip").forEach(function (c) { c.setAttribute("aria-pressed", String((c.dataset.boss || "") === target)); });
    document.querySelectorAll(".ns-boss").forEach(function (s) { s.hidden = !!target && s.dataset.boss !== target; });
  });
})();
