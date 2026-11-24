// The board rules of Tacticus the viewers need (replay.js: the cells a selected character can reach and the cells where the other side can hit it).
// A board is the list of its cells [column, row, tile id, elevation, kind (0 walkable, 1 blocking: wall / water, 2 not playable), rotation]; flat-top hexagons, row 0 at the bottom,
// the odd columns half a cell lower. Rules, from the game's own texts and checked on the recorded replays:
//  - a step costs one movement; no step onto a blocking or unplayable hex, onto an enemy, nor between hexes more than 1 elevation apart; a unit can walk through its friends but not stop on them;
//  - Razor Wire (tile "Swamp") and the fire / ice hexes make a unit end its movement when it enters them; Flying and Unstoppable (also Vehicle, Immune) units are not stopped;
//  - Flying units cross blocking hexes, enemies and any elevation (they still cannot end on a blocking hex or on another unit);
//  - a Bridge is entered and left only through two opposite sides (its "edges", turned by the tile's rotation);
//  - a hit needs the target within the weapon's range (1 = melee, n = ranged) and a clear line of sight: an elevation 2 or more above the shooter (or above the target) right next
//    to it, on the line, blocks the shot, unless the two are adjacent. Indirect Fire units shoot over it.
(function () {
  const OFF = 3;  // the visual grid's first column is 3: the odd columns of the logical grid are the lower ones (see replay.js)
  const cube = function (c, r) { const cc = c + OFF, z = -r - (cc + (cc & 1)) / 2; return [cc, -cc - z, z]; };
  const offset = function (q) { const cc = q[0], r = -q[2] - (cc + (cc & 1)) / 2; return [cc - OFF, r]; };
  const cdist = function (a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])); };
  const round = function (x, y, z) {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return [rx, ry, rz];
  };

  window.HexRules = function (cells, edges) {
    const at = {};
    cells.forEach(function (c) { at[c[0] + "," + c[1]] = { c: c[0], r: c[1], tile: c[2], el: c[3], kind: c[4], rot: c[5] || 0 }; });
    const bridge = edges || { Bridge: [1, 4] };
    const cell = function (c, r) { return at[c + "," + r] || null; };
    // the six neighbours, by direction: N, NE, SE, S, SW, NW
    const around = function (c, r) {
      const odd = c % 2 !== 0;
      return [[c, r + 1], [c + 1, r + (odd ? 0 : 1)], [c + 1, r - (odd ? 1 : 0)], [c, r - 1], [c - 1, r - (odd ? 1 : 0)], [c - 1, r + (odd ? 0 : 1)]];
    };
    const sides = function (x) {  // the directions a bridge can be crossed through
      const e = bridge[x.tile];
      return e ? e.map(function (d) { return (d + x.rot) % 6; }) : null;
    };
    const dist = function (a, b) { return cdist(cube(a[0], a[1]), cube(b[0], b[1])); };

    // the cells a unit can end its move on, with the cost of getting there. u: {from: [c, r], mov, fly, free (unstoppable), enemy(c, r), any(c, r), stop(c, r)}
    // enemy / any / stop: is there an enemy / any unit / a movement-ending effect (fire, ice) on that hex
    const reach = function (u) {
      const best = {}, out = [], queue = [[u.from[0], u.from[1], 0]];
      best[u.from[0] + "," + u.from[1]] = 0;
      for (let i = 0; i < queue.length; i++) {
        const q = queue[i], here = cell(q[0], q[1]);
        if (!here) continue;
        out.push({ c: q[0], r: q[1], k: q[2] });
        if (q[2] >= u.mov) continue;
        if (i > 0 && !u.fly && !u.free && (here.tile === "Swamp" || u.stop(q[0], q[1]))) continue;  // razor wire / fire / ice: the move ends here
        const ring = around(q[0], q[1]), from = sides(here);
        ring.forEach(function (n, d) {
          const key = n[0] + "," + n[1], to = cell(n[0], n[1]);
          if (!to || best[key] !== undefined || to.kind === 2) return;
          if (to.kind === 1 && !u.fly) return;
          if (!u.fly && Math.abs(to.el - here.el) > 1) return;
          if (!u.fly && u.enemy(n[0], n[1])) return;
          const sb = sides(to);
          if (!u.fly && ((from && from.indexOf(d) < 0) || (sb && sb.indexOf((d + 3) % 6) < 0))) return;
          best[key] = q[2] + 1;
          queue.push([n[0], n[1], q[2] + 1]);
        });
      }
      return out.filter(function (x, i) {  // it cannot stop on a hex that is blocking or that holds another unit (its own hex stays)
        const t = cell(x.c, x.r);
        return i === 0 || (t.kind === 0 && !u.any(x.c, x.r));
      });
    };

    // is the line from a shooter to its target clear? (see the rules above)
    const sight = function (a, b) {
      const n = dist(a, b);
      if (n <= 1) return true;
      const ca = cube(a[0], a[1]), cb = cube(b[0], b[1]), pick = function (i) {
        const t = i / n, p = offset(round(ca[0] + (cb[0] - ca[0]) * t + 1e-6, ca[1] + (cb[1] - ca[1]) * t + 2e-6, ca[2] + (cb[2] - ca[2]) * t - 3e-6));
        return cell(p[0], p[1]);
      };
      const ea = cell(a[0], a[1]), eb = cell(b[0], b[1]), first = pick(1), last = pick(n - 1);
      return !((first && ea && first.el - ea.el >= 2) || (last && eb && last.el - eb.el >= 2));
    };

    // every cell a unit standing on `from` can hit with a weapon of this range
    const hits = function (from, range, indirect) {
      const out = [];
      Object.keys(at).forEach(function (k) {
        const t = at[k], d = dist(from, [t.c, t.r]);
        if (d >= 1 && d <= range && t.kind !== 2 && (indirect || sight(from, [t.c, t.r]))) out.push([t.c, t.r]);
      });
      return out;
    };
    return { cell: cell, around: around, dist: dist, reach: reach, hits: hits, sight: sight };
  };
})();
