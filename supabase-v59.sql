-- Little Lanes v59: server-side security hardening.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run more than once.
-- Run AFTER supabase-setup.sql and supabase-accounts.sql (it replaces some of their functions; later definitions win).
--
-- ============================ DASHBOARD SETTINGS FOR MARK ============================
--  1. Authentication -> Providers/Sign In -> Email: turn "Secure password change" ON (if the option exists).
--  2. Realtime -> Settings: turn "Allow public access" OFF, but ONLY AFTER the new game version (private channels) is live
--     for everyone. While it is ON, the old public channels keep working and the policies in section 11 are just waiting.
--  3. Deploy the new supabase-function-signin.ts (Edge Functions -> signin -> edit -> paste -> Deploy). Run THIS script first.
--  4. IMPORTANT ORDER: section 5 hides profiles.friend_code. The OLD game does select('*') on profiles and will get
--     "permission denied". Publish the new online.js (explicit column list + my_friend_code() + find_by_code()) BEFORE running this.
-- =====================================================================================
--
-- Sections: 0 preflight/helpers  1 created_at stamps  2 rate limits (sent_log) + cron  3 free-text holes  4 nicknames
--           5 friend codes  6 login/recovery  7 device required  8 scores/duels  9 groups  10 friend limits  11 realtime

-- ---------- 0. preflight + helpers ----------
do $$ begin
  if to_regclass('public.devices') is null or to_regclass('public.polls') is null or to_regclass('ll_private.rate') is null then
    raise exception 'Run supabase-setup.sql and supabase-accounts.sql first';
  end if;
end $$;
create extension if not exists pg_cron;
create schema if not exists ll_private;
revoke all on schema ll_private from anon, authenticated, public;

-- append-only log of things a player SENT. Deleting your own rows (messages, friends...) does not reset limits.
create table if not exists ll_private.sent_log (
  user_id uuid not null,
  kind text not null,
  target text,
  at timestamptz not null default now()
);
create index if not exists sent_log_u on ll_private.sent_log (user_id, kind, at);
create index if not exists sent_log_at on ll_private.sent_log (at);
revoke all on ll_private.sent_log from anon, authenticated, public;

-- group (group,user) tombstones: someone who declined / left cannot be re-invited for 24 h
create table if not exists ll_private.group_tomb (
  group_id bigint not null,
  user_id uuid not null,
  at timestamptz not null default now(),
  primary key (group_id, user_id)
);
revoke all on ll_private.group_tomb from anon, authenticated, public;

-- sessions that signed in with a recovery code (may skip the current password for 15 minutes, may make a recovery code at once)
create table if not exists ll_private.recovered_sessions (
  session_id uuid primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);
revoke all on ll_private.recovered_sessions from anon, authenticated, public;
alter table ll_private.accounts add column if not exists recovered_at timestamptz;

