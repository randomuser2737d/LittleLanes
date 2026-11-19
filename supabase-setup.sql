-- Little Lanes: online tables (accounts, leaderboards, duels, friends, emotes)
-- Paste all of this into Supabase: SQL Editor -> New query -> Run. Safe to run more than once.

-- Player profiles: nickname + friend code only (no email, no real names)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique not null check (nickname ~ '^[A-Za-z0-9_-]{3,16}$'),
  friend_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  emote_loadout int[] not null default '{0,1,2,3,4,5,6,7}',
  created_at timestamptz not null default now()
);

-- Progress synced across devices (unlocks, medals, achievements), one row per edition
create table if not exists public.progress (
  user_id uuid references auth.users(id) on delete cascade,
  edition text not null check (edition in ('classic','plus')),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, edition)
);

-- Scores for leaderboards
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  city text not null check (city ~ '^[a-z]{2,20}$'),
  edition text not null check (edition in ('classic','plus')),
  kind text not null check (kind in ('normal','daily','weekly','expert','duel')),
  key text,                                  -- date or week for daily/weekly, duel code for duels
  score int not null check (score between 0 and 100000),
  week int not null check (week between 1 and 999),
  replay text,                               -- move record, for checking later
  verified boolean not null default false,   -- only the server can set this
  created_at timestamptz not null default now()
);
create index if not exists scores_board on public.scores (city, edition, kind, score desc);

-- Duels
create table if not exists public.duels (
  id bigint generated always as identity primary key,
  code text unique not null,
  room text unique,                          -- 4-letter code for live rooms
  city text not null,
  seed int not null,
  rule text not null check (rule in ('S','W')),
  p1 uuid references auth.users(id) default auth.uid(),
  p2 uuid references auth.users(id),
  status text not null default 'waiting' check (status in ('waiting','playing','done')),
  result jsonb,
  created_at timestamptz not null default now()
);

-- Friends (added by friend code only)
create table if not exists public.friends (
  a uuid references auth.users(id) on delete cascade,
  b uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b)
);

-- Emotes earned by playing (never sold)
create table if not exists public.emote_unlocks (
  user_id uuid references auth.users(id) on delete cascade,
  emote_id int not null check (emote_id between 0 and 99),
  earned_at timestamptz not null default now(),
  primary key (user_id, emote_id)
);

-- Security rules: players can only change their own rows
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.scores enable row level security;
alter table public.duels enable row level security;
alter table public.friends enable row level security;
alter table public.emote_unlocks enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (id = auth.uid());

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "scores readable" on public.scores;
create policy "scores readable" on public.scores for select using (true);
drop policy if exists "own scores insert" on public.scores;
create policy "own scores insert" on public.scores for insert with check (user_id = auth.uid() and verified = false);

drop policy if exists "duels readable" on public.duels;
create policy "duels readable" on public.duels for select using (true);
drop policy if exists "create duel" on public.duels;
create policy "create duel" on public.duels for insert with check (p1 = auth.uid());
drop policy if exists "players update duel" on public.duels;
create policy "players update duel" on public.duels for update using (p1 = auth.uid() or p2 = auth.uid() or (p2 is null and status = 'waiting'));

drop policy if exists "own friendships" on public.friends;
create policy "own friendships" on public.friends for select using (a = auth.uid() or b = auth.uid());
drop policy if exists "send request" on public.friends;
create policy "send request" on public.friends for insert with check (a = auth.uid());
drop policy if exists "answer request" on public.friends;
create policy "answer request" on public.friends for update using (b = auth.uid());
drop policy if exists "remove friend" on public.friends;
create policy "remove friend" on public.friends for delete using (a = auth.uid() or b = auth.uid());

drop policy if exists "emotes readable" on public.emote_unlocks;
create policy "emotes readable" on public.emote_unlocks for select using (true);
drop policy if exists "own emotes" on public.emote_unlocks;
create policy "own emotes" on public.emote_unlocks for insert with check (user_id = auth.uid());

