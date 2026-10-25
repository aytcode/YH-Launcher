// "yh" ile topluluk bağlantıları; "yh not <metin>" ile hızlı not (eklenti deposu örneği).
module.exports = {
  search(query, ctx) {
    const notes = ctx.storage.get('notes', []);

    if (query.startsWith('not')) {
      const text = query.slice(3).trim();
      const items = notes.map((n, i) => ({
        id: `note-${i}`,
        title: n,
        subtitle: 'Not — Enter: kopyala',
        action: { kind: 'copy', text: n },
        noTrack: true,
      }));
      if (text) items.unshift({ id: 'add', title: `Not ekle: ${text}`, subtitle: 'Enter ile kaydet', data: { add: text }, noTrack: true });
      if (notes.length) items.push({ id: 'clear', title: 'Tüm notları sil', subtitle: `${notes.length} not`, data: { clear: true }, noTrack: true });
      return items;
    }

    const links = [
      { id: 'discord', title: "YazılımHub Discord'a katıl", subtitle: 'discord.gg/yazilimhub', action: { kind: 'url', url: 'https://discord.gg/yazilimhub' } },
      { id: 'notes', title: 'Hızlı notlar', subtitle: `yh not <metin> — ${notes.length} kayıtlı not`, action: { kind: 'setQuery', query: 'yh not ' }, complete: 'yh not ', noTrack: true },
    ];
    return links.filter((l) => !query || ctx.fuzzy(query, l.title) > 0);
  },

  run(data, ctx) {
    const notes = ctx.storage.get('notes', []);
    if (data.add) {
      ctx.storage.set('notes', [data.add, ...notes].slice(0, 50));
      return { setQuery: 'yh not ' };
    }
    if (data.clear) {
      ctx.storage.set('notes', []);
      return { setQuery: 'yh ' };
    }
    return {};
  },
};
