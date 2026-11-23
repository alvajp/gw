// "Saison en cours" / "Saison prochaine": two views of the same page, the button at the right of the title switches between them (#prochaine in the address opens the second).
// In each view the chips at the top (the boss's map with its logo) work in two ways.
//  - big screens (the stack at the left, sticky): anchors, they scroll to the boss; the one in view is marked (aria-current);
//  - small and medium screens: a filter, radio-like: one chip at a time keeps its boss only, the chip clicked again (nothing chosen) shows all five.
(function () {
  const views = Array.prototype.slice.call(document.querySelectorAll(".ns-view"));
  if (!views.length) return;
  const wide = window.matchMedia("(min-width: 1300px)");  // the same breakpoint as the stack at the left (style.css)
  const toggle = document.getElementById("ns-switch"), title = document.getElementById("page-title");
  let ticking = false;

  function shown() { return views.filter(function (v) { return !v.hidden; })[0] || views[0]; }
  function parts() {  // the chips and the boss sections of the view in front
    const v = shown(), links = Array.prototype.slice.call(v.querySelectorAll(".ns-chip"));
    return { links: links, sections: links.map(function (l) { return document.getElementById(l.getAttribute("href").slice(1)); }) };
  }
  function mark() {  // anchors: mark the boss in view
    ticking = false;
    if (!wide.matches) return;
    const p = parts();
    let cur = -1;
    p.sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= window.innerHeight * 0.35) cur = i; });
    p.links.forEach(function (l, i) { if (i === cur) l.setAttribute("aria-current", "true"); else l.removeAttribute("aria-current"); });
  }
  function reset() {  // when the layout or the view changes: everything shown, no chip chosen / marked
    views.forEach(function (v) {
      v.querySelectorAll(".ns-chip").forEach(function (l) { l.removeAttribute("aria-pressed"); l.removeAttribute("aria-current"); });
      v.querySelectorAll(".ns-boss").forEach(function (s) { s.hidden = false; });
    });
    mark();
  }
  document.addEventListener("click", function (e) {
    const chip = e.target.closest && e.target.closest(".ns-chip");
    if (!chip || wide.matches) return;  // anchors: the link does its job
    e.preventDefault();
    const view = chip.closest(".ns-view"), links = view.querySelectorAll(".ns-chip");
    const target = chip.getAttribute("aria-pressed") === "true" ? "" : chip.dataset.boss;
    links.forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.boss === target)); });
    view.querySelectorAll(".ns-boss").forEach(function (s) { s.hidden = !!target && s.dataset.boss !== target; });
  });

  function show(id) {  // "cur" or "next"
    views.forEach(function (v) { v.hidden = v.dataset.view !== id; });
    const v = shown();
    if (title) title.textContent = v.dataset.title;
    if (toggle) {
      const next = v.dataset.view === "cur";
      toggle.firstChild.textContent = next ? toggle.dataset.cur : toggle.dataset.next;
      toggle.setAttribute("aria-pressed", String(!next));
      toggle.classList.toggle("ns-switch-back", !next);
    }
    document.title = v.dataset.title;
    reset();
  }
  if (toggle) toggle.addEventListener("click", function () {
    const id = shown().dataset.view === "cur" ? "next" : "cur";
    history.replaceState(null, "", id === "next" ? "#prochaine" : location.pathname + location.search);
    show(id);
    window.scrollTo(0, 0);
  });
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
  (wide.addEventListener ? wide.addEventListener.bind(wide, "change") : wide.addListener.bind(wide))(reset);
  if (toggle && location.hash === "#prochaine") show("next"); else mark();
})();