-- v49: profile customization (safe to run more than once)
alter table public.profiles add column if not exists avatar text not null default '🚗' check (char_length(avatar) <= 4);
alter table public.profiles add column if not exists color text not null default '#e5622b' check (color ~ '^#[0-9a-f]{6}$');
alter table public.profiles add column if not exists motto text not null default '' check (char_length(motto) <= 40);
alter table public.profiles drop constraint if exists profiles_motto_ok;
alter table public.profiles add constraint profiles_motto_ok check (motto in ('', 'Traffic? What traffic?', 'Roundabout fan', 'Bridge builder', 'Never late', 'Highway hero', 'Just one more road', 'GG every time', 'Map explorer', 'Daily puzzle pro'));
-- players can't change their own friend code or id
create or replace function public.lock_profile_fields() returns trigger language plpgsql as $$
begin new.id := old.id; new.friend_code := old.friend_code; new.created_at := old.created_at; return new; end $$;
drop trigger if exists lock_profile_fields on public.profiles;
create trigger lock_profile_fields before update on public.profiles for each row execute function public.lock_profile_fields();

-- v53: message history (pre-written messages only, stored as a number)
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  from_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  to_id uuid not null references auth.users(id) on delete cascade,
  k int not null check (k between 0 and 99),
  room text check (room ~ '^[A-Z]{4}$'),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_to on public.messages (to_id, read, created_at desc);
create index if not exists messages_pair on public.messages (from_id, to_id, created_at desc);
alter table public.messages enable row level security;
drop policy if exists "read own messages" on public.messages;
create policy "read own messages" on public.messages for select using (from_id = auth.uid() or to_id = auth.uid());
drop policy if exists "send to friends" on public.messages;
create policy "send to friends" on public.messages for insert with check (from_id = auth.uid() and read = false and exists (select 1 from public.friends f where f.status = 'accepted' and ((f.a = auth.uid() and f.b = to_id) or (f.b = auth.uid() and f.a = to_id))));
drop policy if exists "mark read" on public.messages;
create policy "mark read" on public.messages for update using (to_id = auth.uid());
drop policy if exists "delete own messages" on public.messages;
create policy "delete own messages" on public.messages for delete using (from_id = auth.uid() or to_id = auth.uid());
-- spam limit: 30 messages per 5 minutes per player; messages older than 30 days are cleaned up
create or replace function public.message_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.messages where from_id = new.from_id and created_at > now() - interval '5 minutes') >= 30 then raise exception 'message limit'; end if;
  delete from public.messages where created_at < now() - interval '30 days';
  return new;
end $$;
drop trigger if exists message_limit on public.messages;
create trigger message_limit before insert on public.messages for each row execute function public.message_limit();

-- v54: group chats (invite friends; they must accept). Names come from a fixed list; messages are numbers.
create table if not exists public.chat_groups (
  id bigint generated always as identity primary key,
  name text not null check (name in ('🚗 Road Crew','🌉 Bridge Club','🏙️ City Builders','🚦 Traffic Team','🏆 Duel Squad','🛣️ Highway Gang','🎉 Party Lane','🗺️ Map Makers','⭐ All Stars','🔥 Rush Hour')),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id bigint references public.chat_groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.group_messages (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.chat_groups(id) on delete cascade,
  from_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  k int not null check (k between 0 and 99),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_g on public.group_messages (group_id, created_at desc);
create or replace function public.in_group(g bigint, accepted_only boolean) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id = g and m.user_id = auth.uid() and (not accepted_only or m.status = 'accepted'));
$$;
alter table public.chat_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
drop policy if exists "see my groups" on public.chat_groups;
create policy "see my groups" on public.chat_groups for select using (owner = auth.uid() or public.in_group(id, false));
drop policy if exists "make group" on public.chat_groups;
create policy "make group" on public.chat_groups for insert with check (owner = auth.uid());
drop policy if exists "see members" on public.group_members;
create policy "see members" on public.group_members for select using (user_id = auth.uid() or public.in_group(group_id, true));
drop policy if exists "add members" on public.group_members;
create policy "add members" on public.group_members for insert with check (
  invited_by = auth.uid() and (
    (user_id = auth.uid() and status = 'accepted' and exists (select 1 from public.chat_groups c where c.id = group_id and c.owner = auth.uid()))
    or (status = 'pending' and public.in_group(group_id, true)
        and (select count(*) from public.group_members x where x.group_id = group_members.group_id) < 8
        and exists (select 1 from public.friends f where f.status = 'accepted' and ((f.a = auth.uid() and f.b = user_id) or (f.b = auth.uid() and f.a = user_id))))));
drop policy if exists "accept invite" on public.group_members;
create policy "accept invite" on public.group_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "leave group" on public.group_members;
create policy "leave group" on public.group_members for delete using (user_id = auth.uid());
drop policy if exists "read group messages" on public.group_messages;
create policy "read group messages" on public.group_messages for select using (public.in_group(group_id, true));
drop policy if exists "send group messages" on public.group_messages;
create policy "send group messages" on public.group_messages for insert with check (from_id = auth.uid() and public.in_group(group_id, true));
create or replace function public.group_message_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.group_messages where from_id = new.from_id and created_at > now() - interval '5 minutes') >= 30 then raise exception 'message limit'; end if;
  delete from public.group_messages where created_at < now() - interval '30 days';
  return new;
