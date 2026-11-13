// "Saison prochaine": the chips at the top (the boss's map with its logo) work in two ways.
//  - big screens (the stack at the left, sticky): anchors, they scroll to the boss; the one in view is marked (aria-current);
//  - small and medium screens: a filter, radio-like: one chip at a time keeps its boss only, the chip clicked again (nothing chosen) shows all five.
(function () {
  const links = Array.prototype.slice.call(document.querySelectorAll(".ns-chip"));
  if (!links.length) return;
  const sections = links.map(function (l) { return document.getElementById(l.getAttribute("href").slice(1)); });
  const wide = window.matchMedia("(min-width: 1300px)");  // the same breakpoint as the stack at the left (style.css)
  let ticking = false;

  function mark() {  // anchors: mark the boss in view
    ticking = false;
    if (!wide.matches) return;
    let cur = -1;
    sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= window.innerHeight * 0.35) cur = i; });
    links.forEach(function (l, i) { if (i === cur) l.setAttribute("aria-current", "true"); else l.removeAttribute("aria-current"); });
  }
  function reset() {  // when the layout changes: everything shown, no chip chosen / marked
    links.forEach(function (l) { l.removeAttribute("aria-pressed"); l.removeAttribute("aria-current"); });
    sections.forEach(function (s) { if (s) s.hidden = false; });
    mark();
  }
  links.forEach(function (chip) {
    chip.addEventListener("click", function (e) {
      if (wide.matches) return;  // anchors: the link does its job
      e.preventDefault();
      const target = chip.getAttribute("aria-pressed") === "true" ? "" : chip.dataset.boss;
      links.forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.boss === target)); });
      sections.forEach(function (s) { if (s) s.hidden = !!target && s.dataset.boss !== target; });
    });
  });
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
  (wide.addEventListener ? wide.addEventListener.bind(wide, "change") : wide.addListener.bind(wide))(reset);
  mark();
})();
