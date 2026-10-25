// Örnek eklenti: "dev <araç> <metin>" — sonuç Enter ile panoya kopyalanır.
const crypto = require('crypto');

const copyItem = (id, title, subtitle, text) => ({ id, title, subtitle, action: { kind: 'copy', text: String(text) } });

const TOOLS = {
  uuid: { desc: 'Rastgele UUID üret', run: () => [crypto.randomUUID()] },
  b64: { desc: 'Base64 kodla', run: (t) => [Buffer.from(t, 'utf8').toString('base64')] },
  b64d: { desc: 'Base64 çöz', run: (t) => [Buffer.from(t, 'base64').toString('utf8')] },
  url: { desc: 'URL kodla', run: (t) => [encodeURIComponent(t)] },
  urld: { desc: 'URL çöz', run: (t) => [decodeURIComponent(t)] },
  md5: { desc: 'MD5 özeti', run: (t) => [crypto.createHash('md5').update(t).digest('hex')] },
  sha1: { desc: 'SHA-1 özeti', run: (t) => [crypto.createHash('sha1').update(t).digest('hex')] },
  sha256: { desc: 'SHA-256 özeti', run: (t) => [crypto.createHash('sha256').update(t).digest('hex')] },
  json: { desc: 'JSON biçimlendir / küçült', run: (t) => { const o = JSON.parse(t); return [JSON.stringify(o, null, 2), JSON.stringify(o)]; } },
  ts: {
    desc: 'Zaman damgası ↔ tarih',
    run: (t) => {
      if (!t) return [Math.floor(Date.now() / 1000), Date.now()];
      const n = Number(t);
      const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(t);
      if (Number.isNaN(d.getTime())) throw new Error('Geçersiz tarih');
      return Number.isFinite(n) ? [d.toLocaleString('tr-TR'), d.toISOString()] : [Math.floor(d.getTime() / 1000), d.toISOString()];
    },
  },
  renk: {
    desc: 'HEX ↔ RGB renk dönüştür',
    run: (t) => {
      const hex = t.replace('#', '').match(/^([\da-f]{3}|[\da-f]{6})$/i);
      if (hex) {
        const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        return [`rgb(${r}, ${g}, ${b})`];
      }
      const rgb = t.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (rgb) return ['#' + rgb.slice(1, 4).map((x) => (+x).toString(16).padStart(2, '0')).join('')];
      throw new Error('Örn: dev renk #4f8cff');
    },
  },
  sifre: {
    desc: 'Güçlü rastgele şifre üret',
    run: (t) => {
      const len = Math.min(Math.max(parseInt(t, 10) || 20, 8), 128);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
      return [Array.from(crypto.randomBytes(len), (b) => chars[b % chars.length]).join('')];
    },
  },
};

module.exports = {
  search(query, ctx) {
    const [name, ...rest] = query.split(' ');
    const text = rest.join(' ');
    const tool = TOOLS[name?.toLowerCase()];

    if (!tool) {
      return Object.entries(TOOLS)
        .filter(([k, v]) => !name || ctx.fuzzy(name, k) > 0 || ctx.fuzzy(name, v.desc) > 0)
        .map(([k, v]) => ({ id: k, title: `dev ${k}`, subtitle: v.desc, complete: `dev ${k} `, action: { kind: 'setQuery', query: `dev ${k} ` }, noTrack: true }));
    }
    try {
      return tool.run(text).map((out, i) => copyItem(`${name}-${i}`, String(out).replace(/\s+/g, ' ').slice(0, 200), `${tool.desc} — Enter ile kopyala`, out));
    } catch (e) {
      return [{ id: 'err', title: text ? 'Dönüştürülemedi' : `${tool.desc}: metni yaz`, subtitle: e.message, action: { kind: 'noop' }, noTrack: true }];
    }
  },
};
