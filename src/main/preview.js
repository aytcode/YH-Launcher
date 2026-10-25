// Dosya önizleme (Quick Look benzeri): resim, metin/kod, klasör içeriği ya da bilgi kartı.
const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i;
const TEXT = /\.(txt|md|markdown|json|jsonc|js|mjs|cjs|ts|tsx|jsx|css|scss|less|html?|xml|ya?ml|toml|ini|cfg|conf|env|log|csv|tsv|py|rb|php|java|kt|c|h|cpp|hpp|cs|go|rs|swift|sh|bash|zsh|ps1|bat|cmd|sql|lua|dart|vue|svelte|gitignore|dockerfile|editorconfig|desktop)$/i;
const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_TEXT_READ = 48 * 1024;
const MAX_LINES = 300;

async function readHead(file, bytes) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function imagePreview(file, size) {
  if (size > MAX_IMAGE) return null;
  if (/\.svg$/i.test(file)) {
    const svg = await fs.promises.readFile(file);
    return { src: `data:image/svg+xml;base64,${svg.toString('base64')}` };
  }
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return null; // webp/avif gibi biçimler nativeImage'da açılmayabilir
  const { width, height } = img.getSize();
  if (width > 720) img = img.resize({ width: 720, quality: 'good' });
  // Fotoğraflar JPEG olarak çok daha küçük taşınır
  const photo = /\.jpe?g$/i.test(file);
  return { src: photo ? `data:image/jpeg;base64,${img.toJPEG(82).toString('base64')}` : img.toDataURL(), width, height };
}

async function textPreview(file, size) {
  const buf = await readHead(file, Math.min(size, MAX_TEXT_READ));
  if (buf.includes(0)) return null; // ikili dosya
  let text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);
  const truncated = size > MAX_TEXT_READ || lines.length > MAX_LINES;
  text = lines.slice(0, MAX_LINES).join('\n');
  return { text, truncated };
}

async function preview(item) {
  const file = item.path;
  if (!file) return null;
  let st;
  try {
    st = await fs.promises.stat(file);
  } catch {
    return null;
  }
  const meta = { name: path.basename(file) || file, path: file, modified: st.mtimeMs, ext: path.extname(file).slice(1).toLowerCase() };

  if (st.isDirectory()) {
    let entries = [];
    try {
      entries = (await fs.promises.readdir(file, { withFileTypes: true })).filter((e) => !e.name.startsWith('.'));
    } catch {
      // erişim yok
    }
    entries.sort((a, b) => b.isDirectory() - a.isDirectory() || a.name.localeCompare(b.name, 'tr'));
    return { ...meta, kind: 'folder', count: entries.length, entries: entries.slice(0, 40).map((e) => ({ name: e.name, dir: e.isDirectory() })) };
  }

  meta.size = st.size;
  try {
    if (IMAGE.test(file)) {
      const img = await imagePreview(file, st.size);
      if (img) return { ...meta, kind: 'image', ...img };
    }
    if (TEXT.test(file) || (st.size > 0 && st.size < 256 * 1024 && !path.extname(file))) {
      const txt = await textPreview(file, st.size);
      if (txt) return { ...meta, kind: 'text', ...txt };
    }
  } catch {
    // okunamadı: bilgi kartına düş
  }
  let icon = null;
  try {
    const img = await app.getFileIcon(file, { size: 'large' });
    if (!img.isEmpty()) icon = img.toDataURL();
  } catch {
    // simge yok
  }
  return { ...meta, kind: 'info', icon };
}

module.exports = { preview };
