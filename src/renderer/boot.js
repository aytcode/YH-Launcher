// İlk boyamadan önce: cam malzeme (Windows 11) mi, CSS paneli mi?
document.documentElement.classList.add(new URLSearchParams(location.search).get('material') === '1' ? 'material' : 'solid');
document.documentElement.classList.add(`os-${navigator.userAgent.includes('Windows') ? 'win' : 'linux'}`);
