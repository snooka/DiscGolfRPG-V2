\set ON_ERROR_STOP on
do $$ declare n int; begin
  insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'a@x.no','{"name":"Kim"}');
  insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'b@x.no','{"name":"kim"}');  -- samme navn, annen case
  insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'c@x.no','{}');           -- uten navn
  select count(*) into n from public.profiles;
  if n <> 3 then raise exception 'FAIL: forventet 3 profiler, fikk %', n; end if;
  select count(*) into n from public.profile_data;
  if n <> 3 then raise exception 'FAIL: forventet 3 profile_data, fikk %', n; end if;
  raise notice 'ok - navnekonflikt og manglende navn stopper ikke registreringen';
  -- trigger feiler (profiles-tabell ødelagt): registreringen skal likevel gå gjennom
  alter table public.profiles rename to profiles_x;
  insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'d@x.no','{"name":"Ola"}');
  alter table public.profiles_x rename to profiles;
  select count(*) into n from auth.users;
  if n <> 4 then raise exception 'FAIL: bruker ikke opprettet'; end if;
  raise notice 'ok - feil i profil-trigger gir ikke «Database error saving new user»';
  raise notice 'SIGNUP OK';
end $$;
