-- Musée : schéma Supabase, dans le projet partagé de l'écosystème.
--
-- À coller une fois dans l'éditeur SQL. Rejouable sans risque : tout est
-- « if not exists » ou « create or replace ». Aucune table existante n'est
-- touchée, le registre d'Éclats non plus (Musée passe par ses RPC).
--
-- Volume, le quota de 500 Mo étant commun : un document d'état par joueur
-- (quelques centaines de Ko au plus), des sessions purgées après 30 jours,
-- et le catalogue réduit à cinq petites colonnes par œuvre.

create extension if not exists pg_cron;
create extension if not exists pg_net;

/* ------------------------------------------------------------------ */
/* État du joueur                                                      */
/* ------------------------------------------------------------------ */

create table if not exists public.musee_etats (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  etat       jsonb not null,
  version    bigint not null default 1,
  jour_ferme integer not null default 0,
  maj        timestamptz not null default now()
);
alter table public.musee_etats enable row level security;
drop policy if exists musee_etats_lecture on public.musee_etats;
create policy musee_etats_lecture on public.musee_etats
  for select to authenticated using (user_id = auth.uid());

-- Écriture conditionnée à la version lue : deux écritures concurrentes
-- (l'application et l'Edge Function de 4 h) ne s'écrasent jamais.
create or replace function public.musee_enregistrer(p_etat jsonb, p_version bigint)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_version bigint;
begin
  if v_user is null then raise exception 'Non authentifié'; end if;
  if pg_column_size(p_etat) > 3000000 then raise exception 'État trop volumineux'; end if;
  if p_version = 0 then
    insert into musee_etats (user_id, etat, version, jour_ferme)
    values (v_user, p_etat, 1, coalesce((p_etat->>'jourFerme')::integer, 0))
    on conflict (user_id) do nothing
    returning version into v_version;
  else
    update musee_etats
       set etat = p_etat, version = version + 1, maj = now(),
           jour_ferme = coalesce((p_etat->>'jourFerme')::integer, jour_ferme)
     where user_id = v_user and version = p_version
    returning version into v_version;
  end if;
  if v_version is null then raise exception 'Conflit de version'; end if;
  return v_version;
end $$;
revoke all on function public.musee_enregistrer(jsonb, bigint) from public, anon;
grant execute on function public.musee_enregistrer(jsonb, bigint) to authenticated;

/* ------------------------------------------------------------------ */
/* Sessions : l'heure de début est celle du serveur                    */
/* ------------------------------------------------------------------ */

create table if not exists public.musee_sessions (
  id         uuid primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  oeuvre     integer not null,
  duree_min  integer not null check (duree_min between 10 and 420),
  debut      timestamptz not null default now(),
  fin_prevue timestamptz not null,
  arretee_a  timestamptz,
  notifiee   boolean not null default false,
  titre      text not null default ''
);
create index if not exists musee_sessions_a_notifier on public.musee_sessions (fin_prevue) where not notifiee;
alter table public.musee_sessions enable row level security;
drop policy if exists musee_sessions_lecture on public.musee_sessions;
create policy musee_sessions_lecture on public.musee_sessions
  for select to authenticated using (user_id = auth.uid());

