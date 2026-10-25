const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');
const { isWin, powershell } = require('../util');

// Başlat menüsündeki gereksiz kısayolları ayıkla
const JUNK = /(uninstall|kaldır|readme|read me|help|documentation|release notes|website|manual|license|lisans)/i;

async function walk(dir, exts, out, depth = 0) {
  if (depth > 6) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, exts, out, depth + 1);
    else if (exts.includes(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

async function scanWindows() {
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(os.homedir(), 'Desktop'),
  ];
  const files = [];
  for (const r of roots) await walk(r, ['.lnk', '.url', '.appref-ms'], files);

  const apps = new Map();
  for (const file of files) {
    const name = path.basename(file).replace(/\.(lnk|url|appref-ms)$/i, '');
    if (JUNK.test(name)) continue;
    const key = name.toLowerCase();
    if (apps.has(key)) continue;
    let target = null;
    let iconPath = file;
    if (file.toLowerCase().endsWith('.lnk')) {
      try {
        const link = shell.readShortcutLink(file);
        target = link.target || null;
        // Kısayolun kendi simgesi ya da hedef exe, .lnk'nin genel simgesinden daha doğru
        const icon = link.icon && link.icon.replace(/,\s*-?\d+$/, '');
        if (icon && /\.(exe|ico)$/i.test(icon) && fs.existsSync(icon)) iconPath = icon;
        else if (target && /\.exe$/i.test(target) && fs.existsSync(target)) iconPath = target;
      } catch {
        // bazı kısayollar (MSI reklam kısayolları) okunamaz
      }
    }
    apps.set(key, {
      id: `app:${file.toLowerCase()}`,
      type: 'app',
      title: name,
      subtitle: target || file,
      iconPath,
      target,
      action: { kind: 'open-path', path: file },
      uninstallable: true,
    });
  }

  // Microsoft Store (UWP) uygulamaları: Get-StartApps hepsini listeler
  try {
    const raw = await powershell('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress');
    const list = JSON.parse(raw || '[]');
    for (const a of Array.isArray(list) ? list : [list]) {
      if (!a?.Name || !a?.AppID || !a.AppID.includes('!')) continue;
      const key = a.Name.toLowerCase();
      if (apps.has(key) || JUNK.test(a.Name)) continue;
      apps.set(key, {
        id: `app:uwp:${a.AppID}`,
        type: 'app',
        title: a.Name,
        subtitle: 'Microsoft Store uygulaması',
        appId: a.AppID,
        action: { kind: 'uwp', appId: a.AppID },
        uninstallable: true,
      });
    }
  } catch (e) {
    console.warn('Get-StartApps okunamadı:', e.message);
  }
  return [...apps.values()];
}

function parseDesktopFile(text) {
  const out = {};
  let inEntry = false;
  const lang = (process.env.LANG || '').split(/[._]/)[0];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('[')) {
      inEntry = line.trim() === '[Desktop Entry]';
      continue;
    }
    if (!inEntry) continue;
    const m = line.match(/^([A-Za-z0-9-]+)(\[([^\]]+)\])?\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, , locale, value] = m;
    if (!locale) out[key] ??= value;
    else if (locale === lang) out[`${key}:local`] = value;
  }
  return out;
}

async function scanLinux() {
  const home = os.homedir();
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':');
  const roots = [
    path.join(home, '.local/share/applications'),
    ...dataDirs.map((d) => path.join(d, 'applications')),
    '/var/lib/flatpak/exports/share/applications',
    path.join(home, '.local/share/flatpak/exports/share/applications'),
    '/var/lib/snapd/desktop/applications',
  ];
  const files = [];
  for (const r of [...new Set(roots)]) await walk(r, ['.desktop'], files);

  const apps = new Map();
  const seenIds = new Set();
  for (const file of files) {
    const desktopId = path.basename(file);
    if (seenIds.has(desktopId)) continue; // kullanıcı dizini önceliklidir
    seenIds.add(desktopId);
    let entry;
    try {
      entry = parseDesktopFile(await fs.promises.readFile(file, 'utf8'));
    } catch {
      continue;
    }
    if (entry.Type !== 'Application' || entry.NoDisplay === 'true' || entry.Hidden === 'true' || !entry.Exec) continue;
    const title = entry['Name:local'] || entry.Name;
    if (!title) continue;
    const key = title.toLowerCase();
    if (apps.has(key)) continue;
    const exec = entry.Exec.replace(/%[fFuUdDnNickvm]/g, '').replace(/\s+/g, ' ').trim();
    apps.set(key, {
      id: `app:${file}`,
      type: 'app',
      title,
      subtitle: entry['Comment:local'] || entry.Comment || exec,
      keywords: [entry['GenericName:local'], entry.GenericName, ...(entry.Keywords || '').split(';')].filter(Boolean),
      iconPath: entry.Icon || null,
      desktopFile: file,
      action: { kind: 'linux-app', exec, terminal: entry.Terminal === 'true' },
      uninstallable: true,
    });
  }
  return [...apps.values()];
}

class Apps {
  constructor() {
    this.items = [];
    this.byId = new Map();
  }

  async refresh() {
    this.items = isWin ? await scanWindows() : await scanLinux();
    this.byId = new Map(this.items.map((a) => [a.id, a]));
    return this.items.length;
  }

  list() {
    return this.items.map((a) => ({ ...a }));
  }

  get(id) {
    const a = this.byId.get(id);
    return a ? { ...a } : null;
  }
}

module.exports = Apps;
