const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { app, nativeImage } = require('electron');

const cache = new Map();
const isLinux = process.platform === 'linux';

const ICON_BASES = [
  path.join(os.homedir(), '.local/share/icons'),
  path.join(os.homedir(), '.icons'),
  '/usr/share/icons',
  '/usr/local/share/icons',
  '/var/lib/flatpak/exports/share/icons',
  path.join(os.homedir(), '.local/share/flatpak/exports/share/icons'),
];
const SIZES = ['64x64', '48x48', '128x128', '96x96', '256x256', 'scalable', '32x32', '64', '48'];

// Kullanıcının seçtiği ikon temasını (GNOME/KDE) bul, sonra yaygın temalara düş
let themes;
function iconThemes() {
  if (themes) return themes;
  const list = [];
  try {
    const r = spawnSync('gsettings', ['get', 'org.gnome.desktop.interface', 'icon-theme'], { encoding: 'utf8', timeout: 2000 });
    const t = (r.stdout || '').trim().replace(/^'|'$/g, '');
    if (t) list.push(t);
  } catch {
    // gsettings yok
  }
  try {
    const kde = fs.readFileSync(path.join(os.homedir(), '.config/kdeglobals'), 'utf8').match(/^\[Icons\][^[]*?Theme=(.+)$/m);
    if (kde) list.push(kde[1].trim());
  } catch {
    // KDE değil
  }
  themes = [...new Set([...list, 'hicolor', 'Papirus', 'Papirus-Dark', 'Adwaita', 'breeze', 'breeze-dark', 'Yaru', 'Mint-Y', 'elementary'])];
  return themes;
}

function findLinuxIcon(name) {
  if (path.isAbsolute(name)) return fs.existsSync(name) && /\.(png|svg)$/i.test(name) ? name : null;
  name = name.replace(/\.(png|svg|xpm)$/i, '');
  for (const base of ICON_BASES) {
    for (const theme of iconThemes()) {
      for (const size of SIZES) {
        for (const ext of ['.png', '.svg']) {
          const p = path.join(base, theme, size, 'apps', name + ext);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  }
  for (const ext of ['.png', '.svg', '']) {
    const p = `/usr/share/pixmaps/${name}${ext}`;
    if (fs.existsSync(p) && /\.(png|svg)$/i.test(p)) return p;
  }
  return null;
}

function fileToDataUrl(file) {
  const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

async function load(item) {
  if (isLinux && item.type === 'app') {
    const file = findLinuxIcon(item.iconPath);
    return file ? fileToDataUrl(file) : null;
  }
  // .ico için getFileIcon dosya türü simgesini verir; içeriği doğrudan okumak gerekir
  const img = /\.(ico|png)$/i.test(item.iconPath) && item.type === 'app'
    ? nativeImage.createFromPath(item.iconPath)
    : await app.getFileIcon(item.iconPath, { size: 'large' });
  return img.isEmpty() ? null : img.resize({ width: 32, height: 32, quality: 'best' }).toDataURL();
}

async function resolve(item) {
  if (item.icon || !item.iconPath) return item;
  const key = item.iconKey || item.iconPath;
  if (!cache.has(key)) {
    try {
      cache.set(key, await load(item));
    } catch {
      cache.set(key, null);
    }
  }
  item.icon = cache.get(key) || undefined;
  return item;
}

function clear() {
  cache.clear();
}

module.exports = { resolve, clear };
