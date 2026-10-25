<p align="center">
  <img src="assets/icon.png" width="110" alt="YH Launcher">
</p>

<h1 align="center">YH Launcher</h1>

<p align="center">
  <b>YazılımHub</b> topluluğunun Windows ve Linux için geliştirdiği, eklentilerle genişleyen uygulama başlatıcısı.<br>
  <a href="https://discord.gg/yazilimhub">discord.gg/yazilimhub</a>
</p>

<p align="center">
  <a href="https://github.com/aytcode/YH-Launcher/actions/workflows/build.yml"><img src="https://github.com/aytcode/YH-Launcher/actions/workflows/build.yml/badge.svg" alt="Derleme durumu"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-4f8cff" alt="Windows | Linux">
</p>

---

`Alt + Space` ile açılır; uygulama ararsın, dosya bulursun, site açarsın, komut çalıştırırsın. Klavyeden elini kaldırmadan.

## İndir

**Windows:** [**YH-Launcher.exe**](https://github.com/aytcode/YH-Launcher/releases/latest/download/YH-Launcher.exe) — tek dosya. İndir, çift tıkla, çalışsın. Node.js ya da başka bir şey kurmana gerek yok.

| | Dosya | |
|---|---|---|
| Windows (tek exe, kurulumsuz) | [YH-Launcher.exe](https://github.com/aytcode/YH-Launcher/releases/latest/download/YH-Launcher.exe) | Çift tıkla çalışır |
| Windows (kurulum) | [YH-Launcher-Setup.exe](https://github.com/aytcode/YH-Launcher/releases/latest/download/YH-Launcher-Setup.exe) | Başlat menüsüne eklenir, kaldırılabilir |
| Ubuntu / Debian / Mint | [YH-Launcher-amd64.deb](https://github.com/aytcode/YH-Launcher/releases/latest/download/YH-Launcher-amd64.deb) | `sudo apt install ./YH-Launcher-amd64.deb` |
| Fedora / openSUSE | [YH-Launcher-x86_64.rpm](https://github.com/aytcode/YH-Launcher/releases/latest/download/YH-Launcher-x86_64.rpm) | `sudo dnf install ./YH-Launcher-x86_64.rpm` |
| Diğer Linux | [YH-Launcher-x86_64.AppImage](https://github.com/aytcode/YH-Launcher/releases/latest/download/YH-Launcher-x86_64.AppImage) | `chmod +x` yap, çalıştır |

Bağlantılar her zaman en son sürümü indirir. Tüm sürümler: [Releases](https://github.com/aytcode/YH-Launcher/releases).

> **Windows uyarısı:** Exe henüz kod imzalı değil. SmartScreen ilk açılışta "Windows bilgisayarınızı korudu" diyebilir → **Ek bilgi › Yine de çalıştır**. Akıllı Uygulama Denetimi (Smart App Control) açık bilgisayarlarda imzasız uygulamalar engellenir.

## Özellikler

| | |
|---|---|
| **Uygulama başlatma** | Discord, VS Code, Steam… Başlat menüsü + Microsoft Store uygulamaları (Windows), `.desktop` + Flatpak + Snap (Linux) |
| **Dosya arama** | Ana klasörün arka planda indekslenir. `C:\` veya `~/` yazarak klasörlerde gezin |
| **Sabitleme** | Sık kullandıklarını `Ctrl+P` ile sabitle, `Ctrl+↑/↓` ile sırala; ana ekranda en üstte durur |
| **Uygulama kaldırma** | `Ctrl+Delete` → uygulamanın kendi kaldırıcısı (Windows kayıt defteri / Store) ya da paket yöneticisi (apt, dnf, pacman, flatpak, snap) |
| **Sık kullanılan siteler** | Ana ekranda en çok açtığın siteler. Yazarak 3 kez açtığın siteler otomatik eklenir |
| **Arama kısayolları** | `yt lofi`, `gh electron`, `npm react`, `so hata`, `cevir merhaba`… Ayarlardan kendi kısayolunu ekle |
| **Özel komutlar** | Sık çalıştırdığın komutları isimle kaydet. `> komut` ile tek seferlik terminal komutu |
| **Hesap makinesi** | `12*(3+4)` yaz, Enter ile sonucu kopyala |
| **Sistem komutları** | Kilitle, uyku, yeniden başlat, kapat, oturumu kapat, görev yöneticisi |
| **Akıllı sıralama** | Sık ve yakın zamanda kullandıkların otomatik olarak öne çıkar |
| **Eklenti sistemi** | Topluluğun yazdığı eklentilerle genişler (bkz. [PLUGINS.md](PLUGINS.md)) |
| **Gizleme** | İstemediğin sonuçları `Ctrl+H` ile gizle |
| **Tema** | Koyu / açık / sistem |

## Klavye kısayolları

| Kısayol | İşlev |
|---|---|
| `Alt+Space` | Aç / kapat (Ayarlar'dan değiştirilebilir) |
| `Enter` | Aç / çalıştır |
| `Shift+Enter` | Yönetici olarak çalıştır (Windows) |
| `Ctrl+Enter` | Dosya konumunu aç |
| `Ctrl+K` | Eylemler menüsü (sağ tık da olur) |
| `Ctrl+P` | Sabitle / sabitlemeyi kaldır |
| `Ctrl+H` | Sonuçlardan gizle |
| `Ctrl+Delete` | Uygulamayı kaldır |
| `Ctrl+C` | Yolu / linki kopyala |
| `Ctrl+R` | Uygulamaları yeniden tara |
| `Ctrl+,` | Ayarlar |
| `Tab` | Otomatik tamamla |
| `Esc` | Temizle / kapat |

## Linux notları

- **Kısayol:** GNOME ve KDE `Alt+Space`'i pencere menüsü için kullanır. YH Launcher bunu algılarsa sırayla `Ctrl+Alt+Space`, `Super+Space`, `Ctrl+Shift+Space` dener ve bildirim gösterir. İstersen Ayarlar'dan değiştir.
- **Wayland:** Global kısayollar masaüstü portalı üzerinden denenir. Çalışmazsa sistem ayarlarında (Klavye › Özel kısayollar) şu komuta bir kısayol ata — pencereyi açıp kapatır:
  ```bash
  yh-launcher --toggle
  ```
- **AppImage + Ubuntu 24.04:** AppImage açılmazsa (sandbox hatası) `--no-sandbox` ile çalıştır ya da `.deb` paketini kullan.
- **Tepsi simgesi:** GNOME'da tepsi simgesi için "AppIndicator" eklentisi gerekir; simge olmadan da kısayolla her şey çalışır.
- Uygulama kaldırma `pkexec` ile yetki ister (apt, dnf, zypper, pacman, flatpak, snap desteklenir).

## Geliştirme

> Bu bölüm sadece kodu değiştirmek isteyenler için. Uygulamayı **kullanmak** için yukarıdaki exe yeterli.

Gereksinim: [Node.js](https://nodejs.org) 20+

```bash
git clone https://github.com/aytcode/YH-Launcher.git
cd YH-Launcher
npm install
npm start
```

### Paketleme

```bash
npm run dist:win     # Windows: kurulum + taşınabilir exe
npm run dist:linux   # Linux: AppImage + deb + rpm (Linux'ta çalıştır)
npm test             # duman testi: launcher'ı açar, gerçek sorgularla dener
```

Çıktılar `dist/` klasörüne yazılır. Linux paketleri Windows'ta derlenemez; GitHub Actions her push'ta Windows ve Ubuntu üzerinde testleri çalıştırıp tüm paketleri üretir. `v1.2.3` gibi bir etiket push'lanınca dosyalar otomatik olarak Releases'e yüklenir.

> Windows'ta proje çok uzun bir klasör yolundaysa (260+ karakter) NSIS kurulum dosyası derlenemez; projeyi `C:\dev\yh-launcher` gibi kısa bir yola taşı.

## Proje yapısı

```
src/
  main/
    main.js          pencere, kısayol, tepsi, çalıştırma ve eylemler
    search.js        sağlayıcıları birleştirip sıralar
    store.js         ayarlar ve kullanım geçmişi (userData/settings.json)
    uninstall.js     Windows / Linux kaldırma
    icons.js         uygulama ve dosya simgeleri
    providers/       apps, files, web, commands, calc, plugins
  renderer/          arayüz (HTML/CSS/JS)
plugins/             yerleşik eklentiler (dev-tools, yazilimhub)
assets/              logo ve simgeler
```

## Katkı

Hata bildirimi, öneri ve eklentiler için **[discord.gg/yazilimhub](https://discord.gg/yazilimhub)**.

## Lisans

[MIT](LICENSE)
