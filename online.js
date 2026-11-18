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
  const toast = (m, ms) => { try { if (/copied|sent to|welcome|moved here|accepted|saved|added/i.test(m)) (H.ok || H.toast)(m); else if (H.error) H.error(m); else H.toast(m, ms); } catch (e) {} };
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
  const AVATARS = ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚜','🛵','🚲','🚀','🦊','🐱','🐶','🐼','🐸','🦉','🌟','🔥'];
  const COLORS = ['#e5622b','#d63c3c','#e8a317','#2f9e5b','#1f8a8a','#3b6fd8','#7a4fd1','#c24b9a','#5b6470'];
  const prof = p => ({avatar: (p && AVATARS.includes(p.avatar)) ? p.avatar : '🚗', color: (p && COLORS.includes(p.color)) ? p.color : COLORS[0], motto: (p && typeof p.motto === 'string') ? p.motto.slice(0, 40) : ''});
  const MOTTOS = ['', 'Traffic? What traffic?', 'Roundabout fan', 'Bridge builder', 'Never late', 'Highway hero', 'Just one more road', 'GG every time', 'Map explorer', 'Daily puzzle pro'];
  function profileHtml(p) {
    const x = prof(p);
    return `<details id="llProf"><summary class="small"><b>Customize profile</b></summary><div class="stack" style="margin-top:8px">
      <div class="small">Icon</div><div class="btnrow" style="gap:4px">${AVATARS.map(a => `<button class="btn" type="button" data-av="${a}" style="padding:6px 8px;font-size:20px;${a === x.avatar ? 'outline:3px solid ' + x.color : ''}">${a}</button>`).join('')}</div>
      <div class="small">Color</div><div class="btnrow" style="gap:6px">${COLORS.map(c => `<button type="button" data-col="${c}" aria-label="color" style="width:30px;height:30px;border-radius:50%;border:3px solid ${c === x.color ? 'var(--ink)' : 'transparent'};background:${c};cursor:pointer"></button>`).join('')}</div>
      <div class="small">Motto</div><select id="llMotto" style="${inp}">${MOTTOS.map(m => `<option value="${esc(m)}"${m === x.motto ? ' selected' : ''}>${m ? esc(m) : '(none)'}</option>`).join('')}</select>
      <div class="small">Change nickname</div><div class="btnrow"><input id="llNick2" style="${inp}" maxlength="16" placeholder="${esc(p.nickname)}" autocomplete="off"><button class="btn" id="llNickChg" type="button">Change</button></div>
      <p class="hint">Nickname changes: once a day.</p></div></details>`;
  }
  async function saveProf(patch) {
    const {error} = await sb.from('profiles').update(patch).eq('id', S.user.id);
    if (error) { toast(/column/i.test(error.message || '') ? 'Profile styles need the new database update (see supabase-setup.sql)' : (isTaken(error) ? 'That nickname is taken' : 'Could not save profile')); return false; }
    Object.assign(S.profile, patch); changed(); toast('Profile saved'); rerender(); return true;
  }
  function onlineHtml() {
    if (!online()) return OFFMSG;
    if (!S.user) return `<div class="stack"><p class="small">Play with friends and climb the leaderboards. No email needed, just a nickname.</p><div class="btnrow"><button class="btn primary" id="llGo">Go online</button></div>
      <details><summary class="small">Have a transfer code?</summary><div class="btnrow" style="margin-top:8px"><input id="llTin" style="${inp}" placeholder="Paste transfer code" autocomplete="off"><button class="btn" id="llTuse">Use code</button></div></details></div>`;
    if (!S.profile) return `<div class="stack"><p class="small">Pick a nickname (3 to 16 letters, numbers, - or _).</p><div class="btnrow"><input id="llNick" style="${inp}" maxlength="16" placeholder="Nickname" autocomplete="off"><button class="btn primary" id="llNickSave">Save</button></div><div class="btnrow"><button class="btn" id="llOut">Sign out</button></div></div>`;
    const p = S.profile;
    const code = S.showCode && S.session ? `<div class="stack"><p class="hint">Only use this to move YOUR account to your own device. Never send it to anyone, it works like a password. It hides itself after 1 minute.</p><input readonly id="llCode" style="${inp}" value="${esc(S.session.refresh_token)}"><div class="btnrow"><button class="btn" id="llCopy">Copy</button><button class="btn" id="llHide">Hide</button></div></div>` : '';
    return `<div class="stack">
      <div class="btnrow" style="align-items:center"><span style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:24px;background:${prof(p).color}">${prof(p).avatar}</span><span class="stack" style="gap:0"><b style="color:${prof(p).color}">${esc(p.nickname)}</b>${prof(p).motto ? `<span class="hint">${esc(prof(p).motto)}</span>` : ''}</span><span class="codebox"><span class="small">Friend code</span><b>${esc(p.friend_code)}</b><button class="btn" id="llCopyFc" type="button">Copy</button></span></div>
      <div class="btnrow"><button class="btn" id="llXfer">Transfer code</button><button class="btn" id="llOut">Sign out</button></div>${code}
      ${profileHtml(p)}
      <details><summary class="small">Have a transfer code?</summary><div class="btnrow" style="margin-top:8px"><input id="llTin" style="${inp}" placeholder="Paste transfer code" autocomplete="off"><button class="btn" id="llTuse">Use code</button></div></details>
      <div class="small"><b>Friends</b></div>
      <form class="btnrow" id="llAddF"><input id="llFc" style="${inp}" maxlength="8" placeholder="Friend's code" autocomplete="off"><button class="btn" id="llAdd" type="submit">Add</button></form>
      <div id="llFr" class="stack"><p class="hint">Loading friends...</p></div></div>`;
  }
  // Transfer-code limits: 5 tries, then a lockout that doubles each time (1, 2, 4... min, max 1 day).
  function xferLim() { try { const r = JSON.parse(localStorage.getItem('ll.xferLim')); if (r && typeof r === 'object') return {fails: r.fails | 0, until: +r.until || 0, locks: r.locks | 0}; } catch (e) {} return {fails: 0, until: 0, locks: 0}; }
  function saveLim(r) { try { localStorage.setItem('ll.xferLim', JSON.stringify(r)); } catch (e) {} }
  async function useTransfer(card) {
    const v = (card.querySelector('#llTin').value || '').trim();
    const lim = xferLim(), now = Date.now();
    if (lim.until > now) { toast('Too many tries. Wait ' + Math.ceil((lim.until - now) / 60000) + ' min and try again.'); return; }
    if (!v) { toast('Paste a transfer code first'); return; }
    if (v.length < 6 || v.length > 400 || /\s/.test(v)) { toast('That code does not look right'); return; }
    const {data, error} = await sb.auth.refreshSession({refresh_token: v});
    if (error || !data || !data.session) {
      lim.fails++;
      if (lim.fails >= 5) { lim.locks++; lim.fails = 0; lim.until = now + Math.min(86400000, 60000 * Math.pow(2, lim.locks - 1)); saveLim(lim); toast('Too many wrong codes. Transfer is locked for ' + Math.round((lim.until - now) / 60000) + ' min.'); return; }
      saveLim(lim); toast('That transfer code did not work (' + (5 - lim.fails) + ' tries left)'); return;
    }
    saveLim({fails: 0, until: 0, locks: 0});
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
      let shown = []; try { shown = JSON.parse(localStorage.getItem('ll.xferShown')) || []; } catch (e) {}
      shown = shown.filter(t => Date.now() - t < 600000);
      if (shown.length >= 3) { toast('You can show the transfer code 3 times every 10 minutes. Try again soon.'); return; }
      shown.push(Date.now()); try { localStorage.setItem('ll.xferShown', JSON.stringify(shown)); } catch (e) {}
      clearTimeout(S.hideT); S.hideT = setTimeout(() => { if (S.showCode) { S.showCode = false; rerender(); } }, 60000);
      try { const {data} = await sb.auth.getSession(); if (data && data.session) S.session = data.session; } catch (e) {}
      S.showCode = true; rerender();
    });
    card.querySelectorAll('[data-av]').forEach(b => guard(b, () => saveProf({avatar: b.dataset.av})));
    card.querySelectorAll('[data-col]').forEach(b => guard(b, () => saveProf({color: b.dataset.col})));
    const mo = q('#llMotto'); if (mo) mo.onchange = () => { if (MOTTOS.includes(mo.value)) saveProf({motto: mo.value}); };
    guard(q('#llNickChg'), async () => {
      const n = (q('#llNick2').value || '').trim();
      if (!n) { toast('Type a new nickname first'); return; }
      if (!NICK_RE.test(n)) { toast('Nickname: 3 to 16 letters, numbers, - or _'); return; }
      if (badName(n)) { toast('Please pick a different nickname'); return; }
      let last = 0; try { last = +localStorage.getItem('ll.nickChg') || 0; } catch (e) {}
      if (Date.now() - last < 86400000) { toast('You can change your nickname once a day'); return; }
      if (await saveProf({nickname: n})) try { localStorage.setItem('ll.nickChg', String(Date.now())); } catch (e) {}
    });
    { const d = q('#llProf'); if (d) { d.open = !!S.profOpen; d.ontoggle = () => { S.profOpen = d.open; }; } }
    guard(q('#llHide'), async () => { S.showCode = false; rerender(); });
    guard(q('#llCopyFc'), async () => {
      const t = S.profile && S.profile.friend_code; if (!t) return;
      try { await navigator.clipboard.writeText(t); (H.ok || H.toast)('Friend code copied: ' + t); } catch (e) { H.toast('Your friend code is ' + t, 4000); }
    });
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
    const out = {incoming: [], sent: [], friends: [], ids: []};
    const rows = [...((r1 && r1.data) || []).map(x => ({other: x.b, status: x.status, mine: true})), ...((r2 && r2.data) || []).map(x => ({other: x.a, status: x.status, mine: false}))];
    const ids = [...new Set(rows.map(r => r.other))];
    const names = {};
    if (ids.length) { const {data} = await sb.from('profiles').select('id,nickname').in('id', ids); for (const p of data || []) names[p.id] = p.nickname; }
    for (const r of rows) {
      const nm = names[r.other] || 'Player';
      if (r.status === 'accepted') { out.friends.push({id: r.other, nickname: nm}); out.ids.push(r.other); }
      else if (!r.mine) out.incoming.push({id: r.other, nickname: nm});
      else out.sent.push({id: r.other, nickname: nm});
    }
    S.friends = out;
    // tell the player about requests they haven't seen yet, and mark the menu button
    S.seenReq = S.seenReq || new Set(JSON.parse(localStorage.getItem('ll.seenReq') || '[]'));
    const fresh = out.incoming.filter(p => !S.seenReq.has(p.id));
    if (fresh.length) { (H.ok || H.toast)(fresh.length === 1 ? `Friend request from ${fresh[0].nickname}. Open Online to accept.` : `${fresh.length} new friend requests. Open Online to accept.`, 4500);
      for (const p of fresh) S.seenReq.add(p.id); try { localStorage.setItem('ll.seenReq', JSON.stringify([...S.seenReq].slice(-200))); } catch (e) {} }
    try { const mb = document.getElementById('menuBtn'); if (mb) mb.classList.toggle('lldot', out.incoming.length > 0); } catch (e) {}
  }
  // check for new requests every minute while signed in and the game is on screen
  try { if (typeof setInterval === 'function') setInterval(() => { if (S.user && !(typeof document !== 'undefined' && document.hidden)) loadFriends().catch(() => {}); }, 60000); } catch (e) {}
  try { const st = document.createElement('style'); st.textContent = '#menuBtn{position:relative}#menuBtn.lldot::after{content:"";position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:#d63c3c;border:2px solid var(--panel)}'; document.head.appendChild(st); } catch (e) {}
  function drawFriends(card) {
    const box = card && card.querySelector('#llFr'); if (!box) return;
    const f = S.friends || {incoming: [], friends: []};
    let h = '';
    h += `<div class="btnrow" style="align-items:center;justify-content:space-between"><div class="small">Friend requests${f.incoming.length ? ' (' + f.incoming.length + ')' : ''}</div><button class="btn" id="llRefFr" type="button">Refresh</button></div>`;
    h += f.incoming.length ? f.incoming.map(p => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(p.nickname)}</span><button class="btn primary" data-acc="${esc(p.id)}">Accept</button><button class="btn" data-dec="${esc(p.id)}">Decline</button></div>`).join('') : '<p class="hint">No new requests.</p>';
    if (f.sent && f.sent.length) h += `<p class="hint">Sent, waiting for them to accept: ${f.sent.map(p => esc(p.nickname)).join(', ')}</p>`;
    h += f.friends.length ? '<div class="small">Your friends</div><div class="btnrow">' + f.friends.map(p => `<span class="tag">${esc(p.nickname)}</span>`).join('') + '</div>' : '<p class="hint">No friends yet. Share your friend code.</p>';
    box.innerHTML = h;
    const rf = box.querySelector('#llRefFr'); if (rf) guard(rf, async () => { await loadFriends(); drawFriends(card); });
    box.querySelectorAll('[data-dec]').forEach(b => guard(b, async () => {
      const {error} = await sb.from('friends').delete().eq('a', b.dataset.dec).eq('b', S.user.id);
      if (error) { toast('Could not decline'); return; }
      await loadFriends(); drawFriends(card);
    }));
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
