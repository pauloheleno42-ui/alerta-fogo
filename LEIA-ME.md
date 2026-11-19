# Alerta Fogo — comunicação de incêndio em vegetação (CBMMG)

App web instalável no celular (PWA). Tem duas partes:

| Página | Quem usa | O que faz |
|---|---|---|
| `index.html` | População | Envia fotos e vídeos, responde às perguntas com figuras, marca o local (GPS ou toque no mapa) e recebe o protocolo e a unidade mais próxima |
| `painel.html#k=CHAVE` | Bombeiro administrador | Vê as ocorrências por gravidade, no mapa, com mídia, respostas, motivos da classificação e contato. Também muda o status e cadastra unidades |

---

## 1. Testar agora (modo demonstração)

Com `SUPABASE_URL` vazio em `js/config.js`, tudo fica salvo só no navegador.

1. Abra um terminal na pasta e rode `python -m http.server 8000`.
2. Abra `http://localhost:8000` (solicitante) e, em outra aba, `http://localhost:8000/painel.html`.
3. Envie um alerta e veja ele aparecer no painel.

> Abrindo o arquivo com dois cliques (`file://`), o GPS e o service worker não funcionam. Use o servidor do passo 1.

---

## 2. Colocar em produção

### 2.1 Banco de dados (Supabase, gratuito)
1. Crie uma conta em https://supabase.com e um projeto novo, com a região **South America (São Paulo)**.
2. Vá em **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Abra uma query nova, cole `supabase/gerar_chave_painel.sql` e clique em **Run**. **Copie a chave que aparecer**, porque ela só é mostrada essa vez.
4. Em **Project Settings → API**, copie o **Project URL** e a **anon public key**.

### 2.2 Configurar o app
Edite `js/config.js`:
```js
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJ...',
```

### 2.3 Hospedar o site (precisa de HTTPS por causa do GPS e da câmera)
O jeito mais rápido é o **Netlify Drop**: abra https://app.netlify.com/drop e arraste a pasta `alerta-fogo` inteira. Ele já gera um endereço com HTTPS. GitHub Pages ou Cloudflare Pages também funcionam.

### 2.4 Links
- População: `https://SEU-SITE/`
- Painel: `https://SEU-SITE/painel.html#k=CHAVE_DO_PASSO_3`

Para trocar a chave (por exemplo, se o link vazar), rode `gerar_chave_painel.sql` de novo. A chave antiga para de funcionar na hora.

### 2.5 Primeiro acesso ao painel
Na aba **Unidades**, **confira a coordenada do PA João Monlevade**: ela foi cadastrada no centro da cidade. Clique em *Editar*, clique no mapa em cima do quartel e salve. As próximas unidades se cadastram do mesmo jeito.

---

## 3. Classificação de gravidade

Fica em `js/classificacao.js`: é o único arquivo que você precisa mexer para mudar as perguntas ou os critérios.

| Exposição \ Potencial | **Baixo** (combustível limitado pela área e chama baixa) | **Alto** (combustível ilimitado, fogo de copa, área grande ou propagação rápida) |
|---|---|---|
| Só dano ambiental | 🟢 NÃO URGENTE | 🟠 URGENTE |
| Risco a pessoas/bens (casas a menos de 50 m, pessoas ameaçadas, rede elétrica, rodovia, inflamáveis, escola/hospital) | 🟠 URGENTE | 🔴 CRÍTICO |
| Vítimas, ou fogo já na edificação | 🔴 CRÍTICO | 🔴 CRÍTICO |

- Quando o solicitante marca "Não sei" no tipo de área, o app considera combustível ilimitado (lado conservador).
- O solicitante **não** vê a classificação, só o painel. O administrador pode corrigir a classificação na mão, e o painel mostra a original ao lado.

---

## 4. Segurança e LGPD (o que já está feito)
- O público só consegue **criar** ocorrências e ler a lista de unidades. Ninguém lê ocorrências sem a chave do painel, porque o RLS bloqueia e a checagem acontece dentro do banco.
- O banco guarda só o hash da chave, nunca a chave em si.
- Fotos e vídeos vão para nomes aleatórios, a listagem é bloqueada e cada arquivo tem no máximo 50 MB (só imagem ou vídeo).
- Antes de enviar, o solicitante marca o consentimento de uso dos dados (LGPD).
- Anti-abuso: no máximo 5 envios por telefone por hora.
- O painel não é indexado em buscadores (`noindex`).

## 5. Limitações conhecidas
- A "unidade mais próxima" é calculada em **linha reta**, não pela estrada.
- O mapa usa os servidores gratuitos do OpenStreetMap. Para uso pesado, troque por um provedor com chave (MapTiler, por exemplo). A troca é em uma linha em `solicitante.js` e `painel.js`.
- O painel avisa ocorrências novas por consulta a cada 15 s, com bip e notificação. É preciso clicar em **🔔 Ativar alertas** uma vez, porque o navegador só libera som depois de um clique.
- O plano gratuito do Supabase pausa o projeto após 7 dias sem nenhum acesso. Com o app em uso isso não acontece, mas vale lembrar na fase de testes.
- Para virar um serviço oficial do CBMMG, precisa de aprovação institucional (comando e setor de TI/LGPD).

## Estrutura
```
index.html, painel.html, manifest.webmanifest, sw.js
css/      app.css, painel.css
js/       config.js (CONFIGURAR), classificacao.js (CRITÉRIOS), api.js, util.js, solicitante.js, painel.js
img/      ilustrações das perguntas (SVG) e ícones
lib/      Leaflet 1.9.4 e supabase-js 2 (embutidos, sem depender de CDN)
supabase/ schema.sql, gerar_chave_painel.sql
```
