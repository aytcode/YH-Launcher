const $ = (s) => document.querySelector(s);
const qEl = $('#q');
const listEl = $('#list');
const actionsEl = $('#actions');
const toastEl = $('#toast');
const modeEl = $('#mode');

const state = { flat: [], sel: 0, token: 0, actions: null, actSel: 0, actItem: null, cfg: null };
const TILE_COLORS = ['#4f8cff', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4', '#eab308', '#ef4444'];

// ---------------------------------------------------------------- yardımcılar

function letterTile(title) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = TILE_COLORS[h % TILE_COLORS.length];
  const letter = esc((title.trim()[0] || '?').toLocaleUpperCase('tr'));
  return `<span class="item-icon letter" style="background:${color}">${letter}</span>`;
}

function iconHtml(item) {
  const icon = item.icon;
  if (!icon) return letterTile(item.title);
  if (icon === 'sym:logo') return `<span class="item-icon sym"><img class="logo-img" src="../../assets/logo.png" alt=""></span>`;
  if (icon.startsWith('sym:')) return `<span class="item-icon sym">${svgIcon(icon.slice(4))}</span>`;
  return `<span class="item-icon"><img src="${esc(icon)}" alt="" data-fallback="${esc(item.title)}"></span>`;
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

// ---------------------------------------------------------------- liste

let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 25);
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
    if (i >= 0) select(i);
  }
  updateMode(q);
}

function render(res, q) {
  state.flat = [];
  let html = '';
  for (const section of res.sections) {
    if (!section.items.length) continue;
    if (section.title) html += `<div class="section-title">${esc(section.title)}</div>`;
    for (const item of section.items) {
      const idx = state.flat.push(item) - 1;
      html += `
        <div class="item" data-idx="${idx}" role="option">
          ${iconHtml(item)}
          <div class="item-text">
            <div class="item-title">${highlight(item.title, q)}</div>
            ${item.subtitle ? `<div class="item-sub">${esc(item.subtitle)}</div>` : ''}
          </div>
          <div class="item-meta">
            ${item.pinned ? `<span class="pin" title="Sabitlendi">${svgIcon('pin', 14)}</span>` : ''}
            <span>${esc(item.label || '')}</span>
          </div>
        </div>`;
    }
  }
  listEl.innerHTML = html || `<div class="empty">Sonuç yok</div>`;
  listEl.querySelectorAll('img[data-fallback]').forEach((img) =>
    img.addEventListener('error', () => {
      img.parentElement.outerHTML = letterTile(img.dataset.fallback);
    })
  );
  listEl.scrollTop = 0;
  select(0);
}

function select(i) {
  if (!state.flat.length) return;
  state.sel = Math.max(0, Math.min(i, state.flat.length - 1));
  listEl.querySelectorAll('.item.selected').forEach((el) => el.classList.remove('selected'));
  const el = listEl.querySelector(`.item[data-idx="${state.sel}"]`);
  if (el) {
    el.classList.add('selected');
    el.scrollIntoView({ block: 'nearest' });
  }
}

function current() {
  return state.flat[state.sel];
}

function updateMode(q) {
  let label = '';
  if (q.startsWith('>')) label = 'Terminal';
  else if (/^(~|\/|[a-zA-Z]:[\\/])/.test(q)) label = 'Dosya gezgini';
  else {
    const m = q.match(/^(\S+)\s/);
    const eng = m && state.cfg?.engines.find((e) => e.key.toLowerCase() === m[1].toLowerCase());
    if (eng) label = eng.name;
  }
  modeEl.textContent = label;
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
  actionsEl.innerHTML =
    `<div class="actions-title">${esc(item.title)}</div>` +
    list
      .map(
        (a, i) => `
      <div class="action${a.danger ? ' danger' : ''}" data-act="${i}">
        <span class="action-icon">${svgIcon(a.icon.replace('sym:', ''), 16)}</span>
        <span>${esc(a.title)}</span>
        ${a.shortcut ? `<kbd>${esc(a.shortcut)}</kbd>` : ''}
      </div>`
      )
      .join('');
  actionsEl.classList.remove('hidden');
  selectAction(0);
}

function selectAction(i) {
  const n = state.actions.length;
  state.actSel = (i + n) % n;
  actionsEl.querySelectorAll('.action').forEach((el, j) => el.classList.toggle('selected', j === state.actSel));
}

function closeActions() {
  state.actions = null;
  actionsEl.classList.add('hidden');
}

actionsEl.addEventListener('click', (e) => {
  const el = e.target.closest('.action');
  if (el) runAction(state.actions[+el.dataset.act].id, state.actItem);
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
  if (ctrl && e.key === 'ArrowUp' && item?.pinned) runAction('pin-up');
  else if (ctrl && e.key === 'ArrowDown' && item?.pinned) runAction('pin-down');
  else if (e.key === 'ArrowDown') select(state.sel + 1);
  else if (e.key === 'ArrowUp') select(state.sel - 1);
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

let lastMouse = '';
listEl.addEventListener('mousemove', (e) => {
  const pos = `${e.screenX},${e.screenY}`;
  if (pos === lastMouse) return; // kaydırma sırasında seçimi değiştirme
  lastMouse = pos;
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

// ---------------------------------------------------------------- pencere olayları

yh.on('shown', (view) => {
  if (view === 'settings') Settings.open();
  else {
    if (Settings.isOpen) Settings.close();
    qEl.focus();
    qEl.select();
    refresh(true);
  }
});

yh.on('hidden', () => {
  closeActions();
  if (Settings.isOpen) Settings.close(false);
  qEl.value = '';
});

yh.on('theme', applyTheme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(state.cfg?.theme));

(async () => {
  state.cfg = await yh.getSettings();
  applyTheme(state.cfg.theme);
  refresh();
})();
