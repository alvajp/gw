// Player roster page (see scripts/rosters.py): quick name filter, rarity pills and
// ordering. Cards carry data-* attributes; "Faction" order keeps them in their
// faction sections, any other order moves the same cards into one flat grid.
(function () {
  function init() {
    const root = document.getElementById("roster");
    if (!root || root.dataset.ready) return;
    root.dataset.ready = "1";

    const cards = Array.from(root.querySelectorAll(".rc"));
    const sections = Array.from(root.querySelectorAll(".rs:not(.rs-flat)"));
    const flat = root.querySelector(".rs-flat");
    const flatGrid = flat.querySelector(".rs-grid");
    const empty = document.getElementById("roster-empty");
    const input = document.getElementById("roster-q");
    const select = document.getElementById("roster-order");
    const chips = Array.from(document.querySelectorAll(".rcontrols .chip"));
    const homes = {};
    sections.forEach(function (s) { homes[s.dataset.home] = s.querySelector(".rs-grid"); });
    const num = function (el, k) { return parseInt(el.dataset[k], 10); };

    const SORTS = {
      faction: function (a, b) { return num(a, "i") - num(b, "i"); },
      rarity: function (a, b) {
        return num(b, "rar") - num(a, "rar") || num(b, "stars") - num(a, "stars") || num(b, "rank") - num(a, "rank") ||
          num(b, "level") - num(a, "level") || a.dataset.name.localeCompare(b.dataset.name);
      },
      level: function (a, b) { return num(b, "level") - num(a, "level") || SORTS.rarity(a, b); },
      name: function (a, b) { return a.dataset.name.localeCompare(b.dataset.name); },
    };

    function matches(card, q, filter) {
      if (q && card.dataset.name.indexOf(q) === -1) return false;
      if (filter === "all") return true;
      if (filter === "mow") return card.dataset.mow === "1";
      return card.dataset.mow === "0" && card.dataset.rar === filter;
    }

    function apply() {
      const q = input.value.trim().toLowerCase();
      const active = chips.find(function (c) { return c.classList.contains("active"); });
      const filter = active ? active.dataset.filter : "all";
      const order = select.value;
      const sorted = cards.slice().sort(SORTS[order]);
      let shown = 0;

      sorted.forEach(function (card) {
        const ok = matches(card, q, filter);
        card.hidden = !ok;
        if (ok) shown++;
        (order === "faction" ? homes[card.dataset.home] : flatGrid).appendChild(card);
      });
      sections.forEach(function (s) { s.hidden = order !== "faction" || !s.querySelector(".rc:not([hidden])"); });
      flat.hidden = order === "faction" || shown === 0;
      empty.hidden = shown > 0;
    }

    input.addEventListener("input", apply);
    select.addEventListener("change", apply);
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.classList.toggle("active", c === chip); });
        apply();
      });
    });
  }
  init();
})();
