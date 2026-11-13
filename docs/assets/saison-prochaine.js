// "Saison prochaine": the anchors at the top (the boss's map with its logo) scroll to each boss; the one whose section is in view is marked (aria-current).
(function () {
  const links = Array.prototype.slice.call(document.querySelectorAll(".ns-chip"));
  if (!links.length) return;
  const sections = links.map(function (l) { return document.getElementById(l.getAttribute("href").slice(1)); });
  let ticking = false;
  function mark() {
    ticking = false;
    let cur = -1;
    sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= window.innerHeight * 0.35) cur = i; });
    links.forEach(function (l, i) { if (i === cur) l.setAttribute("aria-current", "true"); else l.removeAttribute("aria-current"); });
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
  window.addEventListener("resize", mark);
  mark();
})();