-- take the per-player lock, refuse when the (user, kind) already has lim entries in the window, then record one.
create or replace function ll_private.hit(u uuid, k text, t text, lim int, win interval, msg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ll-sent:' || u::text || ':' || k, 0));
  if (select count(*) from ll_private.sent_log where user_id = u and kind = k and at > now() - win) >= lim then raise exception '%', msg; end if;
  insert into ll_private.sent_log(user_id, kind, target) values (u, k, t);
end $$;
-- same, but per target (e.g. per recipient); does not record (call hit() afterwards)
create or replace function ll_private.cap(u uuid, k text, t text, lim int, win interval, msg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ll-sent:' || u::text || ':' || k, 0));
  if (select count(*) from ll_private.sent_log where user_id = u and kind = k and target is not distinct from t and at > now() - win) >= lim then raise exception '%', msg; end if;
end $$;

-- a signed-in player's login must be a registered device (service_role / no player: skipped)
create or replace function ll_private.need_device() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.devices d where d.session_id = nullif(auth.jwt()->>'session_id','')::uuid and d.user_id = auth.uid()) then
    raise exception 'register device';
  end if;
end $$;
create or replace function public.ll_need_device_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin perform ll_private.need_device(); return new; end $$;
create or replace function public.ll_stamp_created() returns trigger language plpgsql as $$
begin new.created_at := now(); return new; end $$;
create or replace function public.ll_stamp_updated() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- 1. created_at spoofing: the server always decides the time ----------
do $do$
declare t text;
begin
  foreach t in array array['messages','group_messages','friends','blocks','chat_groups','group_members','scores','duels','polls','profiles'] loop
    execute format('drop trigger if exists a1_stamp on public.%I', t);
    execute format('create trigger a1_stamp before insert on public.%I for each row execute function public.ll_stamp_created()', t);
  end loop;
  foreach t in array array['message_reactions','poll_votes'] loop   -- these two only have updated_at
    execute format('drop trigger if exists a1_stamp on public.%I', t);
    execute format('create trigger a1_stamp before insert or update on public.%I for each row execute function public.ll_stamp_updated()', t);
  end loop;
end $do$;

-- ---------- 7. writes need a registered device ----------
do $do$
declare t text;
begin
  foreach t in array array['messages','group_messages','scores','friends','polls','chat_groups','group_members'] loop
    execute format('drop trigger if exists a2_need_device on public.%I', t);
    execute format('create trigger a2_need_device before insert on public.%I for each row execute function public.ll_need_device_trg()', t);
  end loop;
  drop trigger if exists a2_need_device on public.profiles;
  create trigger a2_need_device before update on public.profiles for each row execute function public.ll_need_device_trg();
end $do$;

-- ---------- 2. rate limits, all based on ll_private.sent_log (deleting your rows cannot reset them) ----------
create index if not exists messages_created on public.messages (created_at);
create index if not exists group_messages_created on public.group_messages (created_at);
create index if not exists polls_created on public.polls (created_at);
create index if not exists friends_pending_created on public.friends (created_at) where status = 'pending';

-- messages: 30 per 5 minutes in total, 8 per minute per recipient (old per-insert 30-day delete moved to the cron job)
create or replace function public.message_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform ll_private.cap(new.from_id, 'msg', new.to_id::text, 8, interval '1 minute', 'message limit');
  perform ll_private.hit(new.from_id, 'msg', new.to_id::text, 30, interval '5 minutes', 'message limit');
  return new;
end $$;
drop trigger if exists message_limit on public.messages;
create trigger message_limit before insert on public.messages for each row execute function public.message_limit();

-- group messages: 30 per 5 minutes in total, 8 per minute per group
create or replace function public.group_message_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform ll_private.cap(new.from_id, 'gmsg', new.group_id::text, 8, interval '1 minute', 'message limit');
  perform ll_private.hit(new.from_id, 'gmsg', new.group_id::text, 30, interval '5 minutes', 'message limit');
  return new;
end $$;
drop trigger if exists group_message_limit on public.group_messages;
create trigger group_message_limit before insert on public.group_messages for each row execute function public.group_message_limit();

-- friend requests: 20 per hour. Slots: see section 10.
-- group invites: 10 per hour per inviter; declined / left (group, user) cannot be invited again for 24 h
create or replace function public.group_members_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and new.invited_by is not null and new.invited_by <> new.user_id then
    perform ll_private.hit(new.invited_by, 'ginv', new.group_id::text, 10, interval '1 hour', 'invite limit');
    if exists (select 1 from ll_private.group_tomb t where t.group_id = new.group_id and t.user_id = new.user_id and t.at > now() - interval '24 hours') then
      raise exception 'not allowed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists group_members_limit on public.group_members;
create trigger group_members_limit before insert on public.group_members for each row execute function public.group_members_limit();
create or replace function public.group_members_tomb() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.user_id = auth.uid() then   -- declined or left (not a kick, not a cascade)
    insert into ll_private.group_tomb(group_id, user_id) values (old.group_id, old.user_id)
      on conflict (group_id, user_id) do update set at = now();
  end if;
  return old;
end $$;
drop trigger if exists group_members_tomb on public.group_members;
create trigger group_members_tomb after delete on public.group_members for each row execute function public.group_members_tomb();

-- reactions 40 per minute, poll votes 60 per 5 minutes, blocks 20 per hour
create or replace function public.message_reactions_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.message_id := old.message_id; new.user_id := old.user_id; end if;
  new.updated_at := now();
  perform ll_private.hit(new.user_id, 'react', null, 40, interval '1 minute', 'reaction limit');
  return new;
end $$;
drop trigger if exists message_reactions_guard on public.message_reactions;
create trigger message_reactions_guard before insert or update on public.message_reactions for each row execute function public.message_reactions_guard();
create or replace function public.poll_votes_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.poll_id := old.poll_id; new.user_id := old.user_id; end if;
  if new.choice >= coalesce((select cardinality(options) from public.polls where id = new.poll_id), 0) then raise exception 'bad choice'; end if;
  new.updated_at := now();
  perform ll_private.hit(new.user_id, 'vote', null, 60, interval '5 minutes', 'vote limit');
  return new;
end $$;
drop trigger if exists poll_votes_guard on public.poll_votes;
create trigger poll_votes_guard before insert or update on public.poll_votes for each row execute function public.poll_votes_guard();
create or replace function public.blocks_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  perform ll_private.hit(new.blocker, 'block', new.blocked::text, 20, interval '1 hour', 'block limit');
  if (select count(*) from public.blocks where blocker = new.blocker) >= 200 then raise exception 'block limit'; end if;
  return new;
end $$;
drop trigger if exists blocks_limit on public.blocks;
create trigger blocks_limit before insert on public.blocks for each row execute function public.blocks_limit();

-- duels: 20 inserts per hour
create or replace function public.duels_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.p1 is not null then perform ll_private.hit(new.p1, 'duel', null, 20, interval '1 hour', 'duel limit'); end if;
  return new;
end $$;
drop trigger if exists duels_limit on public.duels;
create trigger duels_limit before insert on public.duels for each row execute function public.duels_limit();

-- the one cleanup job (replaces all per-insert deletes). Rows older than 1 day in the logs, old chat, stale requests.
create or replace function ll_private.cleanup() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from ll_private.sent_log where at < now() - interval '1 day';
  delete from ll_private.rate where at < now() - interval '1 day';
  delete from ll_private.group_tomb where at < now() - interval '1 day';
  delete from ll_private.recovered_sessions where at < now() - interval '1 day' or session_id not in (select id from auth.sessions);
  update ll_private.accounts set recovered_at = null where recovered_at < now() - interval '1 day';
  delete from public.messages where created_at < now() - interval '30 days';
  delete from public.group_messages where created_at < now() - interval '30 days';
  delete from public.polls where created_at < now() - interval '14 days';
  delete from public.friends where status = 'pending' and created_at < now() - interval '7 days';   -- section 10
end $$;
select cron.unschedule('ll-cleanup') where exists (select 1 from cron.job where jobname = 'll-cleanup');
select cron.schedule('ll-cleanup', '*/10 * * * *', $$select ll_private.cleanup()$$);

-- ---------- 3. free-text holes ----------
create table if not exists public.cities (id text primary key check (id ~ '^[a-z]{2,20}$'));
insert into public.cities(id) values ('practice'),('seattle'),('amsterdam'),('london'),('cairo'),('bangkok'),('tokyo'),('mumbai'),('hongkong'),('istanbul'),
  ('sydney'),('sanfrancisco'),('rio'),('newyork'),('paris'),('singapore'),('seoul'),('capetown'),('toronto') on conflict do nothing;
-- when a city is added to the game: insert into public.cities(id) values ('newcity');
alter table public.cities enable row level security;
drop policy if exists "cities readable" on public.cities;
create policy "cities readable" on public.cities for select using (true);
revoke insert, update, delete, truncate on public.cities from anon, authenticated;

-- tiles (chatdata.js) that have a slot, and what kind of slot (city ids come from public.cities; mode/time/thing are fixed below)
create table if not exists public.chat_slot_tiles (id int primary key, slot text not null check (slot in ('city','mode','time','thing')));
insert into public.chat_slot_tiles(id, slot)
select x, 'city' from unnest(array[46,47,48,275,280,327,328,329,330,331,332,333]) x
union all select x, 'mode' from unnest(array[49,50,51,276]) x
union all select x, 'time' from unnest(array[52,53,54,129,135,287,288,289]) x
union all select x, 'thing' from unnest(array[100,101,102,103,104,175,176,177,178,277,278,279,361]) x
on conflict (id) do update set slot = excluded.slot;
alter table public.chat_slot_tiles enable row level security;
drop policy if exists "slot tiles readable" on public.chat_slot_tiles;
create policy "slot tiles readable" on public.chat_slot_tiles for select using (true);
revoke insert, update, delete, truncate on public.chat_slot_tiles from anon, authenticated;

-- room codes only on kind 3 (duel room) and 36 (co-op party), exactly 4 capital letters
alter table public.messages drop constraint if exists messages_room_ok;
alter table public.messages add constraint messages_room_ok check (room is null or (k in (3, 36) and room ~ '^[A-Z]{4}$')) not valid;

-- challenge-card city must be a real city; tile slots must be allowed for their tile
create or replace function public.messages_card_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.card_city is not null and not exists (select 1 from public.cities c where c.id = new.card_city) then raise exception 'bad city'; end if;
  return new;
end $$;
drop trigger if exists messages_card_check on public.messages;
create trigger messages_card_check before insert on public.messages for each row execute function public.messages_card_check();

create or replace function public.chat_slots_check() returns trigger language plpgsql security definer set search_path = public as $$
declare i int; v text; kind text;
begin
  if new.tiles is null then
    if new.slots is not null or (new.emo is not null and (array_ndims(new.emo) is distinct from 1 or array_lower(new.emo, 1) <> 1)) then raise exception 'bad message'; end if;
    return new;
  end if;
  -- arrays must start at index 1 (a shifted array would make slots[i] look empty and skip the checks)
  if array_ndims(new.tiles) is distinct from 1 or array_lower(new.tiles, 1) <> 1
     or new.slots is null or array_ndims(new.slots) is distinct from 1 or array_lower(new.slots, 1) <> 1 or cardinality(new.slots) <> cardinality(new.tiles)
     or (new.emo is not null and (array_ndims(new.emo) is distinct from 1 or array_lower(new.emo, 1) <> 1)) then raise exception 'bad message'; end if;
  for i in 1 .. cardinality(new.tiles) loop
    v := new.slots[i];
    if v is null then continue; end if;
    select s.slot into kind from public.chat_slot_tiles s where s.id = new.tiles[i];
    if kind is null then raise exception 'bad message'; end if;                       -- slot given for a tile that has none
    if kind = 'city' then
      if not exists (select 1 from public.cities c where c.id = v) then raise exception 'bad message'; end if;
    elsif kind = 'mode' then
      if v <> all (array['classic','plus','duel','coop','daily','weekly']) then raise exception 'bad message'; end if;
    elsif kind = 'time' then
      if v <> all (array['now','soon','later','tonight','tomorrow','weekend']) then raise exception 'bad message'; end if;
    elsif kind = 'thing' then
      if v <> all (array['bridges','tunnels','roundabouts','lights','motorways','roads','houses','workplaces','upgrades','shortcuts']) then raise exception 'bad message'; end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists chat_slots_check on public.messages;
create trigger chat_slots_check before insert on public.messages for each row execute function public.chat_slots_check();
drop trigger if exists chat_slots_check on public.group_messages;
create trigger chat_slots_check before insert on public.group_messages for each row execute function public.chat_slots_check();

-- polls: template 0 options must be real cities; limit 10 per hour; no per-insert delete any more (cron)
create or replace function public.polls_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.options is null or array_ndims(new.options) is distinct from 1 or array_lower(new.options, 1) <> 1 then raise exception 'bad poll'; end if;
  if new.template = 0 then
    if cardinality(new.options) < 2 or cardinality(new.options) > 4 then raise exception 'bad poll'; end if;
    if exists (select 1 from unnest(new.options) o where o is null) then raise exception 'bad poll'; end if;
    if (select count(distinct x) from unnest(new.options) x) <> cardinality(new.options) then raise exception 'bad poll'; end if;
    if (select count(*) from public.cities c where c.id = any (new.options)) <> cardinality(new.options) then raise exception 'bad poll'; end if;
  elsif new.template = 1 then new.options := array['classic','plus'];
  elsif new.template = 2 then new.options := array['duel','coop'];
  elsif new.template = 3 then new.options := array['survival','sprint'];
  elsif new.template = 4 then new.options := array['now','later'];
  end if;
  new.created_at := now();
  perform ll_private.hit(new.from_id, 'poll', null, 10, interval '1 hour', 'poll limit');
  return new;
end $$;
drop trigger if exists polls_guard on public.polls;
create trigger polls_guard before insert on public.polls for each row execute function public.polls_guard();

-- ---------- 4. nicknames, enforced on the server ----------
alter table public.profiles add column if not exists nick_key text;
alter table public.profiles add column if not exists nick_changed_at timestamptz;

-- flat form: lowercase, 0->o 1->i 3->e 4->a 5->s 7->t 8->b @->a $->s, separators _ - removed. key: repeated letters collapsed.
create or replace function ll_private.nick_flat(n text) returns text language sql immutable as $f$
  select translate(lower(coalesce(n, '')), '0134578@$_-', 'oieastbas') $f$;
create or replace function ll_private.nick_key(n text) returns text language sql immutable as $f$
  select regexp_replace(ll_private.nick_flat(n), '(.)\1+', '\1', 'g') $f$;

-- returns null when the nickname is fine, otherwise a short reason
create or replace function ll_private.nick_problem(n text) returns text language plpgsql stable security definer set search_path = public as $$
declare
  flat text := ll_private.nick_flat(n);
  k text := ll_private.nick_key(n);
  low text := lower(coalesce(n, ''));
  toks text[];
  hard text[] := array['fuck','fvck','phuck','shit','shyt','bitch','biatch','cunt','nigga','nigger','nigg','faggot','fagg','retard','whore','slut','pussy','penis','vagina',
    'dildo','porn','blowjob','handjob','masturbat','orgasm','cumshot','jizz','twat','bastard','asshole','arsehole','dumbass','jackass','dickhead','dick','cock','douche',
    'paedo','pedophile','rapist','molest','incest','nazi','hitler','suicide','killyourself','killurself','ugly','stupid','idiot','chink','gook','wetback','beaner','kike',
    'tranny','negro','whitepower','terrorist','jihad','boob','kkk','admin','moderator','littlelanes','suckmy','suckmd','jewhat','whitepride',
    'tiktok','discord','instagram','snapchat','whatsapp','telegram','facebook','gmail','hotmail','school','skool'];
  soft text[] := array['ass','arse','anal','anus','sex','sexy','sext','rape','raped','raping','kill','kills','killer','killing','kys','kms','cum','tit','tits','boobs',
    'wank','wanker','pedo','spic','paki','hoe','dic','dik','fuk','fck','wtf','stfu','nude','nudes','naked','horny','fat','fatty','dumb','loser','die','hate','hater','haters','isis',
    'age','aged','yo','yr','yrs','snap','insta','ig','dc','kik','skype','email','phone','address','street','grade','official','staff','owner','support','mod','system','server'];
  w text; t text;
begin
  if n is null or n !~ '^[A-Za-z0-9_-]{3,16}$' then return 'pattern'; end if;
  -- no phone numbers / birth years / ages: 3+ digits in a row, or more than 4 digits in total
  if n ~ '[0-9]{3,}' or char_length(regexp_replace(n, '[^0-9]', '', 'g')) > 4 then return 'digits'; end if;
  if low ~ '(^|[^a-z])age[^a-z]*[0-9]' or low ~ '[0-9][^a-z0-9]*(yo|yr|yrs|yrold|year|years|yearold)($|[^a-z])' then return 'age'; end if;
  foreach w in array hard loop
    if flat like '%' || w || '%' then return 'word'; end if;
    if char_length(ll_private.nick_key(w)) >= 4 and k like '%' || ll_private.nick_key(w) || '%' then return 'word'; end if;   -- stretched: fuuuck
  end loop;
  -- tokens: split on _ - and digits/case changes (KysNow, Emma_Age11), also on the leet-translated form (4ss)
  toks := array(select lower(m[1]) from regexp_matches(n, '[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+', 'g') as m)
       || array(select x from regexp_split_to_table(translate(low, '0134578@$', 'oieastbas'), '[_-]+') x)
       || array(select x from regexp_split_to_table(low, '[_-]+') x);
  foreach t in array toks loop
    if t = '' then continue; end if;
    foreach w in array soft loop
      if ll_private.nick_key(t) = ll_private.nick_key(w) then return 'word'; end if;
    end loop;
    -- a real place name makes the nickname a location (Mia_Seattle)
    if exists (select 1 from public.cities c where c.id <> 'practice' and ll_private.nick_key(c.id) = ll_private.nick_key(t)) then return 'place'; end if;
  end loop;
  return null;
end $$;

-- existing nicknames: fill nick_key; if two old nicknames collide, the older keeps the plain key, the other gets a unique suffix (still works, can rename)
update public.profiles p set nick_key = case when r.rn = 1 then r.k else r.k || '~' || substr(p.id::text, 1, 8) end
from (select id, ll_private.nick_key(nickname) k, row_number() over (partition by ll_private.nick_key(nickname) order by created_at, id) rn from public.profiles) r
where r.id = p.id and p.nick_key is null;
create unique index if not exists profiles_nick_key_uq on public.profiles (nick_key);

alter table public.profiles drop constraint if exists profiles_avatar_ok;
alter table public.profiles add constraint profiles_avatar_ok check (avatar in ('🚗','🚕','🚙','🚌','🚎','🏎️','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚜','🛵','🚲','🚀','🦊','🐱','🐶','🐼','🐸','🦉','🌟','🔥')) not valid;
alter table public.profiles drop constraint if exists profiles_color_ok;
alter table public.profiles add constraint profiles_color_ok check (color in ('#e5622b','#d63c3c','#e8a317','#2f9e5b','#1f8a8a','#3b6fd8','#7a4fd1','#c24b9a','#5b6470')) not valid;
alter table public.profiles drop constraint if exists profiles_loadout_ok;
alter table public.profiles add constraint profiles_loadout_ok check (cardinality(emote_loadout) <= 8) not valid;

create or replace function public.profiles_nick_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare x int;
begin
  if tg_op = 'INSERT' then
    new.nick_changed_at := null;                      -- the first name is free
    if auth.uid() is not null and ll_private.nick_problem(new.nickname) is not null then raise exception 'bad nickname'; end if;
    new.nick_key := ll_private.nick_key(new.nickname);
  else
    new.nick_key := old.nick_key; new.nick_changed_at := old.nick_changed_at;   -- clients cannot touch these
    if new.nickname is distinct from old.nickname then
      if auth.uid() is not null then
        if old.nick_changed_at is not null and old.nick_changed_at > now() - interval '24 hours' then raise exception 'nickname changed recently'; end if;
        if ll_private.nick_problem(new.nickname) is not null then raise exception 'bad nickname'; end if;
      end if;
      new.nick_key := ll_private.nick_key(new.nickname);
      new.nick_changed_at := now();
    end if;
  end if;
  if new.emote_loadout is null or array_ndims(new.emote_loadout) is distinct from 1 or array_lower(new.emote_loadout, 1) <> 1 or cardinality(new.emote_loadout) > 8 then raise exception 'bad loadout'; end if;
  foreach x in array new.emote_loadout loop if x is null or x < 0 or x > 99 then raise exception 'bad loadout'; end if; end loop;
  return new;
end $$;
drop trigger if exists profiles_nick_guard on public.profiles;
create trigger profiles_nick_guard before insert or update on public.profiles for each row execute function public.profiles_nick_guard();

-- ---------- 5. friend codes (= login IDs) are no longer readable ----------
-- The game must switch (online.js): own code -> select public.my_friend_code(); add by code -> public.find_by_code(code).
-- Never select('*') or friend_code from profiles any more: it is "permission denied" for everyone, including yourself.
revoke select on public.profiles from anon, authenticated;
grant select (id, nickname, avatar, color, motto, status, created_at, emote_loadout) on public.profiles to anon, authenticated;

create or replace function public.my_friend_code() returns text language sql security definer stable set search_path = public as $$
  select p.friend_code from public.profiles p where p.id = auth.uid() $$;
create or replace function public.find_by_code(p_code text) returns table (id uuid, nickname text) language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if u is null then raise exception 'not signed in'; end if;
  perform ll_private.need_device();
  perform ll_private.hit(u, 'find', null, 30, interval '1 hour', 'rate limit');
  if char_length(c) <> 6 then return; end if;
  return query select p.id, p.nickname from public.profiles p where p.friend_code = c and not public.is_blocked(u, p.id) limit 1;
end $$;
revoke execute on function public.my_friend_code(), public.find_by_code(text) from public, anon;
grant execute on function public.my_friend_code(), public.find_by_code(text) to authenticated;

-- ---------- 6. login / recovery ----------
-- Attempts are RESERVED before the password is checked (so 1000 parallel guesses cannot all slip through) and refunded on success.
-- 'pend:<key>' = reserved, 'fail:<key>' = failed. Both count toward the limit. Exponential backoff after the 3rd failure.
create or replace function public.svc_try(p_key text, p_limit int, p_minutes int) returns int language plpgsql security definer set search_path = public as $$
declare n int; last_at timestamptz; kth timestamptz; win interval := make_interval(mins => p_minutes); w int;
begin
  perform pg_advisory_xact_lock(hashtextextended('ll-try:' || p_key, 0));
  select count(*), max(at) into n, last_at from ll_private.rate where key in ('fail:' || p_key, 'pend:' || p_key) and at > now() - win;
  if n >= p_limit then
    select at into kth from ll_private.rate where key in ('fail:' || p_key, 'pend:' || p_key) and at > now() - win order by at asc offset (n - p_limit) limit 1;
    return greatest(1, ceil(extract(epoch from (kth + win - now())))::int);
  end if;
  if n >= 3 then
    w := ceil(extract(epoch from (last_at + make_interval(secs => least(600, 10 * power(2, n - 3))) - now())))::int;
    if w > 0 then return w; end if;
  end if;
  insert into ll_private.rate(key) values ('pend:' || p_key);
  return 0;
end $$;
-- the attempt failed: the reservation becomes a recorded failure
create or replace function public.svc_fail(p_key text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ll-try:' || p_key, 0));
  update ll_private.rate set key = 'fail:' || p_key, at = now()
    where ctid = (select ctid from ll_private.rate where key = 'pend:' || p_key order by at desc limit 1);
  if not found then insert into ll_private.rate(key) values ('fail:' || p_key); end if;
end $$;
-- the attempt succeeded (or was refused elsewhere): give the reservation back
create or replace function public.svc_ok(p_key text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('ll-try:' || p_key, 0));
  delete from ll_private.rate where ctid = (select ctid from ll_private.rate where key = 'pend:' || p_key order by at desc limit 1);
end $$;
-- plain counters (atomic now). Keys starting login: or rec: are counted as failures through svc_try.
create or replace function public.svc_rate(p_key text, p_limit int, p_minutes int) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_key like 'login:%' or p_key like 'rec:%' then return public.svc_try(p_key, p_limit, p_minutes) = 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('ll-rate:' || p_key, 0));
  if (select count(*) from ll_private.rate where key = p_key and at > now() - make_interval(mins => p_minutes)) >= p_limit then return false; end if;
  insert into ll_private.rate(key) values (p_key); return true;
end $$;
create or replace function public.svc_is_recovered(p_user uuid, p_session uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from ll_private.recovered_sessions r where r.user_id = p_user and r.session_id = p_session and r.at > now() - interval '15 minutes') $$;

create or replace function public.svc_recover(p_login text, p_code text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare u uuid; h text;
begin
  select p.id, a.recovery_hash into u, h from public.profiles p join ll_private.accounts a on a.user_id = p.id where p.friend_code = upper(trim(p_login)) for update of a;
  if u is null or h is null or crypt(upper(trim(p_code)), h) <> h then return null; end if;
  update ll_private.accounts set recovery_hash = null, recovered_at = now() where user_id = u;   -- single use; the next new device of this account is marked "recovered"
  perform ll_private.log(u, 'signed in with recovery code', null);
  return u;
end $$;
-- wrong password tries are NOT written to the history any more (a counter in ll_private.rate, shown by account_status().bad_tries)
create or replace function public.svc_log(p_user uuid, p_event text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event = 'wrong password try' then return; end if;
  perform ll_private.log(p_user, p_event, null);
end $$;
create or replace function public.svc_password_set(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update ll_private.accounts set has_password = true where user_id = p_user;
  delete from ll_private.recovered_sessions where user_id = p_user;
  perform ll_private.log(p_user, 'changed password', null);
end $$;

-- a new device of an account that just used its recovery code becomes a "recovered session"
create or replace function public.register_device(p_label text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid := ll_private.sid(); u uuid := auth.uid(); n int; latest timestamptz;
begin
  if u is null or s is null then return jsonb_build_object('ok', false, 'reason', 'signed_out'); end if;
  if not exists (select 1 from auth.sessions where id = s) then
    delete from public.devices where session_id = s;
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ll-dev:' || u::text, 0));
  delete from auth.sessions where user_id = u and id in (select session_id from public.devices where user_id = u and session_id <> s and last_seen < now() - interval '60 days');
  delete from public.devices d where d.user_id = u and not exists (select 1 from auth.sessions x where x.id = d.session_id);
  if exists (select 1 from public.devices where session_id = s) then
    update public.devices set last_seen = now() where session_id = s;
  else
    select count(*) into n from public.devices where user_id = u;
    if n >= 2 then
      return jsonb_build_object('ok', false, 'reason', 'full', 'devices',
        (select jsonb_agg(jsonb_build_object('id', session_id, 'name', name, 'last_seen', last_seen) order by last_seen desc) from public.devices where user_id = u));
    end if;
    insert into public.devices(session_id, user_id, name) values (s, u, ll_private.clean_label(p_label));
    perform ll_private.log(u, 'signed in', ll_private.clean_label(p_label));
    if exists (select 1 from ll_private.accounts where user_id = u and recovered_at > now() - interval '30 minutes') then
      insert into ll_private.recovered_sessions(session_id, user_id) values (s, u) on conflict (session_id) do update set at = now();
      update ll_private.accounts set recovered_at = null where user_id = u;
    end if;
  end if;
  select max(created_at) into latest from public.devices where user_id = u and session_id <> s;
  return jsonb_build_object('ok', true, 'other_since', latest);
end $$;

-- sign out everywhere else: also forgets other "recovered" sessions (it already logs)
create or replace function public.kick_others() returns int language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); s uuid := ll_private.sid(); n int;
begin
  if u is null then return 0; end if;
  delete from auth.sessions where user_id = u and id <> s;
  get diagnostics n = row_count;
  delete from public.devices where user_id = u and session_id <> s;
  delete from ll_private.pair_codes where user_id = u;
  delete from ll_private.recovered_sessions where user_id = u and session_id <> s;
  perform ll_private.log(u, 'signed out everywhere else', null);
  return n;
end $$;

-- a device must be 10 minutes old (or a recovered session) before it can make a recovery code or set the parent email
create or replace function ll_private.trusted_device() returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.devices d where d.session_id = ll_private.sid() and d.user_id = auth.uid() and d.created_at <= now() - interval '10 minutes')
      or exists (select 1 from ll_private.recovered_sessions r where r.session_id = ll_private.sid() and r.user_id = auth.uid() and r.at > now() - interval '15 minutes') $$;

create or replace function public.make_recovery_code() returns text language plpgsql security definer set search_path = public, extensions as $$
declare u uuid := auth.uid(); a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text := ''; b bytea; i int;
begin
  if u is null or not exists (select 1 from public.devices where session_id = ll_private.sid()) then raise exception 'not signed in'; end if;
  if not ll_private.trusted_device() then raise exception 'new device, try again in 10 minutes'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ll-rc:' || u::text, 0));
  if (select count(*) from ll_private.rate where key = 'rc:' || u and at > now() - interval '1 hour') >= 5 then raise exception 'rate limit'; end if;
  insert into ll_private.rate(key) values ('rc:' || u);
  b := gen_random_bytes(16);
  for i in 0..15 loop c := c || substr(a, (get_byte(b, i) % 31) + 1, 1); if i in (3, 7, 11) then c := c || '-'; end if; end loop;
  insert into ll_private.accounts(user_id, recovery_hash) values (u, crypt(c, gen_salt('bf', 8)))
    on conflict (user_id) do update set recovery_hash = excluded.recovery_hash;
  perform ll_private.log(u, 'made a new recovery code', (select name from public.devices where session_id = ll_private.sid()));
  return c;
end $$;

create or replace function public.set_parent_email(p_email text) returns text language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); e text := lower(trim(p_email));
begin
  if u is null or not exists (select 1 from public.devices where session_id = ll_private.sid()) then raise exception 'not signed in'; end if;
  if not ll_private.trusted_device() then raise exception 'new device, try again in 10 minutes'; end if;
  if e <> '' and (char_length(e) > 120 or e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$') then raise exception 'bad email'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ll-pe:' || u::text, 0));
  if (select count(*) from ll_private.rate where key = 'pe:' || u and at > now() - interval '1 day') >= 3 then raise exception 'rate limit'; end if;
  insert into ll_private.rate(key) values ('pe:' || u);
  insert into ll_private.accounts(user_id, parent_email, parent_email_verified) values (u, nullif(e, ''), false)
    on conflict (user_id) do update set parent_email = nullif(e, ''), parent_email_verified = false;
  perform ll_private.log(u, case when e = '' then 'removed parent email' else 'changed parent email' end, (select name from public.devices where session_id = ll_private.sid()));
  return ll_private.mask(e);
end $$;

-- account screen: adds bad_tries (wrong password / failed sign-ins against this login in the last 24 h) and trusted_device
create or replace function public.account_status() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); a ll_private.accounts; code text;
begin
  if u is null then return null; end if;
  select * into a from ll_private.accounts where user_id = u;
  select friend_code into code from public.profiles where id = u;
  return jsonb_build_object(
    'has_password', coalesce(a.has_password, false), 'has_recovery', a.recovery_hash is not null,
    'parent', ll_private.mask(a.parent_email), 'parent_verified', coalesce(a.parent_email_verified, false),
    'this', ll_private.sid(),
    'trusted_device', ll_private.trusted_device(),
    'bad_tries', (select count(*) from ll_private.rate r where r.key = 'fail:login:' || code and r.at > now() - interval '1 day'),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('id', session_id, 'name', name, 'last_seen', last_seen, 'created_at', created_at) order by created_at), '[]') from public.devices where user_id = u),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('event', event, 'device', device, 'at', at) order by at desc), '[]') from (select * from public.account_log where user_id = u order by at desc limit 10) l));
