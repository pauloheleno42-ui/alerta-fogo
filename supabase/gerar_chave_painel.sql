-- =====================================================================
--  Gera a CHAVE do painel do administrador.
--  Rode no SQL Editor DEPOIS do schema.sql. O resultado mostra a chave UMA vez:
--  copie e monte o link:  https://SEU-SITE/painel.html#k=CHAVE_AQUI
--  Rodar de novo gera uma chave nova e INVALIDA a anterior (use se o link vazar).
-- =====================================================================
with k as (
  select encode(extensions.gen_random_bytes(24), 'hex') as chave
), grava as (
  insert into public.config (chave, valor)
  select 'chave_admin_hash', encode(extensions.digest(chave, 'sha256'), 'hex') from k
  on conflict (chave) do update set valor = excluded.valor
  returning 1
)
select k.chave as "COPIE ESTA CHAVE (só aparece agora)" from k, grava;
