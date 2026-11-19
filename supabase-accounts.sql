-- Little Lanes v55: secure sign-in (pairing code + QR, login ID + password, recovery code), 2-device limit.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run more than once.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

-- Private data: not reachable from the game at all (this schema is not exposed to the API).
create schema if not exists ll_private;
revoke all on schema ll_private from anon, authenticated, public;
create table if not exists ll_private.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_email text unique,              -- secret made-up address, never shown, never emailed
  has_password boolean not null default false,
  recovery_hash text,                   -- bcrypt hash of the recovery code
  parent_email text,                    -- only readable by the server; shown masked
  parent_email_verified boolean not null default false
);
create table if not exists ll_private.pair_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  maker_session uuid not null,
  expires_at timestamptz not null
);
create table if not exists ll_private.rate (key text not null, at timestamptz not null default now());
create index if not exists rate_key on ll_private.rate (key, at);
create table if not exists ll_private.settings (k text primary key, v text);
insert into ll_private.settings values ('device_limit_since', now()::text) on conflict (k) do nothing;

-- Devices you are signed in on (max 2)
create table if not exists public.devices (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name ~ '^[A-Za-z0-9 ·()/.,_-]+$'),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.devices enable row level security;
drop policy if exists "see own devices" on public.devices;
create policy "see own devices" on public.devices for select using (user_id = auth.uid());

-- Sign-in history (last 10 shown in the game)
create table if not exists public.account_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  device text,
  at timestamptz not null default now()
);
create index if not exists account_log_u on public.account_log (user_id, at desc);
alter table public.account_log enable row level security;
drop policy if exists "see own log" on public.account_log;
create policy "see own log" on public.account_log for select using (user_id = auth.uid());

create or replace function ll_private.sid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'session_id','')::uuid $$;
create or replace function ll_private.log(u uuid, e text, d text) returns void language sql security definer set search_path = public as $$
  insert into public.account_log(user_id, event, device) values (u, e, left(d, 40));
  delete from public.account_log where user_id = u and id not in (select id from public.account_log where user_id = u order by at desc limit 30);
$$;
create or replace function ll_private.clean_label(p text) returns text language sql immutable as $$
  select coalesce(nullif(left(regexp_replace(coalesce(p,''), '[^A-Za-z0-9 ·()/.,_-]', '', 'g'), 40), ''), 'Device') $$;

-- Called by every signed-in device when it starts and once a minute.
create or replace function public.register_device(p_label text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s uuid := ll_private.sid(); u uuid := auth.uid(); n int; latest timestamptz;
begin
  if u is null or s is null then return jsonb_build_object('ok', false, 'reason', 'signed_out'); end if;
  if not exists (select 1 from auth.sessions where id = s) then
    delete from public.devices where session_id = s;
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ll-dev:' || u::text, 0));   -- two new devices registering at once must not both get the last slot
  -- forget devices whose login is gone or that were unused for 60 days
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
  end if;
  select max(created_at) into latest from public.devices where user_id = u and session_id <> s;
  return jsonb_build_object('ok', true, 'other_since', latest);
end $$;

-- Sign another device out (its login is deleted, not just hidden)
create or replace function public.kick_device(p_session uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); nm text;
begin
  if u is null or p_session = ll_private.sid() then return false; end if;
  select name into nm from public.devices where session_id = p_session and user_id = u;
  if nm is null then return false; end if;
  delete from auth.sessions where id = p_session and user_id = u;
  delete from public.devices where session_id = p_session;
  delete from ll_private.pair_codes where maker_session = p_session;
  perform ll_private.log(u, 'signed out remotely', nm);
  return true;
end $$;
create or replace function public.kick_others() returns int language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); s uuid := ll_private.sid(); n int;
begin
  if u is null then return 0; end if;
  delete from auth.sessions where user_id = u and id <> s;
  get diagnostics n = row_count;
  delete from public.devices where user_id = u and session_id <> s;
  delete from ll_private.pair_codes where user_id = u;
  perform ll_private.log(u, 'signed out everywhere else', null);
  return n;
