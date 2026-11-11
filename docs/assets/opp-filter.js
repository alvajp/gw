// Strategy page, "Contre les meilleurs": the guild chips above the maps choose which opponents' defenses are shown
// (any combination, at least one stays selected). Every defender button carries data-g = its opponent guild.
(function () {
  const wrap = document.getElementById("opp-map-wrap");
  if (!wrap) return;
  const picker = wrap.querySelector(".opp-filter");
  if (!picker) return;
  const heading = document.getElementById("opp-heading");

  function apply() {
    const chosen = Array.prototype.map.call(picker.querySelectorAll(".chip.active"), function (c) { return c.dataset.g; });
    wrap.querySelectorAll(".map-def[data-g]").forEach(function (b) { b.hidden = chosen.indexOf(b.dataset.g) < 0; });
    if (heading) heading.textContent = chosen.join(", ");
  }

  picker.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip[data-g]");
    if (!chip) return;
    const active = picker.querySelectorAll(".chip.active");
    if (chip.classList.contains("active") && active.length === 1) return; // keep at least one guild
    chip.classList.toggle("active");
    apply();
  });
  apply();
})();
