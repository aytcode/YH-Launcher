// Görev çubuğu entegrasyonu (sadece Windows):
//  - Windows'un kendi arama kutusu/düğmesi (ve Win+S) YH Launcher'ı açar
//  - görev çubuğunun üstünde Windows 11 tarzı arama kutusu ("hap" pencere)
//  - Windows tuşu ile açma (yerel yardımcı süreç, düşük seviye klavye kancası)
//  - Windows'un kendi arama kutusunu gizleme / geri getirme
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, execFile } = require('child_process');
const { app, BrowserWindow, screen } = require('electron');
const { isWin, run } = require('./util');

const HELPER_VERSION = 2; // yh-helper.cs değişince artır (yeniden derlensin)
const PILL_W = 220;
const SEARCH_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search';

class Taskbar {
  constructor(store, { onWin, onPillClick }) {
    this.store = store;
    this.onWin = onWin;
    this.onPillClick = onPillClick;
    this.proc = null;
    this.helperArgs = '';
    this.fullscreen = false;
    this.pill = null;
    this.topTimer = null;
    this.lastError = null;
    this.gen = 0;
    this.useShell = false;
    if (isWin) {
      const relayout = () => this.updatePill();
      screen.on('display-metrics-changed', relayout);
      screen.on('display-added', relayout);
      screen.on('display-removed', relayout);
    }
  }

  // ---------------------------------------------------------------- yardımcı süreç

  helperPath() {
    return path.join(app.getPath('userData'), `yh-helper-${HELPER_VERSION}.exe`);
  }