end $$;
create or replace function public.rename_device(p_name text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_name not in ('Home PC','My phone','School laptop','Tablet','Laptop','Family computer','Chromebook','iPad','Work computer','Other') then return false; end if;
  update public.devices set name = p_name where session_id = ll_private.sid() and user_id = auth.uid();
  return found;
end $$;
create or replace function public.forget_this_device() returns void language sql security definer set search_path = public as $$
  delete from public.devices where session_id = ll_private.sid() and user_id = auth.uid();
$$;

-- Pairing code: one live code per account, 10 minutes, only while the device that made it stays signed in
create or replace function public.make_pair_code() returns text language plpgsql security definer set search_path = public, extensions as $$
declare u uuid := auth.uid(); s uuid := ll_private.sid(); a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text := ''; b bytea; i int;
begin
  if u is null or s is null or not exists (select 1 from public.devices where session_id = s) then raise exception 'not signed in'; end if;
  if (select count(*) from ll_private.rate where key = 'mk:' || u and at > now() - interval '1 hour') >= 10 then raise exception 'rate limit'; end if;
  insert into ll_private.rate(key) values ('mk:' || u);
  b := gen_random_bytes(8);
  for i in 0..7 loop c := c || substr(a, (get_byte(b, i) % 31) + 1, 1); end loop;
  delete from ll_private.pair_codes where user_id = u or expires_at < now();
  insert into ll_private.pair_codes values (encode(digest(c, 'sha256'), 'hex'), u, s, now() + interval '10 minutes');
  perform ll_private.log(u, 'made a sign-in code', (select name from public.devices where session_id = s));
  return c;
end $$;
create or replace function public.cancel_pair_code() returns void language sql security definer set search_path = public as $$
  delete from ll_private.pair_codes where user_id = auth.uid();
$$;

-- Recovery code: shown once, stored only as a hash
create or replace function public.make_recovery_code() returns text language plpgsql security definer set search_path = public, extensions as $$
declare u uuid := auth.uid(); a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text := ''; b bytea; i int;
begin
  if u is null or not exists (select 1 from public.devices where session_id = ll_private.sid()) then raise exception 'not signed in'; end if;
  if (select count(*) from ll_private.rate where key = 'rc:' || u and at > now() - interval '1 hour') >= 5 then raise exception 'rate limit'; end if;
  insert into ll_private.rate(key) values ('rc:' || u);
  b := gen_random_bytes(16);
  for i in 0..15 loop c := c || substr(a, (get_byte(b, i) % 31) + 1, 1); if i in (3, 7, 11) then c := c || '-'; end if; end loop;
  insert into ll_private.accounts(user_id, recovery_hash) values (u, crypt(c, gen_salt('bf', 8)))
    on conflict (user_id) do update set recovery_hash = excluded.recovery_hash;
  perform ll_private.log(u, 'made a new recovery code', null);
  return c;
end $$;

-- Parent email: stored privately, only ever shown masked
create or replace function public.set_parent_email(p_email text) returns text language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); e text := lower(trim(p_email));
begin
  if u is null or not exists (select 1 from public.devices where session_id = ll_private.sid()) then raise exception 'not signed in'; end if;
  if e <> '' and (char_length(e) > 120 or e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$') then raise exception 'bad email'; end if;
  if (select count(*) from ll_private.rate where key = 'pe:' || u and at > now() - interval '1 day') >= 3 then raise exception 'rate limit'; end if;
  insert into ll_private.rate(key) values ('pe:' || u);
  insert into ll_private.accounts(user_id, parent_email, parent_email_verified) values (u, nullif(e, ''), false)
    on conflict (user_id) do update set parent_email = nullif(e, ''), parent_email_verified = false;
  perform ll_private.log(u, case when e = '' then 'removed parent email' else 'changed parent email' end, null);
  return ll_private.mask(e);
end $$;
create or replace function ll_private.mask(e text) returns text language sql immutable as $$
  select case when e is null or e = '' then null else
    left(split_part(e, '@', 1), 1) || '•••@' || left(split_part(e, '@', 2), 1) || '•••.' || regexp_replace(split_part(e, '@', 2), '^.*\.', '') end $$;

-- What the account screen shows
create or replace function public.account_status() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); a ll_private.accounts;
begin
  if u is null then return null; end if;
  select * into a from ll_private.accounts where user_id = u;
  return jsonb_build_object(
    'has_password', coalesce(a.has_password, false), 'has_recovery', a.recovery_hash is not null,
    'parent', ll_private.mask(a.parent_email), 'parent_verified', coalesce(a.parent_email_verified, false),
    'this', ll_private.sid(),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('id', session_id, 'name', name, 'last_seen', last_seen, 'created_at', created_at) order by created_at), '[]') from public.devices where user_id = u),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('event', event, 'device', device, 'at', at) order by at desc), '[]') from (select * from public.account_log where user_id = u order by at desc limit 10) l));
end $$;

-- ---------- server-only helpers (used by the sign-in server function, never by the game) ----------
create or replace function public.svc_rate(p_key text, p_limit int, p_minutes int) returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from ll_private.rate where at < now() - interval '1 day';
  if (select count(*) from ll_private.rate where key = p_key and at > now() - make_interval(mins => p_minutes)) >= p_limit then return false; end if;
  insert into ll_private.rate(key) values (p_key); return true;
