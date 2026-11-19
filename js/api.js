// =====================================================================
//  Camada de dados: Supabase (produção) ou navegador (modo demonstração)
// =====================================================================
window.API = (() => {
  const C = window.APP_CONFIG;
  const DEMO = !C.SUPABASE_URL;

  function traduzErro(e) {
    const msg = (e && (e.message || e.error_description || e.error)) || String(e);
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com a internet. Tente de novo ou ligue 193.';
    if (/Payload too large|exceeded the maximum/i.test(msg)) return 'Arquivo grande demais (máx. 50 MB).';
    return msg;
  }

  // ------------------------------------------------------------ SUPABASE
  function supabaseImpl() {
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const rpc = async (fn, args) => {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(traduzErro(error));
      return data;
    };
    return {
      demo: false,
      async unidades() {
        const { data, error } = await sb.from('unidades').select('*').eq('ativa', true);
        if (error) throw new Error(traduzErro(error));
        return data;
      },
      async enviarMidia(blob, nomeOriginal, pasta) {
        const tipo = (blob.type || '').startsWith('video') ? 'video' : 'imagem';
        const ext = tipo === 'imagem' ? 'jpg' : ((nomeOriginal.split('.').pop() || 'mp4').toLowerCase().slice(0, 5));
        const caminho = `${pasta}/${U.uuid()}.${ext}`;
        const { error } = await sb.storage.from('midias').upload(caminho, blob, {
          contentType: blob.type || (tipo === 'video' ? 'video/mp4' : 'image/jpeg'), upsert: false,
        });
        if (error) throw new Error(traduzErro(error));
        const { data } = sb.storage.from('midias').getPublicUrl(caminho);
        return { url: data.publicUrl, tipo, nome: nomeOriginal };
      },
      registrar: p => rpc('registrar_ocorrencia', { p }),
      adminListar: (chave, dias = 30) => rpc('admin_listar', { p_chave: chave, p_dias: dias }),
      adminAtualizar: (chave, id, status, classe, obs) =>
        rpc('admin_atualizar', { p_chave: chave, p_id: id, p_status: status, p_classificacao_manual: classe || '', p_obs: obs || '' }),
      adminUnidades: chave => rpc('admin_unidades', { p_chave: chave }),
      adminSalvarUnidade: (chave, u) => rpc('admin_salvar_unidade', { p_chave: chave, p: u }),
      adminRemoverUnidade: (chave, id) => rpc('admin_remover_unidade', { p_chave: chave, p_id: id }),
    };
  }

  // ------------------------------------------------------------ DEMO
  function demoImpl() {
    const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
    const gravar = (k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch { throw new Error('Armazenamento do navegador cheio (modo demonstração). Limpe as ocorrências de teste no painel.'); }
    };
    if (!ler('af_unidades', null)) {
      gravar('af_unidades', [{ id: U.uuid(), nome: 'PA João Monlevade — 11º BBM/1ª Cia/6º Pel',
        endereco: 'João Monlevade/MG (conferir endereço)', telefone: '193',
        lat: C.MAPA_CENTRO[0], lng: C.MAPA_CENTRO[1], ativa: true }]);
    }
    const espera = (ms = 250) => new Promise(r => setTimeout(r, ms));
    return {
      demo: true,
      async unidades() { await espera(); return ler('af_unidades', []).filter(u => u.ativa); },
      async enviarMidia(blob, nomeOriginal) {
        await espera(150);
        const tipo = (blob.type || '').startsWith('video') ? 'video' : 'imagem';
        if (tipo === 'video') return { url: null, tipo, nome: nomeOriginal, demo: true };
        const menor = await U.comprimirImagem(blob, 1280, 0.72);  // reduzida para caber no navegador
        return { url: await U.blobParaDataURL(menor), tipo, nome: nomeOriginal };
      },
      async registrar(p) {
        await espera(400);
        const lista = ler('af_ocorrencias', []);
        const seq = (ler('af_seq', 0) + 1); gravar('af_seq', seq);
        const d = new Date();
        const protocolo = `IF${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(seq).padStart(5, '0')}`;
        const o = { ...p, id: U.uuid(), protocolo, criado_em: d.toISOString(), atualizado_em: d.toISOString(),
                    telefone: U.soDigitos(p.telefone), status: 'NOVA', classificacao_manual: null, obs_admin: null };
        delete o.user_agent;
        lista.push(o); gravar('af_ocorrencias', lista);
        return { id: o.id, protocolo, criado_em: o.criado_em };
      },
      async adminListar() { await espera(100); return ler('af_ocorrencias', []).slice().reverse(); },
      async adminAtualizar(_c, id, status, classe, obs) {
        const lista = ler('af_ocorrencias', []);
        const o = lista.find(x => x.id === id);
        if (o) Object.assign(o, { status, classificacao_manual: classe || null, obs_admin: obs || null, atualizado_em: new Date().toISOString() });
        gravar('af_ocorrencias', lista);
      },
      async adminUnidades() { return ler('af_unidades', []); },
      async adminSalvarUnidade(_c, u) {
        const lista = ler('af_unidades', []);
        if (u.id) Object.assign(lista.find(x => x.id === u.id) || {}, u);
        else lista.push({ ...u, id: U.uuid() });
        gravar('af_unidades', lista);
      },
      async adminRemoverUnidade(_c, id) { gravar('af_unidades', ler('af_unidades', []).filter(u => u.id !== id)); },
      limparDemo() { localStorage.removeItem('af_ocorrencias'); localStorage.removeItem('af_seq'); },
    };
  }

  return DEMO ? demoImpl() : supabaseImpl();
})();