  // Kaynak paket arşivinin (asar) içinde olabilir: derleyici ve PowerShell okusun diye diske yaz
  writeSources() {
    const dir = app.getPath('userData');
    const src = path.join(dir, 'yh-helper.cs');
    const ps1 = path.join(dir, 'yh-helper.ps1');
    const code = fs.readFileSync(path.join(__dirname, 'native', 'yh-helper.cs'), 'utf8');
    const script =
      "$src = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'yh-helper.cs')\r\n" +
      'Add-Type -TypeDefinition $src -ReferencedAssemblies System.Windows.Forms -Language CSharp\r\n' +
      "exit [YhHelper]::Main([string[]]($args | ForEach-Object { '--' + $_ }))\r\n";
    for (const [file, text] of [[src, code], [ps1, script]]) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
    }
    return { src, ps1 };
  }

  // İlk gerektiğinde Windows'la gelen .NET derleyicisiyle derlenir (10 KB, ek kurulum yok)
  async ensureHelper() {
    const exe = this.helperPath();
    if (fs.existsSync(exe)) return exe;
    const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    if (!fs.existsSync(csc)) throw new Error('.NET Framework derleyicisi (csc.exe) bulunamadı');
    const { src } = this.writeSources();
    await new Promise((resolve, reject) => {
      execFile(csc, ['-nologo', '-target:winexe', '-optimize', '-r:System.Windows.Forms.dll', `-out:${exe}`, src], { windowsHide: true }, (err, stdout) =>
        err ? reject(new Error(`Yardımcı derlenemedi: ${stdout || err.message}`.slice(0, 300))) : resolve()
      );
    });
    return exe;
  }

  stopHelper() {
    if (this.proc) {
      const p = this.proc;
      this.proc = null;
      try {
        p.stdin.end();
        p.kill();
      } catch {
        // zaten kapanmış
      }
    }
    this.helperArgs = '';
  }

  // Ayarlara göre yardımcıyı başlat / durdur / yeniden başlat ve hap pencereyi güncelle
  async apply() {
    if (!isWin) return;
    const s = this.store;
    const args = [s.get('winKey') && '--win', s.get('searchRedirect') && '--search', s.get('taskbarSearch') && '--fs'].filter(Boolean);
    if (!s.get('taskbarSearch')) this.fullscreen = false;
    // Kutu ilk açıldığında görev çubuğu simgelerinin üstüne binmeyecek bir yer seç
    if (s.get('taskbarSearch') && s.get('taskbarSearchPos') == null) s.set('taskbarSearchPos', await this.defaultPillPos());
    this.updatePill();
    if (args.join(' ') === this.helperArgs && (this.proc || !args.length)) return;
    this.stopHelper();
    if (!args.length) {
      this.gen++;
      return;
    }
    this.helperArgs = args.join(' ');
    const gen = ++this.gen;
    const p = await this.startHelper(args);
    // Başlarken ayarlar yeniden değiştiyse bu süreç artık geçersiz
    if (gen !== this.gen) {
      p?.kill();
      return;
    }
    if (!p) {
      this.helperArgs = '';
      return;
    }
    this.proc = p;
    this.lastError = null;
    p.on('exit', () => {
      if (this.proc === p) {
        this.proc = null;
        this.helperArgs = '';
      }
    });
    readline.createInterface({ input: p.stdout }).on('line', (line) => this.onHelperLine(line.trim()));
  }

  // Önce derlenmiş küçük exe; Akıllı Uygulama Denetimi / Kod Bütünlüğü imzasız exe'leri
  // engelleyebilir, o zaman aynı kod Windows'un imzalı PowerShell'i içinde bellekte derlenip çalışır.
  async startHelper(args) {
    if (!this.useShell) {
      try {
        const p = await this.trySpawn(await this.ensureHelper(), args);
        if (p) return p;
      } catch (e) {
        console.warn('Yardımcı exe kullanılamadı:', e.message);
      }
      this.useShell = true;
    }
    const p = await this.trySpawn('powershell.exe', this.shellArgs(args));
    if (!p) this.lastError = 'Yardımcı başlatılamadı (exe ve PowerShell engellendi)';
    return p;
  }

  shellArgs(args) {
    const { ps1 } = this.writeSources();
    return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1, ...args.map((a) => a.replace(/^--/, ''))];
  }

  // Süreç "READY" diyene kadar bekler; engellenir ya da hemen kapanırsa null döner
  trySpawn(file, args) {
    return new Promise((resolve) => {
      let p;
      try {
        p = spawn(file, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      } catch {
        return resolve(null);
      }
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        p.stdout.off('data', onData);
        if (!ok) {
          try {
            p.kill();
          } catch {
            // zaten kapalı
          }
        }
        resolve(ok ? p : null);
      };
      const onData = (d) => {
        const s = d.toString();
        if (s.includes('READY')) finish(true);
        else if (s.includes('ERR')) {
          this.lastError = s.trim();
          finish(false);
        }
      };
      p.stdout.on('data', onData);
      p.once('error', () => finish(false));
      p.once('exit', () => finish(false));
      const timer = setTimeout(() => finish(false), 15000); // PowerShell'de ilk derleme birkaç saniye sürebilir
    });
  }

  onHelperLine(line) {
    if (line === 'WIN') this.onWin();
    else if (line === 'FS 1' || line === 'FS 0') {
      this.fullscreen = line === 'FS 1';
      this.updatePill();
    } else if (line.startsWith('ERR')) this.lastError = `Klavye kancası kurulamadı (${line})`;
  }

  // ---------------------------------------------------------------- arama kutusu (hap)

  // Windows 11 simgeleri ortalıysa sol taraf boştur (en solda hava durumu); sola hizalıysa
  // simgeler soldan dizilir, orta boştur.
  async defaultPillPos() {
    const r = await run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', '/v', 'TaskbarAl']);
    const leftAligned = r.ok && /0x0\b/.test(r.stdout);
    return leftAligned ? 50 : 8;
  }

  pillBounds() {
    const d = screen.getPrimaryDisplay();
    const B = d.bounds;
    const W = d.workArea;
    const bottom = B.y + B.height - (W.y + W.height);
    const top = W.y - B.y;
    let tbY;
    let tbH;
    if (bottom >= 24) [tbY, tbH] = [W.y + W.height, bottom];
    else if (top >= 24) [tbY, tbH] = [B.y, top];
    else return null; // görev çubuğu dikey ya da otomatik gizli: gösterme
    const h = Math.min(36, tbH - 10);
    const pos = Math.max(0, Math.min(100, Number(this.store.get('taskbarSearchPos')) || 0));
    return {
      x: Math.round(B.x + 8 + ((B.width - PILL_W - 16) * pos) / 100),
      y: Math.round(tbY + (tbH - h) / 2),
      width: PILL_W,
      height: h,
    };
  }

  createPill() {
    this.pill = new BrowserWindow({
      width: PILL_W,
      height: 36,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false, // tıklayınca odağı çalmasın
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
      },
    });
    // Görev çubuğunun üstünde kalsın
    this.pill.setAlwaysOnTop(true, 'screen-saver');
    this.pill.loadFile(path.join(__dirname, '../renderer/taskbar.html'));
    this.pill.on('closed', () => {
      this.pill = null;
    });
  }

  updatePill() {
    const want = isWin && this.store.get('taskbarSearch') && !this.fullscreen;
    const bounds = want && this.pillBounds();
    if (!bounds) {
      this.pill?.hide();
      clearInterval(this.topTimer);
      this.topTimer = null;
      return;
    }
    if (!this.pill) this.createPill();
    this.pill.setBounds(bounds);
    this.pill.showInactive();
    // Görev çubuğuna tıklanınca Windows onu öne alır; arama kutusunu tekrar üste koy
    if (!this.topTimer) this.topTimer = setInterval(() => this.pill?.isVisible() && this.pill.moveTop(), 2000);
  }

  sendTheme(theme) {
    this.pill?.webContents.send('theme', theme);
  }

  // ---------------------------------------------------------------- Windows arama kutusu

  async setWindowsSearchHidden(hide) {
    if (!isWin) return;
    const q = await run('reg', ['query', SEARCH_KEY, '/v', 'SearchboxTaskbarMode']);
    const m = q.ok && q.stdout.match(/0x([0-9a-f]+)/i);
    const current = m ? parseInt(m[1], 16) : null;
    let value;
    if (hide) {
      // Kapatınca geri getirebilmek için kullanıcının önceki seçimini sakla
      if (current != null && current !== 0) this.store.set('prevSearchboxMode', current);
      value = 0;
    } else {
      value = this.store.get('prevSearchboxMode') ?? 2;
    }
    // Yeni Windows 11 sürümleri ...ModeCache değerini de okur; ikisi aynı olmalı
    for (const name of ['SearchboxTaskbarMode', 'SearchboxTaskbarModeCache']) {
      const r = await run('reg', ['add', SEARCH_KEY, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f']);
      if (!r.ok) throw new Error(`Kayıt defteri güncellenemedi: ${r.stderr.trim()}`);
    }
    // Görev çubuğuna ayarın değiştiğini bildir (Gezgin'i yeniden başlatmadan uygulansın)
    let sent = false;
    if (!this.useShell) {
      try {
        sent = (await run(await this.ensureHelper(), ['--broadcast'], 5000)).ok;
      } catch {
        // exe engellendi: PowerShell'e düş
      }
    }
    if (!sent) await run('powershell.exe', this.shellArgs(['--broadcast']), 20000);
  }

  // Bazı Windows sürümleri arama kutusu ayarını sadece Gezgin başlarken okur.
  // Gezgin kapatılınca Windows onu genelde kendisi açar; açmazsa biz başlatırız.
  async restartExplorer() {
    await run('taskkill', ['/f', '/im', 'explorer.exe']);
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const t = await run('tasklist', ['/FI', 'IMAGENAME eq explorer.exe', '/NH']);
      if (/explorer\.exe/i.test(t.stdout)) return;
    }
    spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref();
  }

  dispose() {
    this.stopHelper();
    clearInterval(this.topTimer);
  }
}

module.exports = Taskbar;
