// Duman testi: launcher'ı gizli açar, gerçek sorgular yazar, sonuçları doğrular ve
// test/output/ altına ekran görüntüleri kaydeder.
//   npm test                         (Windows / masaüstü Linux)
//   xvfb-run -a npx electron --no-sandbox test/smoke.cjs   (CI'da Linux)
// YH_EXPECT_APP="Uygulama Adı" verilirse o uygulamanın bulunması da beklenir.
// YH_APP_PATH=dist/win-unpacked/resources/app.asar verilirse paketlenmiş sürüm test edilir.
const { app, BrowserWindow, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
process.argv.push('--hidden');
require(path.resolve(process.env.YH_APP_PATH || path.join(__dirname, '..'), 'src/main/main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Ekran görüntüsü sadece teşhis için; GPU'suz ortamlarda ara sıra başarısız olabilir
const snap = async (win, name) => {
  try {
    fs.writeFileSync(path.join(OUT, `${name}.png`), (await win.capturePage()).toPNG());
  } catch (e) {
    console.log(`(ekran görüntüsü alınamadı: ${name} — ${e.message})`);
  }
};
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 60 && !win; i++) {
    await wait(250);
    win = BrowserWindow.getAllWindows()[0];
  }
  win.removeAllListeners('blur');
  const wc = win.webContents;
  // Uygulama taraması bitene kadar bekle (yavaş CI makinelerinde sabit süre yetmez)
  for (let i = 0; i < 120; i++) {
    await wait(500);
    const n = await wc.executeJavaScript(`yh.search('a').then(r=>r.sections[0].items.filter(i=>i.type==='app').length)`).catch(() => 0);
    if (n > 0) break;
  }
  const errors = [];
  wc.on('console-message', (e) => e.level === 'error' && errors.push(e.message));
  win.show();
  wc.send('shown', 'search');

  const search = async (name, q) => {
    await wc.executeJavaScript(`(()=>{const q=document.getElementById('q');q.value=${JSON.stringify(q)};q.dispatchEvent(new Event('input'));})()`);
    await wait(1000);
    await snap(win, name);
    const rows = await wc.executeJavaScript(
      `[...document.querySelectorAll('.item')].map(e=>({title:(e.querySelector('.title')||e.querySelector('.tile-label')).textContent,label:(e.querySelector('.meta > span:not(.pin)')?.textContent||'').trim()}))`
    );
    console.log(`--- ${name} "${q}": ${rows.slice(0, 5).map((r) => `${r.title} [${r.label}]`).join(' | ')}`);
    return rows;
  };

  const home = await search('home', '');
  check(home.some((r) => r.title === 'YazılımHub Discord'), 'ana ekranda sık kullanılan siteler');

  const apps = await wc.executeJavaScript(`yh.search('a').then(r=>r.sections[0].items.filter(i=>i.type==='app').length)`);
  check(apps > 0, `uygulama taraması (${process.platform}) sonuç döndürüyor`);

  if (process.env.YH_EXPECT_APP) {
    const rows = await search('expect-app', process.env.YH_EXPECT_APP);
    check(rows[0]?.title === process.env.YH_EXPECT_APP && rows[0].label === 'Uygulama', `"${process.env.YH_EXPECT_APP}" uygulaması bulundu`);
  }

  check((await search('calc', '12*(3+4)/2'))[0]?.title === '= 42', 'hesap makinesi');
  check((await search('engine', 'yt lofi'))[0]?.title === "YouTube'da ara: lofi", 'arama kısayolu');
  check((await search('url', 'github.com'))[0]?.title.startsWith('Siteyi aç'), 'adres algılama');
  check((await search('plugin', 'dev sha256 abc'))[0]?.title.startsWith('ba7816bf'), 'eklenti (dev-tools)');
  check((await search('command', 'kilitle'))[0]?.title === 'Bilgisayarı kilitle', 'sistem komutu');
  check((await search('path', process.platform === 'win32' ? 'C:\\' : '/usr/')).length > 0, 'klasör gezinme');

  await wc.executeJavaScript(`Settings.open()`);
  await wait(600);
  await snap(win, 'settings');

  console.log(`kısayol kayıtlı: ${globalShortcut.isRegistered('Alt+Space') ? 'Alt+Space' : 'hayır (ortam izin vermiyor olabilir)'}`);
  check(errors.length === 0, `arayüzde konsol hatası yok${errors.length ? `: ${errors.join(' / ')}` : ''}`);

  console.log(failures.length ? `\n${failures.length} test başarısız` : '\nTüm testler geçti');
  app.isQuitting = true;
  app.exit(failures.length ? 1 : 0);
});
