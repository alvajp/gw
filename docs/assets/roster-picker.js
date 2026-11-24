// The roster dialog of the custom teams (Simulation, war and raid): the roster of the player chosen in "Qui êtes-vous ?" (the cards of their page), capped to a line (Héros / Élite / Vétéran)
// when the page asks for it, sorted as the Joueurs page ("Niveau"), and a selection of five characters (and a machine of war) shown on top as the same cards.
//   RosterPicker.open({ picked: {units: [...], mow: ...}, tier: "hero", machine: true, capped: true, onDone: function (picked, tier) {} })
//   with choice: {title, note, items: [{key, n, sub}]} the bar asks for that choice instead of the war lines (no cap on the characters): the raid asks for the level of the boss; it is compulsory too.
//   a picked unit: {id, rk (rank, 0-based), sk (stars), it ([[item, level] ...])}. Nobody chosen in "Qui êtes-vous ?": the page of that choice opens instead (no roster is shown).
(function () {
  const TIERS = { hero: { n: "Héros", sub: "Mythique \u00b7 niv. 60", cap: "m", rar: 5, stars: 14, rank: 20, lvl: 60 }, elite: { n: "Élite", sub: "Légendaire \u00b7 niv. 50", cap: "l", rar: 4, stars: 11, rank: 18, lvl: 50 }, veteran: { n: "Vétéran", sub: "Épique \u00b7 niv. 35", cap: "e", rar: 3, stars: 8, rank: 13, lvl: 35 } };  // a line of that tier caps the characters (Veteran: Gold 1, level 35)
  const FREE = { n: "", cap: "m", rar: 5, stars: 14, rank: 20, lvl: 999 };  // no cap (the raid)
  const FRAME = { 2: "rare", 3: "epic", 4: "legendary", 5: "mythic" };
  const guild = document.body.dataset.guild || "ljp";
  const $ = function (id) { return document.getElementById(id); };
  const me = function () { try { const v = JSON.parse(localStorage.getItem(guild + "-me")); return v && v.slug ? v : null; } catch (e) { return null; } };
  const idOf = function (src) { return (String(src).match(/([^\/]+)\.webp/) || [])[1] || ""; };
  let dlg = null, cache = {}, sel = { units: [], mow: null }, opts = {}, tier = "hero", mine = null;

  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "sim-pick";
    dlg.innerHTML = '<div class="sp-head"><h3>Choisir mon équipe <small id="sp-who"></small></h3><button type="button" class="sp-x" aria-label="Fermer">×</button></div>' +
      '<div class="sp-bar" id="sp-bar"></div>' +
      '<div class="sp-sel"></div><div class="sp-note"></div><div class="sp-roster roster"><p class="mnone">Chargement du roster…</p></div>' +
      '<div class="sp-foot"><button type="button" class="rp-btn" id="sp-cancel">Annuler</button><button type="button" class="rp-btn sim-go" id="sp-ok">Valider la sélection</button></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg || e.target.closest(".sp-x") || e.target.closest("#sp-cancel")) { dlg.close(); return; }
      const t = e.target.closest("[data-tier]");
      if (t) { tier = t.dataset.tier; dlg.querySelectorAll("[data-tier]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); drawRoster(); return; }
      if (e.target.closest("#sp-ok")) {
        const keep = function (id) {
          const card = dlg.querySelector('.sp-roster .rc[data-id="' + id + '"]');
          return card ? { id: id, rk: +card.dataset.rk, sk: +card.dataset.sk, it: JSON.parse(card.dataset.items || "[]") } : null;
        };
        const picked = { units: sel.units.map(keep).filter(Boolean), mow: sel.mow ? keep(sel.mow) : null };
        dlg.close();
        if (opts.onDone) opts.onDone(picked, tier);
        return;
      }
      const c = e.target.closest(".rc[data-id]");
      if (c) toggle(c);
    });
    return dlg;
  }
  function buildBar() {  // the compulsory choice on top: the war line (caps the characters) or the level of a raid boss
    const ch = opts.choice, items = ch ? ch.items : Object.keys(TIERS).map(function (k) { return { key: k, n: TIERS[k].n, sub: TIERS[k].sub }; });
    $("sp-bar").innerHTML = '<div class="sp-bar-title"><b>' + (ch ? ch.title : "Ligne \u00e0 affronter") + "</b><small>" + (ch ? ch.note : "obligatoire : elle plafonne vos personnages (rareté, étoiles, rang, niveau) et fixe le niveau de la simulation") + '</small></div><div class="sp-tiers" role="group" aria-label="Choix">' +
      items.map(function (it) { return '<button type="button" class="map-chip sp-tier" data-tier="' + it.key + '" aria-pressed="false"><b>' + it.n + "</b>" + (it.sub ? "<small>" + it.sub + "</small>" : "") + "</button>"; }).join("") + "</div>";
  }
  const needsChoice = function () { return !!opts.choice || opts.capped !== false; };
  function toggle(c) {
    const id = c.dataset.id;
    if (c.dataset.mow === "1") sel.mow = sel.mow === id ? null : id;
    else if (sel.units.indexOf(id) >= 0) sel.units.splice(sel.units.indexOf(id), 1);
    else if (sel.units.length < 5) sel.units.push(id);
    else { dlg.querySelector(".sp-note").textContent = "Déjà 5 personnages : retirez-en un d'abord."; return; }
    dlg.querySelector(".sp-note").textContent = "";
    drawSelection(); markPicked();
  }
  function drawSelection() {  // the selected characters on top, as the same cards as the roster (capped stars, rank, level); a click on one takes it out
    const machine = opts.machine !== false, full = sel.units.length === 5 && (!machine || sel.mow) && (!needsChoice() || !!tier), card = function (id) { return id ? dlg.querySelector('.sp-roster .rc[data-id="' + id + '"]') : null; };
    const cell = function (id, empty) {
      const c = card(id);
      if (!c) return '<div class="rc sp-empty"><span class="rc-portrait"><b>?</b></span><div class="rc-name">' + empty + "</div></div>";
      const e = c.cloneNode(true); e.classList.remove("is-picked"); e.classList.add("sp-in");
      return e.outerHTML;
    };
    dlg.querySelector(".sp-sel").innerHTML = '<div class="rs-grid sp-slots">' + [0, 1, 2, 3, 4].map(function (i) { return cell(sel.units[i], "Perso " + (i + 1)); }).join("") + (machine ? cell(sel.mow, "Machine") : "") + "</div>" +
      '<span class="sp-count">' + sel.units.length + "/5 personnages" + (machine ? " · " + (sel.mow ? "machine choisie" : "pas de machine") : "") + "</span>";
    $("sp-ok").disabled = !full;
  }
  function markPicked() {
    dlg.querySelectorAll(".sp-roster .rc[data-id]").forEach(function (c) {
      c.classList.toggle("is-picked", c.dataset.mow === "1" ? sel.mow === c.dataset.id : sel.units.indexOf(c.dataset.id) >= 0);
    });
  }
  const starsOf = function (n) {  // 1-5 gold, 6-10 red, 11-13 blue, 14 wings (the roster pages' stars)
    if (n >= 14) return '<img class="st-img st-wings" src="assets/ui/star_mythic.png" alt="">';
    const k = n <= 5 ? ["gold", n] : n <= 10 ? ["red", n - 5] : ["blue", n - 10];
    return new Array(Math.max(0, k[1]) + 1).join('<img class="st-img' + (k[0] === "blue" ? " st-blue" : "") + '" src="assets/ui/star_' + k[0] + '.png" alt="">');
  };
  const num = function (c, k) { return parseInt(c.dataset[k], 10) || 0; };
  const byRarity = function (a, b) { return num(b, "rar") - num(a, "rar") || num(b, "stars") - num(a, "stars") || num(b, "rank") - num(a, "rank") || num(b, "level") - num(a, "level") || a.dataset.name.localeCompare(b.dataset.name); };
  const byLevel = function (a, b) { return num(b, "level") - num(a, "level") || byRarity(a, b); };  // the Joueurs page's default order ("Niveau")
  function loadRoster() {
    const box = dlg.querySelector(".sp-roster");
    if (cache[mine.slug]) { drawRoster(); return; }
    box.innerHTML = '<p class="mnone">Chargement du roster…</p>';
    fetch("joueurs/" + mine.slug + ".html").then(function (r) { return r.text(); }).then(function (t) {
      const doc = new DOMParser().parseFromString(t, "text/html");
      cache[mine.slug] = Array.prototype.map.call(doc.querySelectorAll("#roster .rs:not(.rs-flat) .rc"), function (c) { return document.importNode(c, true); });
      cache[mine.slug].forEach(function (c) { c.querySelectorAll("[src]").forEach(function (e) { e.setAttribute("src", e.getAttribute("src").replace("../assets/", "assets/")); }); });
      drawRoster();
    }).catch(function () { box.innerHTML = '<p class="mnone">Roster introuvable.</p>'; });
  }
  function drawRoster() {
    const capped = !opts.choice && opts.capped !== false, need = needsChoice(), machine = opts.machine !== false, all = (cache[mine.slug] || []).map(function (c) { return c.cloneNode(true); });
    dlg.querySelectorAll("[data-tier]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tier === tier)); });
    $("sp-bar").hidden = !need;
    $("sp-bar").classList.toggle("is-required", need && !tier);  // nothing chosen yet: the bar calls for attention
    dlg.querySelector(".sp-note").textContent = "";
    if (need && !tier) {  // the choice is compulsory (the war line caps the characters; the raid's level sets the simulation)
      dlg.querySelector(".sp-roster").innerHTML = '<p class="mnone">' + (opts.choice ? "Choisissez d\'abord la difficult\u00e9." : "Choisissez d\'abord une ligne : H\u00e9ros, \u00c9lite ou V\u00e9t\u00e9ran. Elle plafonne les personnages.") + "</p>";
      drawSelection(); return;
    }
    const T = capped ? TIERS[tier] : FREE;
    all.forEach(function (c) {  // capped to the line: rarity, stars, rank and level can not go above it
      const rar = Math.min(+c.dataset.rar, T.rar), low = capped && +c.dataset.rar < T.rar, mow = c.dataset.mow === "1";
      c.dataset.id = idOf(c.querySelector(".rc-img").getAttribute("src"));
      c.classList.remove("rar-mythic", "rar-legendary", "rar-epic", "rar-rare"); c.classList.add("rar-" + FRAME[rar]);
      c.querySelector(".rc-frame").setAttribute("src", "assets/ui/frame_portrait_" + FRAME[rar] + ".png");
      c.querySelector(".rc-stars").innerHTML = starsOf(Math.min(+c.dataset.stars, T.stars));
      if (!mow) {
        c.querySelector(".rc-rank-badge").setAttribute("src", "assets/ui/rank_" + Math.min(+c.dataset.rank, T.rank) + ".png");
        const l = c.querySelector(".rc-lvl"); if (l) l.textContent = Math.min(+c.dataset.level, T.lvl);
      }
      c.classList.toggle("rc-low", low);
      if (low) c.title = (c.title || "") + " · sous le plafond de la ligne : joué au niveau de la ligne dans la simulation";
      const it = c.querySelector(".rc-items");  // its items, as the roster has them (capped to the line: a better rarity becomes the same item of the line's rarity)
      if (it) {
        const letters = "CURELM", capL = T.cap === "m" ? 5 : T.cap === "l" ? 4 : 3;
        c.dataset.items = JSON.stringify(Array.prototype.map.call(it.querySelectorAll(".it-art"), function (x) {
          let id = idOf(x.querySelector(".it-img").getAttribute("src")); const m = /^(I_[A-Za-z_]+)_([CURELM])(\d+)$/.exec(id);
          if (m && letters.indexOf(m[2]) > capL) id = m[1] + "_" + letters[capL] + m[3];
          return [id, parseInt((x.querySelector(".it-lvl") || {}).textContent, 10) || 1];
        }));
        it.remove();
      }
      c.dataset.rk = Math.min(+c.dataset.rank, T.rank) - 1; c.dataset.sk = Math.min(+c.dataset.stars, T.stars);
    });
    const heroes = all.filter(function (c) { return c.dataset.mow !== "1"; }).sort(byLevel), machines = all.filter(function (c) { return c.dataset.mow === "1"; }).sort(byRarity);
    const grid = function (list) { return '<div class="rs-grid">' + list.map(function (c) { return c.outerHTML; }).join("") + "</div>"; };
    dlg.querySelector(".sp-roster").innerHTML = all.length ? '<section class="rs">' + grid(heroes) + "</section>" + (machine ? '<section class="rs"><h2 class="rs-title">Machines de guerre</h2>' + grid(machines) + "</section>" : "") : '<p class="mnone">Roster vide.</p>';
    drawSelection(); markPicked();
  }
  function open(o) {
    mine = me();
    if (!mine) { location.href = "profil.html"; return false; }  // nobody chosen in "Qui êtes-vous ?": no roster, so go and choose
    opts = o || {};
    const keys = opts.choice ? opts.choice.items.map(function (x) { return x.key; }) : Object.keys(TIERS);
    tier = opts.tier && keys.indexOf(opts.tier) >= 0 ? opts.tier : null;  // no default: the player picks one
    ensureDialog();
    buildBar();
    const picked = opts.picked || { units: [], mow: null };
    sel = { units: picked.units.map(function (x) { return x.id; }), mow: picked.mow ? picked.mow.id : null };
    $("sp-who").textContent = "· roster de " + mine.name;
    drawSelection();
    dlg.showModal();
    loadRoster();
    return true;
  }
  window.RosterPicker = { TIERS: TIERS, me: me, open: open };
})();
