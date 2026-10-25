const $ = (s) => document.querySelector(s);
const panelEl = $('#panel');
const qEl = $('#q');
const listEl = $('#list');
const innerEl = $('#list-inner');
const actionsEl = $('#actions');
const toastEl = $('#toast');
const modeEl = $('#mode');
const primaryHintEl = $('#primary-hint');
const primaryLabelEl = $('#primary-label');

const state = { flat: [], sel: 0, token: 0, actions: null, actSel: 0, actItem: null, cfg: null, view: null };
let hlEl = null;

// ---------------------------------------------------------------- yardımcılar

function letterTile(title) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const letter = esc((title.trim()[0] || '?').toLocaleUpperCase('tr'));
  return `<span class="letter" style="background:linear-gradient(180deg,hsl(${hue} 72% 62%),hsl(${hue} 68% 46%))">${letter}</span>`;
}

function iconHtml(item, size) {
  const icon = item.icon;
  if (!icon) return letterTile(item.title);
  if (icon.startsWith('sym:')) return symTile(icon.slice(4), size);
  const favicon = item.type === 'site' || item.type === 'web' ? ' class="favicon"' : '';
  return `<img${favicon} src="${esc(icon)}" alt="" data-fallback="${esc(item.title)}">`;
}

function highlight(title, q) {
  const t = String(title);
  const needle = q.trim().toLocaleLowerCase('tr');
  const i = needle ? t.toLocaleLowerCase('tr').indexOf(needle) : -1;
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + needle.length)) + '</mark>' + esc(t.slice(i + needle.length));
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const PRIMARY_LABEL = { copy: 'Kopyala', exec: 'Çalıştır', system: 'Çalıştır', internal: 'Çalıştır', setQuery: 'Tamamla', plugin: 'Seç' };

// ---------------------------------------------------------------- liste

let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 20);
}

async function refresh(keepSelection = false) {
  const q = qEl.value;
  const token = ++state.token;
  const res = q.trim() ? await yh.search(q) : await yh.home();
  if (token !== state.token) return;
  const prevId = keepSelection ? state.flat[state.sel]?.id : null;
  render(res, q);
  if (prevId) {
    const i = state.flat.findIndex((it) => it.id === prevId);
    if (i >= 0) select(i, true);
  }
  updateMode(q);
}

function rowHtml(item, idx, q) {
  return `
    <div class="item" data-idx="${idx}" role="option">
      <span class="icon">${iconHtml(item, 28)}</span>
      <div class="text">
        <div class="title">${highlight(item.title, q)}</div>
        ${item.subtitle ? `<div class="sub">${esc(item.subtitle)}</div>` : ''}
      </div>
      <div class="meta">
        ${item.pinned ? `<span class="pin" title="Sabitlendi">${svgIcon('pin', 13)}</span>` : ''}
        <span>${esc(item.label || '')}</span>
        <kbd class="enter">↵</kbd>
      </div>
    </div>`;
}

function tileHtml(item, idx) {
  return `
    <div class="item tile" data-idx="${idx}" role="option" aria-label="${esc(item.title)}">
      <span class="tile-icon">${iconHtml(item, 52)}</span>
      <span class="tile-label">${esc(item.title)}</span>
    </div>`;
}

