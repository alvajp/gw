// Tables and charts that scroll sideways, and the dialogs (both ways) (.table-scroll, the Chronologie and Jetons réussis charts, and the Joueurs list whenever it is wider than the page: Bosses / Primes, and every view on phones) can be scrolled by dragging them with the mouse.
// A click that ends a drag is swallowed, so row links, sort heads and dialogs only react to real clicks. Touch and wheel keep their usual behaviour.
(function () {
  const SCROLLER = ".table-scroll, .pgrid .pg-scroll, .timeline-scroll, .war-tokens-wrap, dialog.defense-modal .dm-body, dialog.meta-modal .mm-scroll, dialog.defense-modal, dialog.meta-modal";
  const BOTH = "dialog, .mm-scroll, .dm-body";  // the dialogs' content scrolls up and down as well: those follow the drag in both directions
  let drag = null, moved = false;
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (e.target.closest && e.target.closest(".pg-toggle, input, select, textarea, button, .dm-close, .mm-close")) return;
    // the nearest scroller that really overflows (a dialog's table may fit while the dialog itself scrolls)
    let sc = e.target.closest && e.target.closest(SCROLLER), both, sideways, vertical;
    for (; sc; sc = sc.parentElement && sc.parentElement.closest(SCROLLER)) {
      both = sc.matches(BOTH); sideways = sc.scrollWidth > sc.clientWidth; vertical = both && sc.scrollHeight > sc.clientHeight;
      if (sideways || vertical) break;
    }
    if (!sc) return;
    drag = { sc: sc, x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop, sideways: sideways, vertical: vertical };
    moved = false;
  });
  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && !((drag.sideways && Math.abs(dx) >= 5) || (drag.vertical && Math.abs(dy) >= 5))) return;
    if (!moved) { moved = true; drag.sc.classList.add("is-dragging"); getSelection().removeAllRanges(); }
    if (drag.sideways) drag.sc.scrollLeft = drag.left - dx;
    if (drag.vertical) drag.sc.scrollTop = drag.top - dy;
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
