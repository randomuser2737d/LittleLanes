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
