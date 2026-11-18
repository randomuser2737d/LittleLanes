// Little Lanes online layer: accounts, friends, leaderboards, progress sync. Never throws; the offline game must keep working.
(function () {
  'use strict';
  const W = typeof window !== 'undefined' ? window : globalThis;
  const H = W.LLHooks;
  if (!H) return;
  const CFG = W.LL_SUPA;
  const online = () => (typeof navigator === 'undefined' || navigator.onLine !== false);
  const OFFMSG = '<p class="hint">Online play needs an internet connection.</p>';

  let sb = null;
  try { if (W.supabase && CFG && CFG.url && CFG.key) sb = W.supabase.createClient(CFG.url, CFG.key, {auth: {persistSession: true, autoRefreshToken: true}}); } catch (e) { sb = null; }
  if (!sb) {
    const f = () => OFFMSG;
    try { H.addMenuSection('Online', f, () => {}); H.addMenuSection('Leaderboards', f, () => {}); } catch (e) {}
    W.LLOnline = {sb: null, user: () => null, profile: () => null, ready: Promise.resolve(), onChange: () => {}};
    return;
  }

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;'}[c]));
  const inp = typeof INP === 'string' ? INP : (typeof globalThis.INP === 'string' ? globalThis.INP : 'font:inherit;padding:9px 12px;border-radius:12px;border:1px solid var(--panel-line);background:var(--land);color:var(--ink);min-width:0;flex:1 1 160px');
  const toast = (m, ms) => { try { H.toast(m, ms); } catch (e) {} };
  const rerender = () => { try { H.menu(); } catch (e) {} };
  const NICK_RE = /^[A-Za-z0-9_-]{3,16}$/;
  const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'penis', 'vagina', 'pussy', 'whore', 'slut', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'porn', 'sex', 'anal', 'asshole', 'bastard', 'damn', 'crap', 'retard', 'suicide', 'kill', 'tits', 'boob', 'cum', 'wank', 'twat', 'dildo', 'milf', 'kkk', 'admin', 'moderator'];
  function badName(n) {
    const t = String(n).toLowerCase().replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't');
    const flat = t.replace(/[^a-z]/g, '');
    return BAD.some(w => flat.includes(w));
  }
  function guard(btn, fn) { // rate limit: disable for 2 s
    if (!btn) return;
    btn.onclick = async ev => {
      if (btn.disabled) return;
      btn.disabled = true; setTimeout(() => { try { btn.disabled = false; } catch (e) {} }, 2000);
      try { await fn(ev); } catch (e) { toast('Something went wrong. Try again.'); }
    };
  }
  const errCode = e => e && (e.code || '') ;
  const isTaken = e => e && (e.code === '23505' || /duplicate|unique|already/i.test(e.message || ''));

  // ---------- state ----------
  const S = {user: null, profile: null, session: null, showCode: false, friends: null, lbCity: null, lbTab: 'all', cache: {}, syncing: false};
  const listeners = [];
  const changed = () => { for (const f of listeners) { try { f(S.user, S.profile); } catch (e) {} } };
  const API = {sb, user: () => S.user, profile: () => S.profile, ready: null, onChange: f => { if (typeof f === 'function') listeners.push(f); }};
  W.LLOnline = API;

  async function loadProfile() {
    S.profile = null;
    if (!S.user) return;
    try {
      const {data, error} = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
      if (!error && data) S.profile = data;
    } catch (e) {}
  }
  async function setSession(session) {
    S.session = session || null;
    const u = session && session.user ? session.user : null;
    const same = (u && S.user && u.id === S.user.id);
    S.user = u;
    if (!u) { S.profile = null; S.friends = null; S.cache = {}; }
    else if (!same) { await loadProfile(); }
    changed();
  }

  API.ready = (async () => {
    try {
      if (!online()) return;
      const {data} = await sb.auth.getSession();
      await setSession(data && data.session);
      if (S.user) syncProgress();
    } catch (e) {}
  })();
  try {
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'TOKEN_REFRESHED' || ev === 'INITIAL_SESSION') { S.session = session || S.session; return; }
      setSession(session).then(() => { if (S.user) syncProgress(); rerender(); }).catch(() => {});
    });
  } catch (e) {}

  // ---------- progress sync ----------
  const EDS = ['classic', 'plus'];
  const MAXKEYS = ['best', 'endless', 'expert', 'chal'];
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  function mergeProgress(local, server) {
    local = isObj(local) ? local : {}; server = isObj(server) ? server : {};
    const out = {};
    for (const k of MAXKEYS) {
      const a = isObj(local[k]) ? local[k] : {}, b = isObj(server[k]) ? server[k] : {};
      const m = {};
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (id === '__proto__' || id === 'constructor') continue;
        m[id] = Math.max(Math.floor(+a[id]) || 0, Math.floor(+b[id]) || 0);
      }
      if (Object.keys(m).length || k === 'best' || k === 'endless') out[k] = m;
    }
    const aa = isObj(local.ach) ? local.ach : {}, ba = isObj(server.ach) ? server.ach : {}, ach = {};
    for (const id of new Set([...Object.keys(aa), ...Object.keys(ba)])) {
      if (id === '__proto__' || id === 'constructor') continue;
      const x = +aa[id] || 0, y = +ba[id] || 0;
      ach[id] = x && y ? Math.min(x, y) : (x || y || 1);
    }
    if (Object.keys(ach).length) out.ach = ach;
    if (local.admin === true || server.admin === true) out.admin = true;
    return out;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  async function syncProgress() {
    if (!S.user || S.syncing || !online()) return;
    S.syncing = true;
    try {
      for (const ed of EDS) {
        try {
          const local = H.storeFor(ed) || {};
          const {data, error} = await sb.from('progress').select('data').eq('user_id', S.user.id).eq('edition', ed).maybeSingle();
          if (error) continue; // never touch local on errors
          const server = data && data.data;
          const merged = mergeProgress(local, server);
          const next = Object.assign({}, local, merged);
          if (!same(next, local)) H.writeStoreFor(ed, next);
          if (!same(merged, mergeProgress(server, {}))) {
            const r = await sb.from('progress').upsert({user_id: S.user.id, edition: ed, data: merged, updated_at: new Date().toISOString()});
            if (r && r.error) toast('Could not save progress online');
          }
        } catch (e) { /* keep local */ }
      }
    } finally { S.syncing = false; }
  }
  API.syncProgress = syncProgress;

  // ---------- scores ----------
  const KINDS = ['normal', 'daily', 'weekly', 'expert'];
  H.on('gameover', async d => {
    try {
      if (!S.user || !d || d.practice || d.custom || d.live || !KINDS.includes(d.kind)) { if (S.user) syncProgress(); return; }
      const score = Math.max(0, Math.min(100000, Math.floor(+d.score) || 0));
      const week = Math.max(1, Math.min(999, Math.floor(+d.week) || 1));
      const city = String(d.city || '');
      if (/^[a-z]{2,20}$/.test(city) && (d.edition === 'classic' || d.edition === 'plus')) {
        const {error} = await sb.from('scores').insert({city, edition: d.edition, kind: d.kind, key: d.key ? String(d.key) : null, score, week});
        if (error) toast('Score not saved online');
        S.cache = {};
      }
    } catch (e) { toast('Score not saved online'); }
    syncProgress();
  });

  // ---------- Online menu ----------
  function onlineHtml() {
    if (!online()) return OFFMSG;
    if (!S.user) return `<div class="stack"><p class="small">Play with friends and climb the leaderboards. No email needed, just a nickname.</p><div class="btnrow"><button class="btn primary" id="llGo">Go online</button></div>
      <details><summary class="small">Have a transfer code?</summary><div class="btnrow" style="margin-top:8px"><input id="llTin" style="${inp}" placeholder="Paste transfer code" autocomplete="off"><button class="btn" id="llTuse">Use code</button></div></details></div>`;
    if (!S.profile) return `<div class="stack"><p class="small">Pick a nickname (3 to 16 letters, numbers, - or _).</p><div class="btnrow"><input id="llNick" style="${inp}" maxlength="16" placeholder="Nickname" autocomplete="off"><button class="btn primary" id="llNickSave">Save</button></div><div class="btnrow"><button class="btn" id="llOut">Sign out</button></div></div>`;
    const p = S.profile;
    const code = S.showCode && S.session ? `<div class="stack"><p class="hint">Warning: using this code on a new device moves your account there. Keep it private.</p><input readonly id="llCode" style="${inp}" value="${esc(S.session.refresh_token)}"><div class="btnrow"><button class="btn" id="llCopy">Copy</button><button class="btn" id="llHide">Hide</button></div></div>` : '';
    return `<div class="stack">
      <div class="btnrow"><span class="tag">${esc(p.nickname)}</span><span class="small">Friend code: <b>${esc(p.friend_code)}</b></span></div>
      <div class="btnrow"><button class="btn" id="llXfer">Transfer code</button><button class="btn" id="llOut">Sign out</button></div>${code}
      <details><summary class="small">Have a transfer code?</summary><div class="btnrow" style="margin-top:8px"><input id="llTin" style="${inp}" placeholder="Paste transfer code" autocomplete="off"><button class="btn" id="llTuse">Use code</button></div></details>
      <div class="small"><b>Friends</b></div>
      <form class="btnrow" id="llAddF"><input id="llFc" style="${inp}" maxlength="8" placeholder="Friend's code" autocomplete="off"><button class="btn" id="llAdd" type="submit">Add</button></form>
      <div id="llFr" class="stack"><p class="hint">Loading friends...</p></div></div>`;
  }
  async function useTransfer(card) {
    const v = (card.querySelector('#llTin').value || '').trim();
    if (!v || v.length < 6 || v.length > 400) { toast('That code does not look right'); return; }
    const {data, error} = await sb.auth.refreshSession({refresh_token: v});
    if (error || !data || !data.session) { toast('That transfer code did not work'); return; }
    await setSession(data.session); S.showCode = false;
    toast(S.profile ? 'Welcome back, ' + S.profile.nickname : 'Account moved here');
    syncProgress(); rerender();
  }
  function wireOnline(card) {
    if (!online()) return;
    const q = s => card.querySelector(s);
    guard(q('#llGo'), async () => {
      const {data, error} = await sb.auth.signInAnonymously();
      if (error || !data || !data.session) { toast('Could not go online. Try again later.'); return; }
      await setSession(data.session); rerender();
    });
    guard(q('#llTuse'), () => useTransfer(card));
    guard(q('#llOut'), async () => { try { await sb.auth.signOut(); } catch (e) {} S.showCode = false; await setSession(null); rerender(); });
    guard(q('#llNickSave'), async () => {
      const n = (q('#llNick').value || '').trim();
      if (!NICK_RE.test(n)) { toast('Nickname: 3 to 16 letters, numbers, - or _'); return; }
      if (badName(n)) { toast('Please pick a different nickname'); return; }
      const {error} = await sb.from('profiles').insert({id: S.user.id, nickname: n});
      if (error) { toast(isTaken(error) ? 'That nickname is taken' : 'Could not save nickname'); return; }
      await loadProfile(); changed(); syncProgress(); rerender();
    });
    guard(q('#llXfer'), async () => {
      try { const {data} = await sb.auth.getSession(); if (data && data.session) S.session = data.session; } catch (e) {}
      S.showCode = true; rerender();
    });
    guard(q('#llHide'), async () => { S.showCode = false; rerender(); });
    guard(q('#llCopy'), async () => {
      const t = S.session && S.session.refresh_token; if (!t) return;
      try { await navigator.clipboard.writeText(t); toast('Transfer code copied'); } catch (e) { const i = q('#llCode'); if (i) { i.select(); } toast('Select the code and copy it'); }
    });
    const form = q('#llAddF');
    if (form) {
      const btn = q('#llAdd');
      form.onsubmit = async ev => {
        ev.preventDefault();
        if (btn.disabled) return;
        btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 2000);
        try { await addFriend((q('#llFc').value || '').trim().toUpperCase(), card); } catch (e) { toast('Could not add friend'); }
      };
      loadFriends().then(() => drawFriends(card)).catch(() => {});
    }
  }
  async function addFriend(code, card) {
    if (!/^[A-Z0-9]{4,8}$/.test(code)) { toast('Friend codes are letters and numbers'); return; }
    const {data, error} = await sb.from('profiles').select('id,nickname').eq('friend_code', code).maybeSingle();
    if (error || !data) { toast('No player has that code'); return; }
    if (data.id === S.user.id) { toast("That's your own code"); return; }
    const {error: e2} = await sb.from('friends').insert({a: S.user.id, b: data.id, status: 'pending'});
    if (e2) { toast(isTaken(e2) ? 'Request already sent' : 'Could not send request'); return; }
    toast('Friend request sent to ' + data.nickname);
    await loadFriends(); drawFriends(card);
  }
  async function loadFriends() {
    if (!S.user) return;
    const me = S.user.id;
    const [r1, r2] = await Promise.all([sb.from('friends').select('a,b,status').eq('a', me), sb.from('friends').select('a,b,status').eq('b', me)]);
    const out = {incoming: [], friends: [], ids: []};
    const rows = [...((r1 && r1.data) || []).map(x => ({other: x.b, status: x.status, mine: true})), ...((r2 && r2.data) || []).map(x => ({other: x.a, status: x.status, mine: false}))];
    const ids = [...new Set(rows.map(r => r.other))];
    const names = {};
    if (ids.length) { const {data} = await sb.from('profiles').select('id,nickname').in('id', ids); for (const p of data || []) names[p.id] = p.nickname; }
    for (const r of rows) {
      const nm = names[r.other] || 'Player';
      if (r.status === 'accepted') { out.friends.push({id: r.other, nickname: nm}); out.ids.push(r.other); }
      else if (!r.mine) out.incoming.push({id: r.other, nickname: nm});
    }
    S.friends = out;
  }
  function drawFriends(card) {
    const box = card && card.querySelector('#llFr'); if (!box) return;
    const f = S.friends || {incoming: [], friends: []};
    let h = '';
    if (f.incoming.length) h += '<div class="small">Requests</div>' + f.incoming.map(p => `<div class="btnrow"><span class="tag">${esc(p.nickname)}</span><button class="btn primary" data-acc="${esc(p.id)}">Accept</button></div>`).join('');
    h += f.friends.length ? '<div class="small">Your friends</div><div class="btnrow">' + f.friends.map(p => `<span class="tag">${esc(p.nickname)}</span>`).join('') + '</div>' : '<p class="hint">No friends yet. Share your friend code.</p>';
    box.innerHTML = h;
    box.querySelectorAll('[data-acc]').forEach(b => guard(b, async () => {
      const id = b.dataset.acc;
      const {error} = await sb.from('friends').update({status: 'accepted'}).eq('a', id).eq('b', S.user.id);
      if (error) { toast('Could not accept'); return; }
      S.cache = {}; await loadFriends(); drawFriends(card);
    }));
  }
  API.friends = () => S.friends;
  API.refreshFriends = () => loadFriends().then(() => S.friends);

  // ---------- Leaderboards ----------
  const cacheGet = k => { const c = S.cache[k]; return c && Date.now() - c.t < 30000 ? c.v : null; };
  const cachePut = (k, v) => { S.cache[k] = {t: Date.now(), v}; return v; };
  async function nicknames(ids) {
    const m = {}; if (!ids.length) return m;
    const {data} = await sb.from('profiles').select('id,nickname').in('id', ids);
    for (const p of data || []) m[p.id] = p.nickname;
    return m;
  }
  async function fetchBoard(city, tab) {
    const ed = H.edition(), key = ['lb', city, ed, tab, S.user ? S.user.id : ''].join('|');
    const hit = cacheGet(key); if (hit) return hit;
    const build = sel => {
      let q = sb.from('scores').select(sel).eq('city', city).eq('edition', ed).eq('kind', 'normal');
      if (tab === 'month') { const d = new Date(); q = q.gte('created_at', new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()); }
      if (tab === 'friends') { const ids = [S.user ? S.user.id : '', ...((S.friends && S.friends.ids) || [])]; q = q.in('user_id', ids); }
      return q.order('score', {ascending: false}).limit(100);
    };
    if (tab === 'friends' && S.user && !S.friends) { try { await loadFriends(); } catch (e) {} }
    let res = await build('score,user_id,profiles(nickname)');
    let rows = res && res.data, names = {};
    if (res.error || !rows) {   // no foreign key to profiles: fetch names separately
      res = await build('score,user_id');
      if (res.error) throw res.error;
      rows = res.data || [];
      names = await nicknames([...new Set(rows.map(r => r.user_id))]);
    } else for (const r of rows) if (r.profiles && r.profiles.nickname) names[r.user_id] = r.profiles.nickname;
    const seen = new Set(), top = [];
    for (const r of rows) { if (seen.has(r.user_id)) continue; seen.add(r.user_id); top.push({user_id: r.user_id, score: r.score, nickname: names[r.user_id] || 'Player'}); if (top.length >= 20) break; }
    let best = null;
    if (S.user) {
      const mine = await sb.from('scores').select('score').eq('user_id', S.user.id).eq('city', city).eq('edition', ed).eq('kind', 'normal').order('score', {ascending: false}).limit(1);
      best = mine && mine.data && mine.data[0] ? mine.data[0].score : null;
    }
    return cachePut(key, {top, best});
  }
  function lbHtml() {
    if (!online()) return OFFMSG;
    const cities = (H.cities() || []).filter(c => c.unlocked);
    const cur = S.lbCity && cities.some(c => c.id === S.lbCity) ? S.lbCity : (cities[0] && cities[0].id);
    S.lbCity = cur;
    const tab = (id, t) => `<button class="opt" data-tab="${id}" aria-pressed="${S.lbTab === id}" style="${S.lbTab === id ? 'outline:2px solid var(--ink)' : ''}">${t}</button>`;
    return `<div class="stack"><select id="llCity" style="${inp}">${cities.map(c => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <div class="grid2">${tab('all', 'All time')}${tab('month', 'This month')}${tab('friends', 'Friends')}</div>
      <div id="llLb" class="stack"><p class="hint">Loading...</p></div></div>`;
  }
  function wireLb(card) {
    if (!online()) return;
    const box = card.querySelector('#llLb'); if (!box) return;
    let seq = 0;
    const draw = async () => {
      const my = ++seq;
      if (S.lbTab === 'friends' && !S.user) { box.innerHTML = '<p class="hint">Go online to see friends.</p>'; return; }
      if (!S.lbCity) { box.innerHTML = '<p class="hint">No cities yet.</p>'; return; }
      try {
        const r = await fetchBoard(S.lbCity, S.lbTab);
        if (my !== seq) return;
        const rows = r.top.map((x, i) => `<div class="btnrow"><span class="small">${i + 1}.</span><span class="tag"${S.user && x.user_id === S.user.id ? ' style="font-weight:700"' : ''}>${esc(x.nickname)}</span><b>${esc(x.score)}</b></div>`).join('');
        box.innerHTML = (rows || '<p class="hint">No scores yet. Be the first!</p>') + (S.user ? `<p class="small">Your best: <b>${r.best == null ? '-' : esc(r.best)}</b></p>` : '<p class="hint">Go online to post scores.</p>');
      } catch (e) { if (my === seq) box.innerHTML = '<p class="hint">Could not load the leaderboard.</p>'; toast('Leaderboard unavailable right now'); }
    };
    const sel = card.querySelector('#llCity');
    if (sel) sel.onchange = () => { S.lbCity = sel.value; draw(); };
    card.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      S.lbTab = b.dataset.tab;
      card.querySelectorAll('[data-tab]').forEach(x => { const on = x.dataset.tab === S.lbTab; x.setAttribute('aria-pressed', on); x.style.outline = on ? '2px solid var(--ink)' : ''; });
      draw();
    });
    draw();
  }

  try {
    H.addMenuSection('Online', () => { try { return onlineHtml(); } catch (e) { return OFFMSG; } }, c => { try { wireOnline(c); } catch (e) { console.error(e); } });
    H.addMenuSection('Leaderboards', () => { try { return lbHtml(); } catch (e) { return OFFMSG; } }, c => { try { wireLb(c); } catch (e) { console.error(e); } });
  } catch (e) {}
  API._test = {mergeProgress, badName};
})();