end $$;
drop trigger if exists group_message_limit on public.group_messages;
create trigger group_message_limit before insert on public.group_messages for each row execute function public.group_message_limit();

-- v56: security hardening (safe to run more than once)
-- Friends: a request can only be created as 'pending'; only the receiver can accept; nobody can rewrite a/b.
drop policy if exists "send request" on public.friends;
create policy "send request" on public.friends for insert with check (a = auth.uid() and a <> b and status = 'pending');
drop policy if exists "answer request" on public.friends;
create policy "answer request" on public.friends for update using (b = auth.uid()) with check (b = auth.uid() and status = 'accepted');
create or replace function public.friends_guard() returns trigger language plpgsql as $$
begin new.a := old.a; new.b := old.b; new.created_at := old.created_at; return new; end $$;
drop trigger if exists friends_guard on public.friends;
create trigger friends_guard before update on public.friends for each row execute function public.friends_guard();
create or replace function public.friends_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.friends where a = new.a and created_at > now() - interval '1 hour') >= 20 then raise exception 'request limit'; end if;
  if (select count(*) from public.friends where a = new.a or b = new.a) >= 300 then raise exception 'friend limit'; end if;
  return new;
end $$;
drop trigger if exists friends_limit on public.friends;
create trigger friends_limit before insert on public.friends for each row execute function public.friends_limit();

-- Messages: the receiver may only flip "read"; sender, receiver, text number and room can never be rewritten.
create or replace function public.messages_guard() returns trigger language plpgsql as $$
begin new.id := old.id; new.from_id := old.from_id; new.to_id := old.to_id; new.k := old.k; new.room := old.room; new.created_at := old.created_at; return new; end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages for each row execute function public.messages_guard();

-- Group members: an invitee may only accept. They cannot move themselves to another group (primary key) or change who invited them.
create or replace function public.group_members_guard() returns trigger language plpgsql as $$
begin
  new.group_id := old.group_id; new.user_id := old.user_id; new.invited_by := old.invited_by; new.created_at := old.created_at;
  if old.status = 'accepted' then new.status := 'accepted'; end if;
  return new;
end $$;
drop trigger if exists group_members_guard on public.group_members;
create trigger group_members_guard before update on public.group_members for each row execute function public.group_members_guard();
create or replace function public.chat_groups_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.chat_groups where owner = new.owner) >= 10 then raise exception 'group limit'; end if;
  return new;
end $$;
drop trigger if exists chat_groups_limit on public.chat_groups;
create trigger chat_groups_limit before insert on public.chat_groups for each row execute function public.chat_groups_limit();

-- Profiles: the server picks the friend code (= login ID) and creation time; clients cannot choose them.
create or replace function public.profile_insert_defaults() returns trigger language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.profiles where friend_code = c);
  end loop;
  new.friend_code := c; new.created_at := now();
  return new;
