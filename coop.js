// Little Lanes: co-op parties (2-4 players) over Supabase Realtime. Everyone plays the same city seed side by side;
// the team score is the total. Survival: the team is out when anyone overflows. Sprint: best team total after week 10.
(() => {
'use strict';
const HK = window.LLHooks;
if (!HK) return;
const MAX = 4, LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ', LEFT_MS = 60000;
const MAX_MSG = 2048;
const MIN_GAP = {state: 500, done: 300, lost: 100, ping: 400, start: 0}; // per-sender throttle (ms)
const EM = ['👋 Hi!', '🍀 Good luck!', '🛣️ Nice road!', '🚗💥 Oops…', '😅 That was close!', '🔥 Bring it!', '🤝 GG', '🔁 Rematch?'];
const PINGS = ['🆘 Help, I\'m close to overflowing!', '👍 Doing fine', '🌉 Get bridges!', '⏸️ Hang on', '🚀 Keep going!', '⭐ Great teamwork!'];
const MODES = {S: 'Team survival: the team is out when anyone overflows', W: 'Team sprint: highest team total after week 10'};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (d || 0); };
const safe = f => function () { try { return f.apply(this, arguments); } catch (e) { try { console.error('coop.js', e); } catch (_) {} } };
const $ = id => document.getElementById(id);
const toast = (m, ms) => { try { if (/copied|joined|ready/i.test(m)) (HK.ok || HK.toast)(m); else if (HK.error) HK.error(m); else HK.toast(m, ms); } catch (_) {} };
const online = () => { const O = window.LLOnline; try { return O && O.sb && O.user && O.user() && O.profile && O.profile() ? O : null; } catch (_) { return null; } };
const myNick = () => { const p = online() && window.LLOnline.profile(); return String((p && p.nickname) || 'Player').slice(0, 20); };
const myId = () => { const u = online() && window.LLOnline.user(); return String((u && u.id) || ''); };
// nicknames always come from the profiles table by user id, never from a message or presence payload
const NICKS = {};
const nickOf = id => NICKS[id] || 'Player';
function fetchNicks(ids) {
  const need = ids.filter(i => i && !(i in NICKS)); if (!need.length) return;
  need.forEach(i => { NICKS[i] = null; });
  const mine = S;
  const undo = () => { for (const i of need) if (NICKS[i] === null) delete NICKS[i]; };
  try {
    Promise.resolve(window.LLOnline.sb.from('profiles').select('id,nickname').in('id', need)).then(res => {
      for (const r of (res && res.data) || []) if (r && need.includes(r.id)) NICKS[r.id] = String(r.nickname || 'Player').replace(/[\u0000-\u001f]/g, '').slice(0, 20) || 'Player';
      undo();
      if (S === mine) { for (const id of Object.keys(S.mates)) if (NICKS[id]) S.mates[id].nick = NICKS[id]; refresh(); drawStrip(); }
    }, undo);
  } catch (_) { undo(); }
}
const cityName = id => { try { const c = HK.cities().find(c => c.id === id); return c ? c.name : id; } catch (_) { return id; } };

const fresh = () => ({ch: null, room: null, host: false, city: null, rule: 'S', phase: 'idle', ready: false, seed: 0, mates: {}, done: {}, out: null, timers: [], ui: null, msg: '', hostId: null, roster: [], warned2: false, thr: {}, priv: true});
let S = fresh();

// raw presence, server order (first = joined first); only the keys are trusted
function rawPeers() {
  const out = []; if (!S.ch) return out; let st = {}; try { st = S.ch.presenceState() || {}; } catch (_) {}
  const id = myId();
  for (const k of Object.keys(st)) { const a = st[k]; const m = (Array.isArray(a) ? a[a.length - 1] : a) || {};
    out.push({id: k, me: k === id, ready: m.ready === true, host: m.host === true, city: m.city, rule: m.rule}); }
  return out;
}
// the party as I see it: the host first, then others in the order they were admitted, 4 at most
function peers() {
  const raw = rawPeers(), by = {}; for (const p of raw) by[p.id] = p;
  return S.roster.filter(id => by[id]).map(id => Object.assign({}, by[id], {host: id === S.hostId, nick: by[id].me ? myNick() : nickOf(id)}));
}
const meta = () => { const m = {ready: !!S.ready, host: !!S.host}; if (S.host) { m.city = S.city; m.rule = S.rule; } return m; };
const track = () => { try { S.ch && S.ch.track(meta()); } catch (_) {} };
const send = (event, payload) => { try { S.ch && S.ch.send({type: 'broadcast', event, payload: Object.assign({}, payload, {id: myId()})}); } catch (_) {} };
// accept a broadcast only from a present, admitted party member; size and rate limited
function gate(ev, p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  let n = 0; try { n = JSON.stringify(p).length; } catch (_) { return false; }
  if (n > MAX_MSG) return false;
  const id = typeof p.id === 'string' ? p.id : ''; if (!id || id === myId()) return false;
  if (!rawPeers().some(x => x.id === id)) return false;
  if (ev === 'start') { if (id !== S.hostId || S.host) return false; }
  else if (!S.mates[id]) return false;
  const gap = MIN_GAP[ev] || 0, now = Date.now(), k = ev + ':' + id; if (gap && now - (S.thr[k] || 0) < gap) return false; S.thr[k] = now;
  return true;
}

// ---------- section ----------
function boxHtml() {
  const INPS = typeof INP !== 'undefined' ? INP : '';
  if (!online()) return '<p class="hint">Go online and pick a nickname first.</p>';
  if (!S.room) {
    let cs = []; try { cs = HK.cities().filter(c => c.unlocked); } catch (_) {}
    return `<div class="stack"><p class="hint">Team up with 1 to 3 friends. Everyone gets the same city; your scores add up.</p>
      <div class="small">Start a party</div>
      <div class="btnrow" style="align-items:center"><select id="cpCity" style="${INPS}">${cs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      <select id="cpRule" style="${INPS}"><option value="S">Team survival</option><option value="W">Team sprint (10 weeks)</option></select>
      <button class="btn primary" id="cpMake">Start party</button></div>
      <div class="small">Join a party</div>
      <form class="btnrow" id="cpJoin"><input id="cpCode" maxlength="4" placeholder="ABCD" autocomplete="off" style="${INPS};text-transform:uppercase"><button class="btn" type="submit">Join</button></form></div>`;
  }
  const ps = peers(), host = ps.find(p => p.host && !p.me), city = S.host ? S.city : host && host.city, rule = S.host ? S.rule : (host && host.rule) || 'S';
  const playing = S.phase === 'countdown' || S.phase === 'playing';
  const allReady = ps.length >= 2 && ps.every(p => p.ready);
  return `<div class="stack"><div class="btnrow" style="align-items:center"><span class="codebox"><span class="small">Party code</span><b>${esc(S.room)}</b><button class="btn" id="cpCopy" type="button">Copy</button></span><span class="hint">${ps.length}/${MAX} players</span></div>
    ${city ? `<p class="hint">${esc(cityName(city))} · ${esc(MODES[rule] || '')}</p>` : ''}
    ${S.host && !playing ? `<div class="btnrow"><select id="cpRule2" style="${INPS}"><option value="S"${S.rule === 'S' ? ' selected' : ''}>Team survival</option><option value="W"${S.rule === 'W' ? ' selected' : ''}>Team sprint (10 weeks)</option></select></div>` : ''}
    ${ps.map(p => `<div class="btnrow" style="align-items:center;gap:8px"><b>${esc(p.nick)}${p.me ? ' (you)' : ''}</b>${p.host ? '<span class="tag">Host</span>' : ''}<span class="tag">${p.ready ? 'Ready' : 'Not ready'}</span></div>`).join('')}
    <div class="btnrow" style="align-items:center">${playing ? '' : `<button class="btn primary" id="cpReady" ${ps.length >= 2 && S.phase === 'lobby' ? '' : 'disabled'}>${S.ready ? 'Not ready' : 'Ready'}</button>`}<button class="btn" id="cpLeave">Leave party</button><span class="hint">${esc(S.msg || (ps.length < 2 ? 'Waiting for friends to join…' : allReady ? 'Starting…' : 'Everyone presses Ready to start'))}</span></div></div>`;
}
function refresh() { try { const b = $('cpBox'); if (b) { b.innerHTML = boxHtml(); wire(); } } catch (e) { console.error(e); } }
function wire() {
  let el;
  if ((el = $('cpMake'))) el.onclick = safe(() => { const city = $('cpCity') && $('cpCity').value; if (!city) { toast('Pick a city first'); return; } let c = ''; for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)]; join(c, true, city, $('cpRule').value === 'W' ? 'W' : 'S'); });
  if ((el = $('cpJoin'))) el.onsubmit = safe(e => { e.preventDefault(); const c = String($('cpCode').value || '').toUpperCase().trim(); if (!/^[A-HJ-NP-Z]{4}$/.test(c)) { toast('A party code is 4 letters'); return; } join(c, false); });
  if ((el = $('cpCopy'))) el.onclick = safe(() => { const t = S.room; try { navigator.clipboard.writeText(t).then(() => (HK.ok || HK.toast)('Party code copied: ' + t), () => HK.toast('Party code: ' + t, 4000)); } catch (_) { HK.toast('Party code: ' + t, 4000); } });
  if ((el = $('cpRule2'))) el.onchange = safe(() => { S.rule = el.value === 'W' ? 'W' : 'S'; S.ready = false; track(); refresh(); });
  if ((el = $('cpReady'))) el.onclick = safe(() => { if (S.phase === 'lobby') { S.ready = !S.ready; track(); refresh(); } });
  if ((el = $('cpLeave'))) el.onclick = safe(() => leave());
}
HK.addMenuSection('Co-op party', () => `<div id="cpBox">${boxHtml()}</div>`, safe(() => refresh()));
window.LLPartyRoom = () => (S.phase === 'lobby' && S.room) ? S.room : null;

