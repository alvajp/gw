// "Saison prochaine": every boss is shown at first; the chips at the top (the boss's map with its logo) work like radio buttons: one chip at a time keeps its boss only,
// the chip clicked again (nothing chosen) shows all five.
(function () {
  const bar = document.querySelector(".ns-filter");
  if (!bar) return;
  bar.addEventListener("click", function (e) {
    const chip = e.target.closest(".ns-chip");
    if (!chip) return;
    const target = chip.getAttribute("aria-pressed") === "true" ? "" : chip.dataset.boss;
    bar.querySelectorAll(".ns-chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.boss === target)); });
    document.querySelectorAll(".ns-boss").forEach(function (s) { s.hidden = !!target && s.dataset.boss !== target; });
  });
})();
