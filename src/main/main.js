const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, screen, shell, clipboard, nativeImage, dialog, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Store = require('./store');
const Search = require('./search');
const uninstall = require('./uninstall');
const { isWin, runDetached, spawnDetached, runInTerminal, powershell, psQuote } = require('./util');

const isLinux = process.platform === 'linux';
if (isLinux) {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  // Wayland'de global kısayollar XDG portalı üzerinden çalışır
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
}
if (!app.requestSingleInstanceLock()) app.quit();

// Varsayılan kısayol başka bir program tarafından kullanılıyorsa sırayla denenir
const FALLBACK_HOTKEYS = ['Alt+Space', 'Ctrl+Alt+Space', 'Super+Space', 'Ctrl+Shift+Space'];

const ASSETS = path.join(__dirname, '../../assets');
const SAFE_PROTOCOLS = /^(https?|mailto|ms-settings|discord|steam|spotify|vscode|file):/i;

let win;
let tray;
let store;
let search;
let modalOpen = false; // onay penceresi açıkken bulanıklaşınca gizlenmesin

// ---------------------------------------------------------------- pencere

function createWindow() {
  win = new BrowserWindow({
    width: 780,
    height: 540,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#00000000',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('blur', () => {
    if (!modalOpen && !win.webContents.isDevToolsOpened()) hide();
  });
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      hide();
    }
  });
  // Uygulama içi linkler tarayıcıda açılsın
  win.webContents.setWindowOpenHandler(({ url }) => {
    openUrl(url);
    return { action: 'deny' };
  });
}

function show(view = 'search') {
  const point = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;
  const [w] = win.getSize();
  win.setPosition(Math.round(area.x + (area.width - w) / 2), Math.round(area.y + area.height * 0.16));
  // Linux'ta hangi çalışma alanındaysan orada açılsın
  if (isLinux) win.setVisibleOnAllWorkspaces(true);
  win.show();
  win.focus();
  win.webContents.send('shown', view);
}

function hide() {
  if (win?.isVisible()) {
    win.hide();
    win.webContents.send('hidden');
  }
}

function toggle() {
  if (win.isVisible() && win.isFocused()) hide();
  else show();
}

async function confirm(message, detail, okLabel = 'Evet') {
  modalOpen = true;
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: [okLabel, 'Vazgeç'],
      defaultId: 1,
      cancelId: 1,
      title: 'YH Launcher',
      message,
      detail,
    });
    return response === 0;
  } finally {
    modalOpen = false;
    if (win.isVisible()) win.focus();
  }
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, icon: path.join(ASSETS, 'icon.png') }).show();
}

function openUrl(url) {
  if (SAFE_PROTOCOLS.test(url)) shell.openExternal(url);
}

// ---------------------------------------------------------------- kısayol / başlangıç

function registerHotkey(accelerator) {
  globalShortcut.unregisterAll();
  try {
    if (globalShortcut.register(accelerator, toggle)) return true;
  } catch {
    // geçersiz kısayol
  }
  return false;
}

// Kayıtlı kısayol alınamazsa (ör. GNOME/KDE Alt+Space'i kullanıyor) bir yedeğini dene
function registerStartupHotkey() {
  const saved = store.get('hotkey');
  if (registerHotkey(saved)) return;
  const alt = FALLBACK_HOTKEYS.find((k) => k !== saved && registerHotkey(k));
  if (alt) {
    store.set('hotkey', alt);
    tray?.setToolTip(`YH Launcher (${alt})`);
    notify('Kısayol değiştirildi', `${saved} başka bir uygulama tarafından kullanılıyor; ${alt} atandı. Ayarlardan değiştirebilirsin.`);
  } else {
    notify(
      'Kısayol kaydedilemedi',
      isLinux
        ? 'Sistem ayarlarından "yh-launcher --toggle" komutuna bir klavye kısayolu ata.'
        : `${saved} kullanılamıyor. Ayarlardan başka bir kısayol seç.`
    );
  }
}

