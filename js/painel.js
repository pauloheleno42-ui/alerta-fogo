// =====================================================================
//  Painel do Bombeiro administrador
// =====================================================================
(() => {
  const C = window.APP_CONFIG;
  const $ = id => document.getElementById(id);
  const chave = new URLSearchParams(location.hash.slice(1)).get('k') || '';
  $('orgao').textContent = C.ORGAO;
  if (API.demo) { $('faixaDemo').classList.remove('oculto'); $('btnLimpar').classList.remove('oculto'); }

  const STATUS = { NOVA: 'Nova', EM_ATENDIMENTO: 'Em atendimento', ENCERRADA: 'Encerrada', IMPROCEDENTE: 'Improcedente/trote' };
  let ocorrencias = [];
  let conhecidas = null;          // ids já vistos (para detectar novas)
  let selecionada = null;
  let somAtivo = false;
  let audioCtx = null;
  let unidades = [];
  let editando = null;           // id cujo formulário de gestão foi alterado e não salvo

  const classeFinal = o => o.classificacao_manual || o.classificacao;
  const badge = cl => `<span class="badge" style="background:${CLASSES[cl].cor}">${CLASSES[cl].rotulo}</span>`;
  const toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };

  function bloquear() {
    $('bloqueio').classList.remove('oculto');
    ['abaOcorrencias', 'abaUnidades'].forEach(id => $(id).classList.add('oculto'));
    document.querySelector('.abas').classList.add('oculto');
  }
  if (!API.demo && !chave) { bloquear(); return; }

  // ---------------------------------------------------------- mapa
  const mapa = L.map('mapaPainel').setView(C.MAPA_CENTRO, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
  const camadaOc = L.layerGroup().addTo(mapa);
  const camadaUn = L.layerGroup().addTo(mapa);
  const iconeOc = (cl, sel) => L.divIcon({
    className: '', iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);width:${sel ? 30 : 22}px;height:${sel ? 30 : 22}px;border-radius:50%;background:${CLASSES[cl].cor};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);display:grid;place-items:center;font-size:${sel ? 15 : 11}px">🔥</div>`,
  });
  const iconeUn = L.divIcon({ className: '', iconSize: [0, 0], html: '<div style="font-size:24px;transform:translate(-50%,-50%)">🚒</div>' });

  // ---------------------------------------------------------- dados
  async function carregar() {
    try {
      const lista = await API.adminListar(chave);
      const novas = conhecidas ? lista.filter(o => !conhecidas.has(o.id)) : [];
      conhecidas = new Set(lista.map(o => o.id));
      ocorrencias = lista;
      desenhar();
      if (novas.length) avisarNovas(novas);
      $('atualizado').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      if (/chave/i.test(e.message)) return bloquear();
      $('atualizado').textContent = '⚠️ ' + e.message;
    }
  }

  async function carregarUnidades() {
    try { unidades = await API.adminUnidades(chave); } catch { unidades = []; }
    camadaUn.clearLayers();
    unidades.filter(u => u.ativa).forEach(u => L.marker([u.lat, u.lng], { icon: iconeUn }).bindTooltip(U.esc(u.nome)).addTo(camadaUn));
    desenharUnidades();
  }

  function ordenar(a, b) {
    const aberto = o => (o.status === 'NOVA' ? 0 : o.status === 'EM_ATENDIMENTO' ? 1 : 2);
    return aberto(a) - aberto(b) || CLASSES[classeFinal(a)].ordem - CLASSES[classeFinal(b)].ordem || new Date(b.criado_em) - new Date(a.criado_em);
  }

  function filtradas() {
    const fs = $('fStatus').value, fc = $('fClasse').value;
    return ocorrencias.filter(o => {
      if (fs === 'abertas' && !['NOVA', 'EM_ATENDIMENTO'].includes(o.status)) return false;
      if (fs === 'fechadas' && !['ENCERRADA', 'IMPROCEDENTE'].includes(o.status)) return false;
      if (['NOVA', 'EM_ATENDIMENTO'].includes(fs) && o.status !== fs) return false;
      if (fc && classeFinal(o) !== fc) return false;
      return true;
    }).sort(ordenar);
  }

  // ---------------------------------------------------------- desenho
  function desenhar() {
    const abertas = ocorrencias.filter(o => ['NOVA', 'EM_ATENDIMENTO'].includes(o.status));
    const cont = cl => abertas.filter(o => classeFinal(o) === cl).length;
    $('contadores').innerHTML = Object.keys(CLASSES).map(cl =>
      `<span class="chip" style="background:${CLASSES[cl].cor}">${cont(cl)} ${CLASSES[cl].rotulo}</span>`).join('')
      + `<span class="chip cl">${abertas.filter(o => o.status === 'NOVA').length} nova(s)</span>`;
    const novasN = abertas.filter(o => o.status === 'NOVA').length;
    document.title = (novasN ? `(${novasN}) ` : '') + 'Painel — Alerta Fogo';

    const lista = filtradas();
    $('itens').innerHTML = lista.length ? lista.map(o => {
      const cl = classeFinal(o);
      return `<div class="item ${o.status === 'NOVA' ? 'nova' : ''} ${['ENCERRADA', 'IMPROCEDENTE'].includes(o.status) ? 'encerrada' : ''} ${selecionada === o.id ? 'sel' : ''}" data-id="${o.id}">
        <div class="faixa" style="background:${CLASSES[cl].cor}"></div>
        <div>
          <div class="l1"><span class="prot">${U.esc(o.protocolo)}</span><span class="tempo">${U.haQuanto(o.criado_em)}</span></div>
          <div class="l1" style="margin-top:4px">${badge(cl)}<span class="st">${STATUS[o.status]}</span></div>
          <div class="mot">${U.esc((o.motivos || []).slice(0, 3).join(' · '))}</div>
          <div class="l2">${U.esc(o.referencia || `${o.lat.toFixed(4)}, ${o.lng.toFixed(4)}`)}${(o.midias || []).length ? ` · 📷 ${o.midias.length}` : ''}</div>
        </div></div>`;
    }).join('') : '<div class="vazio">Nenhuma ocorrência neste filtro.</div>';
    $('itens').querySelectorAll('.item').forEach(el => el.onclick = () => abrir(el.dataset.id, true));

    camadaOc.clearLayers();
    lista.forEach(o => L.marker([o.lat, o.lng], { icon: iconeOc(classeFinal(o), o.id === selecionada), zIndexOffset: o.id === selecionada ? 1000 : 0 })
      .on('click', () => abrir(o.id, false)).bindTooltip(o.protocolo).addTo(camadaOc));

    if (selecionada) {
      const o = ocorrencias.find(x => x.id === selecionada);
      if (o && editando !== o.id) renderDetalhe(o);
    }
  }

  function abrir(id, centralizar) {
    if (editando && editando !== id && !confirm('Há alterações não salvas na ocorrência aberta. Descartar?')) return;
    editando = null;
    selecionada = id;
    const o = ocorrencias.find(x => x.id === id);
    if (!o) return;
    if (centralizar) {
      mapa.setView([o.lat, o.lng], Math.max(mapa.getZoom(), 15), { animate: false });
      if (window.innerWidth > 860) mapa.panBy([Math.min(260, mapa.getSize().x / 4), 0], { animate: false }); // fica visível ao lado do detalhe
    }
    desenhar();
    renderDetalhe(o);
  }

  function renderDetalhe(o) {
    const cl = classeFinal(o);
    const u = o.unidade_proxima;
    const tel = U.soDigitos(o.telefone);
    const r = o.respostas || {};
    const $d = $('detalhe');
    $d.classList.remove('oculto');
    $d.innerHTML = `
      <button class="fechar" id="fechar" aria-label="Fechar">×</button>
      <h2>${U.esc(o.protocolo)}</h2>
      <div>${badge(cl)} <span class="st">${STATUS[o.status]}</span>
        ${o.classificacao_manual ? `<span class="ajuda" style="font-size:12px"> · ajustada (automática: ${CLASSES[o.classificacao].rotulo})</span>` : ''}</div>
      <div class="ajuda" style="margin-top:6px">Recebida em ${U.fmtData(o.criado_em)} (${U.haQuanto(o.criado_em)})</div>

      <h4>Por que essa classificação</h4>
      <ul>${(o.motivos || []).map(m => `<li>${U.esc(m)}</li>`).join('')}</ul>

      ${(o.midias || []).length ? `<h4>Fotos e vídeos</h4><div class="galeria">${o.midias.map((m, i) =>
        !m.url ? `<div class="semvideo">🎥 ${U.esc(m.nome)}<br>(vídeo não salvo no modo demonstração)</div>`
        : m.tipo === 'video' ? `<button class="mini" data-midia="${i}"><video src="${U.esc(m.url)}" muted preload="metadata" playsinline></video><span class="play">▶</span></button>`
        : `<button class="mini" data-midia="${i}"><img src="${U.esc(m.url)}" alt="" loading="lazy"></button>`).join('')}</div>
        <div class="ajuda" style="font-size:12px;margin-top:4px">Clique para ampliar</div>` : ''}

      <h4>Respostas do solicitante</h4>
      <table>${PERGUNTAS.map(q => `<tr><td>${U.esc(q.titulo)}</td><td><b>${U.esc(rotuloResposta(q.id, r[q.id]))}</b></td></tr>`).join('')}
        ${o.observacao ? `<tr><td>Observação</td><td>${U.esc(o.observacao)}</td></tr>` : ''}</table>

      <h4>Local</h4>
      <table>
        <tr><td>Coordenadas</td><td><b>${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}</b></td></tr>
        <tr><td>Como foi marcado</td><td>${o.no_local ? 'GPS do solicitante (estava perto do fogo)' : 'Marcado no mapa (solicitante em outro lugar)'}${o.precisao_m ? ` · precisão ~${Math.round(o.precisao_m)} m` : ''}</td></tr>
        ${o.referencia ? `<tr><td>Referência</td><td>${U.esc(o.referencia)}</td></tr>` : ''}
        ${u ? `<tr><td>Unidade mais próxima</td><td>${U.esc(u.nome)} — <b>${String(u.distancia_km).replace('.', ',')} km</b> (linha reta)</td></tr>` : ''}
      </table>
      <div class="links">
        <a href="${U.linkRota(o.lat, o.lng)}" target="_blank" rel="noopener">🧭 Rota (Google Maps)</a>
        <a href="${U.linkWaze(o.lat, o.lng)}" target="_blank" rel="noopener">🚗 Waze</a>
        <button id="copiarCoord">📋 Copiar coordenadas</button>
      </div>

      <h4>Solicitante</h4>
      <table>
        <tr><td>Nome</td><td><b>${U.esc(o.nome)}</b></td></tr>
        <tr><td>Telefone</td><td><b>${U.esc(U.formatarTelefone(tel))}</b></td></tr>
        <tr><td>RG</td><td><b>${o.rg ? U.esc(o.rg) : '<span class="ajuda">não informado</span>'}</b></td></tr>
      </table>
      <div class="links">
        <a href="tel:${tel}">📞 Ligar</a>
        <a href="https://wa.me/55${tel}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <button id="copiarResumo">📋 Copiar resumo</button>
      </div>

      <h4>Gestão</h4>
      <div class="gestao">
        <div><label>Status</label><select id="gStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label>Classificação</label><select id="gClasse">
          <option value="">Automática (${CLASSES[o.classificacao].rotulo})</option>
          ${Object.entries(CLASSES).map(([k, v]) => `<option value="${k}" ${o.classificacao_manual === k ? 'selected' : ''}>${v.rotulo}</option>`).join('')}
        </select></div>
        <div style="grid-column:1/-1"><label>Observações da equipe</label><textarea id="gObs" placeholder="Ex.: ABT 01 despachado às 14h20">${U.esc(o.obs_admin || '')}</textarea></div>
        <button class="btn pq" id="gSalvar" style="grid-column:1/-1">Salvar</button>
      </div>`;

    ['gStatus', 'gClasse', 'gObs'].forEach(id => $(id).addEventListener('input', () => editando = o.id));
    $('fechar').onclick = () => { $d.classList.add('oculto'); selecionada = null; editando = null; desenhar(); };
    $('copiarCoord').onclick = () => copiar(`${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}`);
    $('copiarResumo').onclick = () => copiar(resumo(o));
    $d.querySelectorAll('[data-midia]').forEach(b => b.onclick = () => abrirMidia(o.midias.filter(m => m.url), +b.dataset.midia, o.midias));
    $('gSalvar').onclick = async () => {
      try {
        await API.adminAtualizar(chave, o.id, $('gStatus').value, $('gClasse').value, $('gObs').value);
        toast('Salvo');
        editando = null;
        await carregar();
      } catch (e) { toast('Erro: ' + e.message); }
    };
  }

  // ---------------------------------------------------------- visualizador de fotos/vídeos
  function abrirMidia(lista, idxOriginal, todas) {
    let i = Math.max(0, lista.indexOf(todas[idxOriginal]));
    const box = document.createElement('div');
    box.className = 'visualizador';
    const mostrar = () => {
      const m = lista[i];
      const ehLink = /^https?:/.test(m.url);
      box.innerHTML = `
        <button class="vz-fechar" aria-label="Fechar">×</button>
        ${lista.length > 1 ? '<button class="vz-ant" aria-label="Anterior">‹</button><button class="vz-prox" aria-label="Próxima">›</button>' : ''}
        <div class="vz-midia">${m.tipo === 'video'
          ? `<video src="${U.esc(m.url)}" controls autoplay playsinline></video>`
          : `<img src="${U.esc(m.url)}" alt="">`}</div>
        <div class="vz-rodape">${i + 1} de ${lista.length} · ${U.esc(m.nome || '')}
          ${ehLink ? ` · <a href="${U.esc(m.url)}" target="_blank" rel="noopener">abrir original em nova aba</a>` : ''}</div>`;
      box.querySelector('.vz-fechar').onclick = fechar;
      const ant = box.querySelector('.vz-ant'), prox = box.querySelector('.vz-prox');
      if (ant) ant.onclick = e => { e.stopPropagation(); i = (i - 1 + lista.length) % lista.length; mostrar(); };
      if (prox) prox.onclick = e => { e.stopPropagation(); i = (i + 1) % lista.length; mostrar(); };
    };
    const tecla = e => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowLeft' && lista.length > 1) { i = (i - 1 + lista.length) % lista.length; mostrar(); }
      if (e.key === 'ArrowRight' && lista.length > 1) { i = (i + 1) % lista.length; mostrar(); }
    };
    function fechar() { box.remove(); document.removeEventListener('keydown', tecla); }
    box.addEventListener('click', e => { if (e.target === box || e.target.classList.contains('vz-midia')) fechar(); });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(box);
    mostrar();
  }

  function resumo(o) {
    const r = o.respostas || {};
    return [
      `🔥 INCÊNDIO EM VEGETAÇÃO — ${CLASSES[classeFinal(o)].rotulo}`,
      `Protocolo: ${o.protocolo} (${U.fmtData(o.criado_em)})`,
      `Local: ${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}${o.referencia ? ' — ' + o.referencia : ''}`,
      `Mapa: ${U.linkMaps(o.lat, o.lng)}`,
      ...PERGUNTAS.map(q => `${q.titulo} ${rotuloResposta(q.id, r[q.id])}`),
      o.observacao ? `Obs. do solicitante: ${o.observacao}` : '',
      `Motivos: ${(o.motivos || []).join('; ')}`,
      `Solicitante: ${o.nome} — ${U.formatarTelefone(o.telefone)}${o.rg ? ' — RG ' + o.rg : ''}`,
    ].filter(Boolean).join('\n');
  }

  function copiar(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(() => toast('Copiado'))
      .catch(() => { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copiado'); });
  }

  // ---------------------------------------------------------- alertas de novas ocorrências
  $('btnSom').onclick = () => {
    somAtivo = !somAtivo;
    if (somAtivo) {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume();
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      bip(1);
    }
    $('btnSom').textContent = somAtivo ? '🔔 Alertas ligados' : '🔕 Ativar alertas';
  };

  function bip(vezes) {
    if (!somAtivo || !audioCtx) return;
    for (let i = 0; i < vezes; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = i % 2 ? 660 : 880;
      g.gain.value = 0.12;
      o.connect(g).connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.35;
      o.start(t); o.stop(t + 0.25);
    }
  }

  function avisarNovas(novas) {
    const critica = novas.some(o => classeFinal(o) === 'CRITICO');
    bip(critica ? 6 : 2);
    const txt = `${novas.length} nova(s) ocorrência(s)${critica ? ' — HÁ CRÍTICA' : ''}`;
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('Alerta Fogo', { body: txt, icon: 'img/icone.svg' }); } catch {}
    }
    const b = document.createElement('div');
    b.className = 'alerta-novo'; b.textContent = '🔥 ' + txt + ' — clique para ver';
    b.onclick = () => { b.remove(); abrir(novas.sort(ordenar)[0].id, true); };
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 15000);
  }

  // ---------------------------------------------------------- unidades
  let mapaUn = null, marcadorUn = null;
  function desenharUnidades() {
    $('tbUn').innerHTML = unidades.length ? unidades.map(u => `
      <tr><td><b>${U.esc(u.nome)}</b><div class="ajuda" style="margin:0;font-size:12px">${U.esc(u.endereco || '')} ${u.telefone ? '· ' + U.esc(u.telefone) : ''}</div></td>
      <td>${(+u.lat).toFixed(5)}, ${(+u.lng).toFixed(5)}</td><td>${u.ativa ? 'Sim' : 'Não'}</td>
      <td style="white-space:nowrap"><button data-ed="${u.id}">Editar</button> <button data-rm="${u.id}">Remover</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="vazio">Nenhuma unidade.</td></tr>';
    $('tbUn').querySelectorAll('[data-ed]').forEach(b => b.onclick = () => preencherForm(unidades.find(u => u.id === b.dataset.ed)));
    $('tbUn').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      const u = unidades.find(x => x.id === b.dataset.rm);
      if (!confirm(`Remover "${u.nome}"?`)) return;
      try { await API.adminRemoverUnidade(chave, u.id); toast('Removida'); carregarUnidades(); } catch (e) { toast('Erro: ' + e.message); }
    });
  }

  function preencherForm(u) {
    u = u || {};
    $('tituloFormUn').textContent = u.id ? 'Editar unidade' : 'Nova unidade';
    $('unId').value = u.id || ''; $('unNome').value = u.nome || ''; $('unEnd').value = u.endereco || '';
    $('unTel').value = u.telefone || ''; $('unLat').value = u.lat ?? ''; $('unLng').value = u.lng ?? '';
    $('unAtiva').checked = u.ativa !== false;
    if (mapaUn && u.lat != null) { pinUn(u.lat, u.lng); mapaUn.setView([u.lat, u.lng], 15); }
  }

  function pinUn(lat, lng) {
    if (!marcadorUn) marcadorUn = L.marker([lat, lng], { icon: iconeUn }).addTo(mapaUn);
    else marcadorUn.setLatLng([lat, lng]);
  }

  $('unCancelar').onclick = () => { preencherForm(null); if (marcadorUn) { marcadorUn.remove(); marcadorUn = null; } };
  $('unSalvar').onclick = async () => {
    const lat = parseFloat(String($('unLat').value).replace(',', '.')), lng = parseFloat(String($('unLng').value).replace(',', '.'));
    if (!$('unNome').value.trim() || isNaN(lat) || isNaN(lng)) return toast('Preencha nome, latitude e longitude');
    try {
      await API.adminSalvarUnidade(chave, { id: $('unId').value || null, nome: $('unNome').value.trim(), endereco: $('unEnd').value.trim(),
        telefone: $('unTel').value.trim(), lat, lng, ativa: $('unAtiva').checked });
      toast('Unidade salva'); $('unCancelar').onclick(); carregarUnidades();
    } catch (e) { toast('Erro: ' + e.message); }
  };

  document.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-aba]').forEach(x => x.classList.toggle('sel', x === b));
    const un = b.dataset.aba === 'unidades';
    $('abaOcorrencias').classList.toggle('oculto', un);
    $('abaUnidades').classList.toggle('oculto', !un);
    if (un && !mapaUn) {
      mapaUn = L.map('mapaUn').setView(C.MAPA_CENTRO, 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapaUn);
      mapaUn.on('click', e => { $('unLat').value = e.latlng.lat.toFixed(6); $('unLng').value = e.latlng.lng.toFixed(6); pinUn(e.latlng.lat, e.latlng.lng); });
    }
    if (!un) setTimeout(() => mapa.invalidateSize(), 50); else setTimeout(() => mapaUn.invalidateSize(), 50);
  });

  $('fStatus').onchange = $('fClasse').onchange = desenhar;
  $('btnLimpar').onclick = () => { if (confirm('Apagar todas as ocorrências de teste?')) { API.limparDemo(); conhecidas = null; carregar(); } };

  // ---------------------------------------------------------- início
  carregarUnidades();
  carregar();
  setInterval(carregar, C.PAINEL_ATUALIZA_SEG * 1000);
  setInterval(() => !document.hidden && desenhar(), 60000); // atualiza "há X min"
  if (API.demo) window.addEventListener('storage', e => e.key === 'af_ocorrencias' && carregar());
})();
