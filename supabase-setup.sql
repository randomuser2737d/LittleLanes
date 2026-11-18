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
