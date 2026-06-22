function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('pia_theme', next);
  updateThemeIco(next);
}

function updateThemeIco(t) {
  const ico = document.getElementById('themeIco');
  if (!ico) return;
  if (t === 'dark') {
    ico.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    ico.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}

// Aplica tema salvo ao carregar
(function() {
  const saved = localStorage.getItem('pia_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  // updateThemeIco chamado depois que o DOM estiver pronto
  document.addEventListener('DOMContentLoaded', () => updateThemeIco(saved));
})();
