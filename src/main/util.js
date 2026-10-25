const { spawn, spawnSync, execFile } = require('child_process');

const isWin = process.platform === 'win32';

function runDetached(command, opts = {}) {
  const child = spawn(command, { shell: true, detached: true, stdio: 'ignore', ...opts });
  child.on('error', (e) => console.error('Komut başlatılamadı:', e.message));
  child.unref();
}

function spawnDetached(file, args) {
  const child = spawn(file, args, { detached: true, stdio: 'ignore' });
  child.on('error', (e) => console.error(`${file} başlatılamadı:`, e.message));
  child.unref();
}

function hasCommand(cmd) {
  if (isWin) return spawnSync('where', [cmd], { stdio: 'ignore' }).status === 0;
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}

let linuxTerminal;
function findLinuxTerminal() {
  if (linuxTerminal !== undefined) return linuxTerminal;
  // Masaüstüne uygun terminal önce; x-terminal-emulator bazı sistemlerde "-e"yi tek
  // string olarak yorumladığı için sona yakın
  const candidates = [
    ['ptyxis', '--'],
    ['gnome-terminal', '--'],
    ['kgx', '--'],
    ['konsole', '-e'],
    ['xfce4-terminal', '-x'],
    ['mate-terminal', '-x'],
    ['lxterminal', '-e'],
    ['tilix', '-e'],
    ['kitty'],
    ['alacritty', '-e'],
    ['foot'],
    ['wezterm', 'start', '--'],
    ['x-terminal-emulator', '-e'],
    ['xterm', '-e'],
  ];
  const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();
  if (desktop.includes('KDE')) candidates.unshift(['konsole', '-e']);
  if (desktop.includes('XFCE')) candidates.unshift(['xfce4-terminal', '-x']);
  const preferred = process.env.TERMINAL && [process.env.TERMINAL, '-e'];
  linuxTerminal = [preferred, ...candidates].find((c) => c && hasCommand(c[0])) || null;
  return linuxTerminal;
}

// Komutu görünür bir terminal penceresinde çalıştırır (çıktı açık kalır)
function runInTerminal(command) {
  if (isWin) {
    const child = spawn('cmd.exe', ['/k', command], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return true;
  }
  const term = findLinuxTerminal();
  if (!term) return false;
  const [bin, ...flags] = term;
  const shell = process.env.SHELL || 'sh';
  spawnDetached(bin, [...flags, 'sh', '-c', `${command}; exec ${shell}`]);
  return true;
}

function powershell(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const full = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', full],
      { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

function run(file, args, timeout = 10000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, encoding: 'utf8' }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '' })
    );
  });
}

// PowerShell tek tırnaklı string kaçışı
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

module.exports = { isWin, runDetached, spawnDetached, runInTerminal, powershell, run, psQuote, hasCommand };
