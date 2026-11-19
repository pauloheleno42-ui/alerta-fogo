// =====================================================================
//  CONFIGURAÇÃO — preencha com os dados do seu projeto Supabase
//  (Supabase > Project Settings > API: "Project URL" e "anon public key")
//
//  Se SUPABASE_URL ficar vazio, o app roda em MODO DEMONSTRAÇÃO:
//  tudo fica salvo só no navegador, bom para testar e apresentar.
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  NOME_APP: 'Alerta Fogo',
  ORGAO: 'CBMMG — 11º BBM / 1ª Cia / 6º Pel — PA João Monlevade',

  // Centro inicial do mapa quando o GPS não estiver disponível
  MAPA_CENTRO: [-19.8109, -43.1737],
  MAPA_ZOOM: 14,

  // Painel: de quantos em quantos segundos busca ocorrências novas
  PAINEL_ATUALIZA_SEG: 15,

  // Limites de mídia
  MAX_ARQUIVOS: 5,
  MAX_VIDEO_MB: 50,
};