end $$;

revoke execute on function public.svc_try(text,int,int), public.svc_fail(text), public.svc_ok(text), public.svc_rate(text,int,int), public.svc_is_recovered(uuid,uuid),
  public.svc_recover(text,text), public.svc_log(uuid,text), public.svc_password_set(uuid) from public, anon, authenticated;
grant execute on function public.svc_try(text,int,int), public.svc_fail(text), public.svc_ok(text), public.svc_rate(text,int,int), public.svc_is_recovered(uuid,uuid),
  public.svc_recover(text,text), public.svc_log(uuid,text), public.svc_password_set(uuid) to service_role;
revoke execute on function public.register_device(text), public.kick_others(), public.make_recovery_code(), public.set_parent_email(text), public.account_status() from public, anon;
grant execute on function public.register_device(text), public.kick_others(), public.make_recovery_code(), public.set_parent_email(text), public.account_status() to authenticated;

-- ---------- 8. scores and duels ----------
-- clients can never write kind 'duel' (only the server may)
drop policy if exists "own scores insert" on public.scores;
create policy "own scores insert" on public.scores for insert with check (user_id = auth.uid() and verified = false and kind in ('normal','daily','weekly','expert'));
alter table public.scores drop constraint if exists scores_sane;
alter table public.scores add constraint scores_sane check (week <= 300 and score <= 400 * week + 50 and char_length(coalesce(replay, '')) < 20000 and coalesce(char_length(key), 0) < 40) not valid;
create or replace function public.scores_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.cities c where c.id = new.city) then raise exception 'bad city'; end if;
  perform ll_private.hit(new.user_id, 'score', null, 120, interval '1 hour', 'score limit');
  return new;
