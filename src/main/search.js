const fuzzy = require('./fuzzy');
const icons = require('./icons');
const Apps = require('./providers/apps');
const Files = require('./providers/files');
const Web = require('./providers/web');
const Commands = require('./providers/commands');
const Calc = require('./providers/calc');
const Plugins = require('./providers/plugins');

// Dosyalar, uygulama/komut/sitelerle aynı kalitede eşleşse bile onların altında kalsın
const TYPE_WEIGHT = { app: 1, command: 0.93, site: 0.92, plugin: 0.9, folder: 0.62, file: 0.58 };
const LABELS = {
  app: 'Uygulama', file: 'Dosya', folder: 'Klasör', site: 'Site', web: 'Web',
  command: 'Komut', calc: 'Hesap', plugin: 'Eklenti', shell: 'Terminal', tip: 'İpucu',
};

class Search {
  constructor(store, ctx) {
    this.store = store;
    this.apps = new Apps();
    this.files = new Files(store);
    this.web = new Web(store);
    this.cmds = new Commands(store);
    this.plugins = new Plugins(store, ctx);
    this.items = new Map(); // ekrandaki son öğeler (id -> öğe)
  }

  async init() {
    await Promise.all([this.apps.refresh().catch((e) => console.error(e)), this.plugins.load()]);
    this.files.refresh().catch((e) => console.error(e));
  }

  async reload() {
    icons.clear();
    await Promise.all([this.apps.refresh(), this.plugins.load()]);
    this.files.refresh();
  }

  matchScore(q, it) {
    let s = fuzzy.score(q, it.title);
    for (const k of it.keywords || []) s = Math.max(s, fuzzy.score(q, k) * 0.85);
    return s;
  }

  async query(raw) {
    const q = raw.trim();
    const max = this.store.get('maxResults');
    let items;

    // Eklenti sonuç vermezse ("yh launcher" gibi) normal aramaya düş
    const pluginHit = await this.plugins.keywordSearch(q);
    if (pluginHit?.length) {
      items = pluginHit;
    } else if (q.startsWith('>')) {
      items = [this.cmds.shellItem(q.slice(1).trim())];
    } else if (this.files.isPathQuery(q)) {
      items = await this.files.browse(q);
    } else {
      const hidden = new Set(this.store.get('hidden'));
      const pool = [];
      const add = (list) => {
        for (const it of list) {
          if (hidden.has(it.id)) continue;
          const s = it.score ?? this.matchScore(q, it);
          if (s <= 0) continue;
          it.score = s * (TYPE_WEIGHT[it.type] || 0.85) + this.store.frecency(it.id) * 45 + (this.store.isPinned(it.id) ? 120 : 0);
          pool.push(it);
        }
      };
      add(this.apps.list());
      add(this.cmds.list());
      add(this.web.sites());
      add(this.plugins.suggestions(q));
      add(await this.plugins.globalSearch(q));
      if (this.store.get('fileSearch') && q.length >= 2) add(this.files.search(q));
      pool.sort((a, b) => b.score - a.score);

      items = pool.slice(0, max);
      const calc = Calc.evaluate(q);
      if (calc) items.unshift(calc);
      items.unshift(...this.web.direct(q));
      items.push(...this.web.fallback(q));
    }
    return { sections: [{ title: null, items: await this.finish(items, true) }] };
  }

  async home() {
    const sections = [];
    // Güncel halini kullan (ikon, yol değişmiş olabilir); bulunamazsa kayıtlı kopya
    const pinned = this.store.get('pinned').map((p) => this.lookup(p.id) || { ...p });
    if (pinned.length) sections.push({ title: 'Sabitlenenler', layout: 'grid', items: pinned });

    sections.push({ title: 'Sık kullanılan siteler', layout: 'grid', items: this.web.frequentSites(8) });

    const exclude = new Set([...pinned.map((p) => p.id), ...sections[sections.length - 1].items.map((s) => s.id)]);
    const hidden = new Set(this.store.get('hidden'));
    const recent = Object.entries(this.store.get('usage'))
      .filter(([id]) => !exclude.has(id) && !hidden.has(id))
      .sort((a, b) => this.store.frecency(b[0]) - this.store.frecency(a[0]))
      .map(([id]) => this.lookup(id))
      .filter(Boolean)
      .slice(0, 6);
    if (recent.length) sections.push({ title: 'Sık kullanılanlar', items: recent });

    if (Object.keys(this.store.get('usage')).length < 5) sections.push({ title: 'İpuçları', items: this.tips() });

    const flat = sections.flatMap((s) => s.items);
    this.items.clear();
    await this.finish(flat, false);
    return { sections };
  }

  tips() {
    const tip = (title, subtitle, query) => ({
      id: `tip:${query}`, type: 'tip', title, subtitle, icon: 'sym:bulb',
      action: { kind: 'setQuery', query }, complete: query, noTrack: true,
    });
    return [
      tip('yt lofi', 'Kısayolla YouTube, GitHub, Google… içinde ara (yt, gh, g, so, npm)', 'yt '),
      tip('> komut', 'Terminal komutunu doğrudan çalıştır', '> '),
      tip('dev uuid', 'Geliştirici araçları eklentisi: uuid, base64, hash, json…', 'dev '),
      tip('Ctrl+K', 'Seçili öğe için sabitle, kaldır, gizle gibi eylemleri aç', ''),
    ];
  }

  // Kimlikten (pin, kullanım geçmişi) tekrar öğe üret
  lookup(id) {
    if (id.startsWith('app:')) return this.apps.get(id);
    if (id.startsWith('cmd:')) return this.cmds.get(id);
    if (id.startsWith('site:')) return this.web.siteById(id);
    if (id.startsWith('file:')) return this.files.fromId(id);
    return null;
  }

  async finish(items, reset) {
    if (reset) this.items.clear();
    await Promise.all(
      items.map(async (it) => {
        it.label ||= LABELS[it.type] || '';
        it.pinned = this.store.isPinned(it.id);
        delete it.score;
        await icons.resolve(it);
        this.items.set(it.id, it);
      })
    );
    return items;
  }

  get(id) {
    return this.items.get(id) || this.store.get('pinned').find((p) => p.id === id) || this.lookup(id);
  }
}

module.exports = Search;
