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

  // ---------- who's online (live presence) ----------
  S.on = {}; // user id -> {st}
  const ghost = () => { try { return localStorage.getItem('ll.ghost') === '1'; } catch (e) { return false; } };
  const myStatus = () => { try { return H.inLiveDuel && H.inLiveDuel() ? 'duel' : (H.duelState && H.duelState()) ? 'playing' : 'menu'; } catch (e) { return 'menu'; } };
  function startPresence() {
    try {
      if (S.pres) { sb.removeChannel(S.pres); S.pres = null; }
      if (!S.user || !sb.channel) return;
      const ch = sb.channel('ll-online', {config: {presence: {key: S.user.id}}});
      ch.on('presence', {event: 'sync'}, () => {
        const st = ch.presenceState(), m = {};
        for (const k in st) { const a = st[k] && st[k][0]; if (a && !a.ghost) m[k] = {st: a.st === 'duel' || a.st === 'playing' ? a.st : 'menu'}; }
        S.on = m; try { if (document.querySelector('#llFr')) drawFriends(document); } catch (e) {}
      });
      ch.subscribe(st => { if (st === 'SUBSCRIBED') ch.track({st: myStatus(), ghost: ghost()}); });
      S.pres = ch;
    } catch (e) {}
  }
  try { if (typeof setInterval === 'function') setInterval(() => { try { if (S.pres) S.pres.track({st: myStatus(), ghost: ghost()}); } catch (e) {} }, 20000); } catch (e) {}
  listeners.push(u => { if (!u && S.pres) { try { sb.removeChannel(S.pres); } catch (e) {} S.pres = null; S.on = {}; } else if (u && !S.pres) startPresence(); });
  const statusDot = id => { const o = S.on[id]; const c = !o ? '#9aa0a6' : o.st === 'menu' ? '#2f9e5b' : '#e8a317'; const t = !o ? 'Offline' : o.st === 'duel' ? 'In a duel' : o.st === 'playing' ? 'Playing' : 'Online'; return {c, t, on: !!o}; };
  API.isOnline = id => !!S.on[id];

  // ---------- system notifications (installed app, while it is open in the background) ----------
  const installed = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const notifOn = () => { try { return localStorage.getItem('ll.notif') === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'; } catch (e) { return false; } };
  function notify(title, body) {
    try { if (!notifOn() || !document.hidden) return;
      const opt = {body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'll-msg', renotify: true};
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(r => r.showNotification(title, opt)).catch(() => { try { new Notification(title, opt); } catch (e) {} });
      else new Notification(title, opt);
    } catch (e) {}
  }
  API.notify = notify;
  // ---------- quick messages (pre-written only, no free typing) ----------
  const MSGS = ['Are you free to play?', 'Want to duel? (Survival)', 'Want to duel? (Sprint, 10 weeks)', 'Join my duel room!', "Yes, I'm in!", 'Not right now', 'Give me 5 minutes', 'Try today\'s daily puzzle!', 'Beat my score!', 'GG!', 'Rematch?', 'Gotta go, bye!', 'Check out my new map!', 'Nice score!',
    'Hi! 👋', 'Good luck!', 'Thanks!', 'Want to play later?', 'Online now, come play!', 'Want to duel? (any rule)', 'I made a room, check your messages', 'Best of 3?', 'One more game?', 'That was close!', 'You\'re really good!', 'Wow, nice roads!', 'Try the weekly challenge!', 'I beat my best score!', 'Which city should we play?', 'Busy right now', 'Be right back', 'Okay 👍', 'No thanks', 'See you tomorrow!'];
  const MSG_GROUPS = [['Ask', [0, 14, 17, 18, 19, 26, 27]], ['Duel', [1, 2, 19, 3, 21, 22, 10]], ['Answer', [4, 5, 6, 31, 33, 32, 16]], ['Cheer', [15, 9, 13, 23, 24, 25, 28]], ['Ideas', [7, 8, 12, 29, 30, 11, 34, 20]]];
  const loadInbox = () => { try { const a = JSON.parse(localStorage.getItem('ll.inbox')); return Array.isArray(a) ? a.slice(0, 30) : []; } catch (e) { return []; } };
  const saveInbox = a => { try { localStorage.setItem('ll.inbox', JSON.stringify(a.slice(0, 30))); } catch (e) {} };
  S.inbox = loadInbox();
  const unread = () => S.inbox.filter(m => !m.read && !m.out).length;
  const markDot = () => { try { const mb = document.getElementById('menuBtn'); if (mb) mb.classList.toggle('lldot', unread() > 0 || !!(S.friends && S.friends.incoming.length)); } catch (e) {} };
  function startInbox() {
    try {
      if (S.inboxCh) { sb.removeChannel(S.inboxCh); S.inboxCh = null; }
      if (!S.user || !sb.channel) return;
      const ch = sb.channel('inbox:' + S.user.id);
      ch.on('broadcast', {event: 'm'}, ({payload: p}) => {
        if (!p || typeof p.k !== 'number' || !MSGS[p.k]) return;
        const fr = S.friends && S.friends.friends.find(f => f.id === p.from); if (!fr) return; // friends only
        const room = typeof p.room === 'string' && /^[A-Z]{4}$/.test(p.room) ? p.room : '';
        S.inbox.unshift({from: fr.id, nick: fr.nickname, k: p.k, room, at: Date.now()}); saveInbox(S.inbox); markDot(); if (S.hist[fr.id]) S.hist[fr.id].push({mine: false, k: p.k, room, at: Date.now()}); if (S.openF === fr.id) sb.from('messages').update({read: true}).eq('from_id', fr.id).eq('to_id', S.user.id).eq('read', false).then(() => {}, () => {});
        notify(fr.nickname, MSGS[p.k] + (room ? ' Room ' + room : ''));
        try { (H.ok || H.toast)(fr.nickname + ': ' + MSGS[p.k] + (room ? ' Room ' + room : ''), 5000); H.tone && H.tone(880, .12, .04, 'triangle'); } catch (e) {}
        try { if (document.querySelector('#llFr')) drawFriends(document); } catch (e) {}
      });
      ch.subscribe(); S.inboxCh = ch;
    } catch (e) {}
  }
  listeners.push(u => { if (!u && S.inboxCh) { try { sb.removeChannel(S.inboxCh); } catch (e) {} S.inboxCh = null; } else if (u && !S.inboxCh) startInbox(); });
  async function sendMsg(to, k) {
    const now = Date.now(); S.sentAt = (S.sentAt || []).filter(t => now - t < 300000);
    if (S.sentAt.length && now - S.sentAt[S.sentAt.length - 1] < 3000) { toast('Slow down a little'); return; }
    if (S.sentAt.length >= 20) { toast('Message limit reached. Try again in a few minutes.'); return; }
    const room = k === 3 ? (window.LLDuelRoom && window.LLDuelRoom()) : '';
    if (k === 3 && !room) { toast('Make a room in Live duel first, then send this'); return; }
    const ins = await sb.from('messages').insert({to_id: to, k, room: room || null});
    if (ins.error && !S.on[to]) { toast(/relation|exist|schema/i.test(ins.error.message || '') ? 'Message history needs the new database update' : /limit/i.test(ins.error.message || '') ? 'Message limit reached. Try again in a few minutes.' : 'Could not send. Try again.'); return; }
    if (!S.on[to]) { S.sentAt.push(now); afterSend(to, k, room, now); return; }
    const ch = sb.channel('inbox:' + to);
    await new Promise(res => { const t = setTimeout(res, 4000); ch.subscribe(st => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(); } }); });
    const r = await ch.send({type: 'broadcast', event: 'm', payload: {from: S.user.id, k, room: room || ''}});
    setTimeout(() => { try { sb.removeChannel(ch); } catch (e) {} }, 1500);
    if (r !== 'ok') { toast('Could not send. Try again.'); return; }
    S.sentAt.push(now); afterSend(to, k, room, now);
  }
  try { if (typeof setInterval === 'function') setInterval(() => { if (S.user && !(typeof document !== 'undefined' && document.hidden)) loadMissed(); }, 120000); } catch (e) {}
  function afterSend(to, k, room, now) {
    const fr = S.friends && S.friends.friends.find(f => f.id === to);
    S.inbox.unshift({from: to, nick: fr ? fr.nickname : 'Friend', k, room: room || '', at: now, out: true, read: true}); saveInbox(S.inbox);
    (S.hist[to] = S.hist[to] || []).push({mine: true, k, room: room || '', at: now});
    toast('Message sent to ' + (fr ? fr.nickname : 'your friend') + (S.on[to] ? '' : ' (they will see it next time)'));
    try { if (document.querySelector('#llFr')) drawFriends(document); } catch (e) {}
  }
  S.hist = {};
  async function loadHist(id) {
    try { const me = S.user.id;
      const {data, error} = await sb.from('messages').select('from_id,to_id,k,room,created_at,read').or(`and(from_id.eq.${me},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${me})`).order('created_at', {ascending: false}).limit(40);
      if (error) return null;
      S.hist[id] = (data || []).reverse().map(m => ({mine: m.from_id === me, k: m.k, room: m.room || '', at: Date.parse(m.created_at)}));
      if ((data || []).some(m => m.to_id === me && !m.read)) sb.from('messages').update({read: true}).eq('from_id', id).eq('to_id', me).eq('read', false).then(() => {}, () => {});
      return S.hist[id];
    } catch (e) { return null; }
  }
  async function loadMissed() {
    try { if (!S.user) return; const {data, error} = await sb.from('messages').select('from_id,k,room,created_at').eq('to_id', S.user.id).eq('read', false).order('created_at', {ascending: false}).limit(30);
      if (error || !data || !data.length) return;
      if (!S.friends) await loadFriends();
      let n = 0;
      for (const m of data.reverse()) { const at = Date.parse(m.created_at), fr = S.friends && S.friends.friends.find(f => f.id === m.from_id); if (!fr || !MSGS[m.k]) continue;
        if (S.inbox.some(x => x.from === fr.id && x.k === m.k && Math.abs(x.at - at) < 15000)) continue; S.inbox.unshift({from: fr.id, nick: fr.nickname, k: m.k, room: m.room || '', at}); n++; }
      if (n) { notify('Little Lanes', n === 1 ? 'You have a new message' : `You have ${n} new messages`); saveInbox(S.inbox); markDot(); (H.ok || H.toast)(n === 1 ? 'You have a new message. Open Online to read it.' : `You have ${n} new messages. Open Online to read them.`, 4500); rerender(); }
    } catch (e) {}
  }
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };

  API.ready = (async () => {
    try {
      if (!online()) return;
      const {data} = await sb.auth.getSession();
      await setSession(data && data.session);
      if (S.user) { syncProgress(); startPresence(); startInbox(); loadFriends().then(loadMissed).then(loadGroups).catch(() => {}); }
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
    return `<details id="llProf" open><summary class="small"><b>Customize profile</b></summary><div class="stack" style="margin-top:8px">
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
    const nOn = S.friends ? S.friends.friends.filter(f => S.on[f.id]).length : 0, nReq = S.friends ? S.friends.incoming.length : 0;
    return `<div class="stack">
      <div class="btnrow" style="align-items:center"><span style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:24px;background:${prof(p).color}">${prof(p).avatar}</span><span class="stack" style="gap:0"><b style="color:${prof(p).color}">${esc(p.nickname)}</b>${prof(p).motto ? `<span class="hint">${esc(prof(p).motto)}</span>` : ''}</span><span class="codebox"><span class="small">Friend code</span><b>${esc(p.friend_code)}</b><button class="btn" id="llCopyFc" type="button">Copy</button></span></div>
      <div class="btnrow"><span class="tag">🟢 ${nOn} friend${nOn === 1 ? '' : 's'} online</span>${nReq ? `<span class="tag" style="background:#d63c3c;color:#fff">${nReq} friend request${nReq === 1 ? '' : 's'}</span>` : ''}${unread() ? `<span class="tag" style="background:#2f9e5b;color:#fff">${unread()} new message${unread() === 1 ? '' : 's'}</span>` : ''}</div></div>`;
  }
  function friendsHtml() {
    if (!online() || !S.profile) return '<p class="hint">Go online and pick a nickname first (top of this page).</p>';
    return `<div class="stack"><form class="btnrow" id="llAddF"><input id="llFc" style="${inp}" maxlength="8" placeholder="Add a friend by their code" autocomplete="off"><button class="btn primary" id="llAdd" type="submit">Add</button></form>
      <div id="llFr" class="stack"><p class="hint">Loading friends...</p></div></div>`;
  }
  function accountHtml() {
    if (!online()) return OFFMSG;
    if (!S.profile) return '<p class="hint">Go online and pick a nickname first.</p>';
    const p = S.profile;
    const code = S.showCode && S.session ? `<div class="stack"><p class="hint">Only use this to move YOUR account to your own device. Never send it to anyone, it works like a password. It hides itself after 1 minute.</p><input readonly id="llCode" style="${inp}" value="${esc(S.session.refresh_token)}"><div class="btnrow"><button class="btn" id="llCopy">Copy</button><button class="btn" id="llHide">Hide</button></div></div>` : '';
    return `<div class="stack">${profileHtml(p)}
      <div class="small">Move your account to another device</div><div class="btnrow"><button class="btn" id="llXfer">Show transfer code</button></div>${code}
      <details><summary class="small">Have a transfer code?</summary><div class="btnrow" style="margin-top:8px"><input id="llTin" style="${inp}" placeholder="Paste transfer code" autocomplete="off"><button class="btn" id="llTuse">Use code</button></div></details>
      <div class="small">Notifications</div>${installed() ? (typeof Notification === 'undefined' ? '<p class="hint">This device does not support notifications.</p>' : `<div class="btnrow"><button class="btn" id="llNotif">${notifOn() ? 'Turn off notifications' : 'Turn on notifications'}</button></div><p class="hint">Shows a notification for messages, group chats and friend requests while the app is open in the background.</p>`) : '<p class="hint">Install Little Lanes to your home screen to get notifications for messages.</p>'}
      <div class="btnrow"><button class="btn" id="llOut">Sign out</button></div></div>`;
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
    
    guard(q('#llNotif'), async () => {
      if (notifOn()) { try { localStorage.setItem('ll.notif', '0'); } catch (e) {} rerender(); return; }
      let perm = 'denied'; try { perm = await Notification.requestPermission(); } catch (e) {}
      if (perm !== 'granted') { toast('Notifications are blocked. Allow them in your device settings for Little Lanes.'); return; }
      try { localStorage.setItem('ll.notif', '1'); } catch (e) {} (H.ok || H.toast)('Notifications turned on'); rerender();
    });
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
    const [r1, r2] = await Promise.all([sb.from('friends').select('a,b,status,created_at').eq('a', me), sb.from('friends').select('a,b,status,created_at').eq('b', me)]);
    const out = {incoming: [], sent: [], friends: [], ids: []};
    const rows = [...((r1 && r1.data) || []).map(x => ({other: x.b, status: x.status, mine: true, since: x.created_at})), ...((r2 && r2.data) || []).map(x => ({other: x.a, status: x.status, mine: false, since: x.created_at}))];
    const ids = [...new Set(rows.map(r => r.other))];
    const names = {};
    if (ids.length) { let res = await sb.from('profiles').select('id,nickname,avatar,color,motto,created_at').in('id', ids); if (res.error) res = await sb.from('profiles').select('id,nickname').in('id', ids); for (const p of res.data || []) { names[p.id] = p.nickname; S.pf = S.pf || {}; S.pf[p.id] = p; } }
    for (const r of rows) {
      const nm = names[r.other] || 'Player';
      if (r.status === 'accepted') { out.friends.push({id: r.other, nickname: nm, since: r.since}); out.ids.push(r.other); }
      else if (!r.mine) out.incoming.push({id: r.other, nickname: nm});
      else out.sent.push({id: r.other, nickname: nm});
    }
    S.friends = out;
    // tell the player about requests they haven't seen yet, and mark the menu button
    S.seenReq = S.seenReq || new Set(JSON.parse(localStorage.getItem('ll.seenReq') || '[]'));
    const fresh = out.incoming.filter(p => !S.seenReq.has(p.id));
    if (fresh.length) { notify('Little Lanes', fresh.length === 1 ? `Friend request from ${fresh[0].nickname}` : `${fresh.length} new friend requests`); (H.ok || H.toast)(fresh.length === 1 ? `Friend request from ${fresh[0].nickname}. Open Online to accept.` : `${fresh.length} new friend requests. Open Online to accept.`, 4500);
      for (const p of fresh) S.seenReq.add(p.id); try { localStorage.setItem('ll.seenReq', JSON.stringify([...S.seenReq].slice(-200))); } catch (e) {} }
    markDot();
  }
  // check for new requests every minute while signed in and the game is on screen
  try { if (typeof setInterval === 'function') setInterval(() => { if (S.user && !(typeof document !== 'undefined' && document.hidden)) loadFriends().catch(() => {}); }, 60000); } catch (e) {}
  try { const st = document.createElement('style'); st.textContent = '#menuBtn{position:relative}#menuBtn.lldot::after{content:"";position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:#d63c3c;border:2px solid var(--panel)}'; document.head.appendChild(st); } catch (e) {}
  // ---------- group chats (invite friends; they must accept to join) ----------
  const GNAMES = ['🚗 Road Crew', '🌉 Bridge Club', '🏙️ City Builders', '🚦 Traffic Team', '🏆 Duel Squad', '🛣️ Highway Gang', '🎉 Party Lane', '🗺️ Map Makers', '⭐ All Stars', '🔥 Rush Hour'];
  S.groups = []; S.ginv = []; S.gch = {}; S.ghist = {}; S.openG = null;
  async function loadGroups() {
    if (!S.user) return;
    try {
      const {data, error} = await sb.from('group_members').select('group_id,status,invited_by,chat_groups(id,name,owner)').eq('user_id', S.user.id);
      if (error) { S.gErr = /relation|exist|schema/i.test(error.message || ''); return; }
      S.gErr = false;
      const rows = (data || []).filter(r => r.chat_groups);
      const prev = new Set(S.ginv.map(g => g.id));
      S.groups = rows.filter(r => r.status === 'accepted').map(r => ({id: r.group_id, name: r.chat_groups.name, owner: r.chat_groups.owner}));
      S.ginv = rows.filter(r => r.status === 'pending').map(r => ({id: r.group_id, name: r.chat_groups.name, by: r.invited_by}));
      const fresh = S.ginv.filter(g => !prev.has(g.id));
      if (fresh.length && S.gLoaded) { notify('Little Lanes', 'You were invited to ' + fresh[0].name); (H.ok || H.toast)('Group chat invite: ' + fresh[0].name + '. Open Online → Group chats.', 4500); }
      S.gLoaded = true;
      const ids = S.groups.map(g => g.id);
      if (ids.length) { const {data: mem} = await sb.from('group_members').select('group_id,user_id,status').in('group_id', ids); S.gmem = {}; for (const m of mem || []) (S.gmem[m.group_id] = S.gmem[m.group_id] || []).push(m); const uids = [...new Set((mem || []).map(m => m.user_id))]; const missing = uids.filter(u => !(S.pf && S.pf[u])); if (missing.length) { const {data: pf} = await sb.from('profiles').select('id,nickname,avatar,color').in('id', missing); S.pf = S.pf || {}; for (const x of pf || []) S.pf[x.id] = x; } }
      for (const g of S.groups) if (!S.gch[g.id]) subGroup(g.id);
      for (const id of Object.keys(S.gch)) if (!ids.includes(+id) && !ids.includes(id)) { try { sb.removeChannel(S.gch[id]); } catch (e) {} delete S.gch[id]; }
    } catch (e) {}
  }
  const gname = id => { const g = S.groups.find(x => String(x.id) === String(id)); return g ? g.name : 'Group'; };
  const nickOf = id => id === (S.user && S.user.id) ? 'You' : (S.pf && S.pf[id] && S.pf[id].nickname) || 'Player';
  function subGroup(id) {
    try { const ch = sb.channel('group:' + id, {config: {broadcast: {self: false}}});
      ch.on('broadcast', {event: 'm'}, ({payload: p}) => {
        if (!p || !MSGS[p.k] || !(S.gmem && (S.gmem[id] || []).some(m => m.user_id === p.from && m.status === 'accepted'))) return;
        (S.ghist[id] = S.ghist[id] || []).push({from: p.from, k: p.k, at: Date.now()});
        if (S.openG !== String(id) || document.hidden) { S.gUnread = S.gUnread || {}; S.gUnread[id] = (S.gUnread[id] || 0) + 1; notify(gname(id), nickOf(p.from) + ': ' + MSGS[p.k]); (H.ok || H.toast)(gname(id) + ' · ' + nickOf(p.from) + ': ' + MSGS[p.k], 4000); }
        drawGroups();
      });
      ch.subscribe(); S.gch[id] = ch; } catch (e) {}
  }
  async function loadGHist(id) {
    const {data, error} = await sb.from('group_messages').select('from_id,k,created_at').eq('group_id', id).order('created_at', {ascending: false}).limit(40);
    if (!error) S.ghist[id] = (data || []).reverse().map(m => ({from: m.from_id, k: m.k, at: Date.parse(m.created_at)}));
  }
  async function sendGroup(id, k) {
    const now = Date.now(); S.sentAt = (S.sentAt || []).filter(t => now - t < 300000);
    if (S.sentAt.length && now - S.sentAt[S.sentAt.length - 1] < 3000) { toast('Slow down a little'); return; }
    const {error} = await sb.from('group_messages').insert({group_id: id, k});
    if (error) { toast(/limit/i.test(error.message || '') ? 'Message limit reached. Try again in a few minutes.' : 'Could not send. Try again.'); return; }
    S.sentAt.push(now);
    try { const ch = S.gch[id]; if (ch) ch.send({type: 'broadcast', event: 'm', payload: {from: S.user.id, k}}); } catch (e) {}
    (S.ghist[id] = S.ghist[id] || []).push({from: S.user.id, k, at: now}); drawGroups();
  }
  function groupsHtml() {
    if (!online() || !S.profile) return '<p class="hint">Go online and pick a nickname first.</p>';
    return '<div id="llGr" class="stack"><p class="hint">Loading group chats...</p></div>';
  }
  function drawGroups() {
    const box = typeof document !== 'undefined' && document.querySelector('#llGr'); if (!box) return;
    if (S.gErr) { box.innerHTML = '<p class="hint">Group chats need the new database update.</p>'; return; }
    let h = '';
    if (S.ginv.length) h += '<div class="small">Invites</div>' + S.ginv.map(g => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(g.name)}</span><span class="hint" style="margin:0">from ${esc(nickOf(g.by))}</span><button class="btn primary" type="button" data-gacc="${esc(g.id)}">Join</button><button class="btn" type="button" data-gdec="${esc(g.id)}">No thanks</button></div>`).join('');
    const og = S.openG && S.groups.find(g => String(g.id) === S.openG);
    if (og) {
      const mem = (S.gmem && S.gmem[og.id]) || [], hist = S.ghist[og.id] || [];
      const fr = (S.friends && S.friends.friends) || [], inGroup = new Set(mem.map(m => m.user_id));
      h += `<div class="btnrow" style="align-items:center"><button class="btn" type="button" id="llGBack">← Groups</button><b>${esc(og.name)}</b></div>
        <p class="hint" style="margin:0">${mem.map(m => esc(nickOf(m.user_id)) + (m.status === 'pending' ? ' (invited)' : '')).join(', ')}</p>
        <div class="stack" id="llGH" style="gap:4px;max-height:240px;overflow:auto;padding:6px;border-radius:12px;background:var(--land)">${hist.length ? hist.map(m => { const me = m.from === S.user.id; return `<div style="align-self:${me ? 'flex-end' : 'flex-start'};max-width:85%;padding:6px 10px;border-radius:14px;background:${me ? 'var(--accent,#e5622b)' : 'var(--panel)'};color:${me ? '#fff' : 'inherit'};font-size:14px">${me ? '' : `<b style="font-size:12px">${esc(nickOf(m.from))}</b><br>`}${esc(MSGS[m.k] || '')}<span style="opacity:.6;font-size:11px;margin-left:6px">${ago(m.at)}</span></div>`; }).join('') : '<p class="hint" style="margin:0">No messages yet.</p>'}</div>
        <div class="btnrow" style="gap:4px">${MSG_GROUPS.map(([g], i) => `<button class="btn${(S.mg || 0) === i ? ' primary' : ''}" type="button" data-gmg="${i}" style="padding:4px 10px;font-size:13px">${g}</button>`).join('')}</div>
        <div class="btnrow" style="gap:4px">${MSG_GROUPS[S.mg || 0][1].filter(i => i !== 3).map(i => `<button class="btn" type="button" data-gmsg="${i}" style="padding:6px 10px;font-size:13px">${esc(MSGS[i])}</button>`).join('')}</div>
        ${mem.length < 8 && fr.some(f => !inGroup.has(f.id)) ? `<div class="btnrow"><select id="llGInv" style="${inp}">${fr.filter(f => !inGroup.has(f.id)).map(f => `<option value="${esc(f.id)}">${esc(f.nickname)}</option>`).join('')}</select><button class="btn" type="button" id="llGInvB">Invite</button></div>` : ''}
        <div class="btnrow"><button class="btn" type="button" id="llGLeave">Leave group</button></div>`;
    } else {
      h += S.groups.length ? '<div class="small">Your groups</div>' + S.groups.map(g => `<button class="btn" type="button" data-gopen="${esc(g.id)}" style="justify-content:flex-start;width:100%">${esc(g.name)}${S.gUnread && S.gUnread[g.id] ? ` <span class="tag" style="background:#2f9e5b;color:#fff">${S.gUnread[g.id]} new</span>` : ''}</button>`).join('') : '<p class="hint">No group chats yet.</p>';
      const fr = (S.friends && S.friends.friends) || [];
      h += fr.length ? `<details><summary class="small"><b>New group chat</b></summary><div class="stack" style="margin-top:8px"><select id="llGName" style="${inp}">${GNAMES.map(n => `<option>${esc(n)}</option>`).join('')}</select><div class="small">Invite friends (up to 7). They have to accept to join.</div>${fr.map(f => `<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-gpick="${esc(f.id)}"> ${esc(f.nickname)}</label>`).join('')}<button class="btn primary" type="button" id="llGMake">Create group</button></div></details>` : '<p class="hint">Add friends first to make a group chat.</p>';
    }
    box.innerHTML = h;
    const q = s => box.querySelector(s);
    box.querySelectorAll('[data-gacc]').forEach(b => guard(b, async () => { const {error} = await sb.from('group_members').update({status: 'accepted'}).eq('group_id', b.dataset.gacc).eq('user_id', S.user.id); if (error) { toast('Could not join'); return; } (H.ok || H.toast)('Joined the group chat'); await loadGroups(); drawGroups(); }));
    box.querySelectorAll('[data-gdec]').forEach(b => guard(b, async () => { await sb.from('group_members').delete().eq('group_id', b.dataset.gdec).eq('user_id', S.user.id); await loadGroups(); drawGroups(); }));
    box.querySelectorAll('[data-gopen]').forEach(b => b.onclick = async () => { S.openG = b.dataset.gopen; if (S.gUnread) S.gUnread[S.openG] = 0; drawGroups(); await loadGHist(S.openG); drawGroups(); });
    const bk = q('#llGBack'); if (bk) bk.onclick = () => { S.openG = null; drawGroups(); };
    box.querySelectorAll('[data-gmg]').forEach(b => b.onclick = () => { S.mg = +b.dataset.gmg; drawGroups(); });
    box.querySelectorAll('[data-gmsg]').forEach(b => guard(b, () => sendGroup(S.openG, +b.dataset.gmsg)));
    const hh = q('#llGH'); if (hh) hh.scrollTop = hh.scrollHeight;
    guard(q('#llGInvB'), async () => { const uid = q('#llGInv').value; const {error} = await sb.from('group_members').insert({group_id: S.openG, user_id: uid, status: 'pending', invited_by: S.user.id}); if (error) { toast('Could not invite'); return; } (H.ok || H.toast)('Invite sent to ' + nickOf(uid)); await loadGroups(); drawGroups(); });
    guard(q('#llGLeave'), async () => { const b = q('#llGLeave'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to leave'; return; } await sb.from('group_members').delete().eq('group_id', S.openG).eq('user_id', S.user.id); S.openG = null; await loadGroups(); drawGroups(); });
    guard(q('#llGMake'), async () => {
      const name = q('#llGName').value; if (!GNAMES.includes(name)) return;
      const picks = [...box.querySelectorAll('[data-gpick]:checked')].map(x => x.dataset.gpick).slice(0, 7);
      if (!picks.length) { toast('Pick at least one friend to invite'); return; }
      const {data, error} = await sb.from('chat_groups').insert({name}).select('id').single();
      if (error || !data) { toast(S.gErr ? 'Group chats need the new database update' : 'Could not create the group'); return; }
      await sb.from('group_members').insert({group_id: data.id, user_id: S.user.id, status: 'accepted', invited_by: S.user.id});
      const r = await sb.from('group_members').insert(picks.map(u => ({group_id: data.id, user_id: u, status: 'pending', invited_by: S.user.id})));
      if (r.error) toast('Some invites could not be sent'); else (H.ok || H.toast)('Group created. Invites sent!');
      await loadGroups(); S.openG = String(data.id); await loadGHist(S.openG); drawGroups();
    });
  }
  try { if (typeof setInterval === 'function') setInterval(() => { if (S.user && !(typeof document !== 'undefined' && document.hidden)) loadGroups().then(drawGroups).catch(() => {}); }, 60000); } catch (e) {}
  function drawFriends(card) {
    const box = card && card.querySelector('#llFr'); if (!box) return;
    const f = S.friends || {incoming: [], friends: []};
    let h = '';
    const ib = S.inbox.slice(0, 6);
    if (ib.length) { h += `<div class="small">Messages${unread() ? ' (' + unread() + ' new)' : ''}</div><div class="stack" style="gap:4px">` + ib.map(m => `<div class="btnrow" style="align-items:center;gap:6px;${m.read ? 'opacity:.75' : ''}"><span class="small">${m.out ? 'You → ' + esc(m.nick) : '<b>' + esc(m.nick) + '</b>'}:</span><span>${esc(MSGS[m.k] || '')}</span>${m.room ? `<span class="tag">Room <b>${esc(m.room)}</b></span><button class="btn" type="button" data-room="${esc(m.room)}">Copy</button>` : ''}<span class="hint" style="margin:0">${ago(m.at)}</span>${!m.out ? `<button class="btn" type="button" data-reply="${esc(m.from)}">Reply</button>` : ''}</div>`).join('') + `</div><button class="btn" type="button" id="llClrIn" style="align-self:flex-start">Clear messages</button>`; }
    h += `<div class="btnrow" style="align-items:center;justify-content:space-between"><div class="small">Friend requests${f.incoming.length ? ' (' + f.incoming.length + ')' : ''}</div><button class="btn" id="llRefFr" type="button">Refresh</button></div>`;
    h += f.incoming.length ? f.incoming.map(p => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(p.nickname)}</span><button class="btn primary" data-acc="${esc(p.id)}">Accept</button><button class="btn" data-dec="${esc(p.id)}">Decline</button></div>`).join('') : '<p class="hint">No new requests.</p>';
    if (f.sent && f.sent.length) h += `<div class="small">Sent requests (waiting)</div>` + f.sent.map(p => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(p.nickname)}</span><button class="btn" type="button" data-cancel="${esc(p.id)}">Cancel</button></div>`).join('');
    const qf = (S.fq || '').toLowerCase();
    if (f.friends.length > 4) h += `<input id="llFq" style="${inp}" placeholder="Search friends" value="${esc(S.fq || '')}" autocomplete="off">`;
    const fl = f.friends.filter(p => !qf || p.nickname.toLowerCase().includes(qf)).slice().sort((a, b) => (S.on[b.id] ? 1 : 0) - (S.on[a.id] ? 1 : 0) || a.nickname.localeCompare(b.nickname));
    const nOn = fl.filter(p => S.on[p.id]).length;
    h += fl.length ? `<div class="small">Your friends (${f.friends.length}) · ${nOn} online</div><div class="stack" style="gap:6px">` + fl.map(p => { const x = prof(S.pf && S.pf[p.id]), d = statusDot(p.id);
      return `<button class="btn" type="button" data-fp="${esc(p.id)}" style="display:flex;align-items:center;gap:10px;justify-content:flex-start;text-align:left;width:100%"><span style="position:relative;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:18px;background:${x.color};flex:none">${x.avatar}<i style="position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;background:${d.c};border:2px solid var(--panel)"></i></span><span style="display:flex;flex-direction:column"><b>${esc(p.nickname)}</b><span class="hint" style="margin:0">${d.t}</span></span></button>` + (S.openF === p.id ? '<div class="llFp" style="padding:10px 12px;border:1px solid var(--panel-line);border-radius:14px"><p class="hint">Loading profile...</p></div>' : ''); }).join('') + '</div>' : '<p class="hint">No friends yet. Share your friend code.</p>';
    h += `<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="llGhost"${ghost() ? ' checked' : ''}> Appear offline to others</label>`;
    box.innerHTML = h;
    const fq = box.querySelector('#llFq'); if (fq) { fq.oninput = () => { S.fq = fq.value; const pos = fq.selectionStart; drawFriends(card); const n = box.querySelector('#llFq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }; }
    box.querySelectorAll('[data-cancel]').forEach(b => guard(b, async () => { const {error} = await sb.from('friends').delete().eq('a', S.user.id).eq('b', b.dataset.cancel); if (error) { toast('Could not cancel'); return; } await loadFriends(); drawFriends(card); }));
    const gh = box.querySelector('#llGhost'); if (gh) gh.onchange = () => { try { localStorage.setItem('ll.ghost', gh.checked ? '1' : '0'); } catch (e) {} try { if (S.pres) S.pres.track({st: myStatus(), ghost: gh.checked}); } catch (e) {} };
    box.querySelectorAll('[data-fp]').forEach(b => b.onclick = () => { S.openF = S.openF === b.dataset.fp ? null : b.dataset.fp; drawFriends(card); });
    if (S.openF) showFriend(box.querySelector('.llFp'), S.openF, card);
    box.querySelectorAll('[data-room]').forEach(b => b.onclick = () => { const t = b.dataset.room; try { navigator.clipboard.writeText(t).then(() => (H.ok || H.toast)('Room code copied: ' + t + '. Paste it in Live duel → Join.'), () => H.toast('Room code: ' + t, 4000)); } catch (e) { H.toast('Room code: ' + t, 4000); } });
    box.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => { S.openF = b.dataset.reply; drawFriends(card); });
    const ci = box.querySelector('#llClrIn'); if (ci) ci.onclick = () => { S.inbox = []; saveInbox(S.inbox); markDot(); drawFriends(card); };
    if (unread()) { setTimeout(() => { for (const m of S.inbox) m.read = true; saveInbox(S.inbox); markDot(); }, 1500); }
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
  function histHtml(id) {
    const h = S.hist[id] || S.inbox.filter(m => m.from === id).slice().reverse().map(m => ({mine: !!m.out, k: m.k, room: m.room, at: m.at}));
    if (!h.length) return '<p class="hint" style="margin:0">No messages yet. Say hi!</p>';
    return h.map(m => `<div style="align-self:${m.mine ? 'flex-end' : 'flex-start'};max-width:85%;padding:6px 10px;border-radius:14px;background:${m.mine ? 'var(--accent,#e5622b)' : 'var(--panel)'};color:${m.mine ? '#fff' : 'inherit'};font-size:14px">${esc(MSGS[m.k] || '')}${m.room ? ' <b>' + esc(m.room) + '</b>' : ''}<span style="opacity:.6;font-size:11px;margin-left:6px">${ago(m.at)}</span></div>`).join('');
  }
  async function showFriend(el, id, card) {
    if (!el) return;
    const f = (S.friends && S.friends.friends.find(x => x.id === id)) || {}; const pf = (S.pf && S.pf[id]) || {}, x = prof(pf), d = statusDot(id);
    const k = 'fp:' + id; let best = cacheGet(k);
    if (!best) { try { const {data} = await sb.from('scores').select('city,score,kind').eq('user_id', id).order('score', {ascending: false}).limit(40); const seen = {}; best = []; for (const r of data || []) { if (seen[r.city]) continue; seen[r.city] = 1; best.push(r); if (best.length >= 4) break; } cachePut(k, best); } catch (e) { best = []; } }
    if (!el.isConnected) return;
    const day = t => { try { return new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}); } catch (e) { return ''; } };
    const city = c => String(c).charAt(0).toUpperCase() + String(c).slice(1);
    el.innerHTML = `<div class="stack" style="gap:6px"><div class="btnrow" style="align-items:center"><span style="width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:28px;background:${x.color}">${x.avatar}</span><span style="display:flex;flex-direction:column"><b style="color:${x.color};font-size:17px">${esc(f.nickname || pf.nickname || 'Player')}</b>${x.motto ? `<span class="hint" style="margin:0">“${esc(x.motto)}”</span>` : ''}<span class="small" style="color:${d.c}">● ${d.t}</span></span></div>
      ${best.length ? '<div class="small">Best scores</div><div class="btnrow">' + best.map(r => `<span class="tag">${esc(city(r.city))} <b>${esc(r.score)}</b></span>`).join('') + '</div>' : '<p class="hint">No online scores yet.</p>'}
      <p class="hint" style="margin:0">${f.since ? 'Friends since ' + esc(day(f.since)) : ''}${pf.created_at ? ' · playing since ' + esc(day(pf.created_at)) : ''}</p>
      <div class="small">Messages</div><div class="llHist stack" style="gap:4px;max-height:220px;overflow:auto;padding:6px;border-radius:12px;background:var(--land)">${histHtml(id)}</div>
      <div class="small">Send${d.on ? '' : ' (offline: they will see it next time they open the game)'}</div>
      <div class="btnrow" style="gap:4px">${MSG_GROUPS.map(([g], i) => `<button class="btn${(S.mg || 0) === i ? ' primary' : ''}" type="button" data-mg="${i}" style="padding:4px 10px;font-size:13px">${g}</button>`).join('')}</div>
      <div class="btnrow" style="gap:4px">${MSG_GROUPS[S.mg || 0][1].map(i => `<button class="btn" type="button" data-msg="${i}" style="padding:6px 10px;font-size:13px">${esc(MSGS[i])}</button>`).join('')}</div>
      <div class="btnrow"><button class="btn" type="button" id="llRm">Remove friend</button></div></div>`;
    el.querySelectorAll('[data-msg]').forEach(b => guard(b, () => sendMsg(id, +b.dataset.msg)));
    el.querySelectorAll('[data-mg]').forEach(b => b.onclick = () => { S.mg = +b.dataset.mg; showFriend(el, id, card); });
    const hb = el.querySelector('.llHist'); if (hb) { hb.scrollTop = hb.scrollHeight; S.histLoaded = S.histLoaded || {}; if (!S.histLoaded[id]) { S.histLoaded[id] = true; loadHist(id).then(r => { if (r && el.isConnected) { const h2 = el.querySelector('.llHist'); if (h2) { h2.innerHTML = histHtml(id); h2.scrollTop = h2.scrollHeight; } } }); } }
    const rm = el.querySelector('#llRm'); if (rm) rm.onclick = async () => {
      if (rm.dataset.sure !== '1') { rm.dataset.sure = '1'; rm.textContent = 'Tap again to remove'; return; }
      const r1 = await sb.from('friends').delete().eq('a', S.user.id).eq('b', id); const r2 = await sb.from('friends').delete().eq('a', id).eq('b', S.user.id);
      if (r1.error && r2.error) { toast('Could not remove friend'); return; } S.openF = null; await loadFriends(); drawFriends(card); };
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
    H.addMenuSection('Friends', () => { try { return friendsHtml(); } catch (e) { return OFFMSG; } }, () => {});
    H.addMenuSection('Group chats', () => { try { return groupsHtml(); } catch (e) { return OFFMSG; } }, () => { loadGroups().then(drawGroups).catch(() => {}); });
    H.addMenuSection('Profile and account', () => { try { return accountHtml(); } catch (e) { return OFFMSG; } }, () => {});
    H.addMenuSection('Leaderboards', () => { try { return lbHtml(); } catch (e) { return OFFMSG; } }, c => { try { wireLb(c); } catch (e) { console.error(e); } });
  } catch (e) {}
  API._test = {mergeProgress, badName};
})();
