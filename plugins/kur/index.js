// "kur 100 dolar", "kur 50 euro tl", "kur 1000 tl dolar", "kur sterlin"
// Kurlar Avrupa Merkez Bankası verisinden (frankfurter.app, ücretsiz, anahtarsız) alınır ve
// 30 dakika önbellekte tutulur.
const ALIASES = {
  dolar: 'USD', usd: 'USD', $: 'USD',
  euro: 'EUR', avro: 'EUR', eur: 'EUR', '€': 'EUR',
  sterlin: 'GBP', pound: 'GBP', gbp: 'GBP', '£': 'GBP',
  tl: 'TRY', try: 'TRY', lira: 'TRY', '₺': 'TRY',
  yen: 'JPY', jpy: 'JPY', frank: 'CHF', chf: 'CHF', yuan: 'CNY', cny: 'CNY',
  riyal: 'SAR', kanada: 'CAD', cad: 'CAD', avustralya: 'AUD', aud: 'AUD',
  kron: 'SEK', sek: 'SEK', nok: 'NOK', dkk: 'DKK', pln: 'PLN', zloti: 'PLN',
};
const NAMES = { USD: 'Dolar', EUR: 'Euro', GBP: 'Sterlin', TRY: 'TL', JPY: 'Yen', CHF: 'Frank', CNY: 'Yuan', CAD: 'Kanada $', AUD: 'Avustralya $' };
const TTL = 30 * 60 * 1000;
const cache = new Map(); // baz para -> { at, date, rates } ya da { pending }

function load(base) {
  const c = cache.get(base);
  if (c?.rates && Date.now() - c.at < TTL) return Promise.resolve(c);
  if (c?.pending) return c.pending;
  const pending = fetch(`https://api.frankfurter.app/latest?from=${base}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Sunucu yanıtı: ${r.status}`);
      return r.json();
    })
    .then((j) => {
      const entry = { at: Date.now(), date: j.date, rates: { ...j.rates, [base]: 1 } };
      cache.set(base, entry);
      return entry;
    })
    .catch((e) => {
      cache.delete(base);
      throw e;
    });
  cache.set(base, { ...c, pending });
  return pending;
}

function parse(query) {
  const tokens = query.toLocaleLowerCase('tr').replace(/,/g, '.').match(/\d+(?:\.\d+)?|[^\s\d.]+/g) || [];
  let amount = 1;
  const codes = [];
  for (const t of tokens) {
    if (/^\d/.test(t)) amount = parseFloat(t);
    else if (ALIASES[t]) codes.push(ALIASES[t]);
    else if (/^[a-z]{3}$/.test(t) && !['kaç', 'ile'].includes(t)) codes.push(t.toUpperCase());
  }
  const from = codes[0] || 'USD';
  const to = codes[1] ? [codes[1]] : from === 'TRY' ? ['USD', 'EUR', 'GBP'] : ['TRY', ...['USD', 'EUR'].filter((c) => c !== from)];
  return { amount, from, to };
}

const fmt = (n) => n.toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 });
const label = (code) => (NAMES[code] ? `${NAMES[code]} (${code})` : code);

module.exports = {
  async search(query) {
    if (!query) {
      return ['100 dolar', '50 euro tl', '1000 tl dolar', 'sterlin'].map((ex) => ({
        id: `ex-${ex}`,
        title: `kur ${ex}`,
        subtitle: 'Örnek — Enter ile dene',
        icon: 'sym:currency',
        complete: `kur ${ex}`,
        action: { kind: 'setQuery', query: `kur ${ex}` },
        noTrack: true,
      }));
    }
    const { amount, from, to } = parse(query);
    let data;
    try {
      // Eklentiler hızlı yanıt vermeli; ilk istek yavaşsa "yükleniyor" göster, sonuç önbelleğe girer
      data = await Promise.race([load(from), new Promise((r) => setTimeout(() => r(null), 650))]);
    } catch (e) {
      return [{ id: 'err', title: 'Kurlar alınamadı', subtitle: `${e.message} — internet bağlantını kontrol et`, icon: 'sym:currency', action: { kind: 'noop' }, noTrack: true }];
    }
    if (!data) {
      return [{ id: 'loading', title: 'Kurlar alınıyor…', subtitle: 'Enter ile yenile', icon: 'sym:currency', action: { kind: 'setQuery', query: `kur ${query}` }, noTrack: true }];
    }
    const items = to
      .filter((c) => data.rates[c] != null)
      .map((c) => {
        const value = amount * data.rates[c];
        return {
          id: `${from}-${c}`,
          title: `${fmt(amount)} ${from} = ${fmt(value)} ${c}`,
          subtitle: `1 ${label(from)} = ${fmt(data.rates[c])} ${c} · ${data.date} (ECB) — Enter ile kopyala`,
          icon: 'sym:currency',
          action: { kind: 'copy', text: value.toFixed(2) },
          noTrack: true,
        };
      });
    return items.length
      ? items
      : [{ id: 'unknown', title: `"${to[0]}" para birimi bulunamadı`, subtitle: 'Örn: kur 100 dolar, kur 50 eur gbp', icon: 'sym:currency', action: { kind: 'noop' }, noTrack: true }];
  },
};