// ---------- room ----------
function join(room, host, city, rule) {
  const O = online(); if (!O) { toast('Go online first'); return; }
  leave(true);
  S = fresh(); S.room = room; S.host = host; S.city = city || null; S.rule = rule || 'S'; S.phase = 'lobby'; S.joinedAt = Date.now(); S.msg = host ? '' : 'Looking for the party…';
  if (host) { S.hostId = myId(); S.roster = [myId()]; }
  const mine = S;
  const open = priv => {
    if (S !== mine) return;
    if (S.ch) { try { S.ch.untrack(); } catch (_) {} try { O.sb.removeChannel(S.ch); } catch (_) {} }
    S.priv = priv;
    const ch = O.sb.channel('coop:' + room, {config: {private: priv, broadcast: {self: false}, presence: {key: myId()}}});
    S.ch = ch;
    const on = (ev, f) => ch.on('broadcast', {event: ev}, safe(m => { if (S === mine && S.ch === ch) { const p = (m && m.payload) || {}; if (gate(ev, p)) f(p); } }));
    on('start', onStart);
    on('state', p => { const m = S.mates[p.id]; if (S.phase !== 'playing') return; m.score = num(p.score, 0, 1e6, 0) | 0; m.week = num(p.week, 0, 999, 0) | 0; m.danger = num(p.danger, 0, 1, 0); m.at = Date.now(); m.away = p.away === true; drawStrip(); });
    on('lost', p => { if (S.phase === 'playing' && S.rule === 'S') teamOut(nickOf(p.id)); });
    on('done', p => { if (S.phase !== 'playing') return; S.done[p.id] = num(p.score, 0, 1e6, 0) | 0; checkSprint(); });
    on('ping', p => { const k = p.k | 0, t = PINGS[k] || EM[k - 100]; if (t) try { HK.showEmote(nickOf(p.id) + ': ' + t); } catch (_) {} });
    ch.on('presence', {event: 'sync'}, safe(() => { if (S === mine && S.ch === ch) onSync(); }));
    ch.subscribe(safe((st, err) => {
      if (S !== mine || S.ch !== ch) return;
      if (st === 'SUBSCRIBED') track();
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
        const msg = String((err && (err.message || err)) || '');
        if (priv && /unauthor|permission|authoriz|private|policy|forbidden|rls/i.test(msg)) { open(false); return; } // server not on private channels yet
        toast('Could not connect to the party'); if (S.phase === 'lobby') leave();
      }
    }));
  };
  open(true);
  if (!host) S.timers.push(setTimeout(safe(() => { if (S === mine && S.phase === 'lobby' && !S.hostId) { toast('No party with that code'); leave(); } }), 3500));
  refresh();
}
function leave(quiet) {
  const o = S; for (const t of o.timers) { clearTimeout(t); clearInterval(t); }
  try { if (o.ch) { try { o.ch.untrack(); } catch (_) {} window.LLOnline.sb.removeChannel(o.ch); } } catch (_) {}
  S = fresh(); if (!quiet) refresh();
}
function onSync() {
  const raw = rawPeers(), me = myId();
  if (S.phase === 'lobby') {
    // a joiner locks onto the first presence (server order) that claims host; later claims are ignored, never a reason to leave
    if (!S.host && !S.hostId) { const h = raw.find(p => p.host && !p.me); if (h) { S.hostId = h.id; S.roster = [h.id]; S.msg = ''; } }
    if (S.hostId) {
      const here = new Set(raw.map(p => p.id));
      S.roster = S.roster.filter(id => id === S.hostId || here.has(id)); // lobby: people who left free their seat
      for (const p of raw) if (S.roster.length < MAX && !S.roster.includes(p.id) && (p.me ? true : !p.host)) S.roster.push(p.id);
      if (!S.roster.includes(me)) { toast('That party is full (4 players)'); leave(); return; }
      if (raw.some(p => !S.roster.includes(p.id)) && !S.warned2) { S.warned2 = true; HK.toast('Someone else tried to join', 2500); }
      fetchNicks(S.roster.filter(id => id !== me));
      const h = raw.find(p => p.id === S.hostId && !p.me);
      if (!S.host && h) { S.msg = ''; S.city = h.city; S.rule = h.rule === 'W' ? 'W' : 'S'; }
    }
    const ps = peers();
    if (ps.length < 2 && S.ready) { S.ready = false; track(); }
    refresh();
    if (S.host && ps.length >= 2 && ps.every(p => p.ready)) {
      const now = Date.now(), p = {city: S.city, rule: S.rule, seed: 1 + Math.floor(Math.random() * 1679615), startAt: now + 4000, sentAt: now, ids: ps.map(x => x.id)};
      send('start', p); onStart(Object.assign({id: me}, p));
    }
  } else if (S.phase === 'playing') {
    const here = new Set(raw.map(p => p.id));
    for (const id of Object.keys(S.mates)) { const m = S.mates[id]; if (!here.has(id)) { if (!m.goneAt) m.goneAt = Date.now(); } else m.goneAt = 0; }
  }
}
function onStart(p) {
  if (S.phase !== 'lobby') return;
  const city = String(p.city || ''); if (!HK.cities().some(c => c.id === city)) { toast("Your game doesn't have that city"); return; }
  S.city = city; S.rule = p.rule === 'W' ? 'W' : 'S'; S.seed = Math.floor(num(p.seed, 1, 1679615, 1)); S.phase = 'countdown'; S.ready = false; track();
  // teammates: only people the host named who are really in the room, at most 3 besides me
  const me = myId(), here = new Set(rawPeers().map(x => x.id)), named = Array.isArray(p.ids) ? p.ids.filter(x => typeof x === 'string') : [];
  S.mates = {};
  for (const id of S.roster) if (id !== me && here.has(id) && (S.host || named.includes(id)) && Object.keys(S.mates).length < MAX - 1) S.mates[id] = {nick: nickOf(id), score: 0, week: 1, danger: 0, at: Date.now()};
  const delay = num(+p.startAt - +p.sentAt, 0, 10000, 4000), mine = S;
  for (let i = 3; i >= 1; i--) S.timers.push(setTimeout(() => { if (S === mine) big(String(i)); }, delay - i * 1000));
  S.timers.push(setTimeout(safe(() => { if (S === mine) go(); }), delay));
  refresh();
}
function big(t) {
  try { let el = $('ldBig'); if (!el) { el = document.createElement('div'); el.id = 'ldBig'; el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:70;font:800 120px var(--display,system-ui);color:var(--accent,#e5622b);text-shadow:0 6px 30px rgba(0,0,0,.25);transition:opacity .3s'; document.body.appendChild(el); }
    el.textContent = t; el.style.opacity = '1'; clearTimeout(big.t); big.t = setTimeout(() => { el.style.opacity = '0'; }, t === 'Go!' ? 700 : 950); } catch (_) {}
}
function go() {
  if (S.phase !== 'countdown') return;
  big('Go!'); S.phase = 'playing';
  let ok = false; try { ok = HK.startLiveDuel({cityId: S.city, seed: S.seed, rule: S.rule, room: 'CO' + S.room}); } catch (_) {}
  if (!ok) { toast('Could not start'); S.phase = 'lobby'; refresh(); return; }
  buildStrip(); const mine = S;
  S.timers.push(setInterval(safe(() => { if (S === mine) tick(); }), 1000));
}
function tick() {
  if (S.phase !== 'playing') return;
  let st = null; try { st = HK.duelState(); } catch (_) {}
  if (st) send('state', {score: st.score | 0, week: st.week | 0, danger: Math.round(num(st.danger, 0, 1, 0) * 100) / 100, away: document.hidden});
  try { const strip = HK.oppStrip(); if (strip && strip.hidden && HK.inLiveDuel() && !document.querySelector('#sheet:not([hidden])')) strip.hidden = false; if (strip && !strip.querySelector('.cpT')) buildStrip(); } catch (_) {}
  const now = Date.now();
  for (const id of Object.keys(S.mates)) { const m = S.mates[id]; if ((m.goneAt && now - m.goneAt > LEFT_MS) || now - m.at > LEFT_MS) { delete S.mates[id]; HK.toast(m.nick + ' left the party', 3000); } }
  drawStrip();
}
// ---------- team strip ----------
function buildStrip() {
  const strip = HK.oppStrip(); if (!strip) return;
  strip.innerHTML = '<b class="cpT">Team 0</b><span class="cpL" style="display:inline-flex;gap:8px;flex-wrap:wrap"></span><button class="btn" type="button" id="cpPingB" style="padding:2px 8px;font-size:13px">📣 Ping</button>';
  S.ui = {t: strip.querySelector('.cpT'), l: strip.querySelector('.cpL')};
  strip.querySelector('#cpPingB').onclick = safe(e => { e.stopPropagation(); pingMenu(); });
  drawStrip();
}
function myScore() { try { const st = HK.duelState(); return st ? st.score | 0 : 0; } catch (_) { return 0; } }
function drawStrip() {
  const u = S.ui; if (!u || !u.t) return;
  const ms = Object.values(S.mates), total = myScore() + ms.reduce((a, m) => a + m.score, 0);
  u.t.textContent = 'Team ' + total + (S.rule === 'W' ? ' · wk ' + Math.min(10, (HK.duelState() || {}).week || 1) + '/10' : '');
  u.l.innerHTML = ms.map(m => `<span title="${esc(m.nick)}" style="display:inline-flex;gap:4px;align-items:center"><i style="width:8px;height:8px;border-radius:50%;background:${m.away || Date.now() - m.at > 4000 ? '#f2b311' : '#2f9e5b'}"></i>${esc(m.nick)} <b>${m.score}</b><i style="width:26px;height:5px;border-radius:3px;background:rgba(128,128,128,.35);overflow:hidden"><i style="display:block;height:100%;width:${Math.round(m.danger * 100)}%;background:#e5484d"></i></i></span>`).join('');
  if (ms.some(m => m.danger > 0.7) && !S.warned) { S.warned = true; HK.toast('A teammate is close to overflowing!', 2500); } else if (!ms.some(m => m.danger > 0.5)) S.warned = false;
}
function pingMenu() {
  let r = $('cpPings'); if (r) { r.remove(); return; }
  r = document.createElement('div'); r.id = 'cpPings';
  r.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 110px);z-index:66;display:flex;flex-wrap:wrap;gap:6px;max-width:94vw;justify-content:center;background:var(--panel,#fff);padding:10px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.2)';
  r.innerHTML = PINGS.map((t, k) => `<button class="btn" data-pg="${k}" style="font-size:13px">${esc(t)}</button>`).join('');
  document.body.appendChild(r);
  r.querySelectorAll('[data-pg]').forEach(b => b.onclick = safe(() => { const now = Date.now(); if (now - (S.lastPing || 0) < 2500) { toast('Wait a moment before pinging again'); return; } S.lastPing = now; send('ping', {k: +b.dataset.pg}); try { HK.showEmote('You: ' + PINGS[+b.dataset.pg]); } catch (_) {} r.remove(); }));
}
HK.on('emote', safe(k => { if (S.phase === 'playing' && Number.isInteger(k) && k >= 0 && k < 8) send('ping', {k: 100 + k}); }));
// ---------- ending ----------
function total() { return myScore() + Object.values(S.mates).reduce((a, m) => a + m.score, 0); }
function endCard(title, extra) {
  const rows = [`<div class="btnrow"><b>${esc(myNick())} (you)</b><span class="tag">${myScore()}</span></div>`].concat(Object.values(S.mates).map(m => `<div class="btnrow"><b>${esc(m.nick)}</b><span class="tag">${m.score}</span></div>`)).join('');
  const html = `<p class="hint">${esc(extra || '')}</p><div class="small">Team total</div><div class="big">${total()}</div>${rows}<div class="btnrow"><button class="btn" id="cpAgain">Back to party</button></div>`;
  let box = $('liveDuelEnd');
  if (box) box.innerHTML = `<h3>${esc(title)}</h3>` + html; else try { HK.endDuel(title, html); } catch (_) {}
  const b = $('cpAgain'); if (b) b.onclick = safe(() => { S.phase = 'lobby'; S.mates = {}; S.done = {}; S.ready = false; S.ui = null; track(); try { HK.menu(); } catch (_) {} });
  try { const best = JSON.parse(localStorage.getItem('ll.coopBest') || '0') | 0; if (total() > best) { localStorage.setItem('ll.coopBest', String(total())); HK.toast('New team best: ' + total() + '!', 3000); } } catch (_) {}
}
function stop() { for (const t of S.timers) { clearTimeout(t); clearInterval(t); } S.timers = []; S.phase = 'ended'; try { const r = $('cpPings'); if (r) r.remove(); } catch (_) {} }
function teamOut(who) { if (S.phase !== 'playing') return; stop(); endCard('Team overflowed', who + "'s city overflowed. Final team score:"); }
function checkSprint() {
  if (S.phase !== 'playing' || !S.myDone) return;
  const need = Object.keys(S.mates); if (need.every(id => S.done[id] != null)) { for (const id of need) S.mates[id].score = S.done[id]; stop(); endCard('Sprint finished! 🏁', 'Everyone reached week 10.'); }
}
HK.on('gameover', safe(d => {
  if (!d || !d.live || S.phase !== 'playing') return;
  const score = d.score | 0;
  if (S.rule === 'S') { const s = () => send('lost', {}); s(); setTimeout(s, 600); stop(); endCard('Team overflowed', 'Your city overflowed. Final team score:'); return; }
  S.myDone = true; const s = () => send('done', {score}); s(); setTimeout(s, 600); setTimeout(s, 2000);
  if (d.sprintDone) { try { HK.endDuel('Sprint finished! 🏁', '<div id="liveDuelEnd"><p class="hint">Waiting for your teammates…</p></div>'); } catch (_) {} }
  checkSprint(); const mine = S; S.timers.push(setTimeout(safe(() => { if (S === mine && S.phase === 'playing') { stop(); endCard('Sprint finished! 🏁', 'Some teammates did not finish in time.'); } }), 60000));
}));
HK.on('newgame', safe(d => { if (d && !d.live && S.room) leave(); }));
if (window.LLOnline && window.LLOnline.onChange) { try { window.LLOnline.onChange(safe(() => { if (!online() && S.room) leave(); else refresh(); })); } catch (_) {} }
})();
