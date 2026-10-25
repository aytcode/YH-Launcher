// Uygulama kaldırma: Windows'ta kayıt defterindeki kaldırıcıyı, Linux'ta paket yöneticisini kullanır.
const path = require('path');
const fuzzy = require('./fuzzy');
const { isWin, powershell, psQuote, run, hasCommand } = require('./util');

async function windowsEntries() {
  const script = `
$paths = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
         'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
         'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and $_.UninstallString -and -not $_.SystemComponent } |
  Select-Object DisplayName, UninstallString, DisplayIcon, InstallLocation |
  ConvertTo-Json -Compress`;
  const raw = await powershell(script, 20000);
  const list = JSON.parse(raw || '[]');
  return Array.isArray(list) ? list : [list];
}

const dirOf = (p) => (p ? path.dirname(String(p).replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '')).toLowerCase() : '');

function matchEntry(app, entries) {
  const targetDir = dirOf(app.target);
  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    let s = Math.max(fuzzy.score(app.title, e.DisplayName), fuzzy.score(e.DisplayName, app.title));
    const loc = String(e.InstallLocation || '').replace(/[\\/]+$/, '').toLowerCase();
    if (targetDir && loc && targetDir.startsWith(loc)) s += 400;
    if (targetDir && targetDir === dirOf(e.DisplayIcon)) s += 300;
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return bestScore >= 700 ? best : null;
}

// "C:\x\unins000.exe" /SILENT  ->  ['C:\x\unins000.exe', '/SILENT']
function splitCommand(cmd) {
  cmd = cmd.trim();
  if (cmd.startsWith('"')) {
    const end = cmd.indexOf('"', 1);
    return [cmd.slice(1, end), cmd.slice(end + 1).trim()];
  }
  const m = cmd.match(/^(.+?\.exe)\s*(.*)$/i);
  return m ? [m[1], m[2]] : [cmd, ''];
}

async function planWindows(app) {
  if (app.appId) {
    const family = app.appId.split('!')[0];
    return {
      label: `${app.title} (Microsoft Store uygulaması)`,
      exec: () =>
        powershell(`Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq ${psQuote(family)} } | Remove-AppxPackage`, 120000),
    };
  }
  const entry = matchEntry(app, await windowsEntries());
  if (!entry) return null;
  const [file, args] = splitCommand(entry.UninstallString);
  return {
    label: entry.DisplayName,
    // Start-Process gerekiyorsa UAC istemini kendisi gösterir
    exec: () =>
      powershell(`Start-Process -FilePath ${psQuote(file)}${args ? ` -ArgumentList ${psQuote(args)}` : ''}`),
  };
}

async function planLinux(app) {
  const file = app.desktopFile;
  if (!file) return null;
  if (file.includes('/flatpak/')) {
    const id = path.basename(file, '.desktop');
    const user = file.startsWith(process.env.HOME || '~');
    return { label: `${app.title} (Flatpak: ${id})`, exec: () => run('flatpak', ['uninstall', '-y', ...(user ? ['--user'] : []), id], 300000) };
  }
  if (file.includes('/snapd/')) {
    const name = path.basename(file, '.desktop').split('_')[0];
    return { label: `${app.title} (Snap: ${name})`, exec: () => run('pkexec', ['snap', 'remove', name], 300000) };
  }
  if (hasCommand('dpkg')) {
    const r = await run('dpkg', ['-S', file]);
    const pkg = r.ok && r.stdout.split(':')[0].trim();
    if (pkg) return { label: `${app.title} (paket: ${pkg})`, exec: () => run('pkexec', ['apt-get', 'remove', '-y', pkg], 600000) };
  }
  if (hasCommand('rpm')) {
    const r = await run('rpm', ['-qf', '--qf', '%{NAME}', file]);
    if (r.ok && r.stdout.trim()) {
      const pkg = r.stdout.trim();
      const pm = hasCommand('dnf') ? 'dnf' : hasCommand('zypper') ? 'zypper' : 'yum';
      return { label: `${app.title} (paket: ${pkg})`, exec: () => run('pkexec', [pm, 'remove', '-y', pkg], 600000) };
    }
  }
  if (hasCommand('pacman')) {
    const r = await run('pacman', ['-Qqo', file]);
    if (r.ok && r.stdout.trim()) {
      const pkg = r.stdout.trim();
      return { label: `${app.title} (paket: ${pkg})`, exec: () => run('pkexec', ['pacman', '-R', '--noconfirm', pkg], 600000) };
    }
  }
  return null;
}

function plan(app) {
  return isWin ? planWindows(app) : planLinux(app);
}

module.exports = { plan };