end $$;
drop trigger if exists scores_limit on public.scores;
create trigger scores_limit before insert on public.scores for each row execute function public.scores_limit();

alter table public.duels drop constraint if exists duels_result_small;
alter table public.duels add constraint duels_result_small check (result is null or pg_column_size(result) < 2000) not valid;
alter table public.duels drop constraint if exists duels_shape_ok;
alter table public.duels add constraint duels_shape_ok check (city ~ '^[a-z]{2,20}$' and code ~ '^[A-Za-z0-9-]{3,40}$' and (room is null or room ~ '^[A-Z]{4}$')) not valid;

-- ---------- 9. groups: blocked pairs, owner kick ----------
create or replace function public.is_group_owner(g bigint) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.chat_groups c where c.id = g and c.owner = auth.uid()) $$;
revoke execute on function public.is_group_owner(bigint) from public, anon;
grant execute on function public.is_group_owner(bigint) to authenticated;
drop policy if exists "owner kicks" on public.group_members;
create policy "owner kicks" on public.group_members for delete using (user_id <> auth.uid() and public.is_group_owner(group_id));

-- an invitee who is blocked by / has blocked any accepted member cannot be invited (or accept)
create or replace function public.group_members_block_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invited_by is not null and new.invited_by <> new.user_id and public.is_blocked(new.invited_by, new.user_id) then raise exception 'not allowed'; end if;
  if new.status = 'pending' or (tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted') then
    if exists (select 1 from public.group_members m join public.blocks b
        on (b.blocker = m.user_id and b.blocked = new.user_id) or (b.blocker = new.user_id and b.blocked = m.user_id)
        where m.group_id = new.group_id and m.status = 'accepted' and m.user_id <> new.user_id) then raise exception 'not allowed'; end if;
  end if;
  return new;
end $$;
drop trigger if exists group_members_block_check on public.group_members;
create trigger group_members_block_check before insert on public.group_members for each row execute function public.group_members_block_check();
drop trigger if exists group_members_accept_check on public.group_members;
create trigger group_members_accept_check before update on public.group_members for each row execute function public.group_members_block_check();

-- ---------- 10. friend limits ----------
-- slots: your own pending requests + accepted friends (max 300). Incoming pending requests are capped separately at 50 and expire after 7 days (cron).
create or replace function public.friends_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform ll_private.hit(new.a, 'freq', new.b::text, 20, interval '1 hour', 'request limit');
  if (select count(*) from public.friends where (a = new.a and status = 'pending') or (status = 'accepted' and (a = new.a or b = new.a))) >= 300 then raise exception 'friend limit'; end if;
  if (select count(*) from public.friends where b = new.b and status = 'pending') >= 50 then raise exception 'request limit'; end if;
  return new;
end $$;
drop trigger if exists friends_limit on public.friends;
create trigger friends_limit before insert on public.friends for each row execute function public.friends_limit();
create or replace function public.friends_accept_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    if (select count(*) from public.friends where status = 'accepted' and (a = old.a or b = old.a)) >= 300
       or (select count(*) from public.friends where status = 'accepted' and (a = old.b or b = old.b)) >= 300 then raise exception 'friend limit'; end if;
  end if;
  return new;
end $$;
drop trigger if exists friends_accept_limit on public.friends;
create trigger friends_accept_limit before update on public.friends for each row execute function public.friends_accept_limit();

-- trigger functions are never meant to be called directly
do $do$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop;
end $do$;

-- ---------- 11. REALTIME AUTHORIZATION (private channels) ----------
-- The game must open every channel with  {config: {private: true, ...}}:
--   'll-online' (presence + broadcast), 'inbox:<uuid>', 'group:<id>', 'duel:<ROOM>', 'coop:<ROOM>'.
-- These policies only apply to PRIVATE channels. Public channels keep working until you turn off Realtime "Allow public access".
-- Room membership of duel:/coop: channels cannot be proven yet (rooms are not in a table): any registered player may join one by its 4-letter code.
-- Policies are checked when a client joins and when it sends a new JWT; revoking access takes effect on the next token refresh.
-- (Do NOT run "alter table realtime.messages enable row level security": it is already on and the statement fails for non-owners.)
create or replace function public.rt_allowed(p_topic text, p_ext text, p_op text) returns boolean language plpgsql security definer stable set search_path = public as $$
declare u uuid := auth.uid(); t text := regexp_replace(coalesce(p_topic, ''), '^realtime:', ''); target uuid;
begin
  if u is null or p_ext is null or p_ext not in ('broadcast', 'presence') then return false; end if;
  if not exists (select 1 from public.devices d where d.session_id = nullif(auth.jwt()->>'session_id','')::uuid and d.user_id = u) then return false; end if;
  if t = 'll-online' then return true; end if;
  if t ~ '^(duel|coop):[A-Z]{4}$' then return true; end if;
  if t ~ '^group:[0-9]{1,18}$' then return public.in_group(substr(t, 7)::bigint, true); end if;
  if t ~ '^inbox:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if p_ext <> 'broadcast' then return false; end if;
    target := substr(t, 7)::uuid;
    if p_op = 'select' then return target = u; end if;
    -- send: only an accepted friend of the owner, with no block either way
    return target <> u
      and exists (select 1 from public.friends f where f.status = 'accepted' and ((f.a = u and f.b = target) or (f.a = target and f.b = u)))
      and not exists (select 1 from public.blocks b where (b.blocker = u and b.blocked = target) or (b.blocker = target and b.blocked = u));
  end if;
  return false;
end $$;
revoke execute on function public.rt_allowed(text, text, text) from public, anon;
grant execute on function public.rt_allowed(text, text, text) to authenticated;

do $do$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found: skipping Realtime policies (enable Realtime Authorization first)';
    return;
  end if;
  drop policy if exists "ll realtime receive" on realtime.messages;
  create policy "ll realtime receive" on realtime.messages for select to authenticated
    using (public.rt_allowed((select realtime.topic()), realtime.messages.extension, 'select'));
  drop policy if exists "ll realtime send" on realtime.messages;
  create policy "ll realtime send" on realtime.messages for insert to authenticated
    with check (public.rt_allowed((select realtime.topic()), realtime.messages.extension, 'insert'));
end $do$;