create or replace function public.musee_session_demarrer(p_id uuid, p_oeuvre integer, p_duree integer, p_titre text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v musee_sessions%rowtype;
begin
  if v_user is null then raise exception 'Non authentifié'; end if;
  -- Rejouer le même identifiant renvoie la même session (réseau coupé).
  select * into v from musee_sessions where id = p_id and user_id = v_user;
  if found then
    return jsonb_build_object('debut', v.debut, 'fin_prevue', v.fin_prevue);
  end if;
  if exists (select 1 from musee_sessions where user_id = v_user and arretee_a is null and fin_prevue > now()) then
    raise exception 'Une session est déjà en cours';
  end if;
  insert into musee_sessions (id, user_id, oeuvre, duree_min, debut, fin_prevue, titre)
  values (p_id, v_user, p_oeuvre, p_duree, now(), now() + make_interval(mins => p_duree), left(coalesce(p_titre, ''), 120))
  returning * into v;
  return jsonb_build_object('debut', v.debut, 'fin_prevue', v.fin_prevue);
end $$;
revoke all on function public.musee_session_demarrer(uuid, integer, integer, text) from public, anon;
grant execute on function public.musee_session_demarrer(uuid, integer, integer, text) to authenticated;

-- Arrêt anticipé : l'heure d'arrêt est celle du serveur, bornée à la fin prévue.
create or replace function public.musee_session_arreter(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_fin timestamptz;
begin
  if v_user is null then raise exception 'Non authentifié'; end if;
  update musee_sessions set arretee_a = least(now(), fin_prevue), notifiee = true
   where id = p_id and user_id = v_user and arretee_a is null
  returning arretee_a into v_fin;
  if v_fin is null then
    select coalesce(arretee_a, fin_prevue) into v_fin from musee_sessions where id = p_id and user_id = v_user;
  end if;
  if v_fin is null then raise exception 'Session inconnue'; end if;
  return jsonb_build_object('fin', v_fin);
end $$;
revoke all on function public.musee_session_arreter(uuid) from public, anon;
grant execute on function public.musee_session_arreter(uuid) to authenticated;

/* ------------------------------------------------------------------ */
/* Catalogue réduit et tirage des arrivages                            */
/* ------------------------------------------------------------------ */

-- support : 0 peinture, 1 sculpture, 2 photographie, 3 estampe.
-- Alimentée chaque mois par outils/catalogue/supabase-sync.mjs.
create table if not exists public.musee_catalogue (
  id       integer primary key,
  niveau   smallint not null,
  prestige smallint not null,
  support  smallint not null,
  musee    integer
);
create index if not exists musee_catalogue_tirage on public.musee_catalogue (niveau, support);
alter table public.musee_catalogue enable row level security;
drop policy if exists musee_catalogue_lecture on public.musee_catalogue;
create policy musee_catalogue_lecture on public.musee_catalogue for select to authenticated using (true);

-- Empreinte de tirage : (id XOR graine) × 2654435761 mod 2^32, la même que
-- rangTirage() dans js/moteur/arrivages.js. La multiplication est découpée en
-- deux moitiés de 16 bits pour ne jamais dépasser un bigint.
create or replace function public.musee_rang(p_id integer, p_graine bigint)
returns bigint
language sql immutable as $$
  select ((((((p_id::bigint # p_graine) & 4294967295) >> 16) * 2654435761) % 4294967296) * 65536
          + (((p_id::bigint # p_graine) & 65535) * 2654435761)) % 4294967296
$$;

create or replace function public.musee_tirer(p_niveau integer, p_support text, p_graine bigint, p_exclus integer[] default '{}')
returns integer
language sql stable security definer set search_path = public as $$
  select id from musee_catalogue
   where niveau = p_niveau
     and support = case p_support when 'peinture' then 0 when 'sculpture' then 1
                                  when 'photographie' then 2 when 'estampe' then 3 end
     and not (id = any (coalesce(p_exclus, '{}')))
   order by musee_rang(id, p_graine), id
   limit 1
$$;
revoke all on function public.musee_tirer(integer, text, bigint, integer[]) from public, anon;
grant execute on function public.musee_tirer(integer, text, bigint, integer[]) to authenticated, service_role;

/* ------------------------------------------------------------------ */
/* Notifications : abonnements Web Push                                */
/* ------------------------------------------------------------------ */

create table if not exists public.musee_abonnements (
  endpoint text primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  p256dh   text not null,
  auth     text not null,
  cree     timestamptz not null default now()
);
alter table public.musee_abonnements enable row level security;

create or replace function public.musee_abonner(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  insert into musee_abonnements (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
revoke all on function public.musee_abonner(text, text, text) from public, anon;
grant execute on function public.musee_abonner(text, text, text) to authenticated;

create or replace function public.musee_desabonner(p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from musee_abonnements where endpoint = p_endpoint and user_id = auth.uid()
$$;
revoke all on function public.musee_desabonner(text) from public, anon;
grant execute on function public.musee_desabonner(text) to authenticated;

/* ------------------------------------------------------------------ */
/* Images personnalisées : bucket privé, un dossier par joueur         */
/* ------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('musee-images', 'musee-images', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do nothing;

drop policy if exists musee_images_lecture on storage.objects;
create policy musee_images_lecture on storage.objects for select to authenticated
  using (bucket_id = 'musee-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists musee_images_ajout on storage.objects;
create policy musee_images_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'musee-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists musee_images_maj on storage.objects;
create policy musee_images_maj on storage.objects for update to authenticated
  using (bucket_id = 'musee-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists musee_images_suppression on storage.objects;
create policy musee_images_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'musee-images' and (storage.foldername(name))[1] = auth.uid()::text);

/* ------------------------------------------------------------------ */
/* Tâches programmées                                                  */
/* ------------------------------------------------------------------ */

-- L'adresse de la fonction et sa clé d'appel vivent dans le coffre (Vault),
-- jamais dans le code. Elles y sont posées plus bas (docs/INSTALLATION.md).
create or replace function public.musee_appeler(p_type text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_cle text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'musee_url_fonction';
  select decrypted_secret into v_cle from vault.decrypted_secrets where name = 'musee_cle_cron';
  if v_url is null or v_cle is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-musee-cle', v_cle),
    body := jsonb_build_object('type', p_type),
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.musee_appeler(text) from public, anon, authenticated;

-- Vérification légère chaque minute : la fonction n'est appelée que si une
-- session vient réellement de se terminer.
create or replace function public.musee_verifier_sessions()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from musee_sessions where not notifiee and arretee_a is null and fin_prevue <= now()) then
    perform musee_appeler('sessions');
  end if;
end $$;
revoke all on function public.musee_verifier_sessions() from public, anon, authenticated;

-- Rétention posée en même temps que le schéma : sessions de plus de 30 jours
-- (l'historique vit dans l'état) et journal de nos propres tâches pg_cron.
create or replace function public.musee_purger()
returns void
language sql security definer set search_path = public as $$
  delete from musee_sessions where debut < now() - interval '30 days';
  delete from cron.job_run_details
   where end_time < now() - interval '3 days'
     and jobid in (select jobid from cron.job where jobname like 'musee-%');
$$;
revoke all on function public.musee_purger() from public, anon, authenticated;

-- Droits : ce projet n'accorde rien d'office aux tables neuves. L'appli lit
-- directement son état, ses sessions et le catalogue (elle n'écrit que par
-- les fonctions ci-dessus) ; l'Edge Function et la synchro du catalogue
-- passent par la clé de service.
grant select on public.musee_etats, public.musee_sessions, public.musee_catalogue to authenticated;
grant all on public.musee_etats, public.musee_sessions, public.musee_catalogue, public.musee_abonnements to service_role;

-- Coffre : l'adresse de la fonction et sa clé d'appel. La clé est tirée au
-- hasard ici, une fois pour toutes ; pg_cron l'envoie, l'Edge Function la
-- relit par musee_cle_cron(). Personne ne la recopie.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'musee_url_fonction') then
    perform vault.create_secret('https://psutbulpezfdftmaqkoo.supabase.co/functions/v1/musee', 'musee_url_fonction');
  end if;
  if not exists (select 1 from vault.secrets where name = 'musee_cle_cron') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'musee_cle_cron');
  end if;
end $$;

create or replace function public.musee_cle_cron()
returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'musee_cle_cron'
$$;
revoke all on function public.musee_cle_cron() from public, anon, authenticated;
grant execute on function public.musee_cle_cron() to service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('musee-sessions', 'musee-quotidien', 'musee-purge');
-- Chaque heure à 5 : la fonction ne ferme une journée qu'après 4 h, heure de
-- Paris, ce qui reste juste été comme hiver sans dépendre du fuseau de pg_cron.
select cron.schedule('musee-quotidien', '5 * * * *', $$select public.musee_appeler('quotidien')$$);
select cron.schedule('musee-sessions', '* * * * *', $$select public.musee_verifier_sessions()$$);
select cron.schedule('musee-purge', '17 3 * * *', $$select public.musee_purger()$$);
