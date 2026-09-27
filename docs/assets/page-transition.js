// Animated client-side transition between index.html and seasons/<n>.html —
// the only two page shapes that share the frise+chart layout in the same
// position. Links opt in via data-transition="true" (set server-side in
// generate_site.py only on those compatible links). Everything else keeps
// behaving as a normal <a href> navigation (progressive enhancement: works
// with JS disabled too).
(function () {
  const FRISE_MS = 420;
  const CHART_MS = 480;
  const TITLE_MS = 420;

  function easeIn(t) { return t * t * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function animate(duration, onFrame, onDone) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      onFrame(t);
      if (t < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [154, 164, 255];
  }
  function lerpColor(c1, c2, t) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    return "rgb(" + Math.round(lerp(a[0], b[0], t)) + ", " + Math.round(lerp(a[1], b[1], t)) + ", " + Math.round(lerp(a[2], b[2], t)) + ")";
  }

  // FLIP-via-clone helper used for the index<->season title/breadcrumb swap:
  // captures an element's screen rect + relevant computed style, then a
  // fixed-position ghost <div> is animated from a "from" snapshot to a "to"
  // snapshot while the real target element stays hidden (visibility, so it
  // keeps its layout space) until the ghost lands, at which point the ghost
  // is discarded and the real element is revealed in place.
  function captureRect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      left: r.left, top: r.top, width: r.width, height: r.height,
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color,
      background: cs.backgroundColor, borderRadius: cs.borderRadius,
      border: cs.border, padding: cs.padding, letterSpacing: cs.letterSpacing,
    };
  }

  function applyRect(el, snap) {
    el.style.left = snap.left + "px";
    el.style.top = snap.top + "px";
    el.style.width = snap.width + "px";
    el.style.height = snap.height + "px";
    el.style.fontSize = snap.fontSize;
    el.style.fontWeight = snap.fontWeight;
    el.style.color = snap.color;
    el.style.background = snap.background;
    el.style.borderRadius = snap.borderRadius;
    el.style.border = snap.border;
    el.style.padding = snap.padding;
    el.style.letterSpacing = snap.letterSpacing;
  }

  function flipMove(text, fromSnap, toSnap, targetEl, prefix) {
    if (!fromSnap || !toSnap) return;
    const ghost = document.createElement("div");
    ghost.style.position = "fixed";
    ghost.style.margin = "0";
    ghost.style.boxSizing = "border-box";
    ghost.style.zIndex = "1000";
    ghost.style.display = "flex";
    ghost.style.alignItems = "center";
    ghost.style.whiteSpace = "nowrap";
    ghost.style.overflow = "hidden";
    ghost.style.pointerEvents = "none";
    ghost.style.gap = "0.35em";

    // The arrow is present (and already sized/positioned for) from the
    // start so the text doesn't reflow when the ghost is swapped back for
    // the real element -- it just fades in over the move instead of
    // popping in abruptly at the end.
    let prefixSpan = null;
    if (prefix) {
      prefixSpan = document.createElement("span");
      prefixSpan.textContent = prefix;
      prefixSpan.style.opacity = "0";
      prefixSpan.style.transition = "opacity " + TITLE_MS + "ms ease-out";
      ghost.appendChild(prefixSpan);
    }
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    ghost.appendChild(textSpan);

    const props = ["left", "top", "width", "height", "font-size", "color", "background-color", "border-color", "padding"];
    ghost.style.transition = props.map(function (p) { return p + " " + TITLE_MS + "ms cubic-bezier(0.25, 0.46, 0.45, 0.94)"; }).join(", ");
    applyRect(ghost, fromSnap);
    document.body.appendChild(ghost);
    if (targetEl) targetEl.style.visibility = "hidden";

    void ghost.offsetWidth; // force reflow before animating to the "to" snapshot
    requestAnimationFrame(function () {
      applyRect(ghost, toSnap);
      if (prefixSpan) prefixSpan.style.opacity = "1";
    });

    setTimeout(function () {
      ghost.remove();
      if (targetEl) targetEl.style.visibility = "";
    }, TITLE_MS + 40);
  }

  function transitionFrise(liveFrise, newInnerHTML) {
    if (!liveFrise) return;
    const oldLayer = document.createElement("div");
    oldLayer.className = "frise-old-layer";
    oldLayer.innerHTML = liveFrise.innerHTML;

    const newLayer = document.createElement("div");
    newLayer.className = "frise-new-layer";
    newLayer.innerHTML = newInnerHTML;

    liveFrise.classList.add("frise-transitioning");
    liveFrise.innerHTML = "";
    liveFrise.appendChild(oldLayer);
    liveFrise.appendChild(newLayer);

    void liveFrise.offsetWidth; // force reflow so the animate-in/out classes transition
    requestAnimationFrame(function () {
      oldLayer.classList.add("frise-animate-out");
      newLayer.classList.add("frise-animate-in");
    });

    setTimeout(function () {
      liveFrise.innerHTML = newInnerHTML;
      liveFrise.classList.remove("frise-transitioning");
    }, FRISE_MS + 40);
  }

  function readBars(svg) {
    const map = new Map();
    if (!svg) return map;
    svg.querySelectorAll("rect.chart-bar[data-uid]").forEach(function (rect) {
      map.set(rect.dataset.uid, {
        x: parseFloat(rect.getAttribute("x")),
        y: parseFloat(rect.getAttribute("y")),
        width: parseFloat(rect.getAttribute("width")),
        height: parseFloat(rect.getAttribute("height")),
        fill: rect.getAttribute("fill"),
      });
    });
    return map;
  }

  function transitionChart(liveWrap, newWrap) {
    if (!liveWrap) return;
    if (!newWrap) { liveWrap.innerHTML = ""; return; }

    // The chip toggle always resets to the default "Moyenne" metric on a
    // fresh page; keep the hidden "Efficience"/"Tokens"/"Buffs"/"Maps" charts
    // in sync instantly (they aren't visible, so no animation needed) and
    // only animate the default chart below.
    const liveChips = liveWrap.querySelector(".chips");
    const newChips = newWrap.querySelector(".chips");
    if (liveChips && newChips) liveChips.outerHTML = newChips.outerHTML;

    const liveLegend = liveWrap.querySelector(".chart-legend");
    const newLegend = newWrap.querySelector(".chart-legend");
    if (liveLegend) liveLegend.textContent = newLegend ? newLegend.textContent : "";

    // Matched by (metric, active-filter) key, NOT by position: index.html's
    // wrap is filterable (2 scrolls per metric, "all"+"active") while a
    // season page's isn't (1 scroll per metric, no data-active-filter attr
    // at all) -- a positional match silently pairs up the wrong metrics
    // whenever the two sides have a different scroll count (e.g. index's
    // "victoire-all" landing on season's "tokens" scroll), which is
    // exactly what made a chip sometimes reveal the wrong chart after a
    // frise/breadcrumb transition. Missing data-active-filter is normalized
    // to "all" on both sides so a season scroll (no attribute) matches
    // index's own "all" variant of the same metric.
    function scrollKey(el) {
      return el.dataset.metric + "|" + (el.dataset.activeFilter || "all");
    }
    const newScrollsByKey = new Map();
    newWrap.querySelectorAll(".chart-scroll[data-metric]").forEach(function (el) {
      newScrollsByKey.set(scrollKey(el), el);
    });
    liveWrap.querySelectorAll(".chart-scroll[data-metric]").forEach(function (el) {
      const key = scrollKey(el);
      const isDefault = key === "moyenne|all";
      el.style.display = isDefault ? "" : "none";
      if (!isDefault) {
        const match = newScrollsByKey.get(key);
        el.innerHTML = match ? match.innerHTML : "";
      }
    });

    const liveSvg = liveWrap.querySelector("#avg-chart-moyenne");
    const newSvg = newWrap.querySelector("#avg-chart-moyenne");
    if (!liveSvg || !newSvg) {
      liveWrap.innerHTML = newWrap.innerHTML;
      return;
    }

    const oldBars = readBars(liveSvg);
    const newBars = readBars(newSvg);
    const uids = new Set();
    oldBars.forEach(function (_v, k) { uids.add(k); });
    newBars.forEach(function (_v, k) { uids.add(k); });

    liveSvg.setAttribute("viewBox", newSvg.getAttribute("viewBox"));
    liveSvg.setAttribute("width", newSvg.getAttribute("width"));
    liveSvg.setAttribute("height", newSvg.getAttribute("height"));

    liveSvg.querySelectorAll("text").forEach(function (t) { t.remove(); });

    const rectEls = new Map();
    liveSvg.querySelectorAll("rect.chart-bar[data-uid]").forEach(function (rect) {
      rectEls.set(rect.dataset.uid, rect);
    });

    let baselineY = 0;
    oldBars.forEach(function (g) { baselineY = g.y + g.height; });
    if (!baselineY) newBars.forEach(function (g) { baselineY = g.y + g.height; });

    uids.forEach(function (uid) {
      if (!oldBars.has(uid) && newBars.has(uid)) {
        const to = newBars.get(uid);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("class", "chart-bar");
        rect.dataset.uid = uid;
        rect.setAttribute("rx", "2");
        rect.setAttribute("x", to.x);
        rect.setAttribute("width", to.width);
        rect.setAttribute("y", baselineY);
        rect.setAttribute("height", 0);
        rect.setAttribute("fill", to.fill);
        liveSvg.appendChild(rect);
        rectEls.set(uid, rect);
      }
    });

    animate(CHART_MS, function (t) {
      const e = easeInOut(t);
      uids.forEach(function (uid) {
        const rect = rectEls.get(uid);
        if (!rect) return;
        const to = newBars.get(uid) || { x: oldBars.get(uid).x, y: baselineY, width: oldBars.get(uid).width, height: 0, fill: oldBars.get(uid).fill };
        const from = oldBars.get(uid) || { x: to.x, y: baselineY, width: to.width, height: 0, fill: to.fill };
        rect.setAttribute("x", lerp(from.x, to.x, e).toFixed(1));
        rect.setAttribute("y", lerp(from.y, to.y, e).toFixed(1));
        rect.setAttribute("width", lerp(from.width, to.width, e).toFixed(1));
        rect.setAttribute("height", lerp(from.height, to.height, e).toFixed(1));
        rect.setAttribute("fill", lerpColor(from.fill, to.fill, e));
      });
    }, function () {
      uids.forEach(function (uid) {
        if (!newBars.has(uid)) {
          const rect = rectEls.get(uid);
          if (rect) rect.remove();
        }
      });
      newSvg.querySelectorAll("text").forEach(function (t) {
        const clone = t.cloneNode(true);
        clone.style.opacity = "0";
        liveSvg.appendChild(clone);
      });
      requestAnimationFrame(function () {
        liveSvg.querySelectorAll("text").forEach(function (t) {
          t.style.transition = "opacity 200ms ease-out";
          t.style.opacity = "1";
        });
      });
    });
  }

  function fetchDoc(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("fetch failed: " + r.status);
      return r.text();
    }).then(function (html) {
      return new DOMParser().parseFromString(html, "text/html");
    });
  }

  function go(url, link) {
    // Forward = a frise-item click, at any level (index -> season, or
    // season -> war): the current title shrinks into the breadcrumb, the
    // clicked frise pill grows into the new H1. Backward = a breadcrumb
    // click going back up a level (kept as a simple crossfade, per plan).
    const forward = !!(link && link.closest("#frise"));
    const backward = !!(link && link.closest("#breadcrumb"));

    let heroFrom = null;
    let heroText = null;
    let friseLabelFrom = null;
    let friseLabelText = null;
    if (forward) {
      const hero = document.getElementById("page-title");
      if (hero) {
        heroFrom = captureRect(hero);
        heroText = hero.textContent;
      }
      const label = link.querySelector(".frise-label");
      if (label) {
        friseLabelFrom = captureRect(label);
        friseLabelText = label.textContent;
      }
    }

    // The index's hero title is a different font-size than a season's plain
    // H1, so swapping title/breadcrumb content changes <header>'s natural
    // height. Left alone that reflows everything below (the frise!) in a
    // single instant jump. Lock the header at its pre-nav height across the
    // swap and animate it to the new height in step with the title ghost so
    // the frise slides smoothly instead of snapping.
    const header = document.querySelector("header");
    const headerFromH = header ? header.getBoundingClientRect().height : null;

    fetchDoc(url).then(function (doc) {
      // index<->season share the frise+chart+table-wrap+bareme-wrap layout
      // and get the fine-grained per-piece animations below. A war page has
      // none of that (just a result badge + guild tables), so any
      // transition involving one falls back to a plain crossfade of the
      // whole <main> instead -- there's no equivalent piece to animate to.
      const richTransition = !!(document.getElementById("chart-wrap") && doc.getElementById("chart-wrap"));

      if (richTransition) {
        const liveFrise = document.getElementById("frise");
        const newFrise = doc.getElementById("frise");
        if (liveFrise && newFrise) transitionFrise(liveFrise, newFrise.innerHTML);

        transitionChart(document.getElementById("chart-wrap"), doc.getElementById("chart-wrap"));

        // #chart-wrap-scores (the score-variance box plot) is always
        // rendered, even empty (see render_score_chart in generate_site.py),
        // specifically so this can be a plain innerHTML swap regardless of
        // whether either side of the navigation actually has per-battle data
        // -- no FLIP animation like the points chart above, just correctness.
        const liveScoreWrap = document.getElementById("chart-wrap-scores");
        const newScoreWrap = doc.getElementById("chart-wrap-scores");
        if (liveScoreWrap) liveScoreWrap.innerHTML = newScoreWrap ? newScoreWrap.innerHTML : "";

        const liveTableWrap = document.getElementById("table-wrap");
        const newTableWrap = doc.getElementById("table-wrap");
        if (liveTableWrap && newTableWrap) {
          liveTableWrap.innerHTML = newTableWrap.innerHTML;
          if (window.initSortableTables) window.initSortableTables(liveTableWrap);
        }

        const liveBareme = document.getElementById("bareme-wrap");
        const newBareme = doc.getElementById("bareme-wrap");
        if (liveBareme) liveBareme.innerHTML = newBareme ? newBareme.innerHTML : "";
      } else {
        const liveMain = document.querySelector("main");
        const newMain = doc.querySelector("main");
        if (liveMain && newMain) {
          const newMainHTML = newMain.innerHTML;
          liveMain.style.transition = "opacity 200ms ease-out";
          liveMain.style.opacity = "0";
          setTimeout(function () {
            liveMain.innerHTML = newMainHTML;
            if (window.initSortableTables) window.initSortableTables(liveMain);
            void liveMain.offsetWidth;
            liveMain.style.opacity = "1";
            setTimeout(function () { liveMain.style.transition = ""; }, 220);
          }, 200);
        }
      }

      const liveTitle = document.getElementById("page-title");
      const newTitle = doc.getElementById("page-title");
      const liveBreadcrumb = document.getElementById("breadcrumb");
      const newBreadcrumb = doc.getElementById("breadcrumb");

      let headerToH = null;
      if (liveTitle && newTitle) {
        liveTitle.className = newTitle.className;
        liveTitle.textContent = newTitle.textContent;
        if (liveBreadcrumb && newBreadcrumb) liveBreadcrumb.innerHTML = newBreadcrumb.innerHTML;

        // #header-extra (e.g. index's "Joueurs actifs seulement" toggle) is
        // absolutely positioned so it never factors into the header height
        // lock/animate below -- just swap it in wholesale like bareme-wrap,
        // always landing back in its default "off" markup on a fresh page.
        const liveExtra = document.getElementById("header-extra");
        const newExtra = doc.getElementById("header-extra");
        if (liveExtra) liveExtra.innerHTML = newExtra ? newExtra.innerHTML : "";

        if (header && headerFromH != null) {
          // Measure the natural height with the new content, then relock to
          // the old height immediately (still in the same synchronous
          // block, so nothing paints in between) -- this is what stops the
          // frise from snapping to its new spot before we've had a chance
          // to animate there.
          header.style.height = "auto";
          headerToH = header.getBoundingClientRect().height;
          header.style.height = headerFromH + "px";
          header.style.overflow = "hidden";
        }
      }

      if (forward && liveTitle && newTitle && liveBreadcrumb && newBreadcrumb) {
        const titleTo = captureRect(liveTitle);
        const breadcrumbLink = liveBreadcrumb.querySelector("a");
        const breadcrumbTo = breadcrumbLink ? captureRect(breadcrumbLink) : null;

        if (friseLabelFrom && friseLabelText) flipMove(friseLabelText, friseLabelFrom, titleTo, liveTitle);
        if (heroFrom && heroText && breadcrumbTo) flipMove(heroText, heroFrom, breadcrumbTo, breadcrumbLink, "←");
      } else if (backward && liveTitle) {
        liveTitle.style.transition = "none";
        liveTitle.style.opacity = "0";
        liveTitle.style.transform = "translateY(-6px)";
        void liveTitle.offsetWidth;
        liveTitle.style.transition = "opacity " + TITLE_MS + "ms ease-out, transform " + TITLE_MS + "ms ease-out";
        liveTitle.style.opacity = "1";
        liveTitle.style.transform = "translateY(0)";
      }

      if (header && headerToH != null) {
        header.style.transition = "height " + TITLE_MS + "ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        void header.offsetHeight; // reflow so the locked "from" height is committed before transitioning
        requestAnimationFrame(function () {
          header.style.height = headerToH + "px";
        });
        setTimeout(function () {
          header.style.height = "";
          header.style.overflow = "";
          header.style.transition = "";
        }, TITLE_MS + 40);
      }

      document.title = doc.title;
      history.pushState({ transition: true }, "", url);
    }).catch(function () {
      window.location.href = url;
    });
  }

  document.addEventListener("click", function (e) {
    const link = e.target.closest('a[data-transition="true"]');
    if (!link) return;
    e.preventDefault();
    go(link.getAttribute("href"), link);
  });

  window.addEventListener("popstate", function () {
    window.location.reload();
  });
})();
