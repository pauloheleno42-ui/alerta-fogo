-- =====================================================================
--  ALERTA FOGO — Banco de dados (Supabase / PostgreSQL)
--  Rode este arquivo INTEIRO no Supabase: SQL Editor > New query > Run.
--  Pode rodar de novo sem perder dados (é idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.unidades (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  endereco    text,
  telefone    text,
  lat         double precision not null,
  lng         double precision not null,
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create sequence if not exists public.ocorrencias_seq;

create table if not exists public.ocorrencias (
  id                    uuid primary key default gen_random_uuid(),
  protocolo             text unique not null
                        default ('IF' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD')
                                 || '-' || lpad(nextval('public.ocorrencias_seq')::text, 5, '0')),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  -- solicitante
  nome                  text not null,
  telefone              text not null,
  -- local
  lat                   double precision not null,
  lng                   double precision not null,
  precisao_m            double precision,
  no_local              boolean,               -- solicitante está no local do fogo?
  referencia            text,                  -- ponto de referência digitado
  -- triagem
  respostas             jsonb not null default '{}'::jsonb,
  observacao            text,                  -- texto livre do solicitante
  classificacao         text not null check (classificacao in ('CRITICO','URGENTE','NAO_URGENTE')),
  motivos               text[] not null default '{}',
  classificacao_manual  text check (classificacao_manual in ('CRITICO','URGENTE','NAO_URGENTE')),
  -- mídia e unidade
  midias                jsonb not null default '[]'::jsonb,   -- [{url, tipo, nome}]
  unidade_proxima       jsonb,                               -- {id, nome, distancia_km, ...}
  -- gestão
  status                text not null default 'NOVA'
                        check (status in ('NOVA','EM_ATENDIMENTO','ENCERRADA','IMPROCEDENTE')),
  obs_admin             text,
  user_agent            text
);

-- RG opcional do solicitante (adicionado depois; seguro rodar de novo)
alter table public.ocorrencias add column if not exists rg text;

create index if not exists ocorrencias_criado_idx on public.ocorrencias (criado_em desc);
create index if not exists ocorrencias_tel_idx    on public.ocorrencias (telefone, criado_em desc);

create table if not exists public.config (
  chave text primary key,
  valor text not null
);

-- ---------------------------------------------------------------------
-- Segurança: RLS ligado em tudo. Sem política = ninguém de fora acessa.
-- O público só LÊ unidades ativas. Todo o resto passa pelas funções abaixo.
-- ---------------------------------------------------------------------
alter table public.unidades    enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.config      enable row level security;

drop policy if exists "publico le unidades ativas" on public.unidades;
create policy "publico le unidades ativas" on public.unidades
  for select to anon, authenticated using (ativa);

-- ---------------------------------------------------------------------
-- Chave do painel (o "link separado"): guardamos só o hash SHA-256.
-- ---------------------------------------------------------------------
create or replace function public._chave_ok(p_chave text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select valor = encode(extensions.digest(coalesce(p_chave,''), 'sha256'), 'hex')
       from public.config where chave = 'chave_admin_hash'),
    false);
$$;
revoke all on function public._chave_ok(text) from public, anon, authenticated;

create or replace function public._exige_chave(p_chave text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public._chave_ok(p_chave) then
    raise exception 'Chave do painel inválida' using errcode = '28000';
  end if;
end $$;
revoke all on function public._exige_chave(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Solicitante: registra ocorrência (retorna protocolo)
-- ---------------------------------------------------------------------
create or replace function public.registrar_ocorrencia(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tel   text := regexp_replace(coalesce(p->>'telefone',''), '\D', '', 'g');
  v_nome  text := left(trim(coalesce(p->>'nome','')), 120);
  v_lat   double precision := (p->>'lat')::double precision;
  v_lng   double precision := (p->>'lng')::double precision;
  v_class text := p->>'classificacao';
  v_row   public.ocorrencias;
begin
  if length(v_nome) < 2 then raise exception 'Informe o nome'; end if;
  if length(v_tel) < 10 or length(v_tel) > 13 then raise exception 'Telefone inválido'; end if;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'Localização inválida';
  end if;
  if v_class not in ('CRITICO','URGENTE','NAO_URGENTE') then raise exception 'Classificação inválida'; end if;

  -- anti-abuso simples: no máx. 5 envios por telefone por hora
  if (select count(*) from public.ocorrencias
       where telefone = v_tel and criado_em > now() - interval '1 hour') >= 5 then
    raise exception 'Muitos envios deste telefone. Em emergência, ligue 193.';
  end if;

  insert into public.ocorrencias
    (nome, telefone, rg, lat, lng, precisao_m, no_local, referencia, respostas, observacao,
     classificacao, motivos, midias, unidade_proxima, user_agent)
  values
    (v_nome, v_tel, nullif(left(upper(trim(coalesce(p->>'rg',''))), 20), ''), v_lat, v_lng,
     nullif(p->>'precisao_m','')::double precision,
     nullif(p->>'no_local','')::boolean,
     left(p->>'referencia', 300),
     coalesce(p->'respostas', '{}'::jsonb),
     left(p->>'observacao', 1000),
     v_class,
     coalesce(array(select jsonb_array_elements_text(p->'motivos')), '{}'),
     coalesce(p->'midias', '[]'::jsonb),
     p->'unidade_proxima',
     left(p->>'user_agent', 300))
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'protocolo', v_row.protocolo, 'criado_em', v_row.criado_em);
end $$;
revoke all on function public.registrar_ocorrencia(jsonb) from public;
grant execute on function public.registrar_ocorrencia(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Painel do administrador (todas exigem a chave)
-- ---------------------------------------------------------------------
create or replace function public.admin_listar(p_chave text, p_dias int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._exige_chave(p_chave);
  return coalesce((
    select jsonb_agg(to_jsonb(o) - 'user_agent' order by o.criado_em desc)
      from public.ocorrencias o
     where o.criado_em > now() - make_interval(days => greatest(p_dias, 1))
        or o.status in ('NOVA','EM_ATENDIMENTO')
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_atualizar(
  p_chave text, p_id uuid, p_status text, p_classificacao_manual text, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exige_chave(p_chave);
  update public.ocorrencias
     set status = coalesce(p_status, status),
         classificacao_manual = nullif(p_classificacao_manual, ''),
         obs_admin = p_obs,
         atualizado_em = now()
   where id = p_id;
end $$;

create or replace function public.admin_unidades(p_chave text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._exige_chave(p_chave);
  return coalesce((select jsonb_agg(to_jsonb(u) order by u.nome) from public.unidades u), '[]'::jsonb);
end $$;

create or replace function public.admin_salvar_unidade(p_chave text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id','')::uuid;
begin
  perform public._exige_chave(p_chave);
  if v_id is null then
    insert into public.unidades (nome, endereco, telefone, lat, lng, ativa)
    values (p->>'nome', p->>'endereco', p->>'telefone', (p->>'lat')::float8, (p->>'lng')::float8,
            coalesce((p->>'ativa')::boolean, true))
    returning id into v_id;
  else
    update public.unidades set nome = p->>'nome', endereco = p->>'endereco', telefone = p->>'telefone',
           lat = (p->>'lat')::float8, lng = (p->>'lng')::float8, ativa = coalesce((p->>'ativa')::boolean, true)
     where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_remover_unidade(p_chave text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exige_chave(p_chave);
  delete from public.unidades where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Funções que ficam disponíveis para o app (anon). As de admin conferem a chave por dentro.
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_listar(text,int)',
    'public.admin_atualizar(text,uuid,text,text,text)',
    'public.admin_unidades(text)',
    'public.admin_salvar_unidade(text,jsonb)',
    'public.admin_remover_unidade(text,uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Armazenamento de fotos/vídeos: bucket "midias"
--  * público para LEITURA por link (os nomes são aleatórios e só o painel os conhece)
--  * listagem bloqueada (não há política de SELECT)
--  * envio liberado só para imagem/vídeo, até 50 MB por arquivo
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midias', 'midias', true, 52428800, array['image/*','video/*'])
on conflict (id) do update
  set public = true, file_size_limit = 52428800, allowed_mime_types = array['image/*','video/*'];

drop policy if exists "solicitante envia midias" on storage.objects;
create policy "solicitante envia midias" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'midias');

-- ---------------------------------------------------------------------
-- Unidade inicial (CONFIRA a coordenada e o endereço no painel > Unidades)
-- ---------------------------------------------------------------------
insert into public.unidades (nome, endereco, telefone, lat, lng)
select 'PA João Monlevade — 11º BBM/1ª Cia/6º Pel', 'João Monlevade/MG (conferir endereço)', '193',
       -19.8109, -43.1737
where not exists (select 1 from public.unidades);