function setLaunchAtStartup(enabled) {
  if (isLinux) {
    const dir = path.join(os.homedir(), '.config/autostart');
    const file = path.join(dir, 'yh-launcher.desktop');
    if (!enabled) return fs.rmSync(file, { force: true });
    const exec = process.env.APPIMAGE || process.execPath;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=YH Launcher\nExec="${exec}" --hidden\nIcon=yh-launcher\nX-GNOME-Autostart-enabled=true\n`);
  } else {
    // Taşınabilir (portable) sürüm her açılışta geçici klasöre açılır; asıl exe yolunu kaydet
    const exe = process.env.PORTABLE_EXECUTABLE_FILE;
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'], ...(exe ? { path: exe } : {}) });
  }
}

// ---------------------------------------------------------------- çalıştırma

async function runItem(item, mods = {}) {
  const a = item.action || {};
  if (!item.noTrack && a.kind !== 'setQuery' && a.kind !== 'noop') store.bump(item.id);

  switch (a.kind) {
    case 'open-path':
      if (mods.shift && isWin && item.type === 'app') return runAsAdmin(item);
      if (mods.ctrl) return reveal(item);
      shell.openPath(a.path).then((err) => err && notify('Açılamadı', err));
      break;
    case 'uwp':
      spawnDetached('explorer.exe', [`shell:AppsFolder\\${a.appId}`]);
      break;
    case 'linux-app':
      if (a.terminal) runInTerminal(a.exec);
      else runDetached(a.exec, { cwd: a.cwd && fs.existsSync(a.cwd) ? a.cwd : os.homedir() });
      break;
    case 'url': {
      openUrl(a.url);
      if (a.learn) {
        const added = search.web.learn(a.url);
        if (added) notify('Yeni sık kullanılan site', `${added} sık ziyaret ettiğin için sitelerine eklendi.`);
      }
      break;
    }
    case 'copy':
      clipboard.writeText(a.text);
      break;
    case 'exec':
      if (a.terminal) {
        if (!runInTerminal(a.cmd)) notify('Terminal bulunamadı', 'Desteklenen bir terminal kurulu değil.');
      } else runDetached(a.cmd, { cwd: os.homedir() });
      break;
    case 'system': {
      const cmd = search.cmds.systemCommand(a.name);
      if (a.confirm && !(await confirm(`${item.title}?`, 'Kaydedilmemiş işler kaybolabilir.'))) return { keepOpen: true };
      runDetached(cmd);
      break;
    }
    case 'internal':
      return runInternal(a.name);
    case 'plugin': {
      const res = await search.plugins.run(a.pluginId, a.data);
      return handlePluginResult(res);
    }
    case 'setQuery':
      return { keepOpen: true, setQuery: a.query };
    default:
      return { keepOpen: true };
  }
  hide();
  return {};
}

function handlePluginResult(res = {}) {
  if (res.url) openUrl(res.url);
  if (res.copy != null) clipboard.writeText(String(res.copy));
  if (res.notify) notify(res.notify.title || 'YH Launcher', res.notify.body || '');
  if (res.setQuery != null) return { keepOpen: true, setQuery: res.setQuery };
  if (res.keepOpen) return { keepOpen: true, refresh: true };
  hide();
  return {};
}

async function runInternal(name) {
  switch (name) {
    case 'settings':
      return { keepOpen: true, openSettings: true };
    case 'reload':
      await search.reload();
      notify('YH Launcher', `${search.apps.items.length} uygulama bulundu.`);
      return { keepOpen: true, refresh: true };
    case 'plugins-folder':
      shell.openPath(search.plugins.userDir);
      break;
    case 'quit':
      app.isQuitting = true;
      app.quit();
      break;
    default:
  }
  hide();
  return {};
}

function runAsAdmin(item) {
  const target = item.action.path;
  if (isWin) powershell(`Start-Process -FilePath ${psQuote(target)} -Verb RunAs`).catch(() => {});
  hide();
  return {};
}

function reveal(item) {
  const p = item.target || item.path || item.action?.path || item.desktopFile;
  if (p) shell.showItemInFolder(p);
  hide();
  return {};
}

// ---------------------------------------------------------------- eylemler (Ctrl+K)

function actionsFor(item) {
  const list = [];
  const add = (id, title, shortcut, icon, danger) => list.push({ id, title, shortcut, icon, danger });
  add('run', item.type === 'command' || item.type === 'shell' ? 'Çalıştır' : 'Aç', 'Enter', 'sym:enter');
  if (item.type === 'app' && isWin && item.action?.kind === 'open-path') add('admin', 'Yönetici olarak çalıştır', 'Shift+Enter', 'sym:shield');
  if (['app', 'file', 'folder'].includes(item.type) && (item.target || item.path || item.desktopFile || item.action?.path)) add('reveal', 'Dosya konumunu aç', 'Ctrl+Enter', 'sym:folder');
  if (item.path) add('copy-path', 'Yolu kopyala', 'Ctrl+C', 'sym:copy');
  if (item.url) add('copy-url', 'Linki kopyala', 'Ctrl+C', 'sym:copy');
  if (!item.noTrack && item.type !== 'calc') {
    add('pin', item.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', 'Ctrl+P', 'sym:pin');
    if (item.pinned) {
      add('pin-up', 'Sabitlenenlerde yukarı taşı', 'Ctrl+↑', 'sym:up');
      add('pin-down', 'Sabitlenenlerde aşağı taşı', 'Ctrl+↓', 'sym:down');
    }
  }
  if (item.type === 'site' && item.userSite) add('remove-site', 'Sitelerden çıkar', '', 'sym:x', true);
  if (item.type === 'command' && item.customIndex != null) add('remove-cmd', 'Özel komutu sil', '', 'sym:x', true);
  if (['app', 'file', 'folder', 'command', 'site'].includes(item.type)) add('hide', 'Sonuçlardan gizle', 'Ctrl+H', 'sym:eye-off');
  if (item.usage !== false && store.get('usage')[item.id]) add('forget', 'Kullanım geçmişinden sil', '', 'sym:history');
  if (item.uninstallable) add('uninstall', 'Kaldır (uninstall)', 'Ctrl+Delete', 'sym:trash', true);
  return list;
}

async function doAction(item, id) {
  switch (id) {
    case 'run':
      return runItem(item);
    case 'admin':
      return runAsAdmin(item);
    case 'reveal':
      return reveal(item);
    case 'copy-path':
      clipboard.writeText(item.path);
      return { toast: 'Yol kopyalandı', keepOpen: true };
    case 'copy-url':
      clipboard.writeText(item.url);
      return { toast: 'Link kopyalandı', keepOpen: true };
    case 'pin': {
      const pinned = store.togglePin(item);
      return { toast: pinned ? 'Sabitlendi' : 'Sabitleme kaldırıldı', keepOpen: true, refresh: true };
    }
    case 'pin-up':
    case 'pin-down':
      store.movePin(item.id, id === 'pin-up' ? -1 : 1);
      return { keepOpen: true, refresh: true };
    case 'hide':
      store.set('hidden', [...new Set([...store.get('hidden'), item.id])]);
      if (store.isPinned(item.id)) store.togglePin(item);
      return { toast: `"${item.title}" gizlendi (Ayarlar › Gizlenenler)`, keepOpen: true, refresh: true };
    case 'forget': {
      const usage = store.get('usage');
      delete usage[item.id];
      store.set('usage', usage);
      return { toast: 'Geçmişten silindi', keepOpen: true, refresh: true };
    }
    case 'remove-site':
      store.set('sites', store.get('sites').filter((s) => s.url !== item.url));
      if (store.isPinned(item.id)) store.togglePin(item);
      return { toast: 'Site çıkarıldı', keepOpen: true, refresh: true };
    case 'remove-cmd':
      store.set('commands', store.get('commands').filter((_, i) => i !== item.customIndex));
      return { toast: 'Komut silindi', keepOpen: true, refresh: true };
    case 'uninstall':
      return doUninstall(item);
    default:
      return { keepOpen: true };
  }
}

async function doUninstall(item) {
  let plan;
  try {
    plan = await uninstall.plan(item);
  } catch (e) {
    console.error(e);
  }
  if (!plan) {
    if (isWin && (await confirm(`"${item.title}" için kaldırıcı bulunamadı.`, 'Windows "Yüklü uygulamalar" sayfası açılsın mı?', 'Aç'))) {
      openUrl('ms-settings:appsfeatures');
      hide();
      return {};
    }
    if (!isWin) notify('Kaldırılamadı', `"${item.title}" için paket bulunamadı. Paket yöneticini kullan.`);
    return { keepOpen: true };
  }
  const ok = await confirm(`"${plan.label}" kaldırılsın mı?`, 'Uygulamanın kendi kaldırıcısı / paket yöneticisi çalıştırılacak.', 'Kaldır');
  if (!ok) return { keepOpen: true };
  hide();
  try {
    const res = await plan.exec();
    if (res && res.ok === false) notify('Kaldırma başarısız', (res.stderr || '').slice(0, 200) || 'İşlem iptal edildi.');
    else if (!isWin || item.appId) notify('Kaldırıldı', `${item.title} kaldırıldı.`);
    if (store.isPinned(item.id)) store.togglePin(item);
    setTimeout(() => search.apps.refresh(), isWin && !item.appId ? 60000 : 2000);
  } catch (e) {
    notify('Kaldırma başarısız', e.message.slice(0, 200));
  }
  return {};
}

// ---------------------------------------------------------------- IPC

function setupIpc() {
  ipcMain.handle('search', (_e, q) => search.query(q));
  ipcMain.handle('home', () => search.home());
  ipcMain.handle('run', (_e, id, mods) => {
    const item = search.get(id);
    return item ? runItem(item, mods) : { keepOpen: true };
  });
  ipcMain.handle('actions', (_e, id) => {
    const item = search.get(id);
    return item ? actionsFor(item) : [];
  });
  ipcMain.handle('action', (_e, id, actionId) => {
    const item = search.get(id);
    return item ? doAction(item, actionId) : { keepOpen: true };
  });
  ipcMain.handle('settings:get', () => ({ ...store.data, platform: process.platform, version: app.getVersion() }));
  ipcMain.handle('settings:set', (_e, patch) => {
    const result = { ok: true };
    if ('hotkey' in patch && patch.hotkey !== store.get('hotkey')) {
      if (!registerHotkey(patch.hotkey)) {
        registerHotkey(store.get('hotkey'));
        return { ok: false, error: `"${patch.hotkey}" kısayolu kullanılamıyor (başka bir uygulama kullanıyor olabilir).` };
      }
    }
    if ('launchAtStartup' in patch) setLaunchAtStartup(patch.launchAtStartup);
    const allowed = ['hotkey', 'launchAtStartup', 'theme', 'maxResults', 'fileSearch', 'extraFileRoots', 'defaultEngine', 'autoLearnSites', 'hidden', 'sites', 'engines', 'commands', 'disabledPlugins', 'usage'];
    for (const k of Object.keys(patch)) if (allowed.includes(k)) store.data[k] = patch[k];
    store.save();
    if ('fileSearch' in patch || 'extraFileRoots' in patch) search.files.refresh();
    if ('theme' in patch) win.webContents.send('theme', patch.theme);
    return result;
  });
  ipcMain.handle('plugins:list', () => search.plugins.list());
  ipcMain.handle('plugins:folder', () => shell.openPath(search.plugins.userDir));
  ipcMain.handle('plugins:reload', async () => {
    await search.plugins.load();
    return search.plugins.list();
  });
  ipcMain.handle('open-url', (_e, url) => openUrl(url));
  ipcMain.handle('pick-folder', async () => {
    modalOpen = true;
    try {
      const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    } finally {
      modalOpen = false;
      win.focus();
    }
  });
  ipcMain.on('hide', hide);
}

// ---------------------------------------------------------------- tepsi

function createTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(img.resize({ width: isWin ? 16 : 22, height: isWin ? 16 : 22 }));
  tray.setToolTip(`YH Launcher (${store.get('hotkey')})`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Aç', click: () => show() },
      { label: 'Ayarlar', click: () => show('settings') },
      { label: 'Uygulamaları yeniden tara', click: () => search.reload() },
      { type: 'separator' },
      { label: 'YazılımHub Discord', click: () => openUrl('https://discord.gg/yazilimhub') },
      { type: 'separator' },
      { label: 'Çık', click: () => { app.isQuitting = true; app.quit(); } },
    ])
  );
  tray.on('click', () => show());
}

// ---------------------------------------------------------------- başlat

// "yh-launcher --toggle" (ör. Wayland'de sistem kısayoluna bağlanır) aç/kapat yapar
app.on('second-instance', (_e, argv) => (argv.includes('--toggle') ? toggle() : show()));

app.whenReady().then(async () => {
  if (isWin) app.setAppUserModelId('com.yazilimhub.launcher');
  store = new Store();
  search = new Search(store, {
    openUrl,
    copy: (t) => clipboard.writeText(String(t)),
    openPath: (p) => shell.openPath(p),
    exec: (cmd) => runDetached(cmd),
    terminal: (cmd) => runInTerminal(cmd),
    notify,
    platform: process.platform,
  });
  setupIpc();
  createWindow();
  createTray();
  await search.init();

  registerStartupHotkey();
  // Yeni kurulan uygulamaları yakalamak için ara ara tara
  setInterval(() => search.apps.refresh().catch(() => {}), 10 * 60 * 1000);
  setInterval(() => search.files.refresh().catch(() => {}), 30 * 60 * 1000);

  if (!process.argv.includes('--hidden')) {
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => show());
    else show();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  store?.flush();
});

app.on('window-all-closed', (e) => e.preventDefault());