function render(res, q) {
  state.flat = [];
  let html = '<div id="hl" class="highlight instant"></div>';
  for (const section of res.sections) {
    if (!section.items.length) continue;
    if (section.title) html += `<div class="section-title">${esc(section.title)}</div>`;
    const parts = section.items.map((item) => {
      const idx = state.flat.push(item) - 1;
      return section.layout === 'grid' ? tileHtml(item, idx) : rowHtml(item, idx, q);
    });
    html += section.layout === 'grid' ? `<div class="grid">${parts.join('')}</div>` : parts.join('');
  }
  if (!state.flat.length) {
    html += `<div class="empty"><b>Sonuç yok</b><span>"${esc(q.trim())}" için bir şey bulunamadı</span></div>`;
  }
  innerEl.innerHTML = html;
  hlEl = $('#hl');
  innerEl.querySelectorAll('img[data-fallback]').forEach((img) =>
    img.addEventListener('error', () => {
      img.outerHTML = letterTile(img.dataset.fallback);
    })
  );

  // Ana ekran <-> arama geçişinde yumuşak belirme; her tuşta değil
  const view = q.trim() ? 'search' : 'home';
  if (view !== state.view) {
    innerEl.classList.remove('enter');
    void innerEl.offsetWidth;
    innerEl.classList.add('enter');
    state.view = view;
  }
  listEl.scrollTop = 0;
  select(0, true);
}

function itemEl(i) {
  return innerEl.querySelector(`.item[data-idx="${i}"]`);
}

function moveHighlight(el, instant) {
  if (!hlEl) return;
  if (!el) {
    hlEl.style.opacity = '0';
    return;
  }
  if (instant) hlEl.classList.add('instant');
  hlEl.style.width = `${el.offsetWidth}px`;
  hlEl.style.height = `${el.offsetHeight}px`;
  hlEl.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
  hlEl.style.borderRadius = el.classList.contains('tile') ? '14px' : '10px';
  hlEl.style.opacity = '1';
  if (instant) {
    void hlEl.offsetWidth;
    hlEl.classList.remove('instant');
  }
}

function select(i, instant = false) {
  if (!state.flat.length) {
    moveHighlight(null);
    updateFooter();
    return;
  }
  state.sel = Math.max(0, Math.min(i, state.flat.length - 1));
  innerEl.querySelectorAll('.item.selected').forEach((el) => el.classList.remove('selected'));
  const el = itemEl(state.sel);
  if (el) {
    el.classList.add('selected');
    moveHighlight(el, instant);
    el.scrollIntoView({ block: 'nearest' });
  }
  updateFooter();
}

