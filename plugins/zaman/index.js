// "zaman 5dk çay demlendi", "zaman 30sn", "zaman 1sa 30dk", "zaman 14:30 toplantı"
// Süre dolunca sistem bildirimi gösterir. "zaman" tek başına çalışan zamanlayıcıları listeler.
const UNITS = { sn: 1e3, saniye: 1e3, s: 1e3, sec: 1e3, dk: 6e4, dakika: 6e4, m: 6e4, min: 6e4, sa: 36e5, saat: 36e5, h: 36e5 };
const MAX = 7 * 24 * 36e5;
const timers = []; // { id, label, end, handle }
let nextId = 1;

function parse(query) {
  // Saat: "14:30 toplantı" (geçtiyse yarın)
  const clock = query.match(/^(\d{1,2})[:.](\d{2})\b\s*(.*)$/);
  if (clock) {
    const t = new Date();
    t.setHours(+clock[1], +clock[2], 0, 0);
    if (t <= Date.now()) t.setDate(t.getDate() + 1);
    return { ms: t - Date.now(), label: clock[3] || `Saat ${clock[1]}:${clock[2]}` };
  }
  // Süre: birden çok parça olabilir ("1sa 30dk"); birimsiz sayı dakika sayılır
  let ms = 0;
  let rest = query;
  const re = /^\s*(\d+(?:[.,]\d+)?)\s*(saniye|dakika|saat|sn|dk|sa|sec|min|s|m|h)?\b/i;
  let m;
  while ((m = rest.match(re))) {
    ms += parseFloat(m[1].replace(',', '.')) * (UNITS[(m[2] || 'dk').toLowerCase()] || 6e4);
    rest = rest.slice(m[0].length);
  }
  if (!ms) return null;
  return { ms: Math.min(ms, MAX), label: rest.trim() || 'Zamanlayıcı' };
}

function human(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h && `${h} sa`, m && `${m} dk`, (sec || (!h && !m)) && `${sec} sn`].filter(Boolean).join(' ');
}

const clockOf = (t) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

module.exports = {
  search(query) {
    const items = [];
    const p = query && parse(query);
    if (p) {
      items.push({
        id: 'add',
        title: `${human(p.ms)} sonra hatırlat: ${p.label}`,
        subtitle: `Saat ${clockOf(Date.now() + p.ms)} — Enter ile başlat`,
        icon: 'sym:timer',
        data: { add: p },
        noTrack: true,
      });
    } else if (query) {
      items.push({ id: 'help', title: 'Süreyi anlayamadım', subtitle: 'Örn: zaman 5dk çay · zaman 30sn · zaman 1sa 30dk · zaman 14:30 toplantı', icon: 'sym:timer', action: { kind: 'noop' }, noTrack: true });
    }
    for (const t of timers) {
      items.push({
        id: `t${t.id}`,
        title: `${t.label} — ${human(t.end - Date.now())} kaldı`,
        subtitle: `Saat ${clockOf(t.end)} · Enter ile iptal et`,
        icon: 'sym:timer',
        data: { cancel: t.id },
        noTrack: true,
      });
    }
    if (!query && !timers.length) {
      for (const ex of ['5dk çay', '25dk odaklan', '30sn', '14:30 toplantı']) {
        items.push({ id: `ex-${ex}`, title: `zaman ${ex}`, subtitle: 'Örnek — Enter ile dene', icon: 'sym:timer', complete: `zaman ${ex}`, action: { kind: 'setQuery', query: `zaman ${ex}` }, noTrack: true });
      }
    }
    return items;
  },

  run(data, ctx) {
    if (data.add) {
      const { ms, label } = data.add;
      const t = { id: nextId++, label, end: Date.now() + ms };
      t.handle = setTimeout(() => {
        ctx.notify(`⏰ ${label}`, 'Zamanlayıcı doldu');
        timers.splice(timers.indexOf(t), 1);
      }, ms);
      timers.push(t);
      return { notify: { title: 'Zamanlayıcı kuruldu', body: `${label} — saat ${clockOf(t.end)}` } };
    }
    if (data.cancel) {
      const i = timers.findIndex((t) => t.id === data.cancel);
      if (i >= 0) {
        clearTimeout(timers[i].handle);
        timers.splice(i, 1);
      }
      return { setQuery: 'zaman ' };
    }
    return {};
  },
};
