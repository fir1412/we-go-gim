// Runs before anything is drawn (a classic script in <head>; the CSP allows no inline script): the saved light or
// dark choice and app colours go on the page first, so the loading outline in index.html is drawn in them.
try {
  const th = localStorage.getItem('wgg-theme');
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  const css = localStorage.getItem('wgg-palette');   // js/palette.js keeps it, and finds this tag by its id
  if (css) { const st = document.createElement('style'); st.id = 'palette-css'; st.textContent = css; document.head.append(st); }
} catch { /* storage blocked: the phone's own theme, the default colours */ }
