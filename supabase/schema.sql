-- ============================================================================
-- Disc Golf RPG – databaseskjema for Supabase (Postgres + Auth + Realtime)
--
-- Kjør hele filen én gang i Supabase → SQL Editor → «New query» → Run.
-- Skriptet kan kjøres flere ganger uten å ødelegge data (idempotent).
--
-- Sikkerhetsmodell: Row Level Security (RLS) er slått på for alle tabeller.
--  • Alle innloggede kan se offentlig profil (navn, XP, tittel) – til toppliste og venn-søk.
--  • Full profildata (bag, stats, achievements …) kan bare eieren lese og skrive.
--  • Venneforespørsler og varsler styres av funksjoner/triggere på serversiden.
--  • En runde kan bare leses og endres av spillerne i runden (deltakere som er brukere).
-- ============================================================================

-- ---------- Offentlig profil ----------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 20),
  xp          integer not null default 0 check (xp >= 0),
  title_id    text,
  created_at  timestamptz not null default now()
);

-- Brukernavn er unikt uavhengig av store/små bokstaver
create unique index if not exists profiles_name_key on public.profiles (lower(name));

-- ---------- Privat profildata (bag, statistikk, achievements …) -------------

create table if not exists public.profile_data (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------- Venner ---------------------------------------------------------

create table if not exists public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references public.profiles (id) on delete cascade,
  addressee   uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  check (requester <> addressee)
);

create unique index if not exists friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- ---------- Varsler --------------------------------------------------------

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade, -- mottaker
  from_user   uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in ('passed', 'round_invite', 'friend_request', 'friend_accepted')),
  text        text not null,
  data        jsonb not null default '{}'::jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- Runder (flerspiller) ---------------------------------------------

