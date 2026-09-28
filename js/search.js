// Live list filtering shared by every exercise search: runs on each keystroke, no Enter needed.
// Every typed word must match (any order), hyphens and accents don't matter ("pull-up" = "pullup" = "pull up"),
// and the best matches move to the top: name starts with the query, then a word starts with it, then anywhere.

/** Lowercase, drop accents, turn hyphens/dots/slashes into spaces. */
export const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[-_./,()]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Score one item's text against the query: 0 = no match, higher = better. */
export function score(text, q) {
  const t = norm(text), whole = norm(q), words = whole.split(' ').filter(Boolean);
  if (!words.length) return 1;
  const tight = t.replace(/ /g, '');
  let s = 0;
  for (const w of words) {
    const i = t.indexOf(w);
    if (i < 0) { if (tight.includes(w)) { s += 1; continue; } return 0; }
    s += i === 0 ? 4 : t[i - 1] === ' ' ? 3 : 2;
  }
  if (t.startsWith(whole)) s += 10;
  else if (t.includes(' ' + whole)) s += 5;
  return s;
}

/** Hide non-matching items under root (their text is in data-name, name first) and sort matches best-first.
 *  Returns how many are shown. With an empty query the original order comes back. */
export function filterList(root, raw, sel) {
  const items = [...root.querySelectorAll(sel)];
  items.forEach((el, i) => { if (el.dataset.ord == null) el.dataset.ord = i; });
  const q = norm(raw);
  let shown = 0;
  const ranked = items.map(el => {
    const s = q ? score(el.dataset.name, q) : 1;
    el.hidden = !s;
    if (s) shown++;
    return { el, s };
  });
  ranked.sort((a, b) => (b.s - a.s) || (a.el.dataset.ord - b.el.dataset.ord));
  const parent = items[0]?.parentElement;
  if (parent && ranked.some((r, i) => r.el !== parent.children[i])) for (const r of ranked) parent.appendChild(r.el);
  return shown;
}