end $$;
create or replace function public.svc_pair_take(p_code text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare r ll_private.pair_codes;
begin
  -- delete ... returning is atomic: two requests with the same code cannot both succeed
  delete from ll_private.pair_codes where code_hash = encode(digest(upper(p_code), 'sha256'), 'hex') returning * into r;
  if r.user_id is null then return null; end if;
  if r.expires_at < now() or not exists (select 1 from auth.sessions where id = r.maker_session) then return null; end if;
  perform ll_private.log(r.user_id, 'sign-in code used', null);
  return r.user_id;
end $$;
create or replace function public.svc_login_lookup(p_login text) returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('user_id', p.id, 'email', a.login_email, 'has_password', coalesce(a.has_password, false))
  from public.profiles p left join ll_private.accounts a on a.user_id = p.id where p.friend_code = upper(trim(p_login)) $$;
create or replace function public.svc_email_for(p_user uuid) returns text language plpgsql security definer set search_path = public, extensions as $$
declare e text;
begin
  select login_email into e from ll_private.accounts where user_id = p_user;
  if e is not null then return e; end if;
  e := 'p' || encode(gen_random_bytes(12), 'hex') || '@players.littlelanes.invalid';
  insert into ll_private.accounts(user_id, login_email) values (p_user, e) on conflict (user_id) do update set login_email = coalesce(ll_private.accounts.login_email, excluded.login_email) returning login_email into e;
  return e;
end $$;
create or replace function public.svc_password_set(p_user uuid) returns void language sql security definer set search_path = public as $$
  update ll_private.accounts set has_password = true where user_id = p_user;
  select ll_private.log(p_user, 'changed password', null);
$$;
create or replace function public.svc_recover(p_login text, p_code text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare u uuid; h text;
begin
  select p.id, a.recovery_hash into u, h from public.profiles p join ll_private.accounts a on a.user_id = p.id where p.friend_code = upper(trim(p_login)) for update of a;   -- lock: a code cannot be used twice at once
  if u is null or h is null or crypt(upper(trim(p_code)), h) <> h then return null; end if;
  update ll_private.accounts set recovery_hash = null where user_id = u;   -- single use
  perform ll_private.log(u, 'signed in with recovery code', null);
  return u;
end $$;
create or replace function public.svc_log(p_user uuid, p_event text) returns void language plpgsql security definer set search_path = public as $$
begin
  -- wrong-password tries are logged at most once per 30 minutes, so an attacker cannot push real events out of the 30-row history
  if p_event = 'wrong password try' and exists (select 1 from public.account_log where user_id = p_user and event = p_event and at > now() - interval '30 minutes') then return; end if;
  perform ll_private.log(p_user, p_event, null);
end $$;
create or replace function public.svc_has_password(p_user uuid) returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select has_password from ll_private.accounts where user_id = p_user), false) $$;

-- Who may call what
revoke execute on function public.svc_rate(text,int,int), public.svc_pair_take(text), public.svc_login_lookup(text), public.svc_email_for(uuid),
  public.svc_password_set(uuid), public.svc_recover(text,text), public.svc_log(uuid,text), public.svc_has_password(uuid) from public, anon, authenticated;
grant execute on function public.svc_rate(text,int,int), public.svc_pair_take(text), public.svc_login_lookup(text), public.svc_email_for(uuid),
  public.svc_password_set(uuid), public.svc_recover(text,text), public.svc_log(uuid,text), public.svc_has_password(uuid) to service_role;
revoke execute on function public.register_device(text), public.kick_device(uuid), public.kick_others(), public.rename_device(text), public.forget_this_device(),
  public.make_pair_code(), public.cancel_pair_code(), public.make_recovery_code(), public.set_parent_email(text), public.account_status() from public, anon;
grant execute on function public.register_device(text), public.kick_device(uuid), public.kick_others(), public.rename_device(text), public.forget_this_device(),
  public.make_pair_code(), public.cancel_pair_code(), public.make_recovery_code(), public.set_parent_email(text), public.account_status() to authenticated;

-- Enforce the limit: a login that never registered as a device (within 5 minutes) is deleted.
-- Only logins made after this update count, so players already signed in are not kicked.
select cron.unschedule('ll-unregistered-sessions') where exists (select 1 from cron.job where jobname = 'll-unregistered-sessions');
select cron.schedule('ll-unregistered-sessions', '* * * * *', $$
  delete from auth.sessions s
  where s.created_at < now() - interval '5 minutes'
    and s.created_at > (select v::timestamptz from ll_private.settings where k = 'device_limit_since')
    and not exists (select 1 from public.devices d where d.session_id = s.id)
$$);
