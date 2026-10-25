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

class Files {
  constructor(store) {
    this.store = store;
    this.index = []; // { name, full, dir }
    this.indexing = false;
  }

  roots() {
    return [os.homedir(), ...(this.store.get('extraFileRoots') || [])];
  }

  async refresh() {
    if (this.indexing || !this.store.get('fileSearch')) return;
    this.indexing = true;
    const out = [];
    const walk = async (dir, depth) => {
      if (depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return;
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (out.length >= MAX_ENTRIES) return;
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
        const isDir = e.isDirectory();
        // Kısayollar zaten "Uygulama" olarak listeleniyor
        if (!isDir && SHORTCUT_EXT.test(e.name)) continue;
        const full = path.join(dir, e.name);
        out.push({ name: e.name, full, dir: isDir });
        if (isDir && !e.isSymbolicLink()) await walk(full, depth + 1);
      }
      // olay döngüsünü kilitlememek için ara ara nefes al
      await new Promise((r) => setImmediate(r));
    };
    try {
      for (const r of this.roots()) await walk(r, 0);
      this.index = out;
    } finally {
      this.indexing = false;
    }
  }

  search(q, limit = 30) {
    const res = [];
    for (const f of this.index) {
      const s = fuzzy.score(q, f.name);
      if (s >= 550) res.push({ f, s });
    }
    res.sort((a, b) => b.s - a.s || a.f.full.length - b.f.full.length);
    return res.slice(0, limit).map(({ f, s }) => ({ ...fileItem(f.full, f.dir), score: s }));
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
