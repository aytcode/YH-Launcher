// Basınca (bırakmayı beklemeden) aç: anında tepki
document.getElementById('pill').addEventListener('mousedown', (e) => {
  if (e.button === 0) yh.openFromPill();
});

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

let current = 'dark';
yh.getSettings().then((s) => applyTheme((current = s.theme)));
yh.on('theme', (t) => applyTheme((current = t)));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(current));
