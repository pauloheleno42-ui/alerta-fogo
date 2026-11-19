// =====================================================================
//  PERGUNTAS + CLASSIFICAÇÃO DE GRAVIDADE
//  Este é o arquivo para ajustar critérios. Tudo que o app pergunta e
//  como ele classifica está aqui.
//
//  Lógica (critérios do 6º Pel):
//   EXPOSIÇÃO  -> o dano é só AMBIENTAL, já é RISCO A PESSOAS/BENS, ou há VÍTIMAS
//   POTENCIAL  -> ALTO se o combustível é ilimitado (pasto aberto / mata contínua),
//                 se o fogo atinge a copa (acima de 1,80 m), se a área é grande
//                 ou se o fogo avança rápido. BAIXO se o combustível é limitado
//                 pela área (lote cercado) e a chama é baixa.
//
//   Vítimas ...................................... CRÍTICO
//   Fogo atingindo edificação .................... CRÍTICO
//   Risco a pessoas/bens + potencial ALTO ........ CRÍTICO
//   Risco a pessoas/bens + potencial BAIXO ....... URGENTE
//   Só ambiental + potencial ALTO ................ URGENTE
//   Só ambiental + potencial BAIXO ............... NÃO URGENTE
// =====================================================================

window.PERGUNTAS = [
  {
    id: 'altura', tipo: 'imagem', obrigatoria: true,
    titulo: 'Qual a altura das chamas?',
    ajuda: 'Compare com a pessoa do desenho (1,80 m).',
    opcoes: [
      { v: 'rasteiro', t: 'Rasteiro', d: 'Fogo baixo, no capim', img: 'img/altura-rasteiro.svg' },
      { v: 'arbusto',  t: 'Até 1,80 m', d: 'Na altura de uma pessoa', img: 'img/altura-arbusto.svg' },
      { v: 'copa',     t: 'Na copa das árvores', d: 'Acima de 1,80 m', img: 'img/altura-copa.svg' },
    ],
  },
  {
    id: 'area', tipo: 'imagem', obrigatoria: true,
    titulo: 'Onde está queimando?',
    ajuda: 'Escolha o que mais parece com o local.',
    opcoes: [
      { v: 'lote',  t: 'Lote vago na cidade', d: 'Cercado por ruas e casas', img: 'img/area-lote.svg' },
      { v: 'pasto', t: 'Pasto ou campo aberto', d: 'Vegetação sem fim à vista', img: 'img/area-pasto.svg' },
      { v: 'mata',  t: 'Mata ou reflorestamento', d: 'Muitas árvores juntas', img: 'img/area-mata.svg' },
    ],
    extra: { v: 'nao_sei', t: 'Não sei dizer' },
  },
  {
    id: 'casas', tipo: 'imagem', obrigatoria: true,
    titulo: 'Tem casas ou construções perto do fogo?',
    opcoes: [
      { v: 'nao',       t: 'Não tem', img: 'img/casas-nao.svg' },
      { v: 'longe',     t: 'Sim, a mais de 50 m', d: 'Meio quarteirão ou mais', img: 'img/casas-longe.svg' },
      { v: 'perto',     t: 'Sim, a menos de 50 m', img: 'img/casas-perto.svg' },
      { v: 'atingindo', t: 'O fogo já está na construção', img: 'img/casas-atingindo.svg' },
    ],
  },
  {
    id: 'pessoas', tipo: 'botoes', obrigatoria: true,
    titulo: 'Tem pessoas em perigo?',
    opcoes: [
      { v: 'nao',       t: 'Não' },
      { v: 'ameacadas', t: 'Sim, pessoas ou animais ameaçados pelo fogo' },
      { v: 'feridas',   t: 'Sim, há feridos ou pessoas presas', alerta: true },
    ],
  },
  {
    id: 'riscos', tipo: 'multi', obrigatoria: false,
    titulo: 'Tem algo destes perto do fogo?',
    ajuda: 'Pode marcar mais de um.',
    opcoes: [
      { v: 'rede_eletrica', t: 'Poste ou rede elétrica' },
      { v: 'rodovia',       t: 'Rodovia / fumaça na pista' },
      { v: 'inflamaveis',   t: 'Posto, gás ou produto inflamável' },
      { v: 'escola_hosp',   t: 'Escola, creche, hospital ou asilo' },
    ],
  },
  {
    id: 'tamanho', tipo: 'botoes', obrigatoria: true,
    titulo: 'Qual o tamanho da área queimando?',
    opcoes: [
      { v: 'pequeno', t: 'Pequena — até o tamanho de um lote' },
      { v: 'medio',   t: 'Média — até um campo de futebol' },
      { v: 'grande',  t: 'Grande — maior que um campo de futebol' },
    ],
  },
  {
    id: 'avanco', tipo: 'botoes', obrigatoria: true,
    titulo: 'O fogo está se espalhando?',
    opcoes: [
      { v: 'parado',  t: 'Parece parado ou diminuindo' },
      { v: 'devagar', t: 'Está aumentando devagar' },
      { v: 'rapido',  t: 'Está se espalhando rápido' },
    ],
  },
];

