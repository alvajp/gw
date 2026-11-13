// "Qui êtes-vous ?": the visitor says which player they are (profil.html); the choice stays in this browser's localStorage.
//  - top bar: a profile button at the far right, with a "?" badge until a player is chosen, a check once it is;
//  - every table with a row for that player (a data-href to their page), and the Joueurs list: the row is pinned at the top and marked next to the name.
// Nothing here is secured: it only personalises the display (all the data of the site is public anyway).
(function () {
  const KEY = "ljp-me";
  const base = new URL("../", document.currentScript.src).href;  // the site's root, whatever the page's depth
  const USER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const MARK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M6.8 12.6l3.6 3.6 6.8-7.2" fill="none" stroke="#0d1014" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function get() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.slug ? v : null; } catch (e) { return null; }
  }
  function set(v) {
    try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) {}
  }
  function slugOf(href) {
    const m = /joueurs\/([0-9a-f]+)\.html/.exec(href || "");
    return m ? m[1] : null;
  }

  function button(me) {
    const inner = document.querySelector(".topbar-inner");
    if (!inner || inner.querySelector(".me-btn")) return;
    const a = document.createElement("a");
    a.className = "me-btn" + (me ? " is-set" : "");
    a.href = base + "profil.html";
    a.title = me ? "Vous êtes " + me.name + " (changer)" : "Qui êtes-vous ?";
    a.setAttribute("aria-label", a.title);
    a.innerHTML = USER + '<span class="me-badge">' + (me ? CHECK : "?") + "</span>";
    inner.appendChild(a);
  }

  // keep `row` first in its container, also after the page re-orders the rows (column sort)
  function pin(holder, row) {
    const fix = function () { if (holder.firstElementChild !== row) holder.insertBefore(row, holder.firstElementChild); };
    fix();
    new MutationObserver(fix).observe(holder, { childList: true });
  }
  function mark(row, nameEl) {
    row.classList.add("is-me");
    if (!nameEl || row.querySelector(".me-mark")) return;
    const m = document.createElement("span");
    m.className = "me-mark";
    m.title = "C'est vous";
    m.innerHTML = MARK;
    nameEl.after(m);
    if (nameEl.parentElement && nameEl.parentElement.tagName === "TD") nameEl.parentElement.classList.add("me-name");
  }

  function personalise(me) {
    // the tables: only when the player has exactly one row in the table (not the lists of attacks, where they can have many)
    document.querySelectorAll("main table").forEach(function (t) {
      const body = t.tBodies[0];
      if (!body) return;
      const rows = Array.prototype.filter.call(body.rows, function (r) { return slugOf(r.getAttribute("data-href")) === me.slug; });
      if (rows.length !== 1) return;
      mark(rows[0], rows[0].querySelector(".player-btn"));
      pin(body, rows[0]);
    });
    // the Joueurs list
    document.querySelectorAll(".pg-rows").forEach(function (holder) {
      const rows = Array.prototype.filter.call(holder.children, function (r) {
        const btn = r.classList.contains("pg-row") && r.querySelector(".pg-who .player-btn");
        return !!btn && slugOf(btn.getAttribute("href")) === me.slug;
      });
      if (rows.length !== 1) return;
      mark(rows[0], rows[0].querySelector(".pg-who .player-btn"));
      pin(holder, rows[0]);
    });
  }

  // profil.html: the list of players to pick from; the chosen one is highlighted, clicking it again clears the choice
  function picker() {
    const list = document.getElementById("who-list");
    if (!list) return;
    const cur = get();
    list.querySelectorAll(".who-pick").forEach(function (b) { b.classList.toggle("is-current", !!cur && b.dataset.slug === cur.slug); });
    list.addEventListener("click", function (e) {
      const b = e.target.closest(".who-pick");
      if (!b) return;
      const same = !!cur && cur.slug === b.dataset.slug;
      set(same ? null : { slug: b.dataset.slug, name: b.dataset.name });
      // back to the page the visitor came from, the home page otherwise
      const ref = document.referrer;
      if (ref && ref.indexOf(base) === 0 && ref.indexOf("profil.html") < 0) location.href = ref; else location.href = base + "index.html";
    });
  }

  const me = get();
  button(me);
  if (me) personalise(me);
  picker();
})();
