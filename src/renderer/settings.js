function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Apple sistem renkleri (koyu varyant, renk noktalarında gösterilir)
const ACCENTS = [
  { id: 'blue', name: 'Mavi', color: '#0a84ff' },
  { id: 'purple', name: 'Mor', color: '#bf5af2' },
  { id: 'pink', name: 'Pembe', color: '#ff375f' },
  { id: 'red', name: 'Kırmızı', color: '#ff453a' },
  { id: 'orange', name: 'Turuncu', color: '#ff9f0a' },
  { id: 'yellow', name: 'Sarı', color: '#ffd60a' },
  { id: 'green', name: 'Yeşil', color: '#30d158' },
  { id: 'indigo', name: 'Çivit', color: '#5e5ce6' },
  { id: 'graphite', name: 'Grafit', color: '#8e8e93' },
];

// Görünüm ayarlarını kök öğeye uygular (renkler, cam, yoğunluk anında değişir)
function applyAppearance(cfg) {
  const root = document.documentElement.dataset;
  root.accent = cfg.accent || 'blue';
  root.selection = cfg.selection || 'neutral';
  root.glass = cfg.glass || 'balanced';
  root.density = cfg.density || 'normal';
}

const Settings = (() => {
  const el = document.getElementById('settings');
  const TABS = [
    ['general', 'Genel', 'gear'],
    ['appearance', 'Görünüm', 'palette'],
    ['sites', 'Siteler', 'globe'],
    ['engines', 'Arama kısayolları', 'search'],
    ['commands', 'Özel komutlar', 'terminal'],
    ['plugins', 'Eklentiler', 'plugin'],
    ['hidden', 'Gizlenenler', 'eye-off'],
    ['about', 'Hakkında', 'bulb'],
  ];
  let cfg = null;
  let tab = 'general';
  let error = '';

  const api = {
    isOpen: false,
    capturing: false,
    async open(which) {
      cfg = await yh.getSettings();
      if (which) tab = which;
      api.isOpen = true;
      document.querySelector('.content').classList.add('hidden');
      document.querySelector('.searchbar').classList.add('hidden');
      document.getElementById('panel').classList.add('in-settings');
      el.classList.remove('hidden');
      render();
    },
    close(focus = true) {
      api.isOpen = false;
      api.capturing = false;
      el.classList.add('hidden');
      document.getElementById('panel').classList.remove('in-settings');
      document.querySelector('.content').classList.remove('hidden');
      document.querySelector('.searchbar').classList.remove('hidden');
      if (focus) {
        document.getElementById('q').focus();
        refresh(true);
      }
    },
  };

  async function save(patch) {
    const r = await yh.setSettings(patch);
    if (!r.ok) {
      error = r.error;
      render();
      return false;
    }
    error = '';
    Object.assign(cfg, patch);
    state.cfg = cfg;
    applyAppearance(cfg);
    return true;
  }

  const sw = (key, checked) => `<label class="switch"><input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}><span></span></label>`;
  const row = (title, desc, control) => `<div class="row"><div class="row-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>${control}</div>`;
  const favicon = (url) => {
    try {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname.replace(/^www\./, ''))}&sz=64`;
    } catch {
      return '';
    }
  };
  const del = (attr, i) => `<button class="btn icon-only" data-${attr}="${i}" title="Sil">${svgIcon('x', 13)}</button>`;
  const group = (rows, title) => `${title ? `<div class="group-title">${title}</div>` : ''}<div class="group">${rows}</div>`;
  const listOr = (items, empty) => `<div class="list-edit">${items || `<div class="empty-line">${empty}</div>`}</div>`;
  const entryIcon = (name) => symTile(name, 26);

  const views = {
    general() {
      const engines = cfg.engines.map((e) => `<option value="${esc(e.key)}" ${e.key === cfg.defaultEngine ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
      const roots = cfg.extraFileRoots.map((r, i) => `<div class="entry">${entryIcon('folder')}<div class="entry-text"><b>${esc(r)}</b></div>${del('del-root', i)}</div>`).join('');
      return `
        <h2>Genel</h2>
        ${group(
          row('Açma kısayolu', 'Tıkla ve yeni tuş kombinasyonuna bas', `<input class="field hotkey-field" id="hotkey" readonly value="${esc(cfg.hotkey)}">`) +
            (error ? `<div class="error-text">${esc(error)}</div>` : '') +
            row('Bilgisayar açılınca başlat', 'Arka planda sessizce çalışır', sw('launchAtStartup', cfg.launchAtStartup)) +
            row(
              cfg.platform === 'win32' ? 'Sağ altta simge göster' : 'Tepside simge göster',
              'Kapalıyken launcher sadece kısayolla açılır. Exe\'ye tekrar tıklamak da açar.',
              sw('showTray', cfg.showTray)
            )
        )}
        ${group(
          row('Donanım hızlandırma', 'Kapalıyken ~45 MB daha az RAM kullanır. Değişiklik yeniden başlatınca uygulanır.', sw('hardwareAcceleration', cfg.hardwareAcceleration)) +
            row('Yeniden başlat', 'Ayarı hemen uygulamak için', `<button class="btn" id="relaunch">Yeniden başlat</button>`),
          'Performans'
        )}
        ${group(
          row('Gösterilecek sonuç sayısı', '', `<select class="field" data-key="maxResults" data-number>${[6, 8, 9, 10, 12, 15, 20].map((n) => `<option ${n === cfg.maxResults ? 'selected' : ''}>${n}</option>`).join('')}</select>`) +
            row('Varsayılan arama motoru', 'Hiçbir şey bulunamazsa en altta çıkar', `<select class="field" data-key="defaultEngine">${engines}</select>`),
          'Arama'
        )}
        ${group(
          row('Sık ziyaret edilen siteleri öğren', 'Yazarak 3 kez açtığın siteler Siteler listesine eklenir', sw('autoLearnSites', cfg.autoLearnSites)) +
            row('Dosya araması', 'Ana klasörünü 5 seviye derinliğe kadar indeksler', sw('fileSearch', cfg.fileSearch)) +
            row('Dosya önizlemesi', 'Aramada dosya varken sağda resim, metin ve klasör önizlemesi', sw('filePreview', cfg.filePreview)) +
            roots.replace(/class="entry"/g, 'class="entry row"') +
            `<div class="row"><div class="row-text"><small>Ek arama klasörleri (ör. D:\\Projeler)</small></div><button class="btn" id="add-root">${svgIcon('plus', 13)} Klasör ekle</button></div>`,
          'Akıllı özellikler'
        )}
        ${group(row('Kullanım geçmişi', 'Sık kullanılanlar sıralaması bu geçmişe göre yapılır', `<button class="btn" id="clear-usage">Temizle</button>`), 'Gizlilik')}`;
    },

    appearance() {
      const themeCard = (val, label) => `
        <button class="theme-card${cfg.theme === val ? ' active' : ''}" data-set="theme" data-val="${val}">
          <span class="preview preview-${val}"><span class="pv-win"><i></i><i></i><i></i></span></span>
          <span class="tc-label">${label}</span>
        </button>`;
      const current = ACCENTS.find((a) => a.id === cfg.accent) || ACCENTS[0];
      const swatches = ACCENTS.map(
        (a) => `<button class="swatch${a.id === cfg.accent ? ' active' : ''}" data-set="accent" data-val="${a.id}" style="--sw:${a.color}" title="${a.name}" aria-label="${a.name}"></button>`
      ).join('');
      const segmented = (key, options) =>
        `<div class="segmented">${options.map(([v, l]) => `<button data-set="${key}" data-val="${v}" class="${cfg[key] === v ? 'active' : ''}">${l}</button>`).join('')}</div>`;
      return `
        <h2>Görünüm</h2>
        <div class="group theme-cards">
          ${themeCard('system', 'Otomatik')}${themeCard('light', 'Açık')}${themeCard('dark', 'Koyu')}
        </div>
        ${group(
          row('Vurgu rengi', current.name, `<div class="swatches">${swatches}</div>`) +
            row('Seçim vurgusu', 'Seçili satır nötr gri mi, vurgu renginde mi olsun', segmented('selection', [['neutral', 'Nötr'], ['accent', 'Renkli']])),
          'Renk'
        )}
        ${group(
          row('Cam', cfg.platform === 'win32' ? 'Pencerenin arkası ne kadar görünsün' : 'Panelin ne kadar saydam olacağı', segmented('glass', [['clear', 'Şeffaf'], ['balanced', 'Dengeli'], ['frosted', 'Buzlu']])) +
            row('Yoğunluk', 'Satır ve kare boyutu', segmented('density', [['compact', 'Sıkı'], ['normal', 'Normal'], ['comfortable', 'Ferah']])),
          'Malzeme'
        )}
        <div class="group-title">Önizleme</div>
        <div class="group live-preview">
          <div class="lp-row sel">${symTile('globe', 28)}<div><b>YazılımHub Discord</b><small>discord.gg/yazilimhub</small></div></div>
          <div class="lp-row">${symTile('terminal', 28)}<div><b>Terminal komutu</b><small>&gt; npm run dev</small></div></div>
        </div>`;
    },

    sites() {
      const items = cfg.sites
        .map(
          (s, i) => `<div class="entry"><img src="${esc(favicon(s.url))}" alt=""><div class="entry-text"><b>${esc(s.name)}</b><small>${esc(s.url)}</small></div>${s.auto ? '<span class="badge">otomatik</span>' : ''}${del('del-site', i)}</div>`
        )
        .join('');
      return `
        <h2>Siteler</h2>
        <p class="hint">Ana ekranda en çok açtıkların öne çıkar. Adını yazarak da açabilirsin.</p>
        ${listOr(items, 'Henüz site yok.')}
        <div class="group-title">Site ekle</div>
        <div class="group add-form">
          <input class="field" id="site-name" placeholder="Ad (ör. Jira)">
          <input class="field" id="site-url" placeholder="https://…">
          <button class="btn primary" id="add-site">Ekle</button>
        </div>`;
    },

    engines() {
      const items = cfg.engines
        .map((e, i) => `<div class="entry"><span class="badge">${esc(e.key)}</span><div class="entry-text"><b>${esc(e.name)}</b><small>${esc(e.url)}</small></div>${del('del-engine', i)}</div>`)
        .join('');
      return `
        <h2>Arama kısayolları</h2>
        <p class="hint">Kısayolu yazıp boşluk bırak: <code>yt lofi</code>, <code>gh electron</code>, <code>npm react</code>. Adreste aranacak yeri <code>%s</code> ile belirt.</p>
        ${listOr(items, 'Kısayol yok.')}
        <div class="group-title">Kısayol ekle</div>
        <div class="group add-form">
          <input class="field" id="eng-key" placeholder="Kısayol (ör. az)" style="flex:0 0 120px">
          <input class="field" id="eng-name" placeholder="Ad (ör. Amazon)">
          <input class="field" id="eng-url" placeholder="https://site.com/search?q=%s" style="flex-basis:100%">
          <button class="btn primary" id="add-engine">Ekle</button>
        </div>`;
    },

    commands() {
      const items = cfg.commands
        .map(
          (c, i) => `<div class="entry">${entryIcon('terminal')}<div class="entry-text"><b>${esc(c.name)}</b><small>${esc(c.command)}</small></div>${c.terminal ? '<span class="badge">terminal</span>' : ''}${del('del-cmd', i)}</div>`
        )
        .join('');
      const ex = cfg.platform === 'win32' ? 'code C:\\Projeler\\site' : 'code ~/projeler/site';
      return `
        <h2>Özel komutlar</h2>
        <p class="hint">Sık çalıştırdığın komutları isimle kaydet, adını yazıp Enter'a bas. Örn. <code>${esc(ex)}</code>. Tek seferlik komut için <code>&gt; komut</code> yeter.</p>
        ${listOr(items, 'Henüz komut yok.')}
        <div class="group-title">Komut ekle</div>
        <div class="group add-form">
          <input class="field" id="cmd-name" placeholder="Ad (ör. Site projesini aç)">
          <input class="field" id="cmd-cmd" placeholder="Komut" style="flex-basis:100%">
          <label class="inline-check">${sw('cmd-terminal', false).replace('data-key="cmd-terminal"', 'id="cmd-terminal"')} Terminalde göster</label>
          <span style="flex:1"></span>
          <button class="btn primary" id="add-cmd">Ekle</button>
        </div>`;
    },

    async plugins() {
      const list = await yh.plugins();
      const items = list
        .map(
          (p) => `<div class="entry">${entryIcon('plugin')}
            <div class="entry-text"><b>${esc(p.name)} <span style="color:var(--text-3);font-weight:400">${esc(p.version)}</span></b>
            <small>${p.error ? `<span style="color:var(--danger)">Hata: ${esc(p.error)}</span>` : esc(p.description)}</small></div>
            ${p.keyword ? `<span class="badge">${esc(p.keyword)}</span>` : ''}
            <label class="switch"><input type="checkbox" data-plugin="${esc(p.id)}" ${p.enabled ? 'checked' : ''}><span></span></label></div>`
        )
        .join('');
      return `
        <h2>Eklentiler</h2>
        <p class="hint">Topluluk eklentilerini eklenti klasörüne kopyala ve yeniden yükle. Eklentiler tam yetkiyle çalışır; sadece güvendiğin kaynaklardan kur. Kendi eklentini <b>discord.gg/yazilimhub</b>'da paylaş.</p>
        ${listOr(items, 'Eklenti yok.')}
        <div class="add-form" style="padding:0">
          <button class="btn" id="plugins-folder">${svgIcon('folder', 13)} Eklenti klasörünü aç</button>
          <button class="btn" id="plugins-reload">${svgIcon('refresh', 13)} Yeniden yükle</button>
        </div>`;
    },

    hidden() {
      const pretty = (id) => {
        const rest = id.replace(/^(app:uwp:|app:|file:|site:|cmd:custom:|cmd:)/, '');
        return rest.split(/[\\/]/).pop().replace(/\.(lnk|desktop|url)$/i, '') || rest;
      };
      const items = cfg.hidden
        .map((id, i) => `<div class="entry">${entryIcon('eye-off')}<div class="entry-text"><b>${esc(pretty(id))}</b><small>${esc(id)}</small></div><button class="btn" data-unhide="${i}">Göster</button></div>`)
        .join('');
      return `
        <h2>Gizlenenler</h2>
        <p class="hint">Sonuçlarda görmek istemediğin öğeler (Ctrl+H ile gizlenir).</p>
        ${listOr(items, 'Gizlenen öğe yok.')}`;
    },

    about() {
      return `
        <div class="about">
          ${symTile('logo', 88)}
          <h3>YH Launcher</h3>
          <span class="version">Sürüm ${esc(cfg.version)}</span>
          <p>YazılımHub topluluğunun geliştirdiği, eklentilerle genişleyen Windows ve Linux uygulama başlatıcısı.</p>
          <button class="btn primary" id="open-discord">${svgIcon('external', 13)} discord.gg/yazilimhub</button>
        </div>
        <div class="group-title">Klavye kısayolları</div>
        <div class="group">${[
          ['Enter', 'Aç / çalıştır'],
          ['Shift+Enter', 'Yönetici olarak çalıştır (Windows)'],
          ['Ctrl+Enter', 'Dosya konumunu aç'],
          ['Ctrl+K', 'Eylemler menüsü'],
          ['Ctrl+P', 'Sabitle / sabitlemeyi kaldır'],
          ['Ctrl+↑ / ↓', 'Sabitlenenlerin sırasını değiştir'],
          ['Ctrl+H', 'Sonuçlardan gizle'],
          ['Ctrl+Delete', 'Uygulamayı kaldır'],
          ['Ctrl+C', 'Yolu / linki kopyala'],
          ['Ctrl+R', 'Uygulamaları yeniden tara'],
          ['Tab', 'Otomatik tamamla'],
          ['Esc', 'Temizle / kapat'],
        ]
          .map(([k, d]) => row(d, '', `<kbd>${k}</kbd>`))
          .join('')}</div>`;
    },
  };

  async function render() {
    const nav =
      `<div class="nav-head">${symTile('logo', 26)} Ayarlar</div>` +
      TABS.map(([id, label, icon]) => `<button data-tab="${id}" class="${id === tab ? 'active' : ''}">${symTile(icon, 22)} ${label}</button>`).join('');
    const body = await views[tab]();
    el.innerHTML = `<nav class="settings-nav">${nav}</nav><div class="settings-body">${body}</div>`;
    el.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => (img.style.visibility = 'hidden')));
  }

  // ---------------------------------------------------------------- olaylar

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-tab], #hotkey');
    if (!t) return;
    const d = t.dataset;
    // Görünüm seçimleri (tema kartı, renk, segment): anında uygula
    if (d.set) {
      if (cfg[d.set] === d.val) return;
      if (await save({ [d.set]: d.val })) {
        if (d.set === 'theme') applyTheme(d.val);
        render();
      }
      return;
    }
    if (d.tab) {
      tab = d.tab;
      error = '';
      return render();
    }
    if (t.id === 'hotkey') {
      api.capturing = true;
      t.value = 'Tuşlara bas…';
      return;
    }
    const val = (id) => document.getElementById(id).value.trim();
    if (t.id === 'add-root') {
      const dir = await yh.pickFolder();
      if (dir) await save({ extraFileRoots: [...cfg.extraFileRoots, dir] });
    } else if (d.delRoot != null) {
      await save({ extraFileRoots: cfg.extraFileRoots.filter((_, i) => i !== +d.delRoot) });
    } else if (t.id === 'relaunch') {
      return yh.relaunch();
    } else if (t.id === 'clear-usage') {
      await save({ usage: {} });
      toast('Kullanım geçmişi temizlendi');
    } else if (t.id === 'add-site') {
      let url = val('site-url');
      const name = val('site-name');
      if (!url) return;
      if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
      await save({ sites: [...cfg.sites, { name: name || new URL(url).hostname.replace(/^www\./, ''), url }] });
    } else if (d.delSite != null) {
      await save({ sites: cfg.sites.filter((_, i) => i !== +d.delSite) });
    } else if (t.id === 'add-engine') {
      const key = val('eng-key');
      const name = val('eng-name');
      const url = val('eng-url');
      if (!key || !url.includes('%s')) return toast('Kısayol ve %s içeren adres gerekli');
      await save({ engines: [...cfg.engines.filter((x) => x.key !== key), { key, name: name || key, url }] });
    } else if (d.delEngine != null) {
      await save({ engines: cfg.engines.filter((_, i) => i !== +d.delEngine) });
    } else if (t.id === 'add-cmd') {
      const name = val('cmd-name');
      const command = val('cmd-cmd');
      if (!name || !command) return toast('Ad ve komut gerekli');
      await save({ commands: [...cfg.commands, { name, command, terminal: document.getElementById('cmd-terminal').checked }] });
    } else if (d.delCmd != null) {
      await save({ commands: cfg.commands.filter((_, i) => i !== +d.delCmd) });
    } else if (d.unhide != null) {
      await save({ hidden: cfg.hidden.filter((_, i) => i !== +d.unhide) });
    } else if (t.id === 'plugins-folder') {
      return yh.openPluginsFolder();
    } else if (t.id === 'plugins-reload') {
      await yh.reloadPlugins();
      toast('Eklentiler yeniden yüklendi');
    } else if (t.id === 'open-discord') {
      return yh.openUrl('https://discord.gg/yazilimhub');
    } else return;
    render();
  });

  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.plugin) {
      const id = t.dataset.plugin;
      const set = new Set(cfg.disabledPlugins);
      if (t.checked) set.delete(id);
      else set.add(id);
      return save({ disabledPlugins: [...set] });
    }
    const key = t.dataset.key;
    if (!key) return;
    const value = t.type === 'checkbox' ? t.checked : 'number' in t.dataset ? Number(t.value) : t.value;
    await save({ [key]: value });
    if (key === 'theme') applyTheme(value);
  });

  // Kısayol yakalama
  const KEY_NAMES = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', Escape: 'Esc' };
  document.addEventListener(
    'keydown',
    async (e) => {
      if (!api.capturing) return;
      e.preventDefault();
      e.stopPropagation();
      const field = document.getElementById('hotkey');
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') {
        api.capturing = false;
        field.value = cfg.hotkey;
        return;
      }
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Super');
      if (!parts.length) {
        field.value = 'En az bir tuş (Ctrl/Alt/Shift) gerekli';
        return;
      }
      const k = KEY_NAMES[e.key] || (e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key);
      parts.push(k);
      api.capturing = false;
      const accel = parts.join('+');
      if (await save({ hotkey: accel })) {
        field.value = accel;
        toast(`Yeni kısayol: ${accel}`);
      }
    },
    true
  );

  return api;
})();
