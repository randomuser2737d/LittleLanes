// Little Lanes sign-in server function. Deploy in Supabase: Edge Functions -> Deploy a new function -> Via Editor,
// name it "signin", paste this file, Deploy. Then turn OFF "Verify JWT" for it (it checks logins itself).
// It uses admin powers the game itself must never have: making a login for a pairing/recovery code, and setting passwords.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
// works with both the old keys (service_role/anon) and the new ones (secret/publishable)
const pick = (name: string) => { try { const j = JSON.parse(Deno.env.get(name) || '{}'); return j.default || Object.values(j)[0] || ''; } catch { return ''; } };
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || pick('SUPABASE_SECRET_KEYS');
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || pick('SUPABASE_PUBLISHABLE_KEYS');
const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const ORIGINS = ['https://randomuser2737d.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765'];

const cors = (o: string | null) => ({
  'Access-Control-Allow-Origin': o && ORIGINS.includes(o) ? o : ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
});
const out = (o: string | null, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(o), 'Content-Type': 'application/json' } });

async function rate(key: string, limit: number, minutes: number) {
  const { data } = await admin.rpc('svc_rate', { p_key: key, p_limit: limit, p_minutes: minutes });
  return data === true;
}
// a one-time login link for this user, turned into a session by the game (no email is ever sent)
async function loginFor(userId: string) {
  const { data: email, error: e1 } = await admin.rpc('svc_email_for', { p_user: userId });
  if (e1 || !email) throw new Error('account');
  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (u?.user && u.user.email !== email) await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) throw new Error('link');
  return data.properties.hashed_token;
}
async function caller(req: Request) {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return null;
  // the login must be a registered device (a session waiting at the "device limit" screen may not change passwords)
  try {
    const sid = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id;
    const { data: d } = await admin.from('devices').select('session_id').eq('session_id', sid).eq('user_id', user.id).maybeSingle();
    if (!d) return null;
  } catch { return null; }
  return user;
}
// check a password without leaving an extra login behind
async function passwordOk(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return data.session;
}
const goodPw = (pw: unknown) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 72;

Deno.serve(async (req) => {
  const o = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(o) });
  if (req.method !== 'POST') return out(o, { error: 'bad request' }, 405);
  // the client can put anything at the START of x-forwarded-for, so use the proxy's own header, or the LAST entry
  const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const ip = req.headers.get('cf-connecting-ip') || xff[xff.length - 1] || 'x';
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return out(o, { error: 'bad request' }, 400); }
  const act = String(b.action || '');
  try {
    if (act === 'pair') {
      if (!(await rate('ip-pair:' + ip, 20, 60))) return out(o, { error: 'too_many' }, 429);
      const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 8) return out(o, { error: 'bad_code' }, 400);
      const { data: userId } = await admin.rpc('svc_pair_take', { p_code: code });
      if (!userId) return out(o, { error: 'bad_code' }, 400);
      return out(o, { token_hash: await loginFor(userId) });
    }
    if (act === 'login') {
      const login = String(b.login || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12), pw = String(b.password || '');
      if (!(await rate('ip-login:' + ip, 30, 60))) return out(o, { error: 'too_many' }, 429);
      if (!login || !goodPw(pw)) return out(o, { error: 'wrong' }, 400);
      if (!(await rate('login:' + login, 10, 60))) return out(o, { error: 'too_many' }, 429);
      const { data: info } = await admin.rpc('svc_login_lookup', { p_login: login });
      if (!info?.email || !info.has_password) return out(o, { error: 'wrong' }, 400);
      const s = await passwordOk(info.email, pw);
      if (!s) { await admin.rpc('svc_log', { p_user: info.user_id, p_event: 'wrong password try' }); return out(o, { error: 'wrong' }, 400); }
      return out(o, { access_token: s.access_token, refresh_token: s.refresh_token });
    }
    if (act === 'recover') {
      const login = String(b.login || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!(await rate('ip-rec:' + ip, 20, 60)) || !(await rate('rec:' + login, 5, 60))) return out(o, { error: 'too_many' }, 429);
      const { data: userId } = await admin.rpc('svc_recover', { p_login: login, p_code: String(b.code || '') });
      if (!userId) return out(o, { error: 'wrong' }, 400);
      return out(o, { token_hash: await loginFor(userId) });
    }
    if (act === 'set_password') {
      const user = await caller(req); if (!user) return out(o, { error: 'signed_out' }, 401);
      if (!(await rate('pw:' + user.id, 5, 60))) return out(o, { error: 'too_many' }, 429);
      const pw = b.password;
      if (!goodPw(pw)) return out(o, { error: 'weak' }, 400);
      const { data: prof } = await admin.from('profiles').select('nickname,friend_code').eq('id', user.id).maybeSingle();
      const low = String(pw).toLowerCase();
      if (prof && (low.includes(String(prof.nickname).toLowerCase()) || low.includes(String(prof.friend_code).toLowerCase()))) return out(o, { error: 'weak' }, 400);
      const { data: email } = await admin.rpc('svc_email_for', { p_user: user.id });
      const { data: hasPw } = await admin.rpc('svc_has_password', { p_user: user.id });
      if (hasPw === true) { // changing it needs the current password
        const s = await passwordOk(email, String(b.current || ''));
        if (!s) return out(o, { error: 'wrong_current' }, 400);
        await admin.auth.admin.signOut(s.access_token, 'local').catch(() => {});
      }
      const { error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true, password: String(pw) });
      if (error) return out(o, { error: 'failed' }, 500);
      await admin.rpc('svc_password_set', { p_user: user.id });
      return out(o, { ok: true, login: prof?.friend_code });
    }
    return out(o, { error: 'bad request' }, 400);
  } catch (_e) {
    return out(o, { error: 'failed' }, 500);
  }
});
