# Eklenti geliştirme

YH Launcher eklentileri basit Node.js modülleridir. Bir eklenti, içinde `plugin.json` ve `index.js` olan bir klasördür.

Eklenti klasörü: launcher'da **"Eklenti klasörünü aç"** yaz ya da Ayarlar › Eklentiler.

- Windows: `%APPDATA%\YH Launcher\plugins`
- Linux: `~/.config/YH Launcher/plugins`

Klasörü oraya kopyala, Ayarlar › Eklentiler › **Yeniden yükle**.

> ⚠️ Eklentiler bilgisayarında tam yetkiyle çalışır. Sadece güvendiğin kaynaklardan eklenti kur.

## plugin.json

```json
{
  "id": "hava-durumu",
  "name": "Hava Durumu",
  "description": "Şehrin hava durumunu gösterir",
  "version": "1.0.0",
  "author": "kullanici-adin",
  "keyword": "hava",
  "main": "index.js"
}
```

| Alan | Açıklama |
|---|---|
| `id` | Benzersiz kimlik (klasör adıyla aynı olması önerilir) |
| `keyword` | Varsa eklenti sadece `hava istanbul` gibi bu kelimeyle başlayan sorgularda çalışır ve diğer sonuçlar gizlenir. Yoksa her aramaya sonuç ekleyebilir (az ve hızlı sonuç döndür) |
| `main` | Giriş dosyası (varsayılan `index.js`) |

## index.js

```js
module.exports = {
  // İsteğe bağlı: eklenti yüklenirken bir kez çalışır
  async setup(ctx) {},

  // Zorunlu: sonuç listesi döndür (en fazla 800 ms)
  async search(query, ctx) {
    return [
      {
        id: 'ornek',
        title: `Merhaba ${query}`,
        subtitle: 'Enter ile kopyala',
        action: { kind: 'copy', text: `Merhaba ${query}` },
      },
      {
        id: 'ozel',
        title: 'Özel işlem',
        data: { foo: 1 }, // action yoksa Enter'da run(data) çağrılır
      },
    ];
  },

  // İsteğe bağlı: action'ı olmayan bir öğe seçildiğinde
  async run(data, ctx) {
    ctx.notify('Bitti', 'İşlem tamamlandı');
    return {}; // pencere kapanır
  },
};
```

### Sonuç öğesi

| Alan | Açıklama |
|---|---|
| `id` | Eklenti içinde benzersiz |
| `title`, `subtitle` | Gösterilecek metin |
| `icon` | `data:` URL, `https://` görsel ya da `sym:isim` (gear, globe, terminal, folder, file, bolt, calc, copy, lock…) |
| `label` | Sağda görünen etiket (varsayılan: eklenti adı) |
| `complete` | Tab'a basınca arama kutusuna yazılacak metin |
| `action` | Hazır eylem (aşağıda). Yoksa `run(data)` çağrılır |
| `data` | `run`'a verilecek veri |
| `noTrack` | `true` ise "sık kullanılanlar"a eklenmez |

### Hazır eylemler

```js
{ kind: 'url', url: 'https://…' }        // tarayıcıda aç
{ kind: 'copy', text: '…' }              // panoya kopyala
{ kind: 'open-path', path: 'C:\\…' }     // dosya / klasör aç
{ kind: 'exec', cmd: 'npm -v', terminal: true }
{ kind: 'setQuery', query: 'hava ' }     // arama kutusunu değiştir
{ kind: 'noop' }                         // hiçbir şey yapma
```

### `run` dönüş değeri

```js
{ url: '…' }           // aç
{ copy: '…' }          // kopyala
{ notify: { title, body } }
{ setQuery: 'yh not ' } // pencere açık kalır, arama değişir
{ keepOpen: true }      // pencere açık kalır, liste yenilenir
```

### ctx

| | |
|---|---|
| `ctx.openUrl(url)` | Tarayıcıda aç |
| `ctx.copy(text)` | Panoya kopyala |
| `ctx.openPath(path)` | Dosya / klasör aç |
| `ctx.exec(cmd)` | Arka planda komut çalıştır |
| `ctx.terminal(cmd)` | Terminal penceresinde komut çalıştır |
| `ctx.notify(title, body)` | Sistem bildirimi |
| `ctx.fuzzy(query, text)` | Bulanık eşleşme puanı (0 = eşleşmedi) |
| `ctx.storage.get(key, varsayılan)` / `ctx.storage.set(key, value)` | Eklentiye özel kalıcı depo |
| `ctx.platform` | `win32` / `linux` |
| `ctx.dir` | Eklentinin klasörü |

## Örnekler

- [`plugins/dev-tools`](plugins/dev-tools) — `dev uuid`, `dev b64 …`, `dev sha256 …`, `dev json …`, `dev ts`, `dev renk #4f8cff`, `dev sifre 24`
- [`plugins/yazilimhub`](plugins/yazilimhub) — topluluk bağlantıları ve `yh not …` ile kalıcı hızlı notlar (storage örneği)
- [`plugins/kur`](plugins/kur) — `kur 100 dolar`, `kur 50 euro tl`: internetten veri çeken (fetch + önbellek) eklenti örneği
- [`plugins/zaman`](plugins/zaman) — `zaman 5dk çay`, `zaman 14:30 toplantı`: `run` ve `ctx.notify` ile arka planda çalışan eklenti örneği

Eklentini **[discord.gg/yazilimhub](https://discord.gg/yazilimhub)**'da paylaş!
