// Türkçe karakterleri sadeleştirip basit ama hızlı bir bulanık eşleştirme yapar.
const MAP = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' };

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ışğüöç]/g, (c) => MAP[c]);
}

function score(query, text) {
  const q = norm(query).trim();
  const t = norm(text);
  if (!q || !t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(t.length - q.length, 100);

  const words = t.split(/[\s\-_.()[\]/\\]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 760;

  // "vsc" -> "Visual Studio Code"
  const initials = words.map((w) => w[0]).join('');
  if (q.length > 1 && initials.startsWith(q)) return 720;

  const idx = t.indexOf(q);
  if (idx >= 0) return 600 - Math.min(idx, 100);

  // Çok kelimeli sorgu: her kelime bir yerde geçiyorsa
  const parts = q.split(/\s+/);
  if (parts.length > 1 && parts.every((p) => t.includes(p))) return 550;

  // Harf sırası eşleşmesi (subsequence)
  let ti = 0;
  let run = 0;
  let s = 0;
  for (const ch of q.replace(/\s+/g, '')) {
    const f = t.indexOf(ch, ti);
    if (f < 0) return 0;
    run = f === ti ? run + 1 : 0;
    s += 10 + run * 6;
    ti = f + 1;
  }
  return Math.min(300, s);
}

module.exports = { score, norm };