// Izgara + liste karışık düzende ok tuşları: en yakın komşuya geometrik olarak git
function neighbor(dir) {
  const els = [...innerEl.querySelectorAll('.item')];
  const cur = els[state.sel];
  if (!cur) return -1;
  const cx = cur.offsetLeft + cur.offsetWidth / 2;
  const cy = cur.offsetTop + cur.offsetHeight / 2;
  let best = -1;
  let bestScore = Infinity;
  els.forEach((el, i) => {
    if (i === state.sel) return;
    const dx = el.offsetLeft + el.offsetWidth / 2 - cx;
    const dy = el.offsetTop + el.offsetHeight / 2 - cy;
    let primary;
    if (dir === 'down' && dy > 4) primary = dy;
    else if (dir === 'up' && dy < -4) primary = -dy;
    else if (dir === 'right' && Math.abs(dy) < 4 && dx > 0) primary = dx;
    else if (dir === 'left' && Math.abs(dy) < 4 && dx < 0) primary = -dx;
    else return;
    const secondary = dir === 'up' || dir === 'down' ? Math.abs(dx) : 0;
    const score = Math.round(primary / 8) * 100000 + secondary;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function current() {
  return state.flat[state.sel];
}

function updateFooter() {
  const item = current();
  const kind = item?.action?.kind;
  primaryHintEl.style.visibility = item && kind !== 'noop' ? 'visible' : 'hidden';
  primaryLabelEl.textContent = PRIMARY_LABEL[kind] || 'Aç';
}

function updateMode(q) {
  document.querySelector('.searchbar').classList.toggle('has-query', !!q.trim());
  let label = '';
  if (q.startsWith('>')) label = 'Terminal';
  else if (/^(~|\/|[a-zA-Z]:[\\/])/.test(q)) label = 'Dosya gezgini';
  else {
    const m = q.match(/^(\S+)\s/);
    const eng = m && state.cfg?.engines.find((e) => e.key.toLowerCase() === m[1].toLowerCase());
    if (eng) label = eng.name;
  }
  if (modeEl.textContent !== label) modeEl.textContent = label;
  modeEl.classList.toggle('hidden', !label);
}

// ---------------------------------------------------------------- çalıştırma

async function handleResult(res = {}) {
  if (res.toast) toast(res.toast);
  if (res.openSettings) return Settings.open();
  if (res.setQuery != null) {
    qEl.value = res.setQuery;
    qEl.focus();
    return refresh();
  }
  if (res.refresh) refresh(true);
}

async function runSelected(mods = {}) {
  const item = current();
  if (!item) return;
  handleResult(await yh.run(item.id, mods));
}

async function runAction(actionId, item = current()) {
  if (!item) return;
  closeActions();
  handleResult(await yh.action(item.id, actionId));
}

// ---------------------------------------------------------------- eylem menüsü

async function openActions() {
  const item = current();
  if (!item) return;
  const list = await yh.actions(item.id);
  if (!list.length) return;
  state.actions = list;
  state.actItem = item;
  state.actSel = 0;
  let html = `<div class="actions-title">${esc(item.title)}</div>`;
  let sepDone = false;
  list.forEach((a, i) => {
    if (a.danger && !sepDone) {
      html += '<div class="action-sep"></div>';
      sepDone = true;
    }
    html += `
      <div class="action${a.danger ? ' danger' : ''}" data-act="${i}">
        <span class="action-icon">${svgIcon(a.icon.replace('sym:', ''), 15)}</span>
        <span>${esc(a.title)}</span>
        ${a.shortcut ? `<kbd>${esc(a.shortcut)}</kbd>` : ''}
      </div>`;
  });
  actionsEl.innerHTML = html;
  actionsEl.classList.remove('hidden');
  void actionsEl.offsetWidth;
  actionsEl.classList.add('open');
  selectAction(0);
}

function selectAction(i) {
  const n = state.actions.length;
  state.actSel = (i + n) % n;
  actionsEl.querySelectorAll('.action').forEach((el) => el.classList.toggle('selected', +el.dataset.act === state.actSel));
}

function closeActions() {
  state.actions = null;
  actionsEl.classList.remove('open');
}

actionsEl.addEventListener('click', (e) => {
  const el = e.target.closest('.action');
  if (el && state.actions) runAction(state.actions[+el.dataset.act].id, state.actItem);
});

actionsEl.addEventListener('mousemove', (e) => {
  if (e.movementX === 0 && e.movementY === 0) return;
  const el = e.target.closest('.action');
  if (el && state.actions && +el.dataset.act !== state.actSel) selectAction(+el.dataset.act);
});

// ---------------------------------------------------------------- klavye / fare

document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;

  if (Settings.isOpen) {
    if (e.key === 'Escape' && !Settings.capturing) {
      e.preventDefault();
      Settings.close();
    }
    return;
  }

  if (state.actions) {
    if (e.key === 'ArrowDown') selectAction(state.actSel + 1);
    else if (e.key === 'ArrowUp') selectAction(state.actSel - 1);
    else if (e.key === 'Enter') runAction(state.actions[state.actSel].id, state.actItem);
    else if (e.key === 'Escape' || (ctrl && e.key.toLowerCase() === 'k')) closeActions();
    else return;
    e.preventDefault();
    return;
  }

  const item = current();
  const key = e.key.toLowerCase();
  const onTile = itemEl(state.sel)?.classList.contains('tile');
  const go = (dir) => {
    const n = neighbor(dir);
    if (n >= 0) select(n);
  };

  // Sabitlenenleri yeniden sırala: listede Ctrl+↑/↓, kare ızgarada Ctrl+←/→ da olur
  if (ctrl && item?.pinned && (e.key === 'ArrowUp' || (onTile && e.key === 'ArrowLeft'))) runAction('pin-up');
  else if (ctrl && item?.pinned && (e.key === 'ArrowDown' || (onTile && e.key === 'ArrowRight'))) runAction('pin-down');
  else if (e.key === 'ArrowDown') go('down');
  else if (e.key === 'ArrowUp') go('up');
  else if (e.key === 'ArrowRight' && onTile) go('right');
  else if (e.key === 'ArrowLeft' && onTile) go('left');
  else if (e.key === 'PageDown') select(state.sel + 6);
  else if (e.key === 'PageUp') select(state.sel - 6);
  else if (e.key === 'Enter') runSelected({ shift: e.shiftKey, ctrl, alt: e.altKey });
  else if (e.key === 'Tab') {
    if (item?.complete != null) {
      qEl.value = item.complete;
      refresh();
    }
  } else if (e.key === 'Escape') {
    if (qEl.value) {
      qEl.value = '';
      refresh();
    } else yh.hide();
  } else if (ctrl && key === 'k') openActions();
  else if (ctrl && key === 'p' && item) runAction('pin');
  else if (ctrl && key === 'h' && item) runAction('hide');
  else if (ctrl && e.key === 'Delete' && item?.uninstallable) runAction('uninstall');
  else if (ctrl && e.key === ',') Settings.open();
  else if (ctrl && key === 'c' && qEl.selectionStart === qEl.selectionEnd && (item?.path || item?.url)) runAction(item.path ? 'copy-path' : 'copy-url');
  else if (ctrl && key === 'r') {
    yh.run('cmd:reload');
    toast('Yeniden taranıyor…');
  } else return;
  e.preventDefault();
});

qEl.addEventListener('input', scheduleRefresh);

listEl.addEventListener('mousemove', (e) => {
  // Liste yenilenince / kayınca Chromium imleç oynamadan sahte mousemove üretir;
  // sadece gerçek fare hareketi seçimi değiştirsin
  if (e.movementX === 0 && e.movementY === 0) return;
  const el = e.target.closest('.item');
  if (el && +el.dataset.idx !== state.sel) select(+el.dataset.idx);
});

listEl.addEventListener('click', (e) => {
  const el = e.target.closest('.item');
  if (!el) return;
  select(+el.dataset.idx);
  runSelected({ ctrl: e.ctrlKey, shift: e.shiftKey });
});

listEl.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('.item');
  if (!el) return;
  e.preventDefault();
  select(+el.dataset.idx);
  openActions();
});