end $$;
drop trigger if exists profile_insert_defaults on public.profiles;
create trigger profile_insert_defaults before insert on public.profiles for each row execute function public.profile_insert_defaults();

-- Duels: nobody can rewrite who/what a duel is; strangers may only take the empty second seat of a waiting duel.
create or replace function public.duels_guard() returns trigger language plpgsql as $$
begin
  new.id := old.id; new.code := old.code; new.room := old.room; new.city := old.city; new.seed := old.seed; new.rule := old.rule; new.p1 := old.p1; new.created_at := old.created_at;
  if auth.uid() is distinct from old.p1 then
    new.result := old.result;
    if old.p2 is null and old.status = 'waiting' then new.p2 := auth.uid(); new.status := case when new.status = 'playing' then 'playing' else old.status end;
    else new.p2 := old.p2; new.status := old.status; end if;
  elsif old.p2 is not null then new.p2 := old.p2;
  end if;
  return new;
end $$;
drop trigger if exists duels_guard on public.duels;
create trigger duels_guard before update on public.duels for each row execute function public.duels_guard();

-- Scores: at most 120 per hour per player. Progress: small documents only.
create or replace function public.scores_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.scores where user_id = new.user_id and created_at > now() - interval '1 hour') >= 120 then raise exception 'score limit'; end if;
  return new;
end $$;
drop trigger if exists scores_limit on public.scores;
create trigger scores_limit before insert on public.scores for each row execute function public.scores_limit();
alter table public.progress drop constraint if exists progress_small;
alter table public.progress add constraint progress_small check (pg_column_size(data) < 30000) not valid;

-- v57: friend features (safe to run more than once)
-- Everything here is a number or a fixed id. No player can store free text.

-- Blocks. Only the blocker can see or change their own rows.
create table if not exists public.blocks (
  blocker uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "see my blocks" on public.blocks;
create policy "see my blocks" on public.blocks for select using (blocker = auth.uid());
drop policy if exists "block someone" on public.blocks;
create policy "block someone" on public.blocks for insert with check (blocker = auth.uid() and blocker <> blocked);
drop policy if exists "unblock" on public.blocks;
create policy "unblock" on public.blocks for delete using (blocker = auth.uid());
create or replace function public.blocks_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.blocks where blocker = new.blocker and created_at > now() - interval '1 hour') >= 20 then raise exception 'block limit'; end if;
  if (select count(*) from public.blocks where blocker = new.blocker) >= 200 then raise exception 'block limit'; end if;
  return new;
end $$;
drop trigger if exists blocks_limit on public.blocks;
create trigger blocks_limit before insert on public.blocks for each row execute function public.blocks_limit();
-- true when a block exists either way between two players. Only answers for the signed-in player's own pairs.
create or replace function public.is_blocked(x uuid, y uuid) returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() in (x, y) and exists (select 1 from public.blocks b where (b.blocker = x and b.blocked = y) or (b.blocker = y and b.blocked = x));
$$;
-- friend requests, messages and group invites are refused when either player blocked the other
create or replace function public.friends_block_check() returns trigger language plpgsql as $$
begin if public.is_blocked(new.a, new.b) then raise exception 'not allowed'; end if; return new; end $$;
drop trigger if exists friends_block_check on public.friends;
create trigger friends_block_check before insert or update on public.friends for each row execute function public.friends_block_check();
create or replace function public.messages_block_check() returns trigger language plpgsql as $$
begin if public.is_blocked(new.from_id, new.to_id) then raise exception 'not allowed'; end if; return new; end $$;
drop trigger if exists messages_block_check on public.messages;
create trigger messages_block_check before insert on public.messages for each row execute function public.messages_block_check();
create or replace function public.group_members_block_check() returns trigger language plpgsql as $$
begin if new.invited_by is not null and new.invited_by <> new.user_id and public.is_blocked(new.invited_by, new.user_id) then raise exception 'not allowed'; end if; return new; end $$;
drop trigger if exists group_members_block_check on public.group_members;
create trigger group_members_block_check before insert on public.group_members for each row execute function public.group_members_block_check();

