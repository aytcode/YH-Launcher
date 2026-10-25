const fs = require('fs');
const path = require('path');
const os = require('os');
const fuzzy = require('../fuzzy');

const SKIP = new Set([
  'node_modules', 'AppData', 'Application Data', 'Local Settings', 'Cookies', 'NetHood', 'PrintHood',
  'Recent', 'SendTo', 'Templates', 'Start Menu', 'My Documents', '__pycache__', 'venv', 'site-packages',
  'snap', 'go', 'Library', '$RECYCLE.BIN', 'System Volume Information',
]);
const SHORTCUT_EXT = /\.(lnk|url|desktop|appref-ms)$/i;
const MAX_ENTRIES = 80000;
const MAX_DEPTH = 5;

function fileItem(full, isDir) {
  const ext = path.extname(full).toLowerCase();
  return {
    id: `file:${full}`,
    type: isDir ? 'folder' : 'file',
    title: path.basename(full) || full,
    subtitle: full,
    iconPath: full,
    // Aynı uzantılı dosyalar aynı simgeyi paylaşır; .exe gibi dosyalarınki kendine özgüdür
    iconKey: isDir ? 'folder' : ['.exe', '.lnk', '.ico', '.appimage'].includes(ext) || !ext ? full : `ext${ext}`,
    action: { kind: 'open-path', path: full },
    path: full,
  };
}

// Bellek dostu indeks: tam yol yerine sadece isim + üst klasörün sırası tutulur.
// 80 bin girdi için tam yollar ~15 MB iken bu yapı birkaç MB'tır; yol gerektiğinde üretilir.
class FileIndex {
  constructor() {
    this.names = [];
    this.parents = new Int32Array(MAX_ENTRIES + 64);
    this.dirs = new Uint8Array(MAX_ENTRIES + 64);
  }

  get size() {
    return this.names.length;
  }

  add(name, parent, isDir) {
    const i = this.names.length;
    this.names.push(name);
    this.parents[i] = parent;
    this.dirs[i] = isDir ? 1 : 0;
    return i;
  }

  fullPath(i) {
    const parts = [];
    for (let j = i; j >= 0; j = this.parents[j]) parts.push(this.names[j]);
    return path.join(...parts.reverse());
  }
}

class Files {
  constructor(store) {
    this.store = store;
    this.index = new FileIndex();
    this.indexing = false;
    this.indexedAt = 0;
  }

  roots() {
    return [os.homedir(), ...(this.store.get('extraFileRoots') || [])];
  }

  async refresh() {
    if (this.indexing || !this.store.get('fileSearch')) return;
    this.indexing = true;
    const idx = new FileIndex();
    const walk = async (dir, parent, depth) => {
      if (depth > MAX_DEPTH || idx.size >= MAX_ENTRIES) return;
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      const subdirs = [];
      for (const e of entries) {
        if (idx.size >= MAX_ENTRIES) break;
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
        const isDir = e.isDirectory();
        // Kısayollar zaten "Uygulama" olarak listeleniyor
        if (!isDir && SHORTCUT_EXT.test(e.name)) continue;
        const i = idx.add(e.name, parent, isDir);
        if (isDir && !e.isSymbolicLink()) subdirs.push([path.join(dir, e.name), i]);
      }
      // olay döngüsünü kilitlememek için ara ara nefes al
      await new Promise((r) => setImmediate(r));
      for (const [sub, i] of subdirs) await walk(sub, i, depth + 1);
    };
    try {
      for (const r of this.roots()) {
        const rootIdx = idx.add(r, -1, true);
        await walk(r, rootIdx, 0);
      }
      this.index = idx;
      this.indexedAt = Date.now();
    } finally {
      this.indexing = false;
    }
  }

  search(q, limit = 30) {
    const { names, dirs } = this.index;
    const res = [];
    for (let i = 0; i < names.length; i++) {
      if (this.index.parents[i] < 0) continue; // kök klasörün kendisi
      const s = fuzzy.score(q, names[i]);
      if (s >= 550) res.push({ i, s });
    }
    res.sort((a, b) => b.s - a.s || names[a.i].length - names[b.i].length);
    return res.slice(0, limit).map(({ i, s }) => ({ ...fileItem(this.index.fullPath(i), dirs[i] === 1), score: s }));
  }

  isPathQuery(q) {
    return /^(~|\/|[a-zA-Z]:[\\/]|\\\\)/.test(q);
  }

  // "C:\Users\..." ya da "~/Projeler/" yazınca klasörde gezinme
  async browse(q) {
    let p = q.replace(/^~(?=$|[\\/])/, os.homedir());
    const endsWithSep = /[\\/]$/.test(p);
    const dir = endsWithSep ? p : path.dirname(p);
    const filter = endsWithSep ? '' : path.basename(p);
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const items = [];
    for (const e of entries) {
      if (filter && fuzzy.score(filter, e.name) <= 0) continue;
      const full = path.join(dir, e.name);
      const it = fileItem(full, e.isDirectory());
      it.score = filter ? fuzzy.score(filter, e.name) : e.isDirectory() ? 1 : 0;
      it.complete = e.isDirectory() ? full + path.sep : full;
      items.push(it);
    }
    items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'tr'));
    return items.slice(0, 50);
  }

  fromId(id) {
    const full = id.slice(5);
    try {
      return fileItem(full, fs.statSync(full).isDirectory());
    } catch {
      return null;
    }
  }
}

module.exports = Files;
