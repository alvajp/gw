// Tables that scroll sideways (.table-scroll, and the Joueurs list in its Bosses / Primes view) can be scrolled by dragging them with the mouse.
// A click that ends a drag is swallowed, so row links, sort heads and dialogs only react to real clicks. Touch and wheel keep their usual behaviour.
(function () {
  const SCROLLER = ".table-scroll, .pgrid[data-view='boss'] .pg-scroll";
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
})();
