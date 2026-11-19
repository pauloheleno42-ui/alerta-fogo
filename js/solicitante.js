// =====================================================================
//  App do solicitante — fluxo em etapas
// =====================================================================
(() => {
  const C = window.APP_CONFIG;
  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const $voltar = document.getElementById('btnVoltar');
  const $avancar = document.getElementById('btnAvancar');
  const $barra = document.getElementById('barra');
  if (API.demo) document.getElementById('faixaDemo').classList.remove('oculto');

  const salvo = (() => { try { return JSON.parse(localStorage.getItem('af_solicitante')) || {}; } catch { return {}; } })();

  const estado = {
    midias: [],          // {blob, nome, tipo, preview}
    respostas: { riscos: [] },
    local: null,         // {lat, lng, precisao_m}
    no_local: true,
    referencia: '', observacao: '',
    nome: salvo.nome || '', telefone: salvo.telefone || '', consentimento: false,
  };

  const TELAS = ['inicio', 'midia', ...PERGUNTAS.map(q => 'q:' + q.id), 'local', 'dados'];
  let atual = 0;
  let mapa = null;
  let unidadesPromise = API.unidades().catch(() => []);

  // ---------------------------------------------------------- navegação
  function ir(i) {
    if (mapa) { mapa.remove(); mapa = null; }
    atual = Math.max(0, Math.min(TELAS.length - 1, i));
    window.scrollTo(0, 0);
    render();
  }
  $voltar.onclick = () => ir(atual - 1);
  $avancar.onclick = () => {
    if (!validaTela()) return;
    if (TELAS[atual] === 'dados') return enviar();
    ir(atual + 1);
  };

  function atualizaNav() {
    const t = TELAS[atual];
    $nav.classList.toggle('oculto', t === 'inicio');
    $barra.style.width = `${Math.round((atual / (TELAS.length - 1)) * 100)}%`;
    $avancar.textContent = t === 'dados' ? '🔥 Enviar alerta' : (t === 'midia' && !estado.midias.length ? 'Pular' : 'Continuar');
    $avancar.disabled = !podeAvancar();
  }

  function podeAvancar() {
    const t = TELAS[atual];
    if (t.startsWith('q:')) {
      const q = PERGUNTAS.find(p => 'q:' + p.id === t);
      return !q.obrigatoria || !!estado.respostas[q.id];
    }
    if (t === 'local') return !!estado.local;
    return true;
  }

  function validaTela() {
    if (TELAS[atual] !== 'dados') return podeAvancar();
    const erro = document.getElementById('erroDados');
    const tel = U.soDigitos(estado.telefone);
    if (estado.nome.trim().length < 2) { erro.textContent = 'Informe seu nome.'; return false; }
    if (tel.length < 10 || tel.length > 11) { erro.textContent = 'Informe um telefone com DDD.'; return false; }
    if (!estado.consentimento) { erro.textContent = 'Marque a autorização para podermos receber seu alerta.'; return false; }
    erro.textContent = '';
    return true;
  }

  // ---------------------------------------------------------- telas
  function render() {
    const t = TELAS[atual];
    if (t === 'inicio') telaInicio();
    else if (t === 'midia') telaMidia();
    else if (t.startsWith('q:')) telaPergunta(PERGUNTAS.find(p => 'q:' + p.id === t));
    else if (t === 'local') telaLocal();
    else if (t === 'dados') telaDados();
    atualizaNav();
  }

  function telaInicio() {
    $app.innerHTML = `
      <section class="tela">
        <div class="hero">
          <img src="img/icone.svg" alt="">
          <h1>Viu um incêndio em vegetação?</h1>
          <p class="ajuda">Avise o Corpo de Bombeiros em menos de 2 minutos: fotos, algumas perguntas e o local.</p>
        </div>
        <div class="aviso verm"><span>⚠️</span><div><b>Pessoas feridas, presas ou fogo em casa?</b>Ligue 193 agora. Este app não substitui a ligação de emergência.</div></div>
        <button class="btn" id="comecar">🔥 Comunicar incêndio</button>
        <div style="height:10px"></div>
        <a class="btn sec" href="tel:193">📞 Ligar 193</a>
        <div class="cartao">
          <b>Sua segurança vem primeiro</b>
          <ul class="dicas">
            <li>Não se aproxime do fogo para fotografar.</li>
            <li>Fique longe da fumaça e do lado de onde o vento vem.</li>
            <li>Não tente apagar incêndios grandes sozinho.</li>
          </ul>
        </div>
      </section>`;
    document.getElementById('comecar').onclick = () => ir(1);
  }

  function telaMidia() {
    const n = estado.midias.length;
    $app.innerHTML = `
      <section class="tela">
        <h1>Fotos ou vídeos do incêndio</h1>
        <p class="ajuda">Ajudam a equipe a avaliar a gravidade. Opcional — se for perigoso, pule esta etapa.</p>
        <div class="btn-midia">
          <label class="btn sec"><span class="ico">📷</span> Tirar foto
            <input type="file" accept="image/*" capture="environment" class="oculto" data-in></label>
          <label class="btn sec"><span class="ico">🎥</span> Gravar vídeo
            <input type="file" accept="video/*" capture="environment" class="oculto" data-in></label>
        </div>
        <label class="btn sec" style="margin-top:10px">🖼️ Escolher da galeria
          <input type="file" accept="image/*,video/*" multiple class="oculto" data-in></label>
        <div class="erro" id="erroMidia"></div>
        <div class="midias">${estado.midias.map((m, i) => `
          <div class="midia">
            ${m.tipo === 'video' ? `<video src="${m.preview}" muted playsinline></video><span class="tag">▶ vídeo</span>` : `<img src="${m.preview}" alt="">`}
            <button class="x" data-rm="${i}" aria-label="Remover">×</button>
          </div>`).join('')}</div>
        <p class="ajuda">${n}/${C.MAX_ARQUIVOS} arquivos · vídeos até ${C.MAX_VIDEO_MB} MB (cerca de 30 segundos)</p>
      </section>`;
    $app.querySelectorAll('[data-in]').forEach(inp => inp.onchange = async e => {
      const erro = document.getElementById('erroMidia');
      for (const f of e.target.files) {
        if (estado.midias.length >= C.MAX_ARQUIVOS) { erro.textContent = `Máximo de ${C.MAX_ARQUIVOS} arquivos.`; break; }
        const tipo = f.type.startsWith('video') ? 'video' : f.type.startsWith('image') ? 'imagem' : null;
        if (!tipo) continue;
        if (tipo === 'video' && f.size > C.MAX_VIDEO_MB * 1024 * 1024) {
          erro.textContent = `Vídeo muito grande (${(f.size / 1048576).toFixed(0)} MB). Grave um vídeo mais curto.`; continue;
        }
        const blob = tipo === 'imagem' ? await U.comprimirImagem(f) : f;
        estado.midias.push({ blob, nome: f.name || (tipo + '.jpg'), tipo, preview: URL.createObjectURL(blob) });
      }
      render();
    });
    $app.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const [m] = estado.midias.splice(+b.dataset.rm, 1); URL.revokeObjectURL(m.preview); render();
    });
  }

  function telaPergunta(q) {
    const val = estado.respostas[q.id];
    let corpo = '';
    if (q.tipo === 'imagem') {
      corpo = `<div class="opcoes-img ${q.opcoes.length === 4 ? 'c2' : ''}">${q.opcoes.map(o => `
        <button class="op-img ${val === o.v ? 'sel' : ''}" data-v="${o.v}">
          <img src="${o.img}" alt="">
          <div class="txt"><div class="t">${o.t}</div>${o.d ? `<div class="d">${o.d}</div>` : ''}</div>
        </button>`).join('')}</div>
        ${q.extra ? `<button class="op extra ${val === q.extra.v ? 'sel' : ''}" data-v="${q.extra.v}"><span class="t">${q.extra.t}</span></button>` : ''}`;
    } else if (q.tipo === 'botoes') {
      corpo = q.opcoes.map(o => `<button class="op ${o.alerta ? 'alerta' : ''} ${val === o.v ? 'sel' : ''}" data-v="${o.v}"><span class="t">${o.t}</span></button>`).join('');
    } else if (q.tipo === 'multi') {
      const marcados = estado.respostas[q.id] || [];
      corpo = q.opcoes.map(o => `<button class="op ${marcados.includes(o.v) ? 'sel' : ''}" data-m="${o.v}"><span class="t">${o.t}</span></button>`).join('')
        + `<button class="op extra ${!marcados.length ? 'sel' : ''}" data-nenhum><span class="t">Nenhum destes</span></button>`;
    }
    $app.innerHTML = `<section class="tela"><h1>${q.titulo}</h1>${q.ajuda ? `<p class="ajuda">${q.ajuda}</p>` : ''}${corpo}
      ${q.id === 'pessoas' ? `<div class="aviso verm ${val === 'feridas' ? '' : 'oculto'}" id="avisoVit"><span>📞</span><div><b>Há vítimas: ligue 193 agora.</b>Depois, se puder, termine este envio.</div></div>` : ''}
      </section>`;

    $app.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      estado.respostas[q.id] = b.dataset.v;
      $app.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('sel', x === b));
      atualizaNav();
      if (q.id === 'pessoas' && b.dataset.v === 'feridas') { document.getElementById('avisoVit').classList.remove('oculto'); return; }
      setTimeout(() => ir(atual + 1), 280);   // avança sozinho
    });
    $app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const lista = estado.respostas[q.id] || (estado.respostas[q.id] = []);
      const i = lista.indexOf(b.dataset.m);
      i >= 0 ? lista.splice(i, 1) : lista.push(b.dataset.m);
      render();
    });
    const nenhum = $app.querySelector('[data-nenhum]');
    if (nenhum) nenhum.onclick = () => { estado.respostas[q.id] = []; render(); };
  }

  function telaLocal() {
    $app.innerHTML = `
      <section class="tela">
        <h1>Onde está o fogo?</h1>
        <div class="seg">
          <button data-modo="aqui" class="${estado.no_local ? 'sel' : ''}">📍 Estou perto do fogo</button>
          <button data-modo="outro" class="${!estado.no_local ? 'sel' : ''}">🗺️ O fogo é em outro lugar</button>
        </div>
        <p class="ajuda" id="instr"></p>
        <div class="mapa" id="mapa"></div>
        <div class="status-gps" id="gps"></div>
        <button class="btn sec pq" id="btnGps">🎯 Usar minha localização</button>
        <label class="campo" for="ref">Ponto de referência (opcional)</label>
        <input class="campo-in" id="ref" maxlength="300" placeholder="Ex.: atrás da escola X, perto da BR-381 km 360" value="${U.esc(estado.referencia)}">
      </section>`;
    const instr = document.getElementById('instr');
    const $gps = document.getElementById('gps');
    const setInstr = () => instr.textContent = estado.no_local
      ? 'Vamos usar a localização do seu celular. Se precisar, arraste o marcador até o fogo.'
      : 'Toque no mapa no ponto onde está o fogo. Dá para aproximar com dois dedos.';
    setInstr();

    const centro = estado.local ? [estado.local.lat, estado.local.lng] : C.MAPA_CENTRO;
    mapa = L.map('mapa', { zoomControl: true }).setView(centro, estado.local ? 16 : C.MAPA_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(mapa);
    const iconeFogo = L.divIcon({ className: '', html: '<div style="font-size:34px;line-height:34px;transform:translate(-50%,-90%)">🔥</div>', iconSize: [0, 0] });
    let marcador = null;
    const marcar = (lat, lng, precisao) => {
      estado.local = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), precisao_m: precisao ?? null };
      if (!marcador) {
        marcador = L.marker([lat, lng], { draggable: true, icon: iconeFogo }).addTo(mapa);
        marcador.on('dragend', () => { const p = marcador.getLatLng(); marcar(p.lat, p.lng, null); });
      } else marcador.setLatLng([lat, lng]);
      atualizaNav();
    };
    if (estado.local) marcar(estado.local.lat, estado.local.lng, estado.local.precisao_m);
    mapa.on('click', e => marcar(e.latlng.lat, e.latlng.lng, null));

    const pegarGps = () => {
      if (!navigator.geolocation) { $gps.textContent = 'Seu aparelho não informa a localização. Toque no mapa.'; return; }
      $gps.textContent = 'Buscando sua localização…';
      navigator.geolocation.getCurrentPosition(p => {
        const { latitude: la, longitude: lo, accuracy } = p.coords;
        if (!mapa) return;
        mapa.setView([la, lo], 17);
        if (estado.no_local) marcar(la, lo, Math.round(accuracy));
        $gps.textContent = `Localização encontrada (precisão de ~${Math.round(accuracy)} m).`;
      }, err => {
        $gps.textContent = err.code === 1
          ? 'Permissão de localização negada. Toque no mapa onde está o fogo.'
          : 'Não foi possível obter a localização. Toque no mapa onde está o fogo.';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    };
    document.getElementById('btnGps').onclick = pegarGps;
    $app.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => {
      estado.no_local = b.dataset.modo === 'aqui';
      $app.querySelectorAll('[data-modo]').forEach(x => x.classList.toggle('sel', x === b));
      setInstr();
      if (estado.no_local) pegarGps();
    });
    document.getElementById('ref').oninput = e => estado.referencia = e.target.value;
    if (!estado.local) pegarGps();
  }

  function telaDados() {
    $app.innerHTML = `
      <section class="tela">
        <h1>Seus dados para contato</h1>
        <p class="ajuda">A equipe pode ligar para confirmar o local.</p>
        <label class="campo" for="nome">Nome</label>
        <input class="campo-in" id="nome" autocomplete="name" maxlength="120" value="${U.esc(estado.nome)}">
        <label class="campo" for="tel">Telefone com DDD</label>
        <input class="campo-in" id="tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="(31) 99999-9999" value="${U.esc(U.formatarTelefone(estado.telefone))}">
        <label class="campo" for="obs">Quer contar mais alguma coisa? (opcional)</label>
        <textarea class="campo-in" id="obs" maxlength="1000" placeholder="Ex.: o fogo está descendo o morro em direção ao bairro">${U.esc(estado.observacao)}</textarea>
        <label class="check"><input type="checkbox" id="lgpd" ${estado.consentimento ? 'checked' : ''}>
          <span>Autorizo o Corpo de Bombeiros Militar de Minas Gerais a usar meu nome, telefone, localização e as mídias enviadas exclusivamente para o atendimento desta ocorrência (LGPD).</span></label>
        <div class="erro" id="erroDados"></div>
        <div class="aviso"><span>ℹ️</span><div>Trotes atrapalham o atendimento de emergências reais e podem ser crime (art. 340 do Código Penal).</div></div>
      </section>`;
    document.getElementById('nome').oninput = e => { estado.nome = e.target.value; document.getElementById('erroDados').textContent = ''; };
    const tel = document.getElementById('tel');
    tel.oninput = () => { estado.telefone = U.soDigitos(tel.value); tel.value = U.formatarTelefone(tel.value); };
    document.getElementById('obs').oninput = e => estado.observacao = e.target.value;
    document.getElementById('lgpd').onchange = e => estado.consentimento = e.target.checked;
  }

  // ---------------------------------------------------------- envio
  async function enviar() {
    $nav.classList.add('oculto');
    $barra.style.width = '100%';
    const passo = txt => $app.innerHTML = `<div class="enviando"><div class="spinner"></div><h2>Enviando alerta…</h2><p class="ajuda">${txt}</p></div>`;
    passo('Preparando');

    const pasta = U.uuid();
    const midias = [];
    let falhasMidia = 0;
    for (let i = 0; i < estado.midias.length; i++) {
      const m = estado.midias[i];
      passo(`Enviando ${m.tipo === 'video' ? 'vídeo' : 'foto'} ${i + 1} de ${estado.midias.length}…`);
      try { midias.push(await API.enviarMidia(m.blob, m.nome, pasta)); }
      catch (e) { falhasMidia++; console.warn(e); }
    }

    passo('Registrando ocorrência…');
    const { classe, motivos } = classificar(estado.respostas);
    const unidades = await unidadesPromise.then(u => u.length ? u : API.unidades()).catch(() => []);
    const unidade = U.unidadeMaisProxima(estado.local, unidades);

    const payload = {
      nome: estado.nome.trim(), telefone: U.soDigitos(estado.telefone),
      lat: estado.local.lat, lng: estado.local.lng, precisao_m: estado.local.precisao_m,
      no_local: estado.no_local, referencia: estado.referencia.trim(), observacao: estado.observacao.trim(),
      respostas: estado.respostas, classificacao: classe, motivos, midias,
      unidade_proxima: unidade && { id: unidade.id, nome: unidade.nome, endereco: unidade.endereco,
        telefone: unidade.telefone, lat: unidade.lat, lng: unidade.lng, distancia_km: unidade.distancia_km },
      user_agent: navigator.userAgent,
    };

    try {
      const r = await API.registrar(payload);
      try { localStorage.setItem('af_solicitante', JSON.stringify({ nome: payload.nome, telefone: payload.telefone })); } catch {}
      telaResultado(r, unidade, falhasMidia);
    } catch (e) {
      $app.innerHTML = `
        <section class="tela">
          <div class="aviso verm"><span>❌</span><div><b>Não foi possível enviar.</b>${U.esc(e.message)}</div></div>
          <a class="btn" href="tel:193">📞 Ligar 193 agora</a>
          <div style="height:10px"></div>
          <button class="btn sec" id="tentar">Tentar de novo</button>
        </section>`;
      document.getElementById('tentar').onclick = enviar;
    }
  }

  function telaResultado(r, u, falhasMidia) {
    $app.innerHTML = `
      <section class="tela">
        <div class="ok-ico">✓</div>
        <h1 style="text-align:center">Alerta enviado</h1>
        <p class="ajuda" style="text-align:center">Protocolo</p>
        <div class="protocolo">${U.esc(r.protocolo)}</div>
        <p class="ajuda" style="text-align:center">A equipe do Corpo de Bombeiros vai avaliar seu alerta e pode ligar para você.</p>
        ${falhasMidia ? `<div class="aviso"><span>⚠️</span><div>${falhasMidia} arquivo(s) não foram enviados, mas o alerta foi registrado.</div></div>` : ''}
        ${u ? `
        <div class="cartao unidade">
          <p class="ajuda" style="margin:0 0 6px">Unidade do Corpo de Bombeiros mais próxima do incêndio</p>
          <h3>${U.esc(u.nome)}</h3>
          ${u.endereco ? `<div class="ajuda" style="margin:0">${U.esc(u.endereco)}</div>` : ''}
          <div class="dist">${String(u.distancia_km).replace('.', ',')} km</div>
          <div class="ajuda" style="margin:0">em linha reta até o local do fogo</div>
          <div class="mapa" id="mapaRes" style="height:220px"></div>
          <div class="linha-btn">
            <a class="btn sec pq" href="${U.linkRota(u.lat, u.lng)}" target="_blank" rel="noopener">🧭 Como chegar</a>
            <a class="btn sec pq" href="tel:${U.esc(U.soDigitos(u.telefone) || '193')}">📞 Ligar</a>
          </div>
        </div>` : `<div class="aviso"><span>📞</span><div>Não conseguimos carregar as unidades agora. Em caso de emergência, ligue 193.</div></div>`}
        <div class="cartao">
          <b>Enquanto a equipe não chega</b>
          <ul class="dicas">
            <li>Mantenha distância e fique fora da direção da fumaça.</li>
            <li>Afaste pessoas e animais do caminho do fogo.</li>
            <li>Se o fogo chegar perto de casas ou houver feridos, ligue 193.</li>
            <li>Se puder, espere em local seguro para orientar a viatura.</li>
          </ul>
        </div>
        <button class="btn sec" id="novo">Fazer novo alerta</button>
      </section>`;
    document.getElementById('novo').onclick = () => location.reload();
    if (u) {
      const m = L.map('mapaRes', { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      const fogo = [estado.local.lat, estado.local.lng], bm = [u.lat, u.lng];
      L.marker(fogo, { icon: L.divIcon({ className: '', html: '<div style="font-size:28px;transform:translate(-50%,-90%)">🔥</div>', iconSize: [0, 0] }) }).addTo(m);
      L.marker(bm, { icon: L.divIcon({ className: '', html: '<div style="font-size:26px;transform:translate(-50%,-90%)">🚒</div>', iconSize: [0, 0] }) }).addTo(m);
      L.polyline([fogo, bm], { color: '#C62828', dashArray: '6 6', weight: 3 }).addTo(m);
      m.fitBounds([fogo, bm], { padding: [30, 30], maxZoom: 15 });
    }
  }

  render();
})();