-- Status picker: a number from the fixed list in the game (0..10 allowed, 0..5 used). At most 30 changes per hour.
alter table public.profiles add column if not exists status int check (status between 0 and 10);
alter table public.profiles add column if not exists status_log timestamptz[] not null default '{}';
create or replace function public.profile_status_limit() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_log := coalesce((select array_agg(t) from unnest(old.status_log) t where t > now() - interval '1 hour'), '{}'::timestamptz[]) || now();
    if cardinality(new.status_log) > 30 then raise exception 'status limit'; end if;
  else
    new.status_log := old.status_log;
  end if;
  return new;
end $$;
drop trigger if exists profile_status_limit on public.profiles;
create trigger profile_status_limit before update on public.profiles for each row execute function public.profile_status_limit();

-- Challenge cards ride on messages: k 34 = challenge, 35 = reply (both need a city, seed and score), 36 = co-op party invite (uses room).
alter table public.messages add column if not exists card_city text check (card_city ~ '^[a-z]{2,20}$');
alter table public.messages add column if not exists card_seed int;
alter table public.messages add column if not exists card_score int check (card_score between 0 and 100000);
alter table public.messages drop constraint if exists messages_card_ok;
alter table public.messages add constraint messages_card_ok check (
  (k in (34, 35) and card_city is not null and card_seed is not null and card_score is not null)
  or (k not in (34, 35) and card_city is null and card_seed is null and card_score is null));
create or replace function public.messages_guard() returns trigger language plpgsql as $$
begin new.id := old.id; new.from_id := old.from_id; new.to_id := old.to_id; new.k := old.k; new.room := old.room; new.created_at := old.created_at;
  new.card_city := old.card_city; new.card_seed := old.card_seed; new.card_score := old.card_score; return new; end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages for each row execute function public.messages_guard();

-- Reactions on messages: 6 emoji (0..5). Only the two people in the message can see them; you can only change your own.
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  r int not null check (r between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create or replace function public.can_see_message(mid bigint) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.messages m where m.id = mid and (m.from_id = auth.uid() or m.to_id = auth.uid()));
$$;
alter table public.message_reactions enable row level security;
drop policy if exists "see reactions" on public.message_reactions;
create policy "see reactions" on public.message_reactions for select using (public.can_see_message(message_id));
drop policy if exists "add reaction" on public.message_reactions;
create policy "add reaction" on public.message_reactions for insert with check (user_id = auth.uid() and public.can_see_message(message_id));
drop policy if exists "change reaction" on public.message_reactions;
create policy "change reaction" on public.message_reactions for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_message(message_id));
drop policy if exists "remove reaction" on public.message_reactions;
create policy "remove reaction" on public.message_reactions for delete using (user_id = auth.uid());
create or replace function public.message_reactions_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.message_id := old.message_id; new.user_id := old.user_id; end if;
  new.updated_at := now();
  if (select count(*) from public.message_reactions where user_id = new.user_id and updated_at > now() - interval '1 minute') >= 40 then raise exception 'reaction limit'; end if;
  return new;
end $$;
drop trigger if exists message_reactions_guard on public.message_reactions;
create trigger message_reactions_guard before insert or update on public.message_reactions for each row execute function public.message_reactions_guard();

