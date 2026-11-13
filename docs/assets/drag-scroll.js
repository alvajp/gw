// Tables and charts that scroll sideways (.table-scroll, the Chronologie and Jetons réussis charts, and the Joueurs list whenever it is wider than the page: Bosses / Primes, and every view on phones) can be scrolled by dragging them with the mouse.
// A click that ends a drag is swallowed, so row links, sort heads and dialogs only react to real clicks. The wheel keeps its usual behaviour; touch is handled below.
(function () {
  const SCROLLER = ".table-scroll, .pgrid .pg-scroll, .timeline-scroll, .war-tokens-wrap";
  let drag = null, moved = false;
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const sc = e.target.closest && e.target.closest(SCROLLER);
    if (!sc || e.target.closest(".pg-toggle, input, select, textarea") || sc.scrollWidth <= sc.clientWidth) return;
    drag = { sc: sc, x: e.clientX, left: sc.scrollLeft };
    moved = false;
  });
  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!moved && Math.abs(dx) < 5) return;
    if (!moved) { moved = true; drag.sc.classList.add("is-dragging"); getSelection().removeAllRanges(); }
    drag.sc.scrollLeft = drag.left - dx;
  });
  function end() {
    if (!drag) return;
    drag.sc.classList.remove("is-dragging");
    drag = null;
    if (moved) setTimeout(function () { moved = false; }, 0); // `moved` stays true for the click that follows the release
    else moved = false;
  }
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  document.addEventListener("click", function (e) {
    if (moved) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener("dragstart", function (e) {
    if (e.target.closest && e.target.closest(SCROLLER)) e.preventDefault(); // no ghost image of an icon
  });
  // Touch: the browser's own sideways panning rubber-bands on iOS (the pinned columns slide with the bounce). The tables ask for vertical panning only (touch-action in
  // the stylesheet) and this scrolls them sideways itself, clamped at both ends, with a short inertia.
  let touch = null, raf = 0;
  function stopInertia() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return;
    stopInertia();
    const sc = e.target.closest && e.target.closest(SCROLLER);
    if (!sc || sc.scrollWidth <= sc.clientWidth) return;
    touch = { sc: sc, x: e.clientX, left: sc.scrollLeft, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  });
  document.addEventListener("pointermove", function (e) {
    if (!touch || e.pointerType !== "touch") return;
    const sc = touch.sc, max = sc.scrollWidth - sc.clientWidth;
    sc.scrollLeft = Math.max(0, Math.min(max, touch.left - (e.clientX - touch.x)));
    const dt = e.timeStamp - touch.lastT;
    if (dt > 0) touch.v = 0.8 * touch.v + 0.2 * ((touch.lastX - e.clientX) / dt);  // px per ms, towards the right when positive
    touch.lastX = e.clientX; touch.lastT = e.timeStamp;
  });
  function endTouch(e) {
    if (!touch || e.pointerType !== "touch") return;
    const sc = touch.sc; let v = e.type === "pointerup" && e.timeStamp - touch.lastT < 80 ? touch.v : 0;
    touch = null;
    let last = performance.now();
    (function step(now) {
      const dt = now - last; last = now;
      const max = sc.scrollWidth - sc.clientWidth, next = Math.max(0, Math.min(max, sc.scrollLeft + v * dt));
      sc.scrollLeft = next;
      v *= Math.pow(0.95, dt / 16);
      raf = Math.abs(v) > 0.02 && next > 0 && next < max ? requestAnimationFrame(step) : 0;
    })(last);
  }
  document.addEventListener("pointerup", endTouch);
  document.addEventListener("pointercancel", endTouch);
})();