window.CLASSES = {
  CRITICO:     { rotulo: 'CRÍTICO',     cor: '#C62828', ordem: 0 },
  URGENTE:     { rotulo: 'URGENTE',     cor: '#EF6C00', ordem: 1 },
  NAO_URGENTE: { rotulo: 'NÃO URGENTE', cor: '#2E7D32', ordem: 2 },
};

window.classificar = function classificar(r) {
  r = r || {};
  const riscos = r.riscos || [];
  const motivos = [];

  // ---- exposição ----
  const vitimas = r.pessoas === 'feridas';
  const atingindoEdif = r.casas === 'atingindo';
  const riscoPessoas =
    atingindoEdif || r.casas === 'perto' || r.pessoas === 'ameacadas' ||
    riscos.some(x => ['rede_eletrica', 'rodovia', 'inflamaveis', 'escola_hosp'].includes(x));

  if (vitimas) motivos.push('Há vítimas (feridos ou pessoas presas)');
  if (atingindoEdif) motivos.push('Fogo atingindo edificação');
  else if (r.casas === 'perto') motivos.push('Edificações a menos de 50 m');
  if (r.pessoas === 'ameacadas') motivos.push('Pessoas/animais ameaçados');
  const nomesRisco = { rede_eletrica: 'Rede elétrica próxima', rodovia: 'Rodovia/fumaça na pista',
    inflamaveis: 'Inflamáveis próximos (posto/gás)', escola_hosp: 'Escola/hospital/asilo próximo' };
  riscos.forEach(x => nomesRisco[x] && motivos.push(nomesRisco[x]));

  // ---- potencial de dano ----
  const combIlimitado = ['pasto', 'mata', 'nao_sei'].includes(r.area);
  const copa = r.altura === 'copa';
  const potencialAlto = combIlimitado || copa || r.tamanho === 'grande' || r.avanco === 'rapido';

  if (r.area === 'pasto' || r.area === 'mata') motivos.push('Combustível ilimitado (vegetação contínua)');
  if (r.area === 'nao_sei') motivos.push('Área não identificada — tratada como combustível ilimitado');
  if (r.area === 'lote') motivos.push('Combustível limitado pela área (lote cercado)');
  if (copa) motivos.push('Fogo de copa (acima de 1,80 m)');
  if (r.tamanho === 'grande') motivos.push('Área grande (maior que um campo de futebol)');
  if (r.avanco === 'rapido') motivos.push('Propagação rápida');

  let classe;
  if (vitimas || atingindoEdif) classe = 'CRITICO';
  else if (riscoPessoas) classe = potencialAlto ? 'CRITICO' : 'URGENTE';
  else classe = potencialAlto ? 'URGENTE' : 'NAO_URGENTE';

  if (!riscoPessoas && !vitimas) motivos.unshift('Dano apenas ambiental');

  return { classe, motivos, exposicao: vitimas ? 'VITIMAS' : riscoPessoas ? 'PESSOAS' : 'AMBIENTAL',
           potencial: potencialAlto ? 'ALTO' : 'BAIXO' };
};

// Texto legível de uma resposta (usado no painel)
window.rotuloResposta = function (perguntaId, valor) {
  const p = window.PERGUNTAS.find(q => q.id === perguntaId);
  if (!p) return String(valor);
  const achar = v => (p.opcoes.find(o => o.v === v) || (p.extra && p.extra.v === v && p.extra) || { t: v }).t;
  if (Array.isArray(valor)) return valor.length ? valor.map(achar).join(', ') : 'Nenhum';
  return valor == null || valor === '' ? '—' : achar(valor);
};
