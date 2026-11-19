// Funções utilitárias compartilhadas
window.U = (() => {
  const R = 6371;
  const rad = x => x * Math.PI / 180;

  function distanciaKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function unidadeMaisProxima(ponto, unidades) {
    let melhor = null;
    for (const u of unidades || []) {
      if (u.ativa === false) continue;
      const d = distanciaKm(ponto, u);
      if (!melhor || d < melhor.distancia_km) melhor = { ...u, distancia_km: Math.round(d * 10) / 10 };
    }
    return melhor;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // Reduz a foto para economizar dados móveis e armazenamento
  function comprimirImagem(file, maxPx = 1600, qualidade = 0.8) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const esc = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => resolve(b || file), 'image/jpeg', qualidade);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  const blobParaDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

  function formatarTelefone(s) {
    const d = soDigitos(s).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmtData(iso) {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function haQuanto(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h ${min % 60} min`;
    return `há ${Math.floor(h / 24)} d`;
  }

  const linkMaps = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const linkRota = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const linkWaze = (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  return { distanciaKm, unidadeMaisProxima, uuid, comprimirImagem, blobParaDataURL, soDigitos,
           formatarTelefone, esc, fmtData, haQuanto, linkMaps, linkRota, linkWaze };
})();
