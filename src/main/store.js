const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  hotkey: 'Alt+Space',
  launchAtStartup: false,
  showTray: false, // sağ alttaki tepsi simgesi
  // Görev çubuğu (Windows) — hepsi isteğe bağlı, varsayılan kapalı
  taskbarSearch: false, // görev çubuğunda arama kutusu
  taskbarSearchPos: null, // soldan yüzde; null: görev çubuğu hizasına göre otomatik
  searchRedirect: false, // Windows arama kutusu / Win+S YH Launcher'ı açar
  winKey: false, // Windows tuşu tek başına launcher'ı açar
  hardwareAcceleration: false, // kapalıyken daha az RAM (GPU süreci küçülür)
  theme: 'dark', // dark | light | system
  accent: 'blue', // blue | purple | pink | red | orange | yellow | green | indigo | graphite
  selection: 'neutral', // neutral | accent
  glass: 'balanced', // clear | balanced | frosted
  density: 'normal', // compact | normal | comfortable
  maxResults: 9,
  fileSearch: true,
  filePreview: true, // aramada dosya varken sağda önizleme paneli
  extraFileRoots: [],
  defaultEngine: 'g',
  autoLearnSites: true,
  pinned: [], // serileştirilmiş sonuç öğeleri
  hidden: [], // sonuçlardan gizlenen öğe kimlikleri
  usage: {}, // id -> { count, last }
  siteVisits: {}, // origin -> sayı (otomatik site önerisi için)
  disabledPlugins: [],
  sites: [
    { name: 'YazılımHub Discord', url: 'https://discord.gg/yazilimhub' },
    { name: 'GitHub', url: 'https://github.com' },
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Stack Overflow', url: 'https://stackoverflow.com' },
    { name: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
    { name: 'Gmail', url: 'https://mail.google.com' },
  ],
  engines: [
    { key: 'g', name: 'Google', url: 'https://www.google.com/search?q=%s' },
    { key: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
    { key: 'gh', name: 'GitHub', url: 'https://github.com/search?q=%s' },
    { key: 'so', name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q=%s' },
    { key: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q=%s' },
    { key: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/search?q=%s' },
    { key: 'w', name: 'Vikipedi', url: 'https://tr.wikipedia.org/w/index.php?search=%s' },
    { key: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    { key: 'cevir', name: 'Google Çeviri', url: 'https://translate.google.com/?sl=auto&tl=tr&text=%s' },
  ],
  commands: [], // { name, command, terminal }
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.data = structuredClone(DEFAULTS);
    try {
      Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {
      // ilk açılış ya da bozuk dosya: varsayılanlarla devam
    }
    this.timer = null;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  patch(obj) {
    Object.assign(this.data, obj);
    this.save();
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('Ayarlar kaydedilemedi:', e);
    }
  }

  bump(id) {
    const u = this.data.usage[id] || { count: 0, last: 0 };
    u.count += 1;
    u.last = Date.now();
    this.data.usage[id] = u;
    this.save();
  }

  // Sık + yakın zamanda kullanılanları öne çıkaran puan
  frecency(id) {
    const u = this.data.usage[id];
    if (!u) return 0;
    const days = (Date.now() - u.last) / 864e5;
    const decay = days < 1 ? 1 : days < 7 ? 0.7 : days < 30 ? 0.4 : 0.2;
    return Math.log2(1 + u.count) * decay;
  }

  isPinned(id) {
    return this.data.pinned.some((p) => p.id === id);
  }

  togglePin(item) {
    if (this.isPinned(item.id)) {
      this.data.pinned = this.data.pinned.filter((p) => p.id !== item.id);
    } else {
      const { icon, score, pinned, ...rest } = item;
      this.data.pinned.push(rest);
    }
    this.save();
    return this.isPinned(item.id);
  }

  movePin(id, delta) {
    const list = this.data.pinned;
    const i = list.findIndex((p) => p.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.save();
  }
}

module.exports = Store;
