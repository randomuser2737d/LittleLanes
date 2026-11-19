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
  const CITY_RE = /^[a-z]{2,20}$/;
  // a city id is only ever shown (or believed) when it is in the game's own city list: anything else is dropped, never capitalised and shown
  const cityList = () => { try { return (H.cities() || []).filter(c => c && typeof c.id === 'string' && CITY_RE.test(c.id)); } catch (e) { return []; } };
  const isCity = id => typeof id === 'string' && CITY_RE.test(id) && cityList().some(c => c.id === id);
  const cityName = id => { const c = cityList().find(c => c.id === id); return c ? (c.name ? String(c.name) : id.charAt(0).toUpperCase() + id.slice(1)) : ''; };
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const goodId = v => (typeof v === 'number' || typeof v === 'string') && /^[0-9]{1,18}$/.test(String(v)) ? String(v) : null; // database row ids
  const NICK_RE = /^[A-Za-z0-9_-]{3,16}$/;
  const BAD = ['fuck', 'fuk', 'fck', 'fvck', 'phuck', 'shit', 'shyt', 'bitch', 'biatch', 'cunt', 'dick', 'cock', 'penis', 'vagina', 'pussy', 'whore', 'slut', 'nigg', 'nigr', 'fag', 'rape', 'nazi', 'hitler', 'porn', 'sex', 'anal', 'asshole', 'bastard', 'damn', 'retard', 'suicide', 'kill', 'tits', 'boob', 'cum', 'wank', 'twat', 'dildo', 'milf', 'kkk', 'admin', 'moderator', 'kike', 'spic', 'chink', 'tranny', 'dyke', 'pedo', 'molest', 'incest', 'hentai', 'nude', 'naked', 'horny', 'sexy', 'erotic', 'blowjob', 'jizz', 'semen', 'anus', 'idiot', 'stupid', 'dumb', 'loser', 'ugly', 'moron', 'suck', 'hate', 'killyourself',
    'school', 'snap', 'insta', 'tiktok', 'discord', 'whatsapp', 'telegram', 'youtube', 'phone', 'address', 'email', 'gmail'];
  const LEET = {'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i'};
  const collapse = t => t.replace(/(.)\1+/g, '$1');
  // lower-case, leetspeak undone, separators removed, repeated letters squeezed ("F_u_c_k", "sh1iit" -> "fuck", "shit")
  const nickNorm = n => collapse(String(n).toLowerCase().replace(/[01345788@$!|]/g, c => LEET[c]).replace(/[^a-z]/g, ''));
  const BADC = BAD.map(collapse).filter((w, i) => w.length >= 4 && w.length >= BAD[i].length - 1); // squeezed list: skip words the squeeze would shrink into short, harmless-looking ones (boob -> bob)
  const SAFE = /canal|analy|grape|drape|scrape|skill|document|cucumber|accumul|circum|peacock|cockpit|essex|sussex|therap|cocktail|dickens|passion|assum|class|glass|grass|brass|mass|bass|pass/g; // harmless words that contain a blocked fragment
  function badName(n) {
    const raw = String(n).toLowerCase(), plain = raw.replace(/[_\-\s.]/g, '');
    if (/age\d/.test(plain) || /\d{1,2}(yo|yrs|yearold)/.test(plain) || /(yo|yrs)\d/.test(plain)) return true; // "age11", "11yo"
    if ((raw.match(/\d/g) || []).length >= 3) return true; // phone numbers, birth years, ids
    const flat = nickNorm(raw).replace(SAFE, ''); // also try without the squeeze, so short words and "kkk" still count
    const flat2 = raw.replace(/[01345788@$!|]/g, c => LEET[c]).replace(/[^a-z]/g, '').replace(SAFE, '');
    if (BADC.some(w => flat.includes(w)) || BAD.some(w => flat2.includes(w))) return true;
    if (/(^|[^a-z])kys([^a-z]|$)/.test(raw.replace(/[_\-.]/g, ' ')) || flat.startsWith('kys') || flat.endsWith('kys') || /^kms|kms$/.test(flat)) return true; // "kys" only at the edges: it hides inside harmless words
    return false;
  }
  // a name that normalises to an existing friend's nickname is impersonation
  function copiesFriend(n) {
    const k = nickNorm(n); if (!k) return false;
    const mine = S.profile && S.profile.nickname;
    const all = [...((S.friends && S.friends.friends) || []), ...((S.friends && S.friends.incoming) || []), ...((S.friends && S.friends.sent) || [])];
    return all.some(f => f && f.nickname && nickNorm(f.nickname) === k && !(mine && String(f.nickname) === String(mine)));
  }
  // friendly text for errors the server raises on purpose
  const FRIENDLY = [[/bad nickname/i, 'That nickname is not allowed. Please pick a different one.'], [/nickname taken/i, 'That nickname is taken'], [/rename limit/i, 'You changed your nickname recently. Try again later.'],
    [/register device/i, 'This device is not set up yet. Close and reopen Little Lanes, then try again.'], [/message limit/i, 'Message limit reached. Try again in a few minutes.'], [/rate limit/i, 'Slow down a little. Try again in a minute.'], [/not allowed/i, 'That is not allowed.']];
  const friendlyErr = e => { const m = e && (e.message || e.details || e.hint); if (typeof m !== 'string') return ''; for (const [re, t] of FRIENDLY) if (re.test(m)) return t; return ''; };
  function guard(btn, fn) { // rate limit: disable for 2 s
    if (!btn) return;
    btn.onclick = async ev => {
      if (btn.disabled) return;
      btn.disabled = true; setTimeout(() => { try { btn.disabled = false; } catch (e) {} }, 2000);
      try { await fn(ev); } catch (e) { toast('Something went wrong. Try again.'); }
    };
  }
  const errCode = e => e && (e.code || '') ;
  const isTaken = e => e && (e.code === '23505' || /duplicate|unique|already|nickname taken/i.test(e.message || ''));

  // ---------- state ----------
  const S = {user: null, profile: null, session: null, showCode: false, friends: null, lbCity: null, lbTab: 'all', cache: {}, syncing: false};
  const listeners = [];
  const changed = () => { for (const f of listeners) { try { f(S.user, S.profile); } catch (e) {} } };
  const API = {sb, user: () => S.user, profile: () => S.profile, myCode: () => S.myCode || (S.profile && S.profile.friend_code) || '', loadMyCode, ready: null, onChange: f => { if (typeof f === 'function') listeners.push(f); }};
  W.LLOnline = API;

  async function loadProfile() {
    S.profile = null;
    if (!S.user) return;
    try {
      const {data, error} = await sb.from('profiles').select('id,nickname,avatar,color,motto,status,created_at,emote_loadout').eq('id', S.user.id).maybeSingle();
      if (!error && data) S.profile = data;
    } catch (e) {}
    await loadMyCode();
  }
  // our own friend code: the server hides codes in profiles, so ask for it; older servers still have it on the profile row
  async function loadMyCode() {
    S.myCode = null; if (!S.profile) return null;
    try { if (typeof sb.rpc === 'function') { const r = await sb.rpc('my_friend_code'); if (r && !r.error && typeof r.data === 'string' && /^[A-Za-z0-9]{4,8}$/.test(r.data)) S.myCode = r.data.toUpperCase(); } } catch (e) {}
    if (!S.myCode && S.profile && typeof S.profile.friend_code === 'string' && /^[A-Za-z0-9]{4,8}$/.test(S.profile.friend_code)) S.myCode = S.profile.friend_code.toUpperCase();
    return S.myCode;
  }
  async function setSession(session) {
    S.session = session || null;
    const u = session && session.user ? session.user : null;
    const same = (u && S.user && u.id === S.user.id);
    S.user = u;
    if (!u) { S.profile = null; S.myCode = null; S.friends = null; S.cache = {}; }
    else if (!same) { await loadProfile(); }
    changed();
  }

  // ---------- private realtime channels ----------
  // Channels are private (the server checks who may join). The realtime socket needs the current login token before joining, and again whenever it is refreshed.
  const RT_AUTH_RE = /unauthori|forbidden|permission|denied|policy|not allowed|private|jwt|token/i;
  async function rtAuth() { try { if (sb.realtime && typeof sb.realtime.setAuth === 'function') await sb.realtime.setAuth(); } catch (e) {} }
  // join a private channel; if the server refuses (not set up yet) join a public one so everything keeps working
  function openChan(name, baseCfg, attach, onSub, store) {
    let fell = false;
    const make = priv => {
      const ch = sb.channel(name, {config: Object.assign({}, baseCfg, priv ? {private: true} : {})});
      try { attach && attach(ch); } catch (e) {}
      store && store(ch);
      ch.subscribe((st, err) => {
        if (st === 'SUBSCRIBED') { try { onSub && onSub(ch); } catch (e) {} }
        else if (priv && !fell && st === 'CHANNEL_ERROR' && (!err || RT_AUTH_RE.test(String((err && err.message) || err)))) { fell = true; try { sb.removeChannel(ch); } catch (e) {} make(false); }
      });
      return ch;
    };
    return make(true);
  }
  // a short-lived channel for sending one broadcast
  function sendChannel(name) {
    return new Promise(res => {
      let done = false, cur = null; const fin = ch => { if (!done) { done = true; clearTimeout(t); res(ch); } };
      const t = setTimeout(() => fin(cur), 4000);
      openChan(name, {}, null, ch => fin(ch), ch => { cur = ch; });
    });
  }
  // ---------- who's online (live presence) ----------
  S.on = {}; // user id -> {st}
  const ghost = () => { try { return localStorage.getItem('ll.ghost') === '1'; } catch (e) { return false; } };
  const myStatus = () => { try { if (H.inLiveDuel && H.inLiveDuel()) return 'duel'; if (H.duelState && H.duelState()) return 'playing'; const lr = H.lastRun && H.lastRun(); return lr && !lr.over ? 'playing' : 'menu'; } catch (e) { return 'menu'; } };
  // what we tell friends: where we are, and (when playing) the city and week. While "Appear offline" is on nothing is sent at all (we listen, but never track).
  function myPresence() {
    const g = ghost(), p = {st: myStatus(), ghost: g, uid: S.user ? S.user.id : ''};
    if (g || p.st === 'menu') return p;
    try {
      const ds = H.duelState && H.duelState(); let c = ds && ds.cityId, wk = ds && ds.week;
      if (!ds) { const lr = H.lastRun && H.lastRun(); if (lr && !lr.over) { c = lr.cityId; wk = lr.week; } }
      if (typeof c === 'string' && CITY_RE.test(c)) { p.city = c; const w = Math.floor(+wk); if (w >= 1 && w <= 999) p.wk = w; }
    } catch (e) {}
    return p;
  }
  function pushPresence() {
    try {
      const ch = S.pres; if (!ch || !S.presOn) return;
      if (ghost()) { if (S.tracked) { S.tracked = false; if (ch.untrack) ch.untrack(); } return; }
      S.tracked = true; ch.track(myPresence());
    } catch (e) {}
  }
  const trackNow = () => { try { clearTimeout(S.trkT); S.trkT = setTimeout(pushPresence, 800); } catch (e) {} };
  try { for (const ev of ['newgame', 'gameover', 'menu']) H.on(ev, trackNow); } catch (e) {}
  // who is online: keys are chosen by the client, so only my accepted friends count, and only an entry that names the same user as its key
  function computeOn() {
    const m = {};
    try {
      const ch = S.pres, ids = new Set((S.friends && S.friends.ids) || []);
      const st = ch && ch.presenceState ? (ch.presenceState() || {}) : {};
      for (const k of Object.keys(st)) {
        if (!ids.has(k)) continue;
        const arr = Array.isArray(st[k]) ? st[k].slice(0, 5) : [];
        const okMeta = a => a && typeof a === 'object' && JSON.stringify(a).length <= 400;
        const a = arr.find(x => okMeta(x) && x.uid === k); // extras (other entries under the same key) are ignored
        if (!a || a.ghost) continue;
        const o = {st: a.st === 'duel' || a.st === 'playing' ? a.st : 'menu'};
        if (o.st !== 'menu' && isCity(a.city)) { o.city = a.city; if (Number.isInteger(a.wk) && a.wk >= 1 && a.wk <= 999) o.wk = a.wk; }
        m[k] = o;
      }
    } catch (e) {}
    S.on = m; try { if (document.querySelector('#llFr')) drawFriends(document); } catch (e) {}
  }
  function startPresence() {
    try {
      if (S.pres) { sb.removeChannel(S.pres); S.pres = null; }
      S.presOn = false; S.tracked = false;
      if (!S.user || !sb.channel) return;
      const gen = S.presGen = (S.presGen || 0) + 1, uid = S.user.id;
      rtAuth().then(() => { if (gen !== S.presGen || !S.user || S.user.id !== uid) return;
        openChan('ll-online', {presence: {key: uid}}, ch => ch.on('presence', {event: 'sync'}, computeOn), ch => { S.presOn = true; pushPresence(); }, ch => { S.pres = ch; S.presOn = false; }); });
    } catch (e) {}
  }
  try { if (typeof setInterval === 'function') setInterval(pushPresence, 20000); } catch (e) {}
  listeners.push(u => { if (!u && S.pres) { try { sb.removeChannel(S.pres); } catch (e) {} S.pres = null; S.presOn = false; S.on = {}; } else if (u && !S.pres) startPresence(); });
  const statusDot = id => { const o = S.on[id]; const c = !o ? '#9aa0a6' : o.st === 'menu' ? '#2f9e5b' : '#e8a317'; let t = !o ? 'Offline' : o.st === 'duel' ? 'In a duel' : o.st === 'playing' ? 'Playing' : 'Online'; if (o && o.city && isCity(o.city)) t += ' ' + cityName(o.city) + (o.wk ? ' · wk ' + o.wk : ''); return {c, t, on: !!o}; };
  API.isOnline = id => !!S.on[id];
  // everything private to an account is dropped when the account signs out or changes (including remote sign-out)
  listeners.push(u => {
    const id = u ? u.id : null;
    if (S.acctId === id) return;
    const had = S.acctId !== undefined; S.acctId = id;
    if (!had && id) return;
    try { for (const k of Object.keys(S.gch || {})) { try { if (S.gch[k] && S.gch[k] !== 'pending') sb.removeChannel(S.gch[k]); } catch (e) {} } } catch (e) {}
    S.gch = {}; S.groups = []; S.ginv = []; S.gmem = {}; S.ghist = {}; S.gUnread = {}; S.openG = null; S.gLoaded = false;
    S.fl = {}; S.seen = new Map(); S.toastAt = {}; S.on = {}; S.hist = {}; S.histLoaded = {}; S.openF = null; S.friends = null; S.seenReq = null; S.inbox = []; S.sentAt = []; S.blocked = []; S.rx = {}; S.pollc = {}; S.rxOpen = null;
    try { localStorage.removeItem('ll.inbox'); } catch (e) {}
    try { if (S.inboxCh) { sb.removeChannel(S.inboxCh); S.inboxCh = null; } if (id) startInbox(); } catch (e) {}
    markDot();
  });

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
  MSGS.push('Challenge card', 'Challenge reply', 'Join my co-op party!'); // 34 = challenge card, 35 = reply card, 36 = co-op invite (sent from buttons, not the quick list)
  MSGS.push('Chat message'); // 37 = tile message (tiles/slots/emo columns, text comes from chatdata.js)
  const tileShape = (t, s, e) => Array.isArray(t) && t.length <= 3 && t.every(x => Number.isInteger(x) && x >= 1 && x <= 999) && Array.isArray(s) && s.length === t.length && s.every(x => x === null || (typeof x === 'string' && CITY_RE.test(x))) && Array.isArray(e) && e.length <= 3 && e.every(x => Number.isInteger(x) && x >= 0 && x <= 39) && t.length + e.length >= 1;
  // a tile message is only believed when its shape is right AND the phrase library knows every tile (emoji-only messages need only known emoji)
  function msgValid(m) {
    try { const D = W.LLChatData; if (!D || !m || !tileShape(m.t, m.s, m.e)) return false;
      if (m.t.length && D.setCities) D.setCities((H.cities() || []).filter(c => CITY_RE.test(c.id)).map(c => ({id: c.id, name: c.name}))); // city slots come from the game's own city list
      if (!m.t.length) return m.e.every(i => D.emoji && D.emoji.some(x => x.id === i));
      return !!D.validate(m); } catch (e) { return false; }
  }
  const rowMsg = r => { if (!r || r.k !== 37) return null; const m = {t: Array.isArray(r.tiles) ? r.tiles : [], s: Array.isArray(r.slots) ? r.slots : [], e: Array.isArray(r.emo) ? r.emo : []}; if (!m.t.length) m.s = []; return msgValid(m) ? m : null; };
  const TILECOLS = ',tiles,slots,emo';
  const chatText = m => { try { return W.LLChatData.render(m); } catch (e) { return 'Chat message'; } };
  const roomFor = k => { try { return k === 3 ? (W.LLDuelRoom && W.LLDuelRoom()) || '' : k === 36 ? (W.LLPartyRoom && W.LLPartyRoom()) || '' : ''; } catch (e) { return ''; } };
  const ROOM_RE = /^[A-Z]{4}$/;
  const roomOf = (k, v) => (k === 3 || k === 36) && typeof v === 'string' && ROOM_RE.test(v) ? v : ''; // a room code only ever belongs to duel / co-op invites
  const goodTime = v => { const t = Date.parse(v); return Number.isFinite(t) && t > 0 ? t : null; };
  const goodUid = v => typeof v === 'string' && v.length > 0 && v.length <= 64;
  const isBlocked = id => !!(S.blocked && S.blocked.some(b => b.id === id));
  // one strictly checked message row (direct or group): null when anything about it is off, so it is dropped and never drawn
  function cleanRow(r, group) {
    if (!r || typeof r !== 'object' || !Number.isInteger(r.k) || r.k < 0 || r.k >= MSGS.length) return null;
    if (group && (r.k === 3 || (r.k >= 34 && r.k !== 37))) return null;
    const at = goodTime(r.created_at); if (at == null) return null;
    const isC = r.k === 34 || r.k === 35, card = isC ? rowCard(r) : null; if (isC && !card) return null;
    const msg = r.k === 37 ? rowMsg(r) : null; if (r.k === 37 && !msg) return null;
    return {k: r.k, room: group ? '' : roomOf(r.k, r.room), card, msg, at};
  }
  const capPush = (arr, item, n) => { arr.push(item); if (arr.length > n) arr.splice(0, arr.length - n); return arr; };
  // flood control for broadcasts (they are only hints: the database row is what counts)
  S.fl = {}; S.seen = new Map(); S.toastAt = {};
  const throttle = key => { const now = Date.now(), t = S.fl[key] || 0; if (now - t < 2000) return false; S.fl[key] = now; const ks = Object.keys(S.fl); if (ks.length > 200) for (const k of ks.slice(0, 100)) delete S.fl[k]; return true; };
  const firstSeen = id => { if (!id) return true; if (S.seen.has(id)) return false; S.seen.set(id, 1); if (S.seen.size > 500) S.seen.delete(S.seen.keys().next().value); return true; };
  const mayToast = who => { const now = Date.now(), t = S.toastAt[who] || 0; if (now - t < 10000) return false; S.toastAt[who] = now; const ks = Object.keys(S.toastAt); if (ks.length > 200) for (const k of ks.slice(0, 100)) delete S.toastAt[k]; return true; };
  const okCard = (city, seed, score) => isCity(city) && Number.isInteger(seed) && seed >= -2147483648 && seed <= 2147483647 && Number.isInteger(score) && score >= 0 && score <= 100000 ? {city, seed, score} : null;
  const rowCard = r => r && r.card_city != null ? okCard(r.card_city, r.card_seed, r.card_score) : null;
  const msgText = m => m.k === 37 ? (m.msg ? chatText(m.msg) : 'Chat message') : (m.k === 34 || m.k === 35) ? (m.card && isCity(m.card.city) ? (m.k === 34 ? '🏁 Beat my ' : '🏆 I got ') + m.card.score + ' in ' + cityName(m.card.city) : '') : (MSGS[m.k] || '');
  const MSG_GROUPS = [['Ask', [0, 14, 17, 18, 19, 26, 27]], ['Duel', [1, 2, 19, 3, 21, 22, 10]], ['Answer', [4, 5, 6, 31, 33, 32, 16]], ['Cheer', [15, 9, 13, 23, 24, 25, 28]], ['Ideas', [7, 8, 12, 29, 30, 11, 20]]];
  const cardShape = c => c && typeof c === 'object' && typeof c.city === 'string' && CITY_RE.test(c.city) && Number.isInteger(c.seed) && Number.isInteger(c.score) && c.score >= 0 && c.score <= 100000;
  // a message that may be drawn right now: challenge cards need a city the game knows, tile messages need the phrase library's approval
  const visible = m => !!m && Number.isInteger(m.k) && !!MSGS[m.k] && ((m.k !== 34 && m.k !== 35) || (m.card && isCity(m.card.city))) && (m.k !== 37 || !!m.msg);
  const loadInbox = () => { try { const a = JSON.parse(localStorage.getItem('ll.inbox')); return Array.isArray(a) ? a.slice(0, 30).filter(m => m && Number.isInteger(m.k) && MSGS[m.k] && goodUid(m.from) && Number.isFinite(+m.at)).map(m => ({from: m.from, nick: String(m.nick == null ? '' : m.nick).slice(0, 16), k: m.k, room: roomOf(m.k, m.room), card: cardShape(m.card) ? {city: m.card.city, seed: m.card.seed, score: m.card.score} : null, msg: m.k === 37 && m.msg && tileShape(m.msg.t, m.msg.s, m.msg.e) ? m.msg : null, at: +m.at, read: !!m.read, out: !!m.out})).filter(m => (m.k !== 34 && m.k !== 35 || m.card) && (m.k !== 37 || m.msg)) : []; } catch (e) { return []; } };
  const saveInbox = a => { try { localStorage.setItem('ll.inbox', JSON.stringify(a.slice(0, 30))); } catch (e) {} };
  S.inbox = loadInbox();
  const unread = () => S.inbox.filter(m => !m.read && !m.out).length;
  const markDot = () => { try { const mb = document.getElementById('menuBtn'); if (mb) mb.classList.toggle('lldot', unread() > 0 || !!(S.friends && S.friends.incoming.length) || !!(S.ginv && S.ginv.length) || Object.values(S.gUnread || {}).some(n => n > 0)); } catch (e) {} };
  // the chat app tells us which conversation is on screen ('f:<id>' or 'g:<id>'), so those messages count as read
  const viewing = key => S.chatView === key && !(typeof document !== 'undefined' && document.hidden);
  const msgL = []; API.onMsg = f => { if (typeof f === 'function') msgL.push(f); };
  const fireMsg = (kind, id) => { for (const f of msgL) { try { f(kind, id); } catch (e) {} } };
  const unreadAll = () => unread() + Object.values(S.gUnread || {}).reduce((a, n) => a + (n > 0 ? n : 0), 0);
  function startInbox() {
    try {
      if (S.inboxCh) { sb.removeChannel(S.inboxCh); S.inboxCh = null; }
      if (!S.user || !sb.channel) return;
      const gen = S.inboxGen = (S.inboxGen || 0) + 1, uid = S.user.id;
      const attach = ch => ch.on('broadcast', {event: 'm'}, async ({payload: p}) => {
        try {
        if (!p || !Number.isInteger(p.k) || !MSGS[p.k] || typeof p.from !== 'string' || !S.user) return;
        const fr = S.friends && S.friends.friends.find(f => f.id === p.from); if (!fr) return; // friends only
        if (isBlocked(fr.id)) return;
        if (!throttle('f' + fr.id)) return; // at most one handled per sender every 2 s
        // a broadcast can be forged by anyone who knows the channel name, so only believe it if the database has the message
        const mk = cols => sb.from('messages').select(cols).eq('from_id', fr.id).eq('to_id', S.user.id).eq('k', p.k).gte('created_at', new Date(Date.now() - 120000).toISOString()).order('created_at', {ascending: false}).limit(1);
        let rr = await mk('id,room,created_at,k,card_city,card_seed,card_score' + TILECOLS); if (rr.error) rr = await mk('id,room,created_at,k,card_city,card_seed,card_score'); if (rr.error) rr = await mk('room,created_at,k');
        const rows = rr.data;
        if (!rows || !rows.length || !S.user) return;
        const row = Object.assign({}, rows[0], {k: p.k}), mid = goodId(row.id);
        if (mid && (!firstSeen('m' + mid) || (S.hist[fr.id] || []).some(x => x.id === mid))) return; // each database row is handled once
        const cr = cleanRow(row, false); if (!cr) return; // wrong shape, unknown city, unknown phrase...: ignored
        const {room, card, msg} = cr;
        const seen = viewing('f:' + fr.id);
        S.inbox.unshift({from: fr.id, nick: fr.nickname, k: p.k, room, card, msg, at: Date.now(), read: seen}); if (S.inbox.length > 30) S.inbox.length = 30; saveInbox(S.inbox); markDot(); if (S.hist[fr.id]) capPush(S.hist[fr.id], {id: mid, mine: false, k: p.k, room, card, msg, at: Date.now()}, 100); if (S.openF === fr.id || seen) sb.from('messages').update({read: true}).eq('from_id', fr.id).eq('to_id', S.user.id).eq('read', false).then(() => {}, () => {});
        if (mayToast('f' + fr.id)) { // one toast / notification per sender every 10 s
          notify(fr.nickname, msgText({k: p.k, card, msg}) + (room ? ' Room ' + room : ''));
          if (!seen) { try { (H.ok || H.toast)(fr.nickname + ': ' + msgText({k: p.k, card, msg}) + (room ? ' Room ' + room : ''), 5000); H.tone && H.tone(880, .12, .04, 'triangle'); } catch (e) {} }
        }
        try { if (document.querySelector('#llFr')) drawFriends(document); } catch (e) {}
        fireMsg('f', fr.id);
        } catch (e) {}
      });
      rtAuth().then(() => { if (gen !== S.inboxGen || !S.user || S.user.id !== uid) return; openChan('inbox:' + uid, {}, attach, null, ch => { S.inboxCh = ch; }); });
    } catch (e) {}
  }
  listeners.push(u => { if (!u && S.inboxCh) { try { sb.removeChannel(S.inboxCh); } catch (e) {} S.inboxCh = null; } else if (u && !S.inboxCh) startInbox(); });
  async function sendMsg(to, k, card, msg) {
    const now = Date.now(); S.sentAt = (S.sentAt || []).filter(t => now - t < 300000);
    if (k !== 37 && S.sentAt.length && now - S.sentAt[S.sentAt.length - 1] < 3000) { toast('Slow down a little'); return false; } // chat messages have their own 2 s / 10 per minute limit in chat.js
    if (S.sentAt.length >= 20) { toast('Message limit reached. Try again in a few minutes.'); return false; }
    if (!Number.isInteger(k) || !MSGS[k] || !(S.friends && S.friends.ids.includes(to))) return false;
    if (S.blocked && S.blocked.some(b => b.id === to)) return false;
    if (k === 37 && !msgValid(msg)) return false;
    const room = roomFor(k);
    if ((k === 3 || k === 36) && !room) { toast('Create a room first'); return false; }
    const isCard = k === 34 || k === 35;
    if (isCard && !(card = okCard(card && card.city, card && card.seed, card && card.score))) { toast('Finish a classic game first'); return false; }
    const row = {to_id: to, k, room: room || null};
    if (k === 37) { if (msg.t.length) { row.tiles = msg.t.slice(); row.slots = msg.s.slice(); } if (msg.e.length) row.emo = msg.e.slice(); }
    if (isCard) { row.card_city = card.city; row.card_seed = card.seed; row.card_score = card.score; }
    const ins = await sb.from('messages').insert(row).select('id').single();
    if (ins.error) { toast(friendlyErr(ins.error) || (/relation|exist|schema|column/i.test(ins.error.message || '') ? 'Message history needs the new database update' : /limit/i.test(ins.error.message || '') ? 'Message limit reached. Try again in a few minutes.' : 'Could not send. Try again.')); return false; }
    const mid = goodId(ins.data && ins.data.id);
    if (!S.on[to]) { S.sentAt.push(now); afterSend(to, k, room, now, card, mid, msg); return true; }
    await rtAuth();
    const ch = await sendChannel('inbox:' + to);
    let r = 'error'; try { r = ch ? await ch.send({type: 'broadcast', event: 'm', payload: {from: S.user.id, k, room: room || ''}}) : 'error'; } catch (e) {}
    setTimeout(() => { try { if (ch) sb.removeChannel(ch); } catch (e) {} }, 1500);
    if (r !== 'ok') { toast('Could not send. Try again.'); return false; }
    S.sentAt.push(now); afterSend(to, k, room, now, card, mid, msg); return true;
  }
  try { if (typeof setInterval === 'function') setInterval(() => { if (S.user && !(typeof document !== 'undefined' && document.hidden)) loadMissed(); }, 120000); } catch (e) {}
  function afterSend(to, k, room, now, card, mid, msg) {
    const fr = S.friends && S.friends.friends.find(f => f.id === to);
    S.inbox.unshift({from: to, nick: fr ? fr.nickname : 'Friend', k, room: room || '', card: card || null, msg: msg || null, at: now, out: true, read: true}); if (S.inbox.length > 30) S.inbox.length = 30; saveInbox(S.inbox);
    S.lastOk = Date.now(); capPush(S.hist[to] = S.hist[to] || [], {id: mid || null, mine: true, k, room: room || '', card: card || null, msg: msg || null, at: now}, 100);
    if (k !== 37) toast('Message sent to ' + (fr ? fr.nickname : 'your friend') + (S.on[to] ? '' : ' (they will see it next time)'));
    try { if (document.querySelector('#llFr')) drawFriends(document); } catch (e) {}
    fireMsg('f', to);
  }
  S.hist = {}; S.rx = {};
  function markAllRead() { try { if (S.user) sb.from('messages').update({read: true}).eq('to_id', S.user.id).eq('read', false).then(() => {}, () => {}); } catch (e) {} }
  async function loadHist(id) {
    try { const me = S.user.id;
      const mk = cols => sb.from('messages').select(cols).or(`and(from_id.eq.${me},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${me})`).order('created_at', {ascending: false}).limit(40);
      if (!goodUid(id)) return null;
      let res = await mk('id,from_id,to_id,k,room,created_at,read,card_city,card_seed,card_score' + TILECOLS); if (res.error) res = await mk('id,from_id,to_id,k,room,created_at,read,card_city,card_seed,card_score'); if (res.error) res = await mk('from_id,to_id,k,room,created_at,read');
      const {data, error} = res;
      if (error) return null;
      const hl = [];
      for (const m of (data || []).slice().reverse()) { if (!m || (m.from_id !== me && m.from_id !== id) || (m.to_id !== me && m.to_id !== id)) continue; const c = cleanRow(m, false); if (!c) continue; const mid = goodId(m.id); if (mid) S.seen.set('m' + mid, 1); hl.push({id: mid, mine: m.from_id === me, k: c.k, room: c.room, card: c.card, msg: c.msg, unread: m.to_id === me && m.read === false, at: c.at}); }
      S.hist[id] = hl.slice(-100);
      if ((data || []).some(m => m.to_id === me && !m.read)) sb.from('messages').update({read: true}).eq('from_id', id).eq('to_id', me).eq('read', false).then(() => {}, () => {});
      await loadRx(S.hist[id]);
      return S.hist[id];
    } catch (e) { return null; }
  }
  async function loadRx(list) {
    try { const ids = list.map(m => m.id).filter(Boolean); if (!ids.length) return;
      const {data, error} = await sb.from('message_reactions').select('message_id,user_id,r').in('message_id', ids);
      if (error) return;
      for (const id of ids) S.rx[id] = {};
      for (const x of data || []) { const mid = goodId(x.message_id); if (mid && goodUid(x.user_id) && Number.isInteger(x.r) && x.r >= 0 && x.r < RX.length && S.rx[mid]) S.rx[mid][x.user_id] = x.r; }
    } catch (e) {}
  }
  const RX = ['👍', '😂', '😮', '🔥', '❤️', '🎉'];
  async function react(mid, r) {
    if (!S.user || !goodId(mid) || !Number.isInteger(r) || r < 0 || r >= RX.length) return;
    const me = S.user.id, m = (S.rx[mid] = S.rx[mid] || {}), prev = m[me];
    let error;
    if (prev === r) { delete m[me]; ({error} = await sb.from('message_reactions').delete().eq('message_id', mid).eq('user_id', me)); }
    else { m[me] = r; ({error} = await sb.from('message_reactions').upsert({message_id: mid, user_id: me, r}, {onConflict: 'message_id,user_id'})); }
    if (error) { if (prev === undefined) delete m[me]; else m[me] = prev; toast(friendlyErr(error) || (/limit/i.test(error.message || '') ? 'Slow down a little' : 'Could not react')); }
  }
  async function loadMissed() {
    try { if (!S.user) return; const mk = cols => sb.from('messages').select(cols).eq('to_id', S.user.id).eq('read', false).order('created_at', {ascending: false}).limit(30);
      let res = await mk('id,from_id,k,room,created_at,card_city,card_seed,card_score' + TILECOLS); if (res.error) res = await mk('id,from_id,k,room,created_at,card_city,card_seed,card_score'); if (res.error) res = await mk('from_id,k,room,created_at');
      const {data, error} = res;
      if (error || !data || !data.length) return;
      if (!S.friends) await loadFriends();
      let n = 0;
      for (const m of data.slice().reverse()) { const fr = S.friends && typeof m.from_id === 'string' && S.friends.friends.find(f => f.id === m.from_id); if (!fr || isBlocked(fr.id)) continue;
        const c = cleanRow(m, false); if (!c) continue; const {card, msg, room, at} = c, mid = goodId(m.id);
        if (mid && !firstSeen('m' + mid)) continue; // each database row is handled once
        if (S.inbox.some(x => !x.out && x.from === fr.id && x.k === m.k && Math.abs(x.at - at) < (m.k === 37 ? 1500 : 15000))) continue; const seen = viewing('f:' + fr.id); S.inbox.unshift({from: fr.id, nick: fr.nickname, k: m.k, room, card, msg, at, read: seen}); if (S.inbox.length > 30) S.inbox.length = 30; if (S.hist[fr.id]) capPush(S.hist[fr.id], {id: mid, mine: false, k: m.k, room, card, msg, at}, 100); if (seen) { sb.from('messages').update({read: true}).eq('from_id', fr.id).eq('to_id', S.user.id).eq('read', false).then(() => {}, () => {}); continue; } fireMsg('f', fr.id); n++; }
      if (S.inbox.length > 30) S.inbox.length = 30;
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
      if (session) setTimeout(rtAuth, 0); // the realtime socket needs every new token
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
    if (error) { toast(friendlyErr(error) || (/column/i.test(error.message || '') ? 'Profile styles need the new database update (see supabase-setup.sql)' : (isTaken(error) ? 'That nickname is taken' : /limit/i.test(error.message || '') ? 'You are changing your status too often. Try again later.' : 'Could not save profile'))); return false; }
    Object.assign(S.profile, patch); changed(); toast('Profile saved'); rerender(); return true;
  }
  function onlineHtml() {
    if (!online()) return OFFMSG;
    if (!S.user) return `<div class="stack"><p class="small">Play with friends and climb the leaderboards. No email needed, just a nickname.</p><div class="btnrow"><button class="btn primary" id="llGo">Go online (new account)</button></div>
      <p class="hint" style="margin:0">Already have an account on another device? Open <b>Sign-in and devices</b> below.</p></div>`;
    if (!S.profile) return `<div class="stack"><p class="small">Pick a nickname (3 to 16 letters, numbers, - or _).</p><div class="btnrow"><input id="llNick" style="${inp}" maxlength="16" placeholder="Nickname" autocomplete="off"><button class="btn primary" id="llNickSave">Save</button></div><div class="btnrow"><button class="btn" id="llOut">Sign out</button></div></div>`;
    const p = S.profile;
    const code = S.showCode && S.session ? `<div class="stack"><p class="hint">Only use this to move YOUR account to your own device. Never send it to anyone, it works like a password. It hides itself after 1 minute.</p><input readonly id="llCode" style="${inp}" value="${esc(S.session.refresh_token)}"><div class="btnrow"><button class="btn" id="llCopy">Copy</button><button class="btn" id="llHide">Hide</button></div></div>` : '';
    const nOn = S.friends ? S.friends.friends.filter(f => S.on[f.id]).length : 0, nReq = S.friends ? S.friends.incoming.length : 0;
    const nUn = unreadAll();
    return `<div class="stack">
      <button class="btn primary" id="llChatsBtn" type="button" style="min-height:52px;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;width:100%">💬 Chats${nUn ? ` <span class="tag" id="llChatsBadge" style="background:#d63c3c;color:#fff;font-size:13px">${nUn > 99 ? '99+' : nUn}</span>` : ''}</button>
      <div class="btnrow" style="align-items:center"><span style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:24px;background:${prof(p).color}">${prof(p).avatar}</span><span class="stack" style="gap:0"><b style="color:${prof(p).color}">${esc(p.nickname)}</b>${prof(p).motto ? `<span class="hint">${esc(prof(p).motto)}</span>` : ''}</span><span class="codebox"><span class="small">Friend code</span><b>${esc(S.myCode || p.friend_code || '')}</b><button class="btn" id="llCopyFc" type="button">Copy</button></span></div>
      <div class="btnrow" style="align-items:center"><span class="small">Status</span><select id="llStatus" style="${inp}"><option value="">(none)</option>${STATUSES.map((t, i) => `<option value="${i}"${p.status === i ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="btnrow"><span class="tag">🟢 ${nOn} friend${nOn === 1 ? '' : 's'} online</span>${nReq ? `<span class="tag" style="background:#d63c3c;color:#fff">${nReq} friend request${nReq === 1 ? '' : 's'}</span>` : ''}${unread() ? `<span class="tag" style="background:#2f9e5b;color:#fff">${unread()} new message${unread() === 1 ? '' : 's'}</span>` : ''}</div></div>`;
  }
  function friendsHtml() {
    if (!online() || !S.profile) return '<p class="hint">Go online and pick a nickname first (top of this page).</p>';
    return `<div class="stack"><form class="btnrow" id="llAddF"><input id="llFc" style="${inp}" maxlength="8" placeholder="Add a friend by their code" autocomplete="off"><button class="btn primary" id="llAdd" type="submit">Add</button></form>
      <div id="llFr" class="stack"><p class="hint">Loading friends...</p></div>
      <details id="llFbD"><summary class="small"><b>Friends' best</b></summary><div class="stack" style="margin-top:8px"><select id="llFbCity" style="${inp}">${((() => { try { return (H.cities() || []).filter(c => c.unlocked); } catch (e) { return []; } })()).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><div id="llFb" class="stack"><p class="hint">Open to see how you and your friends compare.</p></div></div></details></div>`;
  }
  function accountHtml() {
    if (!online()) return OFFMSG;
    if (!S.profile) return '<p class="hint">Go online and pick a nickname first.</p>';
    const p = S.profile;
    const code = S.showCode && S.session ? `<div class="stack"><p class="hint">Only use this to move YOUR account to your own device. Never send it to anyone, it works like a password. It hides itself after 1 minute.</p><input readonly id="llCode" style="${inp}" value="${esc(S.session.refresh_token)}"><div class="btnrow"><button class="btn" id="llCopy">Copy</button><button class="btn" id="llHide">Hide</button></div></div>` : '';
    return `<div class="stack">${profileHtml(p)}
      <p class="hint" style="margin:0">To use this account on another device, open <b>Sign-in and devices</b>.</p>
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
    { const cb = q('#llChatsBtn'); if (cb) cb.onclick = () => { try { if (W.LLChat) W.LLChat.open(); else toast('Chat is not available right now'); } catch (e) {} }; }
    guard(q('#llTuse'), () => useTransfer(card));
    guard(q('#llOut'), async () => { if (W.LLLocalSignOut) await W.LLLocalSignOut(); else { try { await sb.auth.signOut({scope: 'local'}); } catch (e) {} } S.showCode = false; S.inbox = []; await setSession(null); rerender(); });
    guard(q('#llNickSave'), async () => {
      const n = (q('#llNick').value || '').trim();
      if (!NICK_RE.test(n)) { toast('Nickname: 3 to 16 letters, numbers, - or _'); return; }
      if (badName(n) || copiesFriend(n)) { toast('Please pick a different nickname'); return; }
      const {error} = await sb.from('profiles').insert({id: S.user.id, nickname: n});
      if (error) { toast(friendlyErr(error) || (isTaken(error) ? 'That nickname is taken' : 'Could not save nickname')); return; }
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
    const stSel = q('#llStatus'); if (stSel) stSel.onchange = () => { const v = stSel.value; if (v === '') { saveProf({status: null}); return; } const n = +v; if (Number.isInteger(n) && STATUSES[n]) saveProf({status: n}); };
    const mo = q('#llMotto'); if (mo) mo.onchange = () => { if (MOTTOS.includes(mo.value)) saveProf({motto: mo.value}); };
    guard(q('#llNickChg'), async () => {
      const n = (q('#llNick2').value || '').trim();
      if (!n) { toast('Type a new nickname first'); return; }
      if (!NICK_RE.test(n)) { toast('Nickname: 3 to 16 letters, numbers, - or _'); return; }
      if (badName(n) || copiesFriend(n)) { toast('Please pick a different nickname'); return; }
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
      const t = S.myCode || (S.profile && S.profile.friend_code); if (!t) return;
      try { await navigator.clipboard.writeText(t); (H.ok || H.toast)('Friend code copied: ' + t); } catch (e) { H.toast('Your friend code is ' + t, 4000); }
    });
    guard(q('#llCopy'), async () => {
      const t = S.session && S.session.refresh_token; if (!t) return;
      try { await navigator.clipboard.writeText(t); toast('Transfer code copied'); } catch (e) { const i = q('#llCode'); if (i) { i.select(); } toast('Select the code and copy it'); }
    });
    const fbS = q('#llFbCity'), fbB = q('#llFb'), fbD = q('#llFbD');
    if (fbS && fbB) {
      let seq = 0;
      const drawFb = async () => {
        const my = ++seq, city = fbS.value; if (!CITY_RE.test(city)) { fbB.innerHTML = '<p class="hint">No cities yet.</p>'; return; }
        try { const r = await fetchBoard(city, 'friends'); if (my !== seq) return;
          const rows = r.top.slice(0, 10).map((x, i) => `<div class="btnrow"><span class="small">${i + 1}.</span><span class="tag"${S.user && x.user_id === S.user.id ? ' style="font-weight:700"' : ''}>${esc(x.nickname)}</span><b>${esc(x.score)}</b></div>`).join('');
          fbB.innerHTML = rows || '<p class="hint">No scores in this city yet.</p>'; } catch (e) { if (my === seq) fbB.innerHTML = '<p class="hint">Could not load.</p>'; }
      };
      fbS.onchange = drawFb; if (fbD && fbD.addEventListener) fbD.addEventListener('toggle', () => { if (fbD.open) drawFb(); });
    }
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
    let data = null, error = null, viaRpc = false;
    try { if (typeof sb.rpc === 'function') { const r = await sb.rpc('find_by_code', {p_code: code}); const missing = r && r.error && (r.error.code === 'PGRST202' || r.error.code === '42883' || /function|does not exist|schema cache|could not find/i.test(r.error.message || '')); if (r && !missing) { viaRpc = true; error = r.error; const d = Array.isArray(r.data) ? r.data[0] : r.data; data = d && typeof d.id === 'string' && typeof d.nickname === 'string' ? {id: d.id, nickname: d.nickname.slice(0, 16)} : null; } } } catch (e) {}
    if (!viaRpc) { const r = await sb.from('profiles').select('id,nickname').eq('friend_code', code).maybeSingle(); data = r.data; error = r.error; } // old servers only
    if (error || !data) { toast(friendlyErr(error) || 'No player has that code'); return; }
    if (data.id === S.user.id) { toast("That's your own code"); return; }
    if (S.blocked && S.blocked.some(b => b.id === data.id)) { toast('You blocked that player. Unblock them first.'); return; }
    if (S.friends && S.friends.incoming.some(p => p.id === data.id)) { const {error: e3} = await sb.from('friends').update({status: 'accepted'}).eq('a', data.id).eq('b', S.user.id); if (!e3) { toast('Friend request accepted: ' + data.nickname + ' and you are friends'); S.cache = {}; await loadFriends(); drawFriends(card); return; } }
    const {error: e2} = await sb.from('friends').insert({a: S.user.id, b: data.id, status: 'pending'});
    if (e2) { toast(friendlyErr(e2) || (isTaken(e2) ? 'Request already sent' : 'Could not send request')); return; }
    toast('Friend request sent to ' + data.nickname);
    await loadFriends(); drawFriends(card);
  }
  async function loadFriends() {
    if (!S.user) return;
    const me = S.user.id;
    const [r1, r2] = await Promise.all([sb.from('friends').select('a,b,status,created_at').eq('a', me), sb.from('friends').select('a,b,status,created_at').eq('b', me)]);
    const out = {incoming: [], sent: [], friends: [], ids: []};
    const rows = [...((r1 && r1.data) || []).map(x => ({other: x && x.b, status: x && x.status, mine: true, since: x && x.created_at})), ...((r2 && r2.data) || []).map(x => ({other: x && x.a, status: x && x.status, mine: false, since: x && x.created_at}))].filter(r => goodUid(r.other) && (r.status === 'accepted' || r.status === 'pending'));
    const ids = [...new Set(rows.map(r => r.other))];
    const names = {};
    if (ids.length) { let res = await sb.from('profiles').select('id,nickname,avatar,color,motto,created_at,status').in('id', ids); if (res.error) res = await sb.from('profiles').select('id,nickname,avatar,color,motto,created_at').in('id', ids); if (res.error) res = await sb.from('profiles').select('id,nickname').in('id', ids); for (const p of res.data || []) { if (!p || !goodUid(p.id)) continue; p.nickname = typeof p.nickname === 'string' ? p.nickname.slice(0, 16) : 'Player'; names[p.id] = p.nickname; S.pf = S.pf || {}; S.pf[p.id] = p; } }
    for (const r of rows) {
      const nm = names[r.other] || 'Player';
      if (r.status === 'accepted') { out.friends.push({id: r.other, nickname: nm, since: r.since}); out.ids.push(r.other); }
      else if (!r.mine) out.incoming.push({id: r.other, nickname: nm});
      else out.sent.push({id: r.other, nickname: nm});
    }
    S.friends = out;
    try { const br = await sb.from('blocks').select('blocked').eq('blocker', me); if (!br.error) { const bids = (br.data || []).map(x => x && x.blocked).filter(goodUid); const bn = {}; if (bids.length) { const pr = await sb.from('profiles').select('id,nickname').in('id', bids); for (const x of (pr && pr.data) || []) if (x && typeof x.nickname === 'string') bn[x.id] = x.nickname.slice(0, 16); } S.blocked = bids.map(id => ({id, nickname: bn[id] || 'Player'})); } } catch (e) {}
    // tell the player about requests they haven't seen yet, and mark the menu button
    if (!S.seenReq) { let a = []; try { a = JSON.parse(localStorage.getItem('ll.seenReq') || '[]'); if (!Array.isArray(a)) a = []; } catch (e) { a = []; } S.seenReq = new Set(a); }
    const fresh = out.incoming.filter(p => !S.seenReq.has(p.id));
    if (fresh.length) { notify('Little Lanes', fresh.length === 1 ? `Friend request from ${fresh[0].nickname}` : `${fresh.length} new friend requests`); (H.ok || H.toast)(fresh.length === 1 ? `Friend request from ${fresh[0].nickname}. Open Online to accept.` : `${fresh.length} new friend requests. Open Online to accept.`, 4500);
      for (const p of fresh) S.seenReq.add(p.id); try { localStorage.setItem('ll.seenReq', JSON.stringify([...S.seenReq].slice(-200))); } catch (e) {} }
    markDot(); computeOn();
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
      const gnm = n => GNAMES.includes(n) ? n : '💬 Group'; // names are picked from a fixed list
      S.groups = rows.filter(r => r.status === 'accepted').map(r => ({id: r.group_id, name: gnm(r.chat_groups.name), owner: r.chat_groups.owner}));
      S.ginv = rows.filter(r => r.status === 'pending' && !isBlocked(r.invited_by)).map(r => ({id: r.group_id, name: gnm(r.chat_groups.name), by: r.invited_by}));
      const fresh = S.ginv.filter(g => !prev.has(g.id));
      if (fresh.length && S.gLoaded && mayToast('ginv')) { notify('Little Lanes', 'You were invited to ' + fresh[0].name); (H.ok || H.toast)('Group chat invite: ' + fresh[0].name + '. Open Online → Group chats.', 4500); }
      S.gLoaded = true;
      const ids = S.groups.map(g => g.id);
      if (ids.length) { const {data: mem} = await sb.from('group_members').select('group_id,user_id,status').in('group_id', ids); S.gmem = {}; for (const m of mem || []) if (m && goodUid(m.user_id) && (m.status === 'accepted' || m.status === 'pending')) (S.gmem[m.group_id] = S.gmem[m.group_id] || []).push({group_id: m.group_id, user_id: m.user_id, status: m.status}); const uids = [...new Set((mem || []).map(m => m.user_id))]; const missing = uids.filter(u => !(S.pf && S.pf[u])); if (missing.length) { const {data: pf} = await sb.from('profiles').select('id,nickname,avatar,color').in('id', missing); S.pf = S.pf || {}; for (const x of pf || []) S.pf[x.id] = x; } }
      for (const g of S.groups) if (!S.gch[g.id]) subGroup(g.id);
      for (const id of Object.keys(S.gch)) if (!ids.includes(+id) && !ids.includes(id)) { try { if (S.gch[id] !== 'pending') sb.removeChannel(S.gch[id]); } catch (e) {} delete S.gch[id]; }
    } catch (e) {}
  }
  const gname = id => { const g = S.groups.find(x => String(x.id) === String(id)); return g ? g.name : 'Group'; };
  const nickOf = id => id === (S.user && S.user.id) ? 'You' : (S.pf && S.pf[id] && S.pf[id].nickname) || 'Player';
  function subGroup(id) {
    try {
      const attach = ch => ch.on('broadcast', {event: 'm'}, async ({payload: p}) => {
        try {
        if (!p || !Number.isInteger(p.k) || !MSGS[p.k] || p.k === 3 || (p.k >= 34 && p.k !== 37) || typeof p.from !== 'string' || p.from === (S.user && S.user.id) || !(S.gmem && (S.gmem[id] || []).some(m => m.user_id === p.from && m.status === 'accepted'))) return;
        if (isBlocked(p.from)) return; // a blocked player's messages never show up, and never notify
        if (!throttle('g' + id + ':' + p.from)) return; // at most one handled per sender every 2 s
        // broadcasts can be forged: only show it if the database has this message from this member
        const mk = cols => sb.from('group_messages').select(cols).eq('group_id', id).eq('from_id', p.from).eq('k', p.k).gte('created_at', new Date(Date.now() - 120000).toISOString()).order('created_at', {ascending: false}).limit(1);
        let gr = await mk('id,k,created_at' + TILECOLS); if (gr.error) gr = await mk('id,k,created_at'); if (gr.error) gr = await mk('id,k');
        const rows = gr.data;
        if (!rows || !rows.length) return;
        const row = Object.assign({created_at: new Date().toISOString()}, rows[0], {k: p.k}), mid = goodId(row.id);
        if (mid && !firstSeen('g' + mid)) return; // each database row is handled once
        const cr = cleanRow(row, true); if (!cr) return; const msg = cr.msg;
        const h = (S.ghist[id] = S.ghist[id] || []); capPush(h, {from: p.from, k: p.k, msg, at: Date.now()}, 60);
        const txt = msgText({k: p.k, msg});
        if (!viewing('g:' + id) && (S.openG !== String(id) || (typeof document !== 'undefined' && document.hidden))) { S.gUnread = S.gUnread || {}; S.gUnread[id] = (S.gUnread[id] || 0) + 1; markDot(); if (mayToast('g' + id + ':' + p.from)) { notify(gname(id), nickOf(p.from) + ': ' + txt); (H.ok || H.toast)(gname(id) + ' · ' + nickOf(p.from) + ': ' + txt, 4000); } }
        drawGroups(); fireMsg('g', id);
        } catch (e) {}
      });
      rtAuth().then(() => { if (S.gch[id] || !S.user) return; S.gch[id] = 'pending'; openChan('group:' + id, {broadcast: {self: false}}, attach, null, ch => { S.gch[id] = ch; }); });
    } catch (e) {}
  }
  async function loadGHist(id) {
    const mk = cols => sb.from('group_messages').select(cols).eq('group_id', id).order('created_at', {ascending: false}).limit(40);
    let res = await mk('id,from_id,k,created_at' + TILECOLS); if (res.error) res = await mk('id,from_id,k,created_at'); if (res.error) res = await mk('from_id,k,created_at');
    const {data, error} = res;
    if (!error) { const gl = []; for (const m of (data || []).slice().reverse()) { if (!m || !goodUid(m.from_id) || isBlocked(m.from_id)) continue; const c = cleanRow(m, true); if (!c) continue; const mid = goodId(m.id); if (mid) S.seen.set('g' + mid, 1); gl.push({from: m.from_id, k: c.k, msg: c.msg, at: c.at}); } S.ghist[id] = gl.slice(-60); }
  }
  async function sendGroup(id, k) {
    const now = Date.now(); S.sentAt = (S.sentAt || []).filter(t => now - t < 300000);
    if (S.sentAt.length && now - S.sentAt[S.sentAt.length - 1] < 3000) { toast('Slow down a little'); return; }
    if (S.sentAt.length >= 20) { toast('Message limit reached. Try again in a few minutes.'); return; }
    if (!S.groups.some(g => String(g.id) === String(id)) || !MSGS[k] || k === 3 || k >= 34) return;
    const {error} = await sb.from('group_messages').insert({group_id: id, k});
    if (error) { toast(friendlyErr(error) || (/limit/i.test(error.message || '') ? 'Message limit reached. Try again in a few minutes.' : 'Could not send. Try again.')); return; }
    S.sentAt.push(now);
    try { const ch = S.gch[id]; if (ch && ch.send) ch.send({type: 'broadcast', event: 'm', payload: {from: S.user.id, k}}); } catch (e) {}
    const gh = (S.ghist[id] = S.ghist[id] || []); gh.push({from: S.user.id, k, at: now}); if (gh.length > 60) gh.splice(0, gh.length - 60); drawGroups();
  }
  async function sendGroupMsg(id, msg) { // tile message to a group (chat app)
    const now = Date.now(); S.sentAt = (S.sentAt || []).filter(t => now - t < 300000);
    if (S.sentAt.length >= 20) { toast('Message limit reached. Try again in a few minutes.'); return false; }
    if (!S.groups.some(g => String(g.id) === String(id)) || !msgValid(msg)) return false;
    const row = {group_id: id, k: 37}; if (msg.t.length) { row.tiles = msg.t.slice(); row.slots = msg.s.slice(); } if (msg.e.length) row.emo = msg.e.slice();
    const {error} = await sb.from('group_messages').insert(row);
    if (error) { toast(friendlyErr(error) || (/limit/i.test(error.message || '') ? 'Message limit reached. Try again in a few minutes.' : /relation|exist|schema|column/i.test(error.message || '') ? 'Chat needs the new database update' : 'Could not send. Try again.')); return false; }
    S.sentAt.push(now);
    try { const ch = S.gch[id]; if (ch && ch.send) ch.send({type: 'broadcast', event: 'm', payload: {from: S.user.id, k: 37}}); } catch (e) {}
    const gh = (S.ghist[id] = S.ghist[id] || []); gh.push({from: S.user.id, k: 37, msg, at: now}); if (gh.length > 60) gh.splice(0, gh.length - 60); drawGroups(); fireMsg('g', id);
    return true;
  }
  // group management (shared by the old Group chats panel and the chat app)
  async function createGroup(name, picks) {
    if (!GNAMES.includes(name)) return null;
    picks = (picks || []).slice(0, 7); if (!picks.length) { toast('Pick at least one friend to invite'); return null; }
    const {data, error} = await sb.from('chat_groups').insert({name}).select('id').single();
    if (error || !data) { toast(friendlyErr(error) || (S.gErr ? 'Group chats need the new database update' : 'Could not create the group')); return null; }
    await sb.from('group_members').insert({group_id: data.id, user_id: S.user.id, status: 'accepted', invited_by: S.user.id});
    const r = await sb.from('group_members').insert(picks.map(u => ({group_id: data.id, user_id: u, status: 'pending', invited_by: S.user.id})));
    if (r.error) toast('Some invites could not be sent'); else (H.ok || H.toast)('Group created. Invites sent!');
    await loadGroups(); return String(data.id);
  }
  async function answerInvite(gid, accept) {
    if (accept) { const {error} = await sb.from('group_members').update({status: 'accepted'}).eq('group_id', gid).eq('user_id', S.user.id); if (error) { toast('Could not join'); return false; } (H.ok || H.toast)('Joined the group chat'); }
    else await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', S.user.id);
    await loadGroups(); return true;
  }
  async function inviteToGroup(gid, uid) { const {error} = await sb.from('group_members').insert({group_id: gid, user_id: uid, status: 'pending', invited_by: S.user.id}); if (error) { toast(friendlyErr(error) || 'Could not invite'); return false; } (H.ok || H.toast)('Invite sent to ' + nickOf(uid)); await loadGroups(); return true; }
  // the owner can remove somebody else from the group (the server only allows this for the owner)
  async function removeMember(gid, uid) {
    const g = S.groups.find(x => String(x.id) === String(gid));
    if (!S.user || !g || g.owner !== S.user.id || !goodUid(uid) || uid === S.user.id) return false;
    const {error} = await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', uid);
    if (error) { toast(friendlyErr(error) || 'Could not remove that player'); return false; }
    (H.ok || H.toast)('Removed ' + nickOf(uid) + ' from the group'); await loadGroups(); return true;
  }
  async function leaveGroup(gid) { await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', S.user.id); await loadGroups(); }
  function groupsHtml() {
    if (!online() || !S.profile) return '<p class="hint">Go online and pick a nickname first.</p>';
    return '<div id="llGr" class="stack"><p class="hint">Loading group chats...</p></div>';
  }
  function drawGroups() {
    const box = typeof document !== 'undefined' && document.querySelector('#llGr'); if (!box) return;
    if (S.gErr) { box.innerHTML = '<p class="hint">Group chats need the new database update.</p>'; return; }
    let h = '';
    const ginv = S.ginv.filter(g => !isBlocked(g.by));
    if (ginv.length) h += '<div class="small">Invites</div>' + ginv.map(g => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(g.name)}</span><span class="hint" style="margin:0">from ${esc(nickOf(g.by))}</span><button class="btn primary" type="button" data-gacc="${esc(g.id)}">Join</button><button class="btn" type="button" data-gdec="${esc(g.id)}">No thanks</button></div>`).join('');
    const og = S.openG && S.groups.find(g => String(g.id) === S.openG);
    if (og) {
      const mem = (S.gmem && S.gmem[og.id]) || [], hist = (S.ghist[og.id] || []).filter(m => !isBlocked(m.from));
      const fr = (S.friends && S.friends.friends) || [], inGroup = new Set(mem.map(m => m.user_id));
      h += `<div class="btnrow" style="align-items:center"><button class="btn" type="button" id="llGBack">← Groups</button><b>${esc(og.name)}</b></div>
        <p class="hint" style="margin:0">${mem.map(m => esc(nickOf(m.user_id)) + (m.status === 'pending' ? ' (invited)' : '')).join(', ')}</p>
        <div class="stack" id="llGH" style="gap:4px;max-height:240px;overflow:auto;padding:6px;border-radius:12px;background:var(--land)">${hist.length ? hist.map(m => { const me = m.from === S.user.id; return `<div style="align-self:${me ? 'flex-end' : 'flex-start'};max-width:85%;padding:6px 10px;border-radius:14px;background:${me ? 'var(--accent,#e5622b)' : 'var(--panel)'};color:${me ? '#fff' : 'inherit'};font-size:14px">${me ? '' : `<b style="font-size:12px">${esc(nickOf(m.from))}</b><br>`}${esc(msgText(m))}<span style="opacity:.6;font-size:11px;margin-left:6px">${ago(m.at)}</span></div>`; }).join('') : '<p class="hint" style="margin:0">No messages yet.</p>'}</div>
        ${pollBoxHtml()}
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
    box.querySelectorAll('[data-gacc]').forEach(b => guard(b, async () => { await answerInvite(b.dataset.gacc, true); drawGroups(); }));
    box.querySelectorAll('[data-gdec]').forEach(b => guard(b, async () => { await answerInvite(b.dataset.gdec, false); drawGroups(); }));
    box.querySelectorAll('[data-gopen]').forEach(b => b.onclick = async () => { S.openG = b.dataset.gopen; if (S.gUnread) S.gUnread[S.openG] = 0; drawGroups(); await loadGHist(S.openG); drawGroups(); });
    const bk = q('#llGBack'); if (bk) bk.onclick = () => { S.openG = null; drawGroups(); };
    box.querySelectorAll('[data-gmg]').forEach(b => b.onclick = () => { S.mg = +b.dataset.gmg; drawGroups(); });
    box.querySelectorAll('[data-gmsg]').forEach(b => guard(b, () => sendGroup(S.openG, +b.dataset.gmsg)));
    const hh = q('#llGH'); if (hh) hh.scrollTop = hh.scrollHeight;
    if (og) wirePollBox(box, {group: og.id});
    guard(q('#llGInvB'), async () => { await inviteToGroup(S.openG, q('#llGInv').value); drawGroups(); });
    guard(q('#llGLeave'), async () => { const b = q('#llGLeave'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to leave'; return; } await leaveGroup(S.openG); S.openG = null; drawGroups(); });
    guard(q('#llGMake'), async () => {
      const picks = [...box.querySelectorAll('[data-gpick]:checked')].map(x => x.dataset.gpick).slice(0, 7);
      const gid = await createGroup(q('#llGName').value, picks); if (!gid) return;
      S.openG = gid; await loadGHist(S.openG); drawGroups();
    });
  }
  try { if (typeof setInterval === 'function') setInterval(() => { if (S.user && !(typeof document !== 'undefined' && document.hidden)) loadGroups().then(drawGroups).catch(() => {}); }, 60000); } catch (e) {}
  function drawFriends(card) {
    const box = card && card.querySelector('#llFr'); if (!box) return;
    const f = S.friends || {incoming: [], friends: []};
    let h = '';
    const ib = S.inbox.filter(visible).slice(0, 6);
    if (ib.length) { h += `<div class="small">Messages${unread() ? ' (' + unread() + ' new)' : ''}</div><div class="stack" style="gap:4px">` + ib.map(m => `<div class="btnrow" style="align-items:center;gap:6px;${m.read ? 'opacity:.75' : ''}"><span class="small">${m.out ? 'You → ' + esc(m.nick) : '<b>' + esc(m.nick) + '</b>'}:</span><span>${esc(msgText(m))}</span>${roomOf(m.k, m.room) ? `<span class="tag">Room <b>${esc(m.room)}</b></span>${m.out ? '' : `<button class="btn" type="button" data-room="${esc(m.room)}" data-k="${esc(m.k)}">Join</button>`}` : ''}<span class="hint" style="margin:0">${ago(m.at)}</span>${!m.out ? `<button class="btn" type="button" data-reply="${esc(m.from)}">Reply</button>` : ''}</div>`).join('') + `</div><button class="btn" type="button" id="llClrIn" style="align-self:flex-start">Clear messages</button>`; }
    const offers = loadOffers().filter(o => isCity(o.city)).map((o, i) => ({o, i, fr: f.friends.find(x => x.id === o.from)})).filter(x => x.fr);
    if (offers.length) h += '<div class="small">Challenge finished</div>' + offers.map(({o, i, fr}) => `<div class="btnrow" style="align-items:center"><span>🏆 You got ${esc(o.score)} in ${esc(cityName(o.city))}</span><button class="btn primary" type="button" data-offer="${i}">Tell ${esc(fr.nickname)} "I got ${esc(o.score)}!"</button><button class="btn" type="button" data-offerx="${i}">Dismiss</button></div>`).join('');
    h += `<div class="btnrow" style="align-items:center;justify-content:space-between"><div class="small">Friend requests${f.incoming.length ? ' (' + f.incoming.length + ')' : ''}</div><button class="btn" id="llRefFr" type="button">Refresh</button></div>`;
    h += f.incoming.length ? f.incoming.map(p => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(p.nickname)}</span><button class="btn primary" data-acc="${esc(p.id)}">Accept</button><button class="btn" data-dec="${esc(p.id)}">Decline</button></div>`).join('') : '<p class="hint">No new requests.</p>';
    if (f.sent && f.sent.length) h += `<div class="small">Sent requests (waiting)</div>` + f.sent.map(p => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(p.nickname)}</span><button class="btn" type="button" data-cancel="${esc(p.id)}">Cancel</button></div>`).join('');
    const qf = (S.fq || '').toLowerCase();
    if (f.friends.length > 4) h += `<input id="llFq" style="${inp}" placeholder="Search friends" value="${esc(S.fq || '')}" autocomplete="off">`;
    const fl = f.friends.filter(p => !qf || p.nickname.toLowerCase().includes(qf)).slice().sort((a, b) => (S.on[b.id] ? 1 : 0) - (S.on[a.id] ? 1 : 0) || a.nickname.localeCompare(b.nickname));
    const nOn = fl.filter(p => S.on[p.id]).length;
    h += fl.length ? `<div class="small">Your friends (${f.friends.length}) · ${nOn} online</div><div class="stack" style="gap:6px">` + fl.map(p => { const x = prof(S.pf && S.pf[p.id]), d = statusDot(p.id);
      return `<button class="btn" type="button" data-fp="${esc(p.id)}" style="display:flex;align-items:center;gap:10px;justify-content:flex-start;text-align:left;width:100%"><span style="position:relative;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:18px;background:${x.color};flex:none">${x.avatar}<i style="position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:50%;background:${d.c};border:2px solid var(--panel)"></i></span><span style="display:flex;flex-direction:column"><b>${esc(p.nickname)}</b><span class="hint" style="margin:0">${esc(d.t)}${statusOf(S.pf && S.pf[p.id]) ? ' · ' + esc(statusOf(S.pf[p.id])) : ''}</span></span></button>` + (S.openF === p.id ? '<div class="llFp" style="padding:10px 12px;border:1px solid var(--panel-line);border-radius:14px"><p class="hint">Loading profile...</p></div>' : ''); }).join('') + '</div>' : '<p class="hint">No friends yet. Share your friend code.</p>';
    if (S.blocked && S.blocked.length) h += '<div class="small">Blocked players</div>' + S.blocked.map(p => `<div class="btnrow" style="align-items:center"><span class="tag">${esc(p.nickname)}</span><button class="btn" type="button" data-unblock="${esc(p.id)}">Unblock</button></div>`).join('');
    h += `<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="llGhost"${ghost() ? ' checked' : ''}> Appear offline to others</label>`;
    box.innerHTML = h;
    const fq = box.querySelector('#llFq'); if (fq) { fq.oninput = () => { S.fq = fq.value; const pos = fq.selectionStart; drawFriends(card); const n = box.querySelector('#llFq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }; }
    box.querySelectorAll('[data-cancel]').forEach(b => guard(b, async () => { const {error} = await sb.from('friends').delete().eq('a', S.user.id).eq('b', b.dataset.cancel); if (error) { toast('Could not cancel'); return; } await loadFriends(); drawFriends(card); }));
    const gh = box.querySelector('#llGhost'); if (gh) gh.onchange = () => { try { localStorage.setItem('ll.ghost', gh.checked ? '1' : '0'); } catch (e) {} pushPresence(); };
    box.querySelectorAll('[data-fp]').forEach(b => b.onclick = () => { S.openF = S.openF === b.dataset.fp ? null : b.dataset.fp; if (S.openF) { S.histLoaded = S.histLoaded || {}; S.histLoaded[S.openF] = false; S.rxOpen = null; } drawFriends(card); });
    if (S.openF) showFriend(box.querySelector('.llFp'), S.openF, card);
    box.querySelectorAll('[data-room]').forEach(b => b.onclick = () => copyRoom(b.dataset.room, b.dataset.k));
    box.querySelectorAll('[data-offer]').forEach(b => guard(b, async () => { const o = loadOffers()[+b.dataset.offer]; if (!o) return; S.lastOk = 0; await sendMsg(o.from, 35, {city: o.city, seed: o.seed, score: o.score}); if (S.lastOk) saveOffers(loadOffers().filter(x => !(x.from === o.from && x.city === o.city && x.seed === o.seed))); drawFriends(card); }));
    box.querySelectorAll('[data-offerx]').forEach(b => b.onclick = () => { const o = loadOffers()[+b.dataset.offerx]; if (o) saveOffers(loadOffers().filter(x => !(x.from === o.from && x.city === o.city && x.seed === o.seed))); drawFriends(card); });
    box.querySelectorAll('[data-unblock]').forEach(b => guard(b, async () => { const {error} = await sb.from('blocks').delete().eq('blocker', S.user.id).eq('blocked', b.dataset.unblock); if (error) { toast('Could not unblock'); return; } (H.ok || H.toast)('Unblocked'); await loadFriends(); drawFriends(card); }));
    box.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => { if (W.LLChat) { try { W.LLChat.open(b.dataset.reply); return; } catch (e) {} } S.openF = b.dataset.reply; drawFriends(card); });
    const ci = box.querySelector('#llClrIn'); if (ci) ci.onclick = () => { S.inbox = []; saveInbox(S.inbox); markDot(); markAllRead(); drawFriends(card); };
    if (unread()) { setTimeout(() => { for (const m of S.inbox) m.read = true; saveInbox(S.inbox); markDot(); markAllRead(); }, 1500); }
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
  // ---------- challenge cards ----------
  const loadOffers = () => { const a = lsGet('ll.chOffer', []); return Array.isArray(a) ? a.filter(o => o && typeof o.from === 'string' && okCard(o.city, o.seed, o.score)).slice(0, 5) : []; };
  const saveOffers = a => lsSet('ll.chOffer', a.slice(0, 5));
  H.on('gameover', d => {
    try {
      if (!d || d.practice || d.custom || d.live || d.kind !== 'normal') return;
      const lr = H.lastRun && H.lastRun(); if (!lr || lr.over !== true || lr.kind !== 'classic' || lr.cityId !== d.city) return;
      const c = okCard(lr.cityId, lr.seed | 0, Math.min(100000, Math.max(0, lr.score | 0))); if (!c) return;
      const map = lsGet('ll.cbest', {}), old = map[c.city], now = Date.now();
      if (!old || now - old.at > 7 * 86400000 || c.score >= old.score) map[c.city] = {seed: c.seed, score: c.score, week: lr.week | 0, at: now};
      const keys = Object.keys(map).sort((a, b) => map[b].at - map[a].at); for (const k of keys.slice(12)) delete map[k];
      lsSet('ll.cbest', map);
      const pend = lsGet('ll.chPend', []), hit = Array.isArray(pend) && pend.find(x => x && x.city === c.city && x.seed === c.seed);
      if (hit && typeof hit.from === 'string') {
        saveOffers([{from: hit.from, city: c.city, seed: c.seed, score: c.score, at: now}, ...loadOffers().filter(o => !(o.from === hit.from && o.city === c.city && o.seed === c.seed))]);
        lsSet('ll.chPend', pend.filter(x => x !== hit && !(x && x.city === c.city && x.seed === c.seed)));
        (H.ok || H.toast)('You finished the challenge with ' + c.score + '! Open Online → Friends to reply.', 5000);
      }
    } catch (e) {}
  });
  function challengeOpts() {
    const opts = [], lr = (() => { try { return H.lastRun && H.lastRun(); } catch (e) { return null; } })();
    if (lr && lr.over === true && lr.kind === 'classic') { const c = okCard(lr.cityId, lr.seed | 0, Math.min(100000, Math.max(0, lr.score | 0))); if (c) opts.push(Object.assign({last: true}, c)); }
    const map = lsGet('ll.cbest', {});
    for (const city of Object.keys(map)) { const e = map[city]; if (!e || Date.now() - e.at > 7 * 86400000) continue; const c = okCard(city, e.seed | 0, e.score | 0); if (c && !opts.some(o => o.city === c.city && o.seed === c.seed)) opts.push(c); }
    return opts.slice(0, 8);
  }
  function challengeHtml() {
    const o = challengeOpts();
    return `<div class="small">Challenge</div><div class="btnrow" style="gap:4px">${o.length ? `<select id="llChSel" style="${inp}">${o.map((x, i) => `<option value="${i}">${x.last ? 'Last run: ' : ''}${esc(cityName(x.city))} ${esc(x.score)}</option>`).join('')}</select>` : ''}<button class="btn" type="button" id="llChBtn">Challenge</button></div>${o.length ? '' : '<p class="hint" style="margin:0">Finish a classic game in a city, then send it as a challenge.</p>'}`;
  }

  // ---------- polls (templates only) ----------
  const POLLQ = ['Which city should we play?', 'Classic or Plus?', 'Duel or co-op?', 'Survival or Sprint?', 'Play now or later?'];
  const POLLO = [null, ['classic', 'plus'], ['duel', 'coop'], ['survival', 'sprint'], ['now', 'later']];
  const OPTLAB = {classic: 'Classic', plus: 'Plus', duel: 'Duel', coop: 'Co-op', survival: 'Survival', sprint: 'Sprint', now: 'Play now', later: 'Play later'};
  const optLabel = (t, o) => t === 0 ? cityName(o) : (OPTLAB[o] || '?');
  const validPollOpts = (t, a) => Number.isInteger(t) && Array.isArray(a) && (t === 0 ? a.length >= 2 && a.length <= 4 && a.every(x => isCity(x)) && new Set(a).size === a.length : t >= 1 && t <= 4 && a.length === POLLO[t].length && a.every((x, i) => x === POLLO[t][i]));
  S.pollc = {};
  const pollKey = sc => sc.group != null ? 'g' + sc.group : 'f' + sc.friend;
  async function loadPolls(sc) {
    const me = S.user.id;
    let q = sb.from('polls').select('id,from_id,template,options,created_at');
    q = sc.group != null ? q.eq('group_id', sc.group) : q.or(`and(from_id.eq.${me},to_id.eq.${sc.friend}),and(from_id.eq.${sc.friend},to_id.eq.${me})`);
    const r = await q.order('created_at', {ascending: false}).limit(3);
    if (r.error) return null;
    const polls = (r.data || []).filter(p => p && goodId(p.id) && goodUid(p.from_id) && !isBlocked(p.from_id) && goodTime(p.created_at) != null && validPollOpts(p.template, p.options)).map(p => ({id: goodId(p.id), from: p.from_id, template: p.template, options: p.options, at: Date.parse(p.created_at), counts: p.options.map(() => 0), mine: null}));
    if (polls.length) {
      const v = await sb.from('poll_votes').select('poll_id,user_id,choice').in('poll_id', polls.map(p => p.id));
      for (const x of (v && v.data) || []) { if (!x || !goodUid(x.user_id) || isBlocked(x.user_id)) continue; const p = polls.find(p => p.id === goodId(x.poll_id)); if (p && Number.isInteger(x.choice) && x.choice >= 0 && x.choice < p.options.length) { p.counts[x.choice]++; if (x.user_id === me) p.mine = x.choice; } }
    }
    return polls;
  }
  function pollsHtml(polls) {
    if (!polls || !polls.length) return '<p class="hint" style="margin:0">No polls yet.</p>';
    polls = polls.filter(p => p && Number.isInteger(p.template) && POLLQ[p.template] && !isBlocked(p.from) && validPollOpts(p.template, p.options));
    if (!polls.length) return '<p class="hint" style="margin:0">No polls yet.</p>';
    return polls.map(p => `<div class="stack" style="gap:4px;padding:6px 8px;border-radius:12px;background:var(--land)"><div class="small"><b>${esc(POLLQ[p.template])}</b> <span class="hint" style="margin:0">${esc(p.from === S.user.id ? 'You' : nickOf(p.from))} · ${ago(p.at)}</span></div><div class="btnrow" style="gap:4px">${p.options.map((o, i) => `<button class="btn" type="button" data-pv="${esc(p.id)}" data-pch="${i}" style="padding:4px 10px;font-size:13px${p.mine === i ? ';outline:2px solid var(--ink)' : ''}">${esc(optLabel(p.template, o))} · ${esc(p.counts[i])}</button>`).join('')}</div></div>`).join('');
  }
  function pollBoxHtml() {
    const cs = cityList().filter(c => c.unlocked);
    return `<details class="llPoll"><summary class="small"><b>Polls</b></summary><div class="stack" style="margin-top:6px;gap:6px"><div class="llPollList stack" style="gap:4px"><p class="hint" style="margin:0">Loading polls...</p></div>
      <select class="llPT" style="${inp}">${POLLQ.map((q, i) => `<option value="${i}">${esc(q)}</option>`).join('')}</select>
      <div class="llPC stack" style="gap:2px"><div class="hint" style="margin:0">Pick 2 to 4 cities</div>${cs.map(c => `<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-pcity="${esc(c.id)}"> ${esc(c.name)}</label>`).join('')}</div>
      <button class="btn" type="button" data-psend="1">Send poll</button></div></details>`;
  }
  function wirePollBox(root, sc) {
    const box = root.querySelector('.llPoll'); if (!box) return;
    const list = box.querySelector('.llPollList'), key = pollKey(sc);
    const draw = polls => {
      if (!polls) { list.innerHTML = '<p class="hint" style="margin:0">Polls need the new database update.</p>'; const ps = box.querySelector('[data-psend]'); if (ps) ps.disabled = true; return; }
      list.innerHTML = pollsHtml(polls);
      list.querySelectorAll('[data-pv]').forEach(b => guard(b, async () => {
        const {error} = await sb.from('poll_votes').upsert({poll_id: goodId(b.dataset.pv), user_id: S.user.id, choice: +b.dataset.pch}, {onConflict: 'poll_id,user_id'});
        if (error) { toast(friendlyErr(error) || (/limit/i.test(error.message || '') ? 'Slow down a little' : 'Could not vote')); return; }
        await refresh(true);
      }));
    };
    const refresh = async force => {
      const c = S.pollc[key]; if (c) draw(c.polls);
      if (!force && c && Date.now() - c.t < 15000) return;
      const polls = await loadPolls(sc).catch(() => null); S.pollc[key] = {t: Date.now(), polls}; if (list.isConnected !== false) draw(polls);
    };
    const pt = box.querySelector('.llPT'), pc = box.querySelector('.llPC');
    const showC = () => { if (pc && pc.style) pc.style.display = +pt.value === 0 ? '' : 'none'; }; if (pt) { pt.onchange = showC; showC(); }
    const sendB = box.querySelector('[data-psend]');
    if (sendB) guard(sendB, async () => {
      const t = +pt.value; if (!Number.isInteger(t) || !POLLQ[t]) return;
      let opts;
      if (t === 0) { opts = [...box.querySelectorAll('[data-pcity]')].filter(x => x.checked).map(x => x.dataset.pcity).filter(x => isCity(x)); if (opts.length < 2 || opts.length > 4) { toast('Pick 2 to 4 cities'); return; } }
      else opts = POLLO[t].slice();
      const row = {template: t, options: opts}; if (sc.group != null) row.group_id = sc.group; else row.to_id = sc.friend;
      const {error} = await sb.from('polls').insert(row);
      if (error) { toast(friendlyErr(error) || (/limit/i.test(error.message || '') ? 'Poll limit reached. Try again later.' : /relation|exist|schema/i.test(error.message || '') ? 'Polls need the new database update' : 'Could not send the poll')); return; }
      (H.ok || H.toast)('Poll sent'); await refresh(true);
    });
    box.addEventListener && box.addEventListener('toggle', () => { if (box.open) refresh(true); });
    refresh(false);
  }

  // ---------- status picker ----------
  const STATUSES = ['Building!', 'Taking a break', 'Want a duel?', 'Want co-op?', 'Doing the daily', 'Busy'];
  const statusOf = p => p && Number.isInteger(p.status) && STATUSES[p.status] ? STATUSES[p.status] : '';

  // ---------- block ----------
  async function doBlock(btn, id, card) {
    if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Tap again to block'; return; }
    if (!S.user || btn.dataset.busy) return; btn.dataset.busy = '1';
    const me = S.user.id, nm = (S.friends && S.friends.friends.find(f => f.id === id) || {}).nickname || 'player';
    const ins = await sb.from('blocks').insert({blocked: id});
    if (ins.error && !isTaken(ins.error)) { btn.dataset.busy = ''; toast(/relation|exist|schema/i.test(ins.error.message || '') ? 'Blocking needs the new database update' : 'Could not block'); return; }
    await sb.from('friends').delete().eq('a', me).eq('b', id); await sb.from('friends').delete().eq('a', id).eq('b', me);
    try { await sb.from('messages').delete().eq('from_id', me).eq('to_id', id); await sb.from('messages').delete().eq('from_id', id).eq('to_id', me); } catch (e) {}
    delete S.hist[id]; S.inbox = S.inbox.filter(m => m.from !== id); saveInbox(S.inbox); for (const g of Object.keys(S.ghist || {})) S.ghist[g] = S.ghist[g].filter(m => m.from !== id); S.openF = null; S.cache = {};
    await loadFriends(); markDot(); drawFriends(card); fireMsg('b', id); (H.ok || H.toast)('Blocked ' + nm + '. You can unblock in the Friends list.');
  }

  const roomWhere = k => k === 36 ? 'Online → Co-op party → Join' : 'Online → Live duel → Join';
  function histHtml(id) {
    const h = (S.hist[id] || S.inbox.filter(m => m.from === id).slice().reverse().map(m => ({mine: !!m.out, k: m.k, room: m.room, card: m.card, msg: m.msg, at: m.at}))).filter(visible);
    if (!h.length) return '<p class="hint" style="margin:0">No messages yet. Say hi!</p>';
    const me = S.user ? S.user.id : '';
    return h.map(m => {
      const mid = goodId(m.id), rx = mid && S.rx[mid] ? S.rx[mid] : null;
      const cnt = RX.map(() => 0); let mine = -1;
      if (rx) for (const u of Object.keys(rx)) { cnt[rx[u]]++; if (u === me) mine = rx[u]; }
      const line = cnt.some(n => n) ? `<div class="btnrow" style="gap:3px">${cnt.map((n, i) => n ? `<span class="tag" style="padding:1px 6px;font-size:12px;${i === mine ? 'outline:2px solid var(--ink)' : ''}">${RX[i]} ${n}</span>` : '').join('')}</div>` : '';
      const pick = mid && S.rxOpen === mid ? `<div class="btnrow" style="gap:3px">${RX.map((e, i) => `<button class="btn" type="button" data-rxm="${esc(mid)}" data-rxr="${i}" style="padding:2px 8px;font-size:16px${i === mine ? ';outline:2px solid var(--ink)' : ''}">${e}</button>`).join('')}</div>` : '';
      const rm = roomOf(m.k, m.room);
      const play = m.card && m.k === 34 && !m.mine && isCity(m.card.city) ? `<button class="btn primary" type="button" data-play="${esc(m.card.city)}" data-seed="${esc(m.card.seed)}" data-score="${esc(m.card.score)}" style="padding:4px 10px;font-size:13px">Play</button>` : '';
      const join = rm && !m.mine ? `<button class="btn" type="button" data-room="${esc(rm)}" data-k="${esc(m.k)}" style="padding:4px 10px;font-size:13px">Join</button>` : '';
      return `<div style="align-self:${m.mine ? 'flex-end' : 'flex-start'};max-width:85%;display:flex;flex-direction:column;align-items:${m.mine ? 'flex-end' : 'flex-start'};gap:3px"><div${mid ? ` data-mid="${esc(mid)}" role="button" tabindex="0"` : ''} style="padding:6px 10px;border-radius:14px;background:${m.mine ? 'var(--accent,#e5622b)' : 'var(--panel)'};color:${m.mine ? '#fff' : 'inherit'};font-size:14px;${mid ? 'cursor:pointer' : ''}">${esc(msgText(m))}${rm ? ' <b>' + esc(rm) + '</b>' : ''}<span style="opacity:.6;font-size:11px;margin-left:6px">${ago(m.at)}</span></div>${line}${pick}${play || join ? `<div class="btnrow" style="gap:4px">${play}${join}</div>` : ''}</div>`;
    }).join('');
  }
  function copyRoom(code, k) {
    if (!ROOM_RE.test(code)) return; const where = roomWhere(+k);
    try { navigator.clipboard.writeText(code).then(() => (H.ok || H.toast)('Room code copied: ' + code + '. Paste it in ' + where + '.'), () => H.toast('Room code: ' + code + '. Paste it in ' + where + '.', 4000)); } catch (e) { H.toast('Room code: ' + code, 4000); }
  }
  function playCard(b) {
    const city = b.dataset.play, seed = +b.dataset.seed, score = +b.dataset.score;
    if (!okCard(city, seed, score)) return false;
    let ok = false; try { ok = H.startChallenge ? H.startChallenge({cityId: city, seed}) : false; } catch (e) {}
    if (!ok) { toast('Unlock that city first'); return false; }
    const from = b.dataset.from || S.openF; const pend = lsGet('ll.chPend', []).filter(x => !(x.city === city && x.seed === seed));
    pend.unshift({from, city, seed, score, at: Date.now()}); lsSet('ll.chPend', pend.slice(0, 8));
    return true;
  }
  function paintHist(el, id) {
    const h2 = el.querySelector('.llHist'); if (!h2) return;
    h2.innerHTML = histHtml(id); h2.scrollTop = h2.scrollHeight;
    h2.querySelectorAll('[data-mid]').forEach(b => b.onclick = () => { const m = goodId(b.dataset.mid); S.rxOpen = S.rxOpen === m ? null : m; paintHist(el, id); });
    h2.querySelectorAll('[data-rxm]').forEach(b => guard(b, async () => { S.rxOpen = null; await react(goodId(b.dataset.rxm), +b.dataset.rxr); paintHist(el, id); }));
    h2.querySelectorAll('[data-play]').forEach(b => { b.dataset.from = id; b.onclick = () => playCard(b); });
    h2.querySelectorAll('[data-room]').forEach(b => b.onclick = () => copyRoom(b.dataset.room, b.dataset.k));
  }
  async function showFriend(el, id, card) {
    if (!el) return;
    const f = (S.friends && S.friends.friends.find(x => x.id === id)) || {}; const pf = (S.pf && S.pf[id]) || {}, x = prof(pf), d = statusDot(id);
    const k = 'fp:' + id; let best = cacheGet(k);
    if (!best) { try { const {data} = await sb.from('scores').select('city,score,kind').eq('user_id', id).order('score', {ascending: false}).limit(40); const seen = {}; best = []; for (const r of data || []) { if (!r || !isCity(r.city) || !Number.isFinite(+r.score) || seen[r.city]) continue; seen[r.city] = 1; best.push(r); if (best.length >= 4) break; } cachePut(k, best); } catch (e) { best = []; } }
    if (!el.isConnected) return;
    const day = t => { try { return new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}); } catch (e) { return ''; } };
    const city = c => cityName(c);
    el.innerHTML = `<div class="stack" style="gap:6px"><div class="btnrow" style="align-items:center"><span style="width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:28px;background:${x.color}">${x.avatar}</span><span style="display:flex;flex-direction:column"><b style="color:${x.color};font-size:17px">${esc(f.nickname || pf.nickname || 'Player')}</b>${x.motto ? `<span class="hint" style="margin:0">“${esc(x.motto)}”</span>` : ''}<span class="small" style="color:${d.c}">● ${esc(d.t)}</span>${statusOf(pf) ? `<span class="small">${esc(statusOf(pf))}</span>` : ''}</span></div>
      ${best.length ? '<div class="small">Best scores</div><div class="btnrow">' + best.map(r => `<span class="tag">${esc(city(r.city))} <b>${esc(r.score)}</b></span>`).join('') + '</div>' : '<p class="hint">No online scores yet.</p>'}
      <p class="hint" style="margin:0">${f.since ? 'Friends since ' + esc(day(f.since)) : ''}${pf.created_at ? ' · playing since ' + esc(day(pf.created_at)) : ''}</p>
      <button class="btn primary" type="button" data-chat="1" style="min-height:44px;font-size:15px">💬 Open chat with ${esc(f.nickname || pf.nickname || 'Player')}${(() => { const n = S.inbox.filter(m => m.from === id && !m.read && !m.out).length; return n ? ` <span class="tag" style="background:#d63c3c;color:#fff">${n}</span>` : ''; })()}</button>
      <div class="small">Play together</div>
      <div class="btnrow" style="gap:4px"><button class="btn" type="button" data-inv="3">Invite to duel</button><button class="btn" type="button" data-inv="36">Invite to co-op</button></div>
      ${challengeHtml()}
      ${pollBoxHtml()}
      <div class="btnrow"><button class="btn" type="button" id="llRm">Remove friend</button><button class="btn" type="button" id="llBlk">Block</button></div></div>`;
    el.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => { try { if (W.LLChat) W.LLChat.open(id); else toast('Chat is not available right now'); } catch (e) {} });
    el.querySelectorAll('[data-inv]').forEach(b => guard(b, () => sendMsg(id, +b.dataset.inv)));
    const cb = el.querySelector('#llChBtn'); if (cb) guard(cb, async () => { const o = challengeOpts(), sel = el.querySelector('#llChSel'); const c = o[sel ? +sel.value : 0]; if (!c) { toast('Finish a classic game first'); return; } await sendMsg(id, 34, c); });
    wirePollBox(el, {friend: id});
    const bk = el.querySelector('#llBlk'); if (bk) bk.onclick = () => doBlock(bk, id, card);
    const rm = el.querySelector('#llRm'); if (rm) rm.onclick = async () => {
      if (rm.dataset.sure !== '1') { rm.dataset.sure = '1'; rm.textContent = 'Tap again to remove'; return; }
      const r1 = await sb.from('friends').delete().eq('a', S.user.id).eq('b', id); const r2 = await sb.from('friends').delete().eq('a', id).eq('b', S.user.id);
      if (r1.error && r2.error) { toast('Could not remove friend'); return; } S.openF = null; await loadFriends(); drawFriends(card); };
  }
  function markFriendRead(id) {
    let ch = false; for (const m of S.inbox) if (m.from === id && !m.out && !m.read) { m.read = true; ch = true; } if (ch) saveInbox(S.inbox);
    markDot(); try { if (S.user) sb.from('messages').update({read: true}).eq('from_id', id).eq('to_id', S.user.id).eq('read', false).then(() => {}, () => {}); } catch (e) {}
  }
  function clearGroupUnread(id) { if (S.gUnread) S.gUnread[id] = 0; markDot(); }
  // everything the chat app (chat.js) needs; it never talks to the database for sending except through these
  API.chat = {S, sb, esc, H, MSGS, RX, msgText, msgValid, rowMsg, cityName, prof, statusDot, statusOf, nickOf, gname, ago, goodId, toast, guard, online, unreadAll, unread, markDot,
    sendMsg, sendGroupMsg, cleanRow, loadHist, loadGHist, loadFriends, loadGroups, loadMissed, react, markFriendRead, clearGroupUnread, copyRoom, playCard, challengeOpts, doBlock, loadPolls, pollBoxHtml, wirePollBox, roomWhere,
    createGroup, answerInvite, inviteToGroup, leaveGroup, removeMember, roomOf, visible, isBlocked, isCity, friendlyErr, GNAMES, setView: v => { S.chatView = v; }, drawFriends, onMsg: f => API.onMsg(f), cities: () => cityList()};
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
  API._test = {cleanRow, roomOf, isCity, visible, copiesFriend, friendlyErr, computeOn, pushPresence, openChan, subGroup, startInbox, startPresence, removeMember, mergeProgress, badName, S, esc, sendMsg, react, loadHist, histHtml, msgText, challengeOpts, challengeHtml, playCard, loadPolls, pollsHtml, pollBoxHtml, myPresence, statusDot, statusOf, loadFriends, loadGroups, loadMissed, drawFriends, doBlock, loadOffers, validPollOpts, fetchBoard, onlineHtml, friendsHtml, setSessionForTest: setSession, rowMsg, msgValid, sendGroupMsg, loadGHist, createGroup};
})();
