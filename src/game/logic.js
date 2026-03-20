export const PRI = { 7: 21, 6: 18, 1: 16, 5: 15, 4: 14, 3: 13, 2: 12, 8: 10, 9: 10, 10: 10 };

export function mkDeck() {
  const d = [];
  for (const s of ['$', 'X', 'C', 'B'])
    for (let v = 1; v <= 10; v++)
      d.push({ id: `${v}${s}`, v, s });
  return d;
}

export function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = 0 | Math.random() * (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function subsets(a) {
  const res = [], n = a.length;
  for (let m = 1; m < (1 << n); m++) {
    const s = [];
    for (let i = 0; i < n; i++) if (m >> i & 1) s.push(a[i]);
    res.push(s);
  }
  return res;
}

export function getCaps(c, table) {
  const ex = table.filter(t => t.v === c.v);
  if (ex.length) return [ex];
  return subsets(table).filter(s => s.length > 1 && s.reduce((a, t) => a + t.v, 0) === c.v);
}

export function isScopa(table, cap) {
  // Scopa fires only when ALL cards currently on the board are captured (board becomes empty)
  return table.length > 0 && cap.length === table.length;
}

export function score(pile, sc) {
  const den = pile.filter(c => c.s === '$').length;
  const sb = pile.some(c => c.v === 7 && c.s === '$') ? 1 : 0;
  const pm = {};
  pile.forEach(c => {
    const p = PRI[c.v];
    if (!pm[c.s] || p > pm[c.s]) pm[c.s] = p;
  });
  return { n: pile.length, den, sb, sc, pp: Object.values(pm).reduce((a, v) => a + v, 0) };
}

export function cmpScore(ps, es) {
  const r = { p: 0, e: 0 };
  if (ps.n > es.n) r.p++; else if (es.n > ps.n) r.e++;
  if (ps.den > es.den) r.p++; else if (es.den > ps.den) r.e++;
  r.p += ps.sb; r.e += es.sb;
  if (ps.pp > es.pp) r.p++; else if (es.pp > ps.pp) r.e++;
  r.p += ps.sc; r.e += es.sc;
  return r;
}

export function enricoAI(hand, table) {
  // 1. Settebello
  for (const c of hand)
    for (const cap of getCaps(c, table))
      if (cap.some(x => x.v === 7 && x.s === '$')) return { c, cap };
  // 2. Scopa
  for (const c of hand)
    for (const cap of getCaps(c, table))
      if (isScopa(table, cap)) return { c, cap };
  // 3. Most denari
  let best = null;
  for (const c of hand) {
    const caps = getCaps(c, table);
    if (caps.length) {
      const cap = caps[0];
      const d = cap.filter(x => x.s === '$').length;
      if (!best || d > best.d || (d === best.d && cap.length > best.cap.length))
        best = { c, cap, d };
    }
  }
  if (best) return { c: best.c, cap: best.cap };
  // 4. Any capture
  for (const c of hand) {
    const caps = getCaps(c, table);
    if (caps.length) return { c, cap: caps[0] };
  }
  // 5. Discard lowest (keep 7$ if possible)
  const s = [...hand].sort((a, b) => a.v - b.v);
  return { c: s.find(c => !(c.v === 7 && c.s === '$')) || s[0], cap: null };
}