-- Polls from templates (1:1 between friends, or in a group chat). Options are fixed keywords or city ids, checked here.
create table if not exists public.polls (
  id bigint generated always as identity primary key,
  group_id bigint references public.chat_groups(id) on delete cascade,
  to_id uuid references auth.users(id) on delete cascade,
  from_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  template int not null check (template between 0 and 4),
  options text[] not null check (cardinality(options) between 2 and 4),
  created_at timestamptz not null default now(),
  check ((group_id is null) <> (to_id is null))
);
create index if not exists polls_group on public.polls (group_id, created_at desc);
create index if not exists polls_pair on public.polls (from_id, to_id, created_at desc);
create table if not exists public.poll_votes (
  poll_id bigint not null references public.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  choice int not null check (choice between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
-- who may see and vote: the two friends of a 1:1 poll (still friends), or accepted members of the group
create or replace function public.can_see_poll(pid bigint) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.polls p where p.id = pid and (
    (p.group_id is null and auth.uid() in (p.from_id, p.to_id)
      and exists (select 1 from public.friends f where f.status = 'accepted' and ((f.a = p.from_id and f.b = p.to_id) or (f.a = p.to_id and f.b = p.from_id))))
    or (p.group_id is not null and public.in_group(p.group_id, true))));
$$;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
drop policy if exists "see polls" on public.polls;
create policy "see polls" on public.polls for select using (public.can_see_poll(id));
drop policy if exists "make poll" on public.polls;
create policy "make poll" on public.polls for insert with check (from_id = auth.uid() and (
  (group_id is not null and to_id is null and public.in_group(group_id, true))
  or (group_id is null and to_id is not null and to_id <> auth.uid() and exists (select 1 from public.friends f where f.status = 'accepted' and ((f.a = auth.uid() and f.b = to_id) or (f.b = auth.uid() and f.a = to_id))))));
drop policy if exists "delete own poll" on public.polls;
create policy "delete own poll" on public.polls for delete using (from_id = auth.uid());
drop policy if exists "see votes" on public.poll_votes;
create policy "see votes" on public.poll_votes for select using (public.can_see_poll(poll_id));
drop policy if exists "cast vote" on public.poll_votes;
create policy "cast vote" on public.poll_votes for insert with check (user_id = auth.uid() and public.can_see_poll(poll_id));
drop policy if exists "change vote" on public.poll_votes;
create policy "change vote" on public.poll_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_poll(poll_id));
drop policy if exists "remove vote" on public.poll_votes;
create policy "remove vote" on public.poll_votes for delete using (user_id = auth.uid());
create or replace function public.polls_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare o text;
begin
  if new.template = 0 then
    if new.options is null or cardinality(new.options) < 2 or cardinality(new.options) > 4 then raise exception 'bad poll'; end if;
    foreach o in array new.options loop
      if o is null or o !~ '^[a-z]{2,20}$' then raise exception 'bad poll'; end if;
    end loop;
    if (select count(distinct x) from unnest(new.options) x) <> cardinality(new.options) then raise exception 'bad poll'; end if;
  elsif new.template = 1 then new.options := array['classic','plus'];
  elsif new.template = 2 then new.options := array['duel','coop'];
  elsif new.template = 3 then new.options := array['survival','sprint'];
  elsif new.template = 4 then new.options := array['now','later'];
  end if;
  new.created_at := now();
  if (select count(*) from public.polls where from_id = new.from_id and created_at > now() - interval '1 hour') >= 10 then raise exception 'poll limit'; end if;
  delete from public.polls where created_at < now() - interval '14 days';
  return new;
end $$;
drop trigger if exists polls_guard on public.polls;
create trigger polls_guard before insert on public.polls for each row execute function public.polls_guard();
create or replace function public.poll_votes_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.poll_id := old.poll_id; new.user_id := old.user_id; end if;
  if new.choice >= coalesce((select cardinality(options) from public.polls where id = new.poll_id), 0) then raise exception 'bad choice'; end if;
  new.updated_at := now();
  if (select count(*) from public.poll_votes where user_id = new.user_id and updated_at > now() - interval '5 minutes') >= 60 then raise exception 'vote limit'; end if;
  return new;
end $$;
drop trigger if exists poll_votes_guard on public.poll_votes;
create trigger poll_votes_guard before insert or update on public.poll_votes for each row execute function public.poll_votes_guard();

