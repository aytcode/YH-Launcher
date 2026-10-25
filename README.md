<p align="center">
  <img src="assets/icon.png" width="110" alt="YH Launcher">
</p>

<h1 align="center">YH Launcher</h1>

<p align="center">
  <b>YazılımHub</b> topluluğunun Windows ve Linux için geliştirdiği, eklentilerle genişleyen uygulama başlatıcısı.<br>
  <a href="https://discord.gg/yazilimhub">discord.gg/yazilimhub</a>
</p>

---

`Alt + Space` ile açılır; uygulama ararsın, dosya bulursun, site açarsın, komut çalıştırırsın. Klavyeden elini kaldırmadan.

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

## Kurulum (geliştirme)

Gereksinim: [Node.js](https://nodejs.org) 20+

```bash
git clone <bu-depo>
cd yh-launcher
npm install
npm start
```

## Paketleme

```bash
npm run dist:win     # Windows kurulum dosyası (.exe, NSIS)
npm run dist:linux   # AppImage + .deb
```

Çıktılar `dist/` klasörüne yazılır.

### Linux notları

- GNOME ve KDE `Alt+Space`'i pencere menüsü için kullanır. Ya sistem kısayolunu kapat ya da Ayarlar'dan başka bir kısayol seç (ör. `Super+Space`).
- Wayland'de global kısayollar her masaüstünde çalışmayabilir; bu durumda sistem ayarlarından `yh-launcher` komutuna özel bir kısayol atayabilirsin (uygulama tek örnek çalışır, ikinci çağrı pencereyi açar).
- Uygulama kaldırma `pkexec` ile yetki ister.

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
