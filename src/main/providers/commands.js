const { isWin } = require('../util');

const SYSTEM = isWin
  ? {
      lock: 'rundll32.exe user32.dll,LockWorkStation',
      sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
      logout: 'shutdown /l',
      restart: 'shutdown /r /t 0',
      shutdown: 'shutdown /s /t 0',
      trash: 'explorer.exe shell:RecycleBinFolder',
      taskmgr: 'taskmgr.exe',
    }
  : {
      lock: 'loginctl lock-session',
      sleep: 'systemctl suspend',
      logout: 'loginctl terminate-session "$XDG_SESSION_ID"',
      restart: 'systemctl reboot',
      shutdown: 'systemctl poweroff',
      trash: 'xdg-open trash:///',
      taskmgr: 'gnome-system-monitor || plasma-systemmonitor || ksysguard || xfce4-taskmanager',
    };

const BUILTIN = [
  { key: 'settings', title: 'Ayarlar', subtitle: 'YH Launcher ayarlarını aç', icon: 'sym:gear', keywords: ['settings', 'tercihler'], action: { kind: 'internal', name: 'settings' } },
  { key: 'reload', title: 'Uygulama listesini yenile', subtitle: 'Yeni kurulan uygulamaları ve dosyaları tekrar tara', icon: 'sym:refresh', keywords: ['reload', 'refresh', 'yeniden tara'], action: { kind: 'internal', name: 'reload' } },
  { key: 'plugins', title: 'Eklenti klasörünü aç', subtitle: 'Topluluk eklentilerini buraya kopyala', icon: 'sym:plugin', keywords: ['plugin', 'eklenti', 'extensions'], action: { kind: 'internal', name: 'plugins-folder' } },
  { key: 'quit', title: "YH Launcher'dan çık", subtitle: 'Arka planda çalışmayı durdur', icon: 'sym:power', keywords: ['quit', 'exit', 'kapat'], action: { kind: 'internal', name: 'quit' } },
  { key: 'lock', title: 'Bilgisayarı kilitle', subtitle: 'Oturumu kilitle', icon: 'sym:lock', keywords: ['lock', 'kilit'], action: { kind: 'system', name: 'lock' } },
  { key: 'sleep', title: 'Uyku modu', subtitle: 'Bilgisayarı uyut', icon: 'sym:moon', keywords: ['sleep', 'uyut', 'suspend'], action: { kind: 'system', name: 'sleep' } },
  { key: 'logout', title: 'Oturumu kapat', subtitle: 'Kullanıcı oturumundan çık', icon: 'sym:logout', keywords: ['logout', 'sign out', 'çıkış'], action: { kind: 'system', name: 'logout', confirm: true } },
  { key: 'restart', title: 'Yeniden başlat', subtitle: 'Bilgisayarı yeniden başlat', icon: 'sym:restart', keywords: ['restart', 'reboot'], action: { kind: 'system', name: 'restart', confirm: true } },
  { key: 'shutdown', title: 'Bilgisayarı kapat', subtitle: 'Sistemi kapat', icon: 'sym:power', keywords: ['shutdown', 'kapat', 'power off'], action: { kind: 'system', name: 'shutdown', confirm: true } },
  { key: 'trash', title: 'Geri dönüşüm kutusunu aç', subtitle: 'Silinen dosyalara göz at', icon: 'sym:trash', keywords: ['trash', 'çöp', 'recycle bin'], action: { kind: 'system', name: 'trash' } },
  { key: 'taskmgr', title: 'Görev yöneticisi', subtitle: 'Çalışan işlemleri gör', icon: 'sym:activity', keywords: ['task manager', 'işlemler', 'system monitor'], action: { kind: 'system', name: 'taskmgr' } },
];

class Commands {
  constructor(store) {
    this.store = store;
  }

  list() {
    const builtin = BUILTIN.map((c) => ({ ...c, id: `cmd:${c.key}`, type: 'command', label: c.action.kind === 'system' ? 'Sistem' : 'Komut' }));
    const custom = this.store.get('commands').map((c, i) => ({
      id: `cmd:custom:${c.name}`,
      type: 'command',
      title: c.name,
      subtitle: c.command,
      icon: 'sym:terminal',
      action: { kind: 'exec', cmd: c.command, terminal: !!c.terminal },
      customIndex: i,
    }));
    return [...custom, ...builtin];
  }

  get(id) {
    return this.list().find((c) => c.id === id) || null;
  }

  shellItem(cmd) {
    return {
      id: 'shell',
      type: 'shell',
      title: cmd ? `Çalıştır: ${cmd}` : 'Terminal komutu yaz…',
      subtitle: cmd ? 'Terminal penceresinde çalışır' : 'Örn: > npm -v',
      icon: 'sym:terminal',
      action: cmd ? { kind: 'exec', cmd, terminal: true } : { kind: 'noop' },
      noTrack: true,
    };
  }

  systemCommand(name) {
    return SYSTEM[name];
  }
}

module.exports = Commands;
