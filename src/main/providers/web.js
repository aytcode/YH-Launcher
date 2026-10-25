const URL_RE = /^(https?:\/\/)?(localhost|(\d{1,3}\.){3}\d{1,3}|([\p{L}\d-]+\.)+[\p{L}]{2,})(:\d+)?(\/\S*)?$/iu;

function normalizeUrl(s) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function favicon(url) {
  return `https://icons.duckduckgo.com/ip3/${hostOf(url)}.ico`;
}

class Web {
  constructor(store) {
    this.store = store;
  }

  siteItem(site) {
    return {
      id: `site:${site.url}`,
      type: 'site',
      title: site.name,
      subtitle: site.url,
      keywords: [hostOf(site.url)],
      icon: favicon(site.url),
      action: { kind: 'url', url: site.url },
      url: site.url,
      userSite: true,
    };
  }

  sites() {
    return this.store.get('sites').map((s) => this.siteItem(s));
  }

  siteById(id) {
    const s = this.store.get('sites').find((x) => `site:${x.url}` === id);
    return s ? this.siteItem(s) : null;
  }

  // Sık ziyaret edilenler: kullanım sayısına göre sıralı
  frequentSites(limit = 6) {
    return this.sites()
      .map((s, i) => ({ s, f: this.store.frecency(s.id), i }))
      .sort((a, b) => b.f - a.f || a.i - b.i)
      .slice(0, limit)
      .map((x) => x.s);
  }

  engineItem(engine, term) {
    const url = engine.url.replace('%s', encodeURIComponent(term));
    return {
      id: `web:${engine.key}`,
      type: 'web',
      title: `${engine.name}'da ara: ${term}`,
      subtitle: url,
      icon: favicon(engine.url),
      action: { kind: 'url', url, track: false },
      noTrack: true,
    };
  }

  // Sorgunun en üstüne çıkacak doğrudan web sonuçları
  direct(q) {
    const out = [];
    if (!q.includes(' ') && URL_RE.test(q)) {
      const url = normalizeUrl(q);
      out.push({
        id: `url:${url}`,
        type: 'web',
        title: `Siteyi aç: ${q}`,
        subtitle: url,
        icon: favicon(url),
        action: { kind: 'url', url, learn: true },
        url,
        noTrack: true,
      });
    }
    const engines = this.store.get('engines');
    const m = q.match(/^(\S+)\s+(.+)$/);
    if (m) {
      const eng = engines.find((e) => e.key.toLowerCase() === m[1].toLowerCase());
      if (eng) out.push(this.engineItem(eng, m[2]));
    } else {
      const eng = engines.find((e) => e.key.toLowerCase() === q.toLowerCase());
      if (eng) {
        out.push({
          id: `engine:${eng.key}`,
          type: 'web',
          title: `${eng.name}'da ara…`,
          subtitle: `"${eng.key} aranacak şey" yaz ya da Tab'a bas`,
          icon: favicon(eng.url),
          action: { kind: 'setQuery', query: `${eng.key} ` },
          complete: `${eng.key} `,
          noTrack: true,
        });
      }
    }
    return out;
  }

  fallback(q) {
    const engines = this.store.get('engines');
    const def = engines.find((e) => e.key === this.store.get('defaultEngine')) || engines[0];
    return def ? [this.engineItem(def, q)] : [];
  }

  // Yazılarak açılan siteler 3 ziyarette otomatik olarak "Siteler" listesine eklenir
  learn(url) {
    if (!this.store.get('autoLearnSites')) return null;
    let origin;
    try {
      origin = new URL(url).origin;
    } catch {
      return null;
    }
    const sites = this.store.get('sites');
    if (sites.some((s) => hostOf(s.url) === hostOf(origin))) return null;
    const visits = this.store.get('siteVisits');
    visits[origin] = (visits[origin] || 0) + 1;
    if (visits[origin] >= 3) {
      delete visits[origin];
      const host = hostOf(origin);
      const name = host.charAt(0).toUpperCase() + host.slice(1);
      sites.push({ name, url: origin, auto: true });
      this.store.set('sites', sites);
      return name;
    }
    this.store.save();
    return null;
  }
}

module.exports = Web;
module.exports.hostOf = hostOf;