create table if not exists public.rounds (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.profiles (id) on delete cascade,
  mode         text not null check (mode in ('normal', 'dual_tee', 'roulette', 'putter')),
  course       jsonb not null,
  hole_count   integer not null check (hole_count between 1 and 36),
  config       jsonb not null default '{}'::jsonb, -- hjulsegmenter, vær, hjulkilde
  status       text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists rounds_host_idx on public.rounds (host_id);

create table if not exists public.round_players (
  round_id   uuid not null references public.rounds (id) on delete cascade,
  key        text not null,
  user_id    uuid references public.profiles (id) on delete set null, -- null = gjest
  name       text not null check (char_length(name) between 1 and 40),
  position   integer not null default 0,
  verified   boolean not null default false, -- GPS: stod denne spilleren på banen?
  left_round boolean not null default false,
  primary key (round_id, key)
);

create index if not exists round_players_user_idx on public.round_players (user_id);

-- En rad per hull, opprettes først når noen endrer noe (par, hjul, «lagret»).
create table if not exists public.round_holes (
  round_id    uuid not null references public.rounds (id) on delete cascade,
  hole        integer not null check (hole between 1 and 36),
  par         integer not null default 3 check (par between 3 and 5),
  confirmed   boolean not null default false,
  spin        text,
  spin_disc   text,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (round_id, hole)
);

-- En rad per (spiller, hull). Mangler raden, regnes score som par.
create table if not exists public.round_scores (
  round_id    uuid not null,
  player_key  text not null,
  hole        integer not null check (hole between 1 and 36),
  score       integer not null default 3 check (score between 1 and 15),
  putts       integer not null default 0 check (putts between 0 and 15),
  tee_pick    integer check (tee_pick in (1, 2)),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (round_id, player_key, hole),
  foreign key (round_id, player_key) references public.round_players (round_id, key) on delete cascade
);

-- ---------- Hjelpefunksjoner (security definer: unngår RLS-rekursjon) --------

create or replace function public.is_round_member(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.round_players where round_id = rid and user_id = auth.uid()
  );
$$;

create or replace function public.is_round_active(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rounds where id = rid and status = 'active');
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- ---------- Ny bruker: opprett profil automatisk -----------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  display text;
begin
  display := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  if display is null then
    display := 'Spiller' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  if exists (select 1 from public.profiles where lower(name) = lower(display) and id <> new.id) then
    display := left(display, 16) || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  -- Profilopprettelse skal ALDRI hindre registrering (feil her ga «Database error saving new user»).
  -- Mangler noe, oppretter appen radene ved første innlogging (ensure_my_profile).
  begin
    insert into public.profiles (id, name) values (new.id, display)
      on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, name)
    values (new.id, left(display, 16) || substr(replace(new.id::text, '-', ''), 1, 4))
    on conflict (id) do nothing;
  end;
  insert into public.profile_data (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user feilet for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Brukes av registreringsskjemaet (før konto finnes) for å gi en pen feilmelding.
create or replace function public.name_available(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(name) = lower(btrim(p_name)));
$$;

-- Kalles etter innlogging hvis triggeren ved registrering ikke har laget rader ennå.
create or replace function public.ensure_my_profile(p_name text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  display text;
begin
  if me is null then raise exception 'Ikke innlogget'; end if;
  display := nullif(btrim(coalesce(p_name, '')), '');
  if display is null then
    display := 'Spiller' || substr(replace(me::text, '-', ''), 1, 6);
  end if;
  if not exists (select 1 from public.profiles where id = me) then
    if exists (select 1 from public.profiles where lower(name) = lower(display)) then
      display := left(display, 16) || substr(replace(me::text, '-', ''), 1, 4);
    end if;
    begin
      insert into public.profiles (id, name) values (me, display);
    exception
      when unique_violation then
        insert into public.profiles (id, name)
        values (me, left(display, 16) || substr(replace(me::text, '-', ''), 1, 4));
    end;
  end if;
  insert into public.profile_data (user_id) values (me)
    on conflict (user_id) do nothing;
end;
$$;

-- ---------- Venner: funksjoner ------------------------------------------------

-- Sender forespørsel. Har den andre allerede spurt deg, godtas den i stedet.
-- Returnerer 'requested' | 'accepted' | 'already'.
create or replace function public.request_friend(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  existing public.friendships%rowtype;
begin
  if me is null then raise exception 'Ikke innlogget'; end if;
  if p_user is null or p_user = me then raise exception 'Ugyldig bruker'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Fant ikke brukeren';
  end if;

  select * into existing from public.friendships
   where (requester = me and addressee = p_user) or (requester = p_user and addressee = me);

  if found then
    if existing.status = 'accepted' then return 'already'; end if;
    if existing.requester = me then return 'already'; end if;
    update public.friendships set status = 'accepted' where id = existing.id;
    return 'accepted';
  end if;

  insert into public.friendships (requester, addressee) values (me, p_user);
  return 'requested';
end;
$$;

create or replace function public.accept_friend(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.friendships set status = 'accepted'
   where id = p_id and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'Forespørselen finnes ikke'; end if;
end;
$$;

-- Varsler om venneforespørsler (lages av serveren, kan ikke forfalskes)
create or replace function public.notify_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if tg_op = 'INSERT' then
    select name into who from public.profiles where id = new.requester;
    insert into public.notifications (user_id, from_user, kind, text, data)
    values (new.addressee, new.requester, 'friend_request',
            who || ' vil bli din venn 🤝', jsonb_build_object('friendshipId', new.id));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    select name into who from public.profiles where id = new.addressee;
    insert into public.notifications (user_id, from_user, kind, text, data)
    values (new.requester, new.addressee, 'friend_accepted',
            who || ' godtok vennskapet 🎉', jsonb_build_object('friendshipId', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists friendship_notify on public.friendships;
create trigger friendship_notify
  after insert or update on public.friendships
  for each row execute function public.notify_friendship();

-- ---------- Runder: funksjoner -----------------------------------------------

-- Oppretter runde + spillere i én transaksjon.
-- p_players: [{ "key": "p1", "name": "Kim", "userId": "<uuid>" | null }, …]
-- Alle registrerte spillere (unntatt deg selv) må være vennene dine.
create or replace function public.create_round(
  p_id uuid,
  p_mode text,
  p_course jsonb,
  p_hole_count integer,
  p_config jsonb,
  p_players jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pl jsonb;
  idx integer := 0;
  uid uuid;
  has_me boolean := false;
begin
  if me is null then raise exception 'Ikke innlogget'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) not between 1 and 6 then
    raise exception 'En runde må ha 1–6 spillere';
  end if;

  insert into public.rounds (id, host_id, mode, course, hole_count, config)
  values (p_id, me, p_mode, p_course, p_hole_count, coalesce(p_config, '{}'::jsonb));

  for pl in select * from jsonb_array_elements(p_players) loop
    uid := nullif(pl ->> 'userId', '')::uuid;
    if uid is not null and uid <> me and not public.are_friends(me, uid) then
      raise exception 'Du kan bare legge til venner i en runde';
    end if;
    if uid = me then has_me := true; end if;
    insert into public.round_players (round_id, key, user_id, name, position)
    values (p_id, pl ->> 'key', uid, left(pl ->> 'name', 40), idx);
    idx := idx + 1;
  end loop;

  if not has_me then raise exception 'Du må selv delta i runden du oppretter'; end if;
  return p_id;
end;
$$;

-- Fullfører runden. Alle hull må være lagret – håndheves her, ikke bare i appen.
create or replace function public.finish_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.rounds%rowtype;
  done integer;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or not public.is_round_member(p_round) then raise exception 'Fant ikke runden'; end if;
  if r.status <> 'active' then return; end if;
  select count(*) into done from public.round_holes
   where round_id = p_round and confirmed and hole between 1 and r.hole_count;
  if done < r.hole_count then raise exception 'Alle hull må være spilt før runden kan fullføres'; end if;
  update public.rounds set status = 'finished', finished_at = now() where id = p_round;
end;
$$;

-- Bare verten kan avbryte runden for alle.
create or replace function public.abandon_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.rounds set status = 'abandoned', finished_at = now()
   where id = p_round and host_id = auth.uid() and status = 'active';
  if not found then raise exception 'Bare verten kan avbryte en pågående runde'; end if;
end;
$$;

-- Varsel til spillere som blir lagt til i en runde
create or replace function public.notify_round_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.rounds%rowtype;
  who text;
begin
  if new.user_id is null then return new; end if;
  select * into r from public.rounds where id = new.round_id;
  if r.host_id = new.user_id then return new; end if;
  select name into who from public.profiles where id = r.host_id;
  insert into public.notifications (user_id, from_user, kind, text, data)
  values (new.user_id, r.host_id, 'round_invite',
          who || ' har startet en runde med deg på ' || (r.course ->> 'name') || ' 🥏',
          jsonb_build_object('roundId', new.round_id));
  return new;
end;
$$;

drop trigger if exists round_player_notify on public.round_players;
create trigger round_player_notify
  after insert on public.round_players
  for each row execute function public.notify_round_invite();

-- Sletter kontoen din og alt som hører til.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Ikke innlogget'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------- Tilganger (grants) ------------------------------------------------

revoke all on public.profiles, public.profile_data, public.friendships, public.notifications,
  public.rounds, public.round_players, public.round_holes, public.round_scores from anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, name, xp, title_id) on public.profiles to authenticated;
grant update (xp, title_id) on public.profiles to authenticated;

grant select, insert, update on public.profile_data to authenticated;

grant select, delete on public.friendships to authenticated;

grant select, delete on public.notifications to authenticated;
grant insert (user_id, from_user, kind, text, data) on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

grant select on public.rounds to authenticated;
grant select on public.round_players to authenticated;
grant update (verified, left_round) on public.round_players to authenticated;
grant select, insert, update on public.round_holes to authenticated;
grant select, insert, update on public.round_scores to authenticated;

revoke all on function public.is_round_member(uuid), public.is_round_active(uuid), public.are_friends(uuid, uuid),
  public.request_friend(uuid), public.accept_friend(uuid), public.create_round(uuid, text, jsonb, integer, jsonb, jsonb),
  public.finish_round(uuid), public.abandon_round(uuid), public.delete_my_account(), public.name_available(text),
  public.ensure_my_profile(text)
  from public, anon, authenticated;

grant execute on function public.is_round_member(uuid), public.is_round_active(uuid), public.are_friends(uuid, uuid),
  public.request_friend(uuid), public.accept_friend(uuid), public.create_round(uuid, text, jsonb, integer, jsonb, jsonb),
  public.finish_round(uuid), public.abandon_round(uuid), public.delete_my_account(), public.ensure_my_profile(text)
  to authenticated;
grant execute on function public.name_available(text) to anon, authenticated;

-- ---------- Row Level Security ------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.profile_data   enable row level security;
alter table public.friendships    enable row level security;
alter table public.notifications  enable row level security;
alter table public.rounds         enable row level security;
alter table public.round_players  enable row level security;
alter table public.round_holes    enable row level security;
alter table public.round_scores   enable row level security;

drop policy if exists "profiles: alle innloggede kan se" on public.profiles;
create policy "profiles: alle innloggede kan se" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles: eier kan oppdatere" on public.profiles;
create policy "profiles: eier kan oppdatere" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles: eier kan opprette" on public.profiles;
create policy "profiles: eier kan opprette" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profile_data: eier" on public.profile_data;
create policy "profile_data: eier" on public.profile_data
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "friendships: parter kan se" on public.friendships;
create policy "friendships: parter kan se" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists "friendships: parter kan slette" on public.friendships;
create policy "friendships: parter kan slette" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

drop policy if exists "notifications: mottaker kan se" on public.notifications;
create policy "notifications: mottaker kan se" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications: mottaker kan oppdatere" on public.notifications;
create policy "notifications: mottaker kan oppdatere" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications: mottaker kan slette" on public.notifications;
create policy "notifications: mottaker kan slette" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
-- «Gikk forbi deg»-varsler sendes fra klienten, men bare til egne venner og aldri på vegne av andre.
drop policy if exists "notifications: send passert-varsel til venn" on public.notifications;
create policy "notifications: send passert-varsel til venn" on public.notifications
  for insert to authenticated
  with check (kind = 'passed' and from_user = auth.uid() and public.are_friends(auth.uid(), user_id));

drop policy if exists "rounds: deltakere kan se" on public.rounds;
create policy "rounds: deltakere kan se" on public.rounds
  for select to authenticated using (public.is_round_member(id));

drop policy if exists "round_players: deltakere kan se" on public.round_players;
create policy "round_players: deltakere kan se" on public.round_players
  for select to authenticated using (public.is_round_member(round_id));
drop policy if exists "round_players: egen rad kan oppdateres" on public.round_players;
create policy "round_players: egen rad kan oppdateres" on public.round_players
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "round_holes: deltakere kan se" on public.round_holes;
create policy "round_holes: deltakere kan se" on public.round_holes
  for select to authenticated using (public.is_round_member(round_id));
drop policy if exists "round_holes: deltakere kan skrive" on public.round_holes;
create policy "round_holes: deltakere kan skrive" on public.round_holes
  for insert to authenticated
  with check (public.is_round_member(round_id) and public.is_round_active(round_id));
drop policy if exists "round_holes: deltakere kan endre" on public.round_holes;
create policy "round_holes: deltakere kan endre" on public.round_holes
  for update to authenticated
  using (public.is_round_member(round_id) and public.is_round_active(round_id))
  with check (public.is_round_member(round_id) and public.is_round_active(round_id));

drop policy if exists "round_scores: deltakere kan se" on public.round_scores;
create policy "round_scores: deltakere kan se" on public.round_scores
  for select to authenticated using (public.is_round_member(round_id));
drop policy if exists "round_scores: deltakere kan skrive" on public.round_scores;
create policy "round_scores: deltakere kan skrive" on public.round_scores
  for insert to authenticated
  with check (public.is_round_member(round_id) and public.is_round_active(round_id));
drop policy if exists "round_scores: deltakere kan endre" on public.round_scores;
create policy "round_scores: deltakere kan endre" on public.round_scores
  for update to authenticated
  using (public.is_round_member(round_id) and public.is_round_active(round_id))
  with check (public.is_round_member(round_id) and public.is_round_active(round_id));

-- ---------- Sanntid (Realtime) -------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['profiles', 'friendships', 'notifications', 'rounds',
                             'round_players', 'round_holes', 'round_scores']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- ============================================================================
-- DATASIKKERHET VED OPPDATERINGER
-- All progresjon ligger i skyen. Achievements lagres i tillegg som egne rader (de kan
-- aldri slettes av appen), og profildata får automatiske sikkerhetskopier.
-- ============================================================================

-- Opplåste achievements: én rad per achievement. Kan opprettes, aldri endres eller slettes av klienten.
create table if not exists public.user_achievements (
  user_id         uuid not null references auth.users (id) on delete cascade,
  achievement_id  text not null check (char_length(achievement_id) between 1 and 80),
  unlocked_at     timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- Sikkerhetskopier av profildata (maks én per 6 timer, siste 20 beholdes). Ikke tilgjengelig for appen.
create table if not exists public.profile_backups (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  data      jsonb not null,
  saved_at  timestamptz not null default now()
);
create index if not exists profile_backups_user_idx on public.profile_backups (user_id, saved_at desc);

create or replace function public.backup_profile_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.data <> '{}'::jsonb
     and old.data is distinct from new.data
     and not exists (
       select 1 from public.profile_backups b
       where b.user_id = old.user_id and b.saved_at > now() - interval '6 hours'
     ) then
    insert into public.profile_backups (user_id, data) values (old.user_id, old.data);
    delete from public.profile_backups
    where user_id = old.user_id
      and id not in (
        select id from public.profile_backups where user_id = old.user_id order by saved_at desc limit 20
      );
  end if;
  return new;
end;
$$;

drop trigger if exists profile_data_backup on public.profile_data;
create trigger profile_data_backup
  before update on public.profile_data
  for each row execute function public.backup_profile_data();

revoke all on public.user_achievements, public.profile_backups from anon, authenticated;
revoke all on function public.backup_profile_data() from public, anon, authenticated;
grant select, insert on public.user_achievements to authenticated;

alter table public.user_achievements enable row level security;
alter table public.profile_backups   enable row level security; -- ingen policyer = ingen tilgang fra appen

drop policy if exists "user_achievements: eier kan se" on public.user_achievements;
create policy "user_achievements: eier kan se" on public.user_achievements
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "user_achievements: eier kan legge til" on public.user_achievements;
create policy "user_achievements: eier kan legge til" on public.user_achievements
  for insert to authenticated with check (user_id = auth.uid());

-- Gjenopprette en profil fra sikkerhetskopi (kjøres manuelt i SQL Editor ved behov):
--   select id, saved_at from public.profile_backups where user_id = '<bruker-id>' order by saved_at desc;
--   update public.profile_data set data = (select data from public.profile_backups where id = <id>)
--   where user_id = '<bruker-id>';

-- ============================================================================
-- RATING, VENNEPROFILER, DISKBAG OG RUNDEHISTORIKK
-- Kilden til sannhet for profildata er fortsatt profile_data. Disse tabellene er den
-- normaliserte, delbare kopien som venner kan lese, og som ratingen regnes ut fra.
-- ============================================================================

alter table public.profiles add column if not exists rating integer check (rating between 0 and 2000);
alter table public.profiles add column if not exists rating_rounds integer not null default 0;

-- Fullførte runder (én rad per spiller per runde), brukes til rating og rundehistorikk
create table if not exists public.player_rounds (
  user_id      uuid not null references auth.users (id) on delete cascade,
  round_id     text not null check (char_length(round_id) between 1 and 80),
  mode         text not null check (mode in ('normal', 'dual_tee', 'roulette', 'putter')),
  course_name  text not null default '',
  played_at    timestamptz not null default now(),
  holes        integer not null check (holes between 0 and 100),
  throws       integer not null check (throws between 0 and 1000),
  diff         integer not null check (diff between -200 and 1000),
  xp           integer not null default 0,
  birdies      integer not null default 0,
  putts        integer not null default 0,
  primary key (user_id, round_id)
);
create index if not exists player_rounds_user_time_idx on public.player_rounds (user_id, played_at desc);

-- Diskbag: én rad per disk
create table if not exists public.user_discs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  disc_id    text not null check (char_length(disc_id) between 1 and 80),
  name       text not null check (char_length(name) between 1 and 80),
  brand      text not null default '',
  disc_type  text not null default '',
  speed      numeric not null default 0,
  glide      numeric not null default 0,
  turn       numeric not null default 0,
  fade       numeric not null default 0,
  plastic    text not null default '',
  color      text not null default '',
  position   integer not null default 0,
  primary key (user_id, disc_id)
);

-- Samlet statistikk som venner kan se (tall, ikke rådata)
create table if not exists public.profile_public (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  summary     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Rating regnes ut i databasen fra de siste 10 Normal Game-rundene:
-- 1000 = par hele veien, hvert kast i snitt per hull over/under par flytter 300 poeng.
create or replace function public.calc_rating(uid uuid)
returns table (rating integer, rounds integer)
language sql stable security definer set search_path = public as $$
  with recent as (
    select holes, diff from public.player_rounds
    where user_id = uid and mode = 'normal' and holes > 0
    order by played_at desc, round_id desc
    limit 10
  )
  select
    case when count(*) = 0 then null
         else greatest(400, least(1400, round(1000 - (sum(diff)::numeric / sum(holes)) * 300)))::integer
    end,
    count(*)::integer
  from recent;
$$;

create or replace function public.refresh_rating(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.calc_rating(uid);
  update public.profiles set rating = r.rating, rating_rounds = coalesce(r.rounds, 0) where id = uid;
end;
$$;

create or replace function public.player_rounds_rating_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_rating(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

drop trigger if exists player_rounds_rating on public.player_rounds;
create trigger player_rounds_rating
  after insert or update or delete on public.player_rounds
  for each row execute function public.player_rounds_rating_trigger();

-- Regn ratingen på nytt (kalles etter første synkronisering)
create or replace function public.refresh_my_rating()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Ikke innlogget'; end if;
  perform public.refresh_rating(auth.uid());
end;
$$;

revoke all on public.player_rounds, public.user_discs, public.profile_public from anon, authenticated;
revoke all on function public.calc_rating(uuid), public.refresh_rating(uuid),
  public.player_rounds_rating_trigger(), public.refresh_my_rating() from public, anon, authenticated;
grant execute on function public.refresh_my_rating() to authenticated;
grant select, insert on public.player_rounds to authenticated;
grant select, insert, update, delete on public.user_discs to authenticated;
grant select, insert, update on public.profile_public to authenticated;

alter table public.player_rounds  enable row level security;
alter table public.user_discs     enable row level security;
alter table public.profile_public enable row level security;

-- Eier og godtatte venner kan lese. Bare eieren kan skrive.
drop policy if exists "player_rounds: eier og venner kan se" on public.player_rounds;
create policy "player_rounds: eier og venner kan se" on public.player_rounds
  for select to authenticated using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));
drop policy if exists "player_rounds: eier kan legge til" on public.player_rounds;
create policy "player_rounds: eier kan legge til" on public.player_rounds
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "user_discs: eier og venner kan se" on public.user_discs;
create policy "user_discs: eier og venner kan se" on public.user_discs
  for select to authenticated using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));
drop policy if exists "user_discs: eier kan endre" on public.user_discs;
create policy "user_discs: eier kan endre" on public.user_discs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "profile_public: eier og venner kan se" on public.profile_public;
create policy "profile_public: eier og venner kan se" on public.profile_public
  for select to authenticated using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));
drop policy if exists "profile_public: eier kan skrive" on public.profile_public;
create policy "profile_public: eier kan skrive" on public.profile_public
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "profile_public: eier kan oppdatere" on public.profile_public;
create policy "profile_public: eier kan oppdatere" on public.profile_public
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