document.addEventListener('mousedown', (e) => {
  if (state.actions && !actionsEl.contains(e.target) && !e.target.closest('#btn-actions')) closeActions();
});

$('#btn-actions').addEventListener('click', () => (state.actions ? closeActions() : openActions()));
$('#btn-settings').addEventListener('click', () => (Settings.isOpen ? Settings.close() : Settings.open()));
primaryHintEl.addEventListener('click', () => runSelected());

// ---------------------------------------------------------------- pencere olayları

yh.on('shown', (view) => {
  panelEl.classList.add('visible');
  if (view === 'settings') Settings.open();
  else {
    if (Settings.isOpen) Settings.close();
    qEl.focus();
    qEl.select();
    refresh(true);
  }
});

yh.on('hidden', () => {
  panelEl.classList.remove('visible');
  closeActions();
  if (Settings.isOpen) Settings.close(false);
  qEl.value = '';
  state.view = null;
  // Gizliyken ekrandaki ikonları (data URL) ve önbelleği tutma; açılınca anında yeniden çizilir
  state.token++;
  state.flat = [];
  innerEl.innerHTML = '';
  hlEl = null;
  yh.trimMemory();
});

// Ayar önce güncellenmeli: tema değişince prefers-color-scheme de değişir ve
// aşağıdaki dinleyici eski değeri uygulamasın
yh.on('theme', (theme) => {
  if (state.cfg) state.cfg.theme = theme;
  applyTheme(theme);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(state.cfg?.theme));

(async () => {
  state.cfg = await yh.getSettings();
  applyTheme(state.cfg.theme);
  applyAppearance(state.cfg);
  refresh();
})();
