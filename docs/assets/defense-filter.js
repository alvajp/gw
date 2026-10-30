// War-page "Défense" (see render_defense_section in generate_site.py): the
// "Min. N attaques" chips show only the defensive teams that suffered at least
// N attacks, in both guilds' tables at once. Delegated on document like the
// other chip scripts, so it needs no re-init after client-side navigation.
(function () {
  document.addEventListener("click", function (e) {
    const chip = e.target.closest(".defense-chips .chip[data-min]");
    if (!chip) return;
    const wrap = chip.closest("#defense-wrap");
    if (!wrap) return;
    const min = parseInt(chip.dataset.min, 10);
    wrap.querySelectorAll(".defense-chips .chip").forEach(function (c) {
      c.classList.toggle("active", c === chip);
    });
    wrap.querySelectorAll("tbody tr[data-n]").forEach(function (tr) {
      tr.hidden = parseInt(tr.dataset.n, 10) < min;
    });
  });
})();
