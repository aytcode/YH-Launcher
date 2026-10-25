const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const fuzzy = require('../fuzzy');

const TIMEOUT = 800;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve([]), ms))]);
}

class Plugins {
  constructor(store, ctx) {
    this.store = store;
    this.ctx = ctx;
    this.plugins = []; // { manifest, dir, module, error, builtin }
    this.userDir = path.join(app.getPath('userData'), 'plugins');
    this.builtinDir = path.join(__dirname, '../../../plugins');
  }

  async load() {
    fs.mkdirSync(this.userDir, { recursive: true });
    this.plugins = [];
    for (const [base, builtin] of [[this.builtinDir, true], [this.userDir, false]]) {
      let dirs = [];
      try {
        dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory());
      } catch {
        continue;
      }
      for (const d of dirs) {
        const dir = path.join(base, d.name);
        const entry = { dir, builtin, manifest: null, module: null, error: null };
        try {
          entry.manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
          entry.manifest.id ||= d.name;
          if (this.plugins.some((p) => p.manifest?.id === entry.manifest.id)) continue;
          const main = path.join(dir, entry.manifest.main || 'index.js');
          delete require.cache[require.resolve(main)];
          entry.module = require(main);
          if (typeof entry.module.setup === 'function') await entry.module.setup(this.pluginCtx(entry));
        } catch (e) {
          entry.error = e.message;
          console.error(`Eklenti yüklenemedi (${d.name}):`, e);
        }
        this.plugins.push(entry);
      }
    }
  }

  active() {
    const disabled = new Set(this.store.get('disabledPlugins'));
    return this.plugins.filter((p) => p.module && !p.error && !disabled.has(p.manifest.id));
  }

  pluginCtx(p) {
    const storeKey = `plugin:${p.manifest.id}`;
    return {
      ...this.ctx,
      fuzzy: fuzzy.score,
      dir: p.dir,
      storage: {
        get: (k, def) => (this.store.get(storeKey) || {})[k] ?? def,
        set: (k, v) => this.store.set(storeKey, { ...(this.store.get(storeKey) || {}), [k]: v }),
      },
    };
  }

  wrap(p, items) {
    return (Array.isArray(items) ? items : []).map((it, i) => ({
      id: `plugin:${p.manifest.id}:${it.id ?? i}`,
      type: 'plugin',
      title: String(it.title ?? ''),
      subtitle: it.subtitle ? String(it.subtitle) : '',
      icon: it.icon || 'sym:plugin',
      label: it.label || p.manifest.name,
      score: it.score,
      complete: it.complete,
      noTrack: it.noTrack,
      action: it.action || { kind: 'plugin', pluginId: p.manifest.id, data: it.data ?? it },
      pluginId: p.manifest.id,
    }));
  }

  async call(p, query) {
    try {
      const items = await withTimeout(Promise.resolve(p.module.search(query, this.pluginCtx(p))), TIMEOUT);
      return this.wrap(p, items);
    } catch (e) {
      console.error(`Eklenti hatası (${p.manifest.id}):`, e);
      return [];
    }
  }

  // "dev uuid" gibi anahtar kelimeyle başlayan sorgular sadece o eklentiye gider
  async keywordSearch(q) {
    for (const p of this.active()) {
      const kw = p.manifest.keyword;
      if (!kw || typeof p.module.search !== 'function') continue;
      const lower = q.toLocaleLowerCase('tr');
      if (lower === kw || lower.startsWith(`${kw} `)) {
        return this.call(p, q.slice(kw.length).trim());
      }
    }
    return null;
  }

  // Anahtar kelimesi olmayan eklentiler her aramaya sonuç ekleyebilir
  async globalSearch(q) {
    const list = this.active().filter((p) => !p.manifest.keyword && typeof p.module.search === 'function');
    const results = await Promise.all(list.map((p) => this.call(p, q)));
    return results.flat();
  }

  // Ana ekranda anahtar kelimeli eklentileri öner
  suggestions(q) {
    return this.active()
      .filter((p) => p.manifest.keyword)
      .map((p) => ({
        id: `pluginkw:${p.manifest.id}`,
        type: 'plugin',
        title: p.manifest.name,
        subtitle: `${p.manifest.keyword} … — ${p.manifest.description || ''}`,
        keywords: [p.manifest.keyword],
        icon: 'sym:plugin',
        label: 'Eklenti',
        complete: `${p.manifest.keyword} `,
        action: { kind: 'setQuery', query: `${p.manifest.keyword} ` },
        noTrack: true,
      }))
      .filter((it) => !q || fuzzy.score(q, it.title) > 0 || fuzzy.score(q, it.keywords[0]) > 0);
  }

  async run(pluginId, data) {
    const p = this.active().find((x) => x.manifest.id === pluginId);
    if (!p || typeof p.module.run !== 'function') return {};
    return (await p.module.run(data, this.pluginCtx(p))) || {};
  }

  list() {
    const disabled = new Set(this.store.get('disabledPlugins'));
    return this.plugins.map((p) => ({
      id: p.manifest?.id || path.basename(p.dir),
      name: p.manifest?.name || path.basename(p.dir),
      description: p.manifest?.description || '',
      version: p.manifest?.version || '',
      author: p.manifest?.author || '',
      keyword: p.manifest?.keyword || '',
      builtin: p.builtin,
      error: p.error,
      enabled: !disabled.has(p.manifest?.id),
    }));
  }
}

module.exports = Plugins;
