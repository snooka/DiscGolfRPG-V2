create or replace function public.t_as(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); execute 'reset role'; if u is not null then execute 'set role authenticated'; else execute 'set role anon'; end if; end $$;
create or replace function public.t_ok(c boolean, m text) returns void language plpgsql as $$ begin if not c then raise exception 'FAIL: %', m; end if; raise notice 'ok  - %', m; end $$;
-- NB: grant execute so authenticated can call helpers after set role
grant execute on function public.t_as(uuid), public.t_ok(boolean,text) to public;
\set ON_ERROR_STOP on
do $$
declare
  kim uuid := '11111111-1111-1111-1111-111111111111';
  truls uuid := '22222222-2222-2222-2222-222222222222';
  ola uuid := '33333333-3333-3333-3333-333333333333';
  f uuid;
  failed boolean; r record;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
   (kim,'kim@x.no','{"name":"Kim"}'),(truls,'t@x.no','{"name":"Truls"}'),(ola,'o@x.no','{"name":"Ola"}');
  insert into public.friendships (requester, addressee, status) values (kim, truls, 'accepted');

  perform t_as(kim);
  perform t_ok((select rating from profiles where id = kim) is null, 'ingen runder: rating null');
  -- 9 hull, par = diff 0 -> 1000
  insert into player_rounds (user_id, round_id, mode, course_name, played_at, holes, throws, diff, xp)
    values (kim, 'r1', 'normal', 'Kolbeinsvik', now() - interval '3 days', 9, 27, 0, 100);
  perform public.t_as(null); perform public.t_as(kim);
  perform t_ok((select rating from profiles where id = kim) = 1000, 'par hele veien = 1000');
  -- Roulette og putter påvirker ikke ratingen
  insert into player_rounds (user_id, round_id, mode, played_at, holes, throws, diff)
    values (kim, 'r2', 'roulette', now() - interval '2 days', 9, 18, -9);
  perform t_ok((select rating from profiles where id = kim) = 1000, 'roulette teller ikke');
  -- -9 på 9 hull = snitt -1 -> 1300
  insert into player_rounds (user_id, round_id, mode, played_at, holes, throws, diff)
    values (kim, 'r3', 'normal', now() - interval '1 day', 9, 18, -9);
  -- snitt = -9/18 = -0.5 -> 1150
  perform t_ok((select rating from profiles where id = kim) = 1150, 'to runder: snitt −0,5 per hull = 1150');
  perform t_ok((select rating_rounds from profiles where id = kim) = 2, 'rating bygger på 2 normalrunder');
  -- Bare de 10 siste: 12 runder på +9 (bogey per hull) -> 700, de to første faller utenfor
  for i in 1..12 loop
    insert into player_rounds (user_id, round_id, mode, played_at, holes, throws, diff)
      values (kim, 'b'||i, 'normal', now() + (i||' minutes')::interval, 9, 36, 9);
  end loop;
  perform t_ok((select rating from profiles where id = kim) = 700, 'kun de 10 siste runder teller (bogey-golf = 700)');
  perform t_ok((select rating_rounds from profiles where id = kim) = 10, 'maks 10 runder');
  -- Grenser
  insert into player_rounds (user_id, round_id, mode, played_at, holes, throws, diff)
    values (kim, 'ace', 'normal', now() + interval '1 day', 9, 9, -18);
  -- 9 runder bogey (+81 / 81 hull) + ace-runde -18 → (81-18)/90 = 0.7 -> 790
  perform t_ok((select rating from profiles where id = kim) = 790, 'blanding regnes riktig (790)');

  -- Klienten kan ikke sette rating selv
  failed := false; begin update profiles set rating = 1400 where id = kim; exception when others then failed := true; end;
  perform t_ok(failed, 'klient kan ikke skrive rating direkte');
  -- eller falske runder for andre
  failed := false; begin insert into player_rounds (user_id, round_id, mode, holes, throws, diff) values (truls, 'x', 'normal', 9, 1, -26); exception when others then failed := true; end;
  perform t_ok(failed, 'kan ikke legge til runder for andre');
  -- duplikat-runder gjør ingenting skade (primærnøkkel)
  failed := false; begin insert into player_rounds (user_id, round_id, mode, holes, throws, diff) values (kim, 'r1', 'normal', 9, 1, -26); exception when others then failed := true; end;
  perform t_ok(failed, 'samme runde kan ikke registreres to ganger');
  -- Runder kan ikke endres eller slettes av klienten
  failed := false; begin update player_rounds set diff = -50 where user_id = kim; exception when others then failed := true; end;
  perform t_ok(failed, 'klient kan ikke endre runder');
  failed := false; begin delete from player_rounds where user_id = kim; exception when others then failed := true; end;
  perform t_ok(failed, 'klient kan ikke slette runder');

  -- Diskbag og offentlig statistikk
  insert into user_discs (user_id, disc_id, name, brand, disc_type, speed, glide, turn, fade, plastic, color)
    values (kim, 'd1', 'Destroyer', 'Innova', 'Distance Driver', 12, 5, -1, 3, 'Star', '#ff0000');
  insert into profile_public (user_id, summary) values (kim, '{"rounds":3}');

  -- Venn ser alt
  perform t_as(truls);
  perform t_ok((select count(*) from user_discs where user_id = kim) = 1, 'venn ser diskbag');
  perform t_ok((select count(*) from player_rounds where user_id = kim) > 0, 'venn ser runder');
  perform t_ok((select count(*) from profile_public where user_id = kim) = 1, 'venn ser statistikk');
  perform t_ok((select rating from profiles where id = kim) = 790, 'alle kan se rating i toppliste');
  failed := false; begin insert into user_discs (user_id, disc_id, name) values (kim, 'hack', 'Hack'); exception when others then failed := true; end;
  perform t_ok(failed, 'venn kan ikke skrive til andres bag');
  failed := false; begin update profile_public set summary = '{}' where user_id = kim; if not found then failed := true; end if; exception when others then failed := true; end;
  perform t_ok(failed, 'venn kan ikke endre andres statistikk');

  -- Ikke-venn ser ingenting
  perform t_as(ola);
  perform t_ok((select count(*) from user_discs where user_id = kim) = 0, 'ikke-venn ser IKKE diskbag');
  perform t_ok((select count(*) from player_rounds where user_id = kim) = 0, 'ikke-venn ser IKKE runder');
  perform t_ok((select count(*) from profile_public where user_id = kim) = 0, 'ikke-venn ser IKKE statistikk');
  -- Anon ser ingenting
  perform t_as(null);
  failed := false; begin perform count(*) from player_rounds; exception when others then failed := true; end;
  perform t_ok(failed, 'anon har ingen tilgang til runder');
  perform t_as(null);
  raise notice 'ALLE RATING-TESTER OK';
end $$;
