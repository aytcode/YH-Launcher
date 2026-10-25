// Basit ve güvenli hesap makinesi: sadece sayı ve operatörlere izin verir.
const ALLOWED = /^[\d\s+\-*/().,%^]+$/;

function evaluate(q) {
  const expr = q.trim().replace(/^=/, '');
  if (!expr || !ALLOWED.test(expr) || !/[+\-*/%^]/.test(expr) || !/\d/.test(expr)) return null;
  const js = expr.replace(/,/g, '.').replace(/\^/g, '**');
  let value;
  try {
    // eslint-disable-next-line no-new-func
    value = Function(`"use strict"; return (${js});`)();
  } catch {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const text = Number.isInteger(value) ? String(value) : String(+value.toPrecision(12));
  return {
    id: 'calc',
    type: 'calc',
    title: `= ${text.replace('.', ',')}`,
    subtitle: `${expr} — Enter ile kopyala`,
    icon: 'sym:calc',
    action: { kind: 'copy', text },
    noTrack: true,
  };
}

module.exports = { evaluate };