-- v58: tile chat. Kind 37 = a tile message made from the fixed phrase list (chatdata.js): phrase numbers, optional slot ids (city/mode/time/thing) and emoji numbers.
-- No free text exists anywhere. The server checks shape and limits; the game checks that each phrase number is a real phrase (and drops messages that are not).
alter table public.messages add column if not exists tiles int[];
alter table public.messages add column if not exists slots text[];
alter table public.messages add column if not exists emo int[];
alter table public.group_messages add column if not exists tiles int[];
alter table public.group_messages add column if not exists slots text[];
alter table public.group_messages add column if not exists emo int[];
create or replace function public.chat_tiles_ok(t int[], s text[], e int[]) returns boolean language plpgsql immutable as $$
declare x int; y text; i int;
begin
  if t is not null then
    if cardinality(t) < 1 or cardinality(t) > 3 then return false; end if;
    foreach x in array t loop if x is null or x < 1 or x > 999 then return false; end if; end loop;
    if s is null or cardinality(s) <> cardinality(t) then return false; end if;
    for i in 1 .. cardinality(s) loop y := s[i]; if y is not null and y !~ '^[a-z]{2,20}$' then return false; end if; end loop;
  else
    if s is not null then return false; end if;
    if e is null or cardinality(e) < 1 then return false; end if;
  end if;
  if e is not null then
    if cardinality(e) > 3 then return false; end if;
    foreach x in array e loop if x is null or x < 0 or x > 39 then return false; end if; end loop;
  end if;
  return true;
end $$;
alter table public.messages drop constraint if exists messages_tiles_ok;
alter table public.messages add constraint messages_tiles_ok check (
  (k = 37 and public.chat_tiles_ok(tiles, slots, emo))
  or (k <> 37 and tiles is null and slots is null and emo is null));
alter table public.group_messages drop constraint if exists group_messages_tiles_ok;
alter table public.group_messages add constraint group_messages_tiles_ok check (
  (k = 37 and public.chat_tiles_ok(tiles, slots, emo))
  or (k <> 37 and tiles is null and slots is null and emo is null));
-- the receiver may only flip "read": the tile columns can never be rewritten (messages_guard replaced, group_messages_guard new)
create or replace function public.messages_guard() returns trigger language plpgsql as $$
begin new.id := old.id; new.from_id := old.from_id; new.to_id := old.to_id; new.k := old.k; new.room := old.room; new.created_at := old.created_at;
  new.card_city := old.card_city; new.card_seed := old.card_seed; new.card_score := old.card_score;
  new.tiles := old.tiles; new.slots := old.slots; new.emo := old.emo; return new; end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages for each row execute function public.messages_guard();
create or replace function public.group_messages_guard() returns trigger language plpgsql as $$
begin new.id := old.id; new.group_id := old.group_id; new.from_id := old.from_id; new.k := old.k; new.created_at := old.created_at;
  new.tiles := old.tiles; new.slots := old.slots; new.emo := old.emo; return new; end $$;
drop trigger if exists group_messages_guard on public.group_messages;
create trigger group_messages_guard before update on public.group_messages for each row execute function public.group_messages_guard();
-- the same tile message cannot go to the same chat twice within 10 seconds (the existing 30 per 5 minutes limits stay)
create or replace function public.messages_dup_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.k = 37 and exists (select 1 from public.messages m where m.from_id = new.from_id and m.to_id = new.to_id and m.k = 37
      and m.tiles is not distinct from new.tiles and m.slots is not distinct from new.slots and m.emo is not distinct from new.emo
      and m.created_at > now() - interval '10 seconds') then raise exception 'message limit'; end if;
  return new;
end $$;
drop trigger if exists messages_dup_check on public.messages;
create trigger messages_dup_check before insert on public.messages for each row execute function public.messages_dup_check();
create or replace function public.group_messages_dup_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.k = 37 and exists (select 1 from public.group_messages m where m.from_id = new.from_id and m.group_id = new.group_id and m.k = 37
      and m.tiles is not distinct from new.tiles and m.slots is not distinct from new.slots and m.emo is not distinct from new.emo
      and m.created_at > now() - interval '10 seconds') then raise exception 'message limit'; end if;
  return new;
end $$;
drop trigger if exists group_messages_dup_check on public.group_messages;
create trigger group_messages_dup_check before insert on public.group_messages for each row execute function public.group_messages_dup_check();
