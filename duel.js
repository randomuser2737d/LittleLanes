// Little Lanes: live duels over Supabase Realtime (broadcast + presence). Needs window.LLHooks and window.LLOnline.
// Wrapped in an IIFE so it cannot clash with the top-level names in index.html.
(() => {
'use strict';
const HK = window.LLHooks;
if (!HK) return;

const EM = ['👋 Hi!', '🍀 Good luck!', '🛣️ Nice road!', '🚗💥 Oops…', '😅 That was close!', '🔥 Bring it!', '🤝 GG', '🔁 Rematch?'];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const COLORS = ['#e5484d', '#3e7bfa', '#eea300', '#2fa36b', '#8e5cd9', '#12a5b8'];
const RULES = {S: 'Survival', W: 'Sprint'};
const WAIT_DONE_MS = 60000, LEFT_MS = 30000, ABSENT_MS = 6000;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (d || 0); };
const safe = f => function () { try { return f.apply(this, arguments); } catch (e) { try { console.error('duel.js', e); } catch (_) {} } };
const $ = id => document.getElementById(id);
const toast = (m, ms) => { try { if (/copied|sent to|welcome|moved here|accepted|saved|added/i.test(m) || !HK.error) HK.toast(m, ms); else HK.error(m); } catch (_) {} };
// a duel needs a signed-in player who has picked a nickname (LLOnline.profile())
const online = () => { const O = window.LLOnline; try { return O && O.sb && O.user && O.user() && O.profile && O.profile() ? O : null; } catch (_) { return null; } };
const myNick = () => { const p = online() && window.LLOnline.profile(); return String((p && p.nickname) || 'Player').slice(0, 20); };
const myId = () => { const u = online() && window.LLOnline.user(); return String((u && (u.id || u.user_id)) || ''); };
const cityName = id => { try { const c = HK.cities().find(c => c.id === id); return c ? c.name : id; } catch (_) { return id; } };

function fresh() {
  return {ch: null, room: null, host: false, city: null, rule: 'S', phase: 'idle', ready: false, seed: 0,
    tickT: null, cdT: null, goT: null, waitT: null, joinT: null, ticks: 0, oppState: null, oppStateAt: 0, oppId: null, oppNick: 'Opponent',
    oppLost: false, oppDone: null, myDone: null, myLost: false, lastEmote: 0, absentSince: 0, big: false, mm: null, dbCode: null, recorded: false,
    msg: '', countText: '', ui: null};
}
let S = fresh();

// ---------- menu section ----------
function boxHtml() {
  const INPS = typeof INP !== 'undefined' ? INP : '';
  if (!online()) return '<p class="hint">Go online in the Online section first to duel friends live.</p>';
  if (!S.room) {
    let cs = []; try { cs = HK.cities().filter(c => c.unlocked); } catch (_) {}
    return `<div class="stack"><div class="small">Create a room</div>
      <div class="btnrow" style="align-items:center"><select id="ldCity" style="${INPS}">${cs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      <select id="ldRule" style="${INPS}"><option value="S">Survival: first to overflow loses</option><option value="W">Sprint: most trips after week 10</option></select>
      <button class="btn primary" id="ldMake">Create room</button></div>
      <div class="small">Join a room</div>
      <form class="btnrow" id="ldJoin" style="align-items:center"><input id="ldCode" maxlength="4" placeholder="ABCD" autocomplete="off" style="${INPS};text-transform:uppercase"><button class="btn" type="submit">Join</button></form>
      <p class="hint">Both players press Ready, then the game starts for both at the same moment.</p></div>`;
  }
  const ps = peers(), me = ps.find(p => p.me), opp = ps.find(p => !p.me), host = ps.find(p => p.host);
  const row = (p, label) => `<div class="btnrow" style="align-items:center;gap:8px"><b>${esc(label)}</b><span class="tag">${p ? (p.ready ? 'Ready' : 'Not ready') : 'waiting…'}</span></div>`;
  const hostMeta = host || (S.host ? {city: S.city, rule: S.rule} : null);
  const playing = S.phase === 'countdown' || S.phase === 'playing';
  return `<div class="stack"><div><div class="small">Room</div><div class="btnrow" style="align-items:center"><span class="codebox"><span class="small">Room code</span><b>${esc(S.room)}</b><button class="btn" id="ldCopy" type="button">Copy</button></span><span class="hint">${opp ? 'Friend joined' : 'Send this code to a friend'}</span></div>
    ${hostMeta && hostMeta.city ? `<p class="hint">${esc(cityName(hostMeta.city))} · ${esc(RULES[hostMeta.rule] || '')}</p>` : ''}</div>
    ${row(me, (me ? me.nick : myNick()) + ' (you)')}${row(opp, opp ? opp.nick : 'Friend')}
    <div class="btnrow" style="align-items:center">${playing ? '' : `<button class="btn primary" id="ldReady" ${opp && S.phase === 'lobby' ? '' : 'disabled'}>${S.ready ? 'Not ready' : 'Ready'}</button>`}<button class="btn" id="ldLeave">Leave room</button><span class="hint" id="ldCount">${esc(S.countText || S.msg || '')}</span></div></div>`;
}
function refresh() {
  try {
    const b = $('ldBox'); if (!b) return;
    b.innerHTML = boxHtml(); wireBox();
  } catch (e) { try { console.error(e); } catch (_) {} }
}
function wireBox() {
  const q = id => $(id);
  let el;
  if ((el = q('ldMake'))) el.onclick = safe(() => {
    const city = q('ldCity') && q('ldCity').value, rule = q('ldRule') && q('ldRule').value === 'W' ? 'W' : 'S';
    if (!city) { toast('Pick a city first'); return; }
    let code = ''; for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    join(code, true, city, rule);
  });
  if ((el = q('ldJoin'))) el.onsubmit = safe(e => {
    if (e && e.preventDefault) e.preventDefault();
    const code = String((q('ldCode') && q('ldCode').value) || '').toUpperCase().trim();
    if (!/^[A-HJ-NP-Z]{4}$/.test(code)) { toast('A room code is 4 letters'); return; }
    join(code, false, null, 'S');
  });
  if ((el = q('ldCopy'))) el.onclick = safe(() => { const t = S.room; try { navigator.clipboard.writeText(t).then(() => HK.toast('Room code copied: ' + t), () => HK.toast('Room code: ' + t, 4000)); } catch (_) { HK.toast('Room code: ' + t, 4000); } });
  if ((el = q('ldReady'))) el.onclick = safe(() => { if (S.phase === 'lobby') { S.ready = !S.ready; track(); refresh(); } });
  if ((el = q('ldLeave'))) el.onclick = safe(() => leave());
}
HK.addMenuSection('Live duel', () => `<div id="ldBox">${boxHtml()}</div>`, safe(() => refresh()));
if (window.LLOnline && window.LLOnline.onChange) { try { window.LLOnline.onChange(safe(() => { if (!online() && S.room) leave(); else refresh(); })); } catch (_) {} }

// ---------- channel ----------
function meta() { const m = {nick: myNick(), ready: !!S.ready, host: !!S.host}; if (S.host) { m.city = S.city; m.rule = S.rule; } return m; }
function track() { try { S.ch && S.ch.track(meta()); } catch (_) {} }
function send(event, payload) { try { S.ch && S.ch.send({type: 'broadcast', event, payload}); } catch (_) {} }
function peers() {
  const out = []; if (!S.ch) return out;
  let st = {}; try { st = S.ch.presenceState() || {}; } catch (_) {}
  const id = myId();
  for (const k of Object.keys(st)) {
    const arr = st[k]; const m = (Array.isArray(arr) ? arr[arr.length - 1] : arr) || {};
    out.push({id: k, me: k === id, nick: String(m.nick || 'Player').slice(0, 20), ready: !!m.ready, host: !!m.host, city: m.city, rule: m.rule});
  }
  return out;
}

function join(room, host, city, rule) {
  const O = online(); if (!O) { toast('Go online first'); refresh(); return; }
  leave(true);
  S = fresh(); S.room = room; S.host = host; S.city = city; S.rule = rule; S.phase = 'lobby'; S.msg = host ? '' : 'Looking for the room…';
  const me = myId();
  const ch = O.sb.channel('duel:' + room, {config: {broadcast: {self: false}, presence: {key: me}}});
  S.ch = ch; const mine = S;
  const on = (ev, f) => ch.on('broadcast', {event: ev}, safe(m => { if (S === mine) f((m && m.payload) || {}); }));
  on('start', onStart); on('state', onState); on('map', onMap); on('emote', onEmote); on('lost', onLost); on('done', onDone);
  ch.on('presence', {event: 'sync'}, safe(() => { if (S === mine) onSync(); }));
  ch.on('presence', {event: 'leave'}, safe(() => { if (S === mine) onSync(); }));
  ch.subscribe(safe(status => {
    if (S !== mine) return;
    if (status === 'SUBSCRIBED') { track(); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { toast('Could not connect to the room'); if (S.phase === 'lobby') leave(); }
  }));
  if (!host) S.joinT = setTimeout(safe(() => { if (S !== mine || S.phase !== 'lobby') return; if (!peers().some(p => p.host && !p.me)) { toast('No room with that code'); leave(); } }), 3500);
  refresh();
}

function leave(quiet) {
  const o = S; clearTimers(o);
  try { if (o.ch) { try { o.ch.untrack && o.ch.untrack(); } catch (_) {} const sb = online() && window.LLOnline.sb; (sb || window.LLOnline.sb).removeChannel(o.ch); } } catch (_) {}
  S = fresh(); if (!quiet) refresh();
}
function clearTimers(o) { for (const k of ['tickT', 'cdT']) if (o[k]) clearInterval(o[k]); for (const k of ['goT', 'waitT', 'joinT']) if (o[k]) clearTimeout(o[k]); o.tickT = o.cdT = o.goT = o.waitT = o.joinT = null; }

function onSync() {
  const ps = peers(), opp = ps.find(p => !p.me), others = ps.filter(p => !p.me);
  if (opp) { S.oppId = opp.id; S.oppNick = opp.nick; }
  if (S.phase === 'lobby') {
    if (!S.host) { const h = ps.find(p => p.host && !p.me); if (h) { S.msg = ''; S.city = h.city; S.rule = h.rule === 'W' ? 'W' : 'S'; if (S.joinT) { clearTimeout(S.joinT); S.joinT = null; } } }
    if (others.length > 1) { toast(S.host ? 'That room code is already taken' : 'That room is full'); leave(); return; }
    if (S.host && others.some(p => p.host)) { toast('That room code is taken, try again'); leave(); return; }
    if (!opp && S.ready) { S.ready = false; track(); }
    refresh(); checkStart();
  } else if (S.phase === 'playing') {
    if (opp) S.absentSince = 0; else if (!S.absentSince) S.absentSince = Date.now();
  }
}
function checkStart() {
  if (!S.host || S.phase !== 'lobby' || !S.ready) return;
  const opp = peers().find(p => !p.me);
  if (opp && opp.ready) doStart();
}
function doStart() {
  const seed = 1 + Math.floor(Math.random() * 1679615), now = Date.now();
  const p = {city: S.city, seed, rule: S.rule, startAt: now + 4000, sentAt: now};
  send('start', p); onStart(p);
  try { // record: host inserts on start, ignore failures
    const sb = window.LLOnline.sb; S.dbCode = 'LIVE-' + S.room + '-' + seed;
    const row = {code: S.dbCode, city: p.city, seed, rule: p.rule, status: 'playing'}; if (!window.__llDuelRoomUsed) row.room = S.room; window.__llDuelRoomUsed = true;
    Promise.resolve(sb.from('duels').insert(row)).then(null, () => {});
  } catch (_) {}
}
function onStart(p) {
  if (S.phase !== 'lobby') return;
  const cities = (() => { try { return HK.cities(); } catch (_) { return []; } })();
  const city = String(p.city || ''), rule = p.rule === 'W' ? 'W' : 'S', seed = Math.floor(num(p.seed, 1, 1679615, 1));
  if (!cities.some(c => c.id === city)) { toast("Your game doesn't have that city"); return; }
  S.city = city; S.rule = rule; S.seed = seed; S.phase = 'countdown'; S.ready = false; track();
  let delay = 4000; if (Number.isFinite(+p.startAt) && Number.isFinite(+p.sentAt)) delay = num(+p.startAt - +p.sentAt, 0, 10000, 4000);
  const at = Date.now() + delay, mine = S;
  let last = -1;
  const tickCd = () => { const n = Math.max(0, Math.ceil((at - Date.now()) / 1000)); if (n === last) return; last = n; S.countText = n > 0 ? 'Starting in ' + n + '…' : 'Go!'; if (n > 0) toast(String(n), 900); const c = $('ldCount'); if (c) c.textContent = S.countText; };
  tickCd(); S.cdT = setInterval(safe(() => { if (S === mine) tickCd(); }), 200);
  S.goT = setTimeout(safe(() => { if (S === mine) go(); }), delay);
  refresh();
}
function go() {
  if (S.phase !== 'countdown') return;
  if (S.cdT) { clearInterval(S.cdT); S.cdT = null; }
  S.phase = 'playing'; S.countText = '';
  let ok = false; try { ok = HK.startLiveDuel({cityId: S.city, seed: S.seed, rule: S.rule, room: S.room}); } catch (_) {}
  if (!ok) { toast('Could not start the duel'); S.phase = 'lobby'; refresh(); return; }
  S.oppStateAt = Date.now(); S.absentSince = 0; S.ticks = 0; S.oppState = null; S.mm = null; S.oppLost = false; S.oppDone = null; S.myDone = null; S.myLost = false; S.ui = null;
  buildStrip(); const mine = S;
  S.tickT = setInterval(safe(() => { if (S === mine) tick(); }), 1000);
  tick();
}
function tick() {
  if (S.phase !== 'playing') return;
  S.ticks++;
  let st = null; try { st = HK.duelState(); } catch (_) {}
  if (st) send('state', {score: st.score | 0, week: st.week | 0, danger: Math.round(num(st.danger, 0, 1, 0) * 100) / 100, over: !!st.over, lost: !!st.lost});
  if ((S.ticks - 1) % 3 === 0) {
    let mm = null; try { mm = HK.miniMap(); } catch (_) {}
    if (mm) send('map', {W: mm.W | 0, H: mm.H | 0, rect: mm.rect, roads: mm.roads, houses: mm.houses, dests: mm.dests});
  }
  if (S.myDone) send('done', {score: S.myDone.score});
  const now = Date.now();
  if (S.absentSince && now - S.absentSince > ABSENT_MS) { oppLeft(); return; }
  if (now - S.oppStateAt > LEFT_MS) oppLeft();
}

// ---------- incoming ----------
function onState(p) {
  if (S.phase !== 'playing') return;
  S.oppStateAt = Date.now(); S.absentSince = 0;
  S.oppState = {score: Math.floor(num(p.score, 0, 1e6, 0)), week: Math.floor(num(p.week, 0, 999, 0)), danger: num(p.danger, 0, 1, 0), over: !!p.over, lost: !!p.lost};
  renderStrip();
  if (S.rule === 'S' && S.oppState.lost) oppLost(S.oppState.score);
}
function onMap(p) {
  if (S.phase !== 'playing') return;
  const W = Math.floor(num(p.W, 1, 300, 0)), H = Math.floor(num(p.H, 1, 300, 0)), r = p.rect || {};
  if (!W || !H) return;
  const arr = (a, n) => Array.isArray(a) ? a.slice(0, n) : [];
  S.mm = {W, H, rect: {x: num(r.x, 0, W, 0), y: num(r.y, 0, H, 0), w: Math.max(1, num(r.w, 1, W, W)), h: Math.max(1, num(r.h, 1, H, H))},
    roads: arr(p.roads, 6000).map(v => num(v, 0, W * H, 0)), houses: arr(p.houses, 800).filter(Array.isArray).map(h => [num(h[0], 0, W * H, 0), Math.floor(num(h[1], -1, 99, 0))]),
    dests: arr(p.dests, 200).filter(Array.isArray).map(d => [num(d[0], 0, W, 0), num(d[1], 0, H, 0), Math.floor(num(d[2], -1, 99, 0))])};
  renderStrip();
}
function onEmote(p) {
  const k = p && p.k; if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k > 7) return;
  const now = Date.now(); if (now - S.lastEmote < 1000) return; S.lastEmote = now;
  try { HK.showEmote(S.oppNick + ': ' + EM[k]); } catch (_) {}
}
function onLost(p) { if (S.rule === 'S') oppLost(Math.floor(num(p.score, 0, 1e6, 0))); }
function onDone(p) {
  if (S.phase !== 'playing' || S.rule !== 'W' || S.oppDone) return;
  S.oppDone = {score: Math.floor(num(p.score, 0, 1e6, 0))};
  if (S.myDone) decide();
}
HK.on('emote', safe(k => { if (S.ch && typeof k === 'number' && Number.isInteger(k) && k >= 0 && k <= 7) send('emote', {k}); }));

// ---------- ending ----------
function stopPlay() { for (const k of ['tickT']) if (S[k]) clearInterval(S[k]); for (const k of ['waitT']) if (S[k]) clearTimeout(S[k]); S.tickT = S.waitT = null; }
function endInner(text) { return `<p>${text}</p><div class="btnrow"><button class="btn" id="ldRematch">Rematch</button></div>`; }
function fillEnd(inner, tries) {
  const el = $('liveDuelEnd');
  if (!el) { if ((tries == null ? 20 : tries) > 0) setTimeout(safe(() => fillEnd(inner, (tries == null ? 20 : tries) - 1)), 50); return; }
  el.innerHTML = inner;
  const b = el.querySelector && el.querySelector('#ldRematch'); if (b) b.onclick = safe(() => rematch());
}
function showEnd(title, text) {
  try { HK.endDuel(title, '<div id="liveDuelEnd"></div>'); } catch (_) {}
  fillEnd(endInner(text), 5);
}
function record(winner, a, b) {
  if (!S.host || !S.dbCode) return;
  try { const sb = window.LLOnline.sb; const upd = {status: 'done', result: {winner, p1: a, p2: b}}; if (S.oppId) upd.p2 = S.oppId;
    Promise.resolve(sb.from('duels').update(upd).eq('code', S.dbCode)).then(null, () => {}); } catch (_) {}
}
function oppLost(score) {
  if (S.phase !== 'playing' || S.rule !== 'S' || S.myLost) return;
  let playing = false; try { playing = HK.inLiveDuel(); } catch (_) {}
  if (!playing) return;
  S.oppLost = true; stopPlay(); S.phase = 'ended';
  showEnd('You win! 🏆', `${esc(S.oppNick)} overflowed with ${score} trips.`);
  record(S.host ? 'p1' : 'p2', null, score);
}
function oppLeft() {
  if (S.phase !== 'playing') return;
  if (S.rule === 'W' && S.myDone) { decide(true); return; }
  let playing = false; try { playing = HK.inLiveDuel(); } catch (_) {}
  stopPlay(); S.phase = 'ended';
  if (playing) { try { HK.endDuel('Your opponent left — you win', ''); } catch (_) {} }
  record(S.host ? 'p1' : 'p2', null, null);
}
function decide(left) {
  if (S.phase !== 'playing' || !S.myDone) return;
  if (S.waitT) { clearTimeout(S.waitT); S.waitT = null; }
  const mine = S.myDone.score, theirs = S.oppDone ? S.oppDone.score : (S.oppState ? S.oppState.score : 0);
  const note = S.oppDone ? '' : left ? ' (they left)' : " (they didn't finish)";
  stopPlay(); S.phase = 'ended';
  const t = mine > theirs ? 'You win! 🏆' : mine < theirs ? 'You lost.' : "It's a tie!";
  fillEnd(endInner(`${t} You had ${mine} trips, ${esc(S.oppNick)} had ${theirs}${note}.`));
  record(mine === theirs ? 'tie' : (mine > theirs) === S.host ? 'p1' : 'p2', S.host ? mine : theirs, S.host ? theirs : mine);
}
HK.on('gameover', safe(d => {
  if (!d || !d.live || S.phase !== 'playing') return;
  const score = Math.floor(num(d.score, 0, 1e6, 0)), week = Math.floor(num(d.week, 0, 999, 0));
  if (S.rule === 'S') {
    if (d.sprintDone) return;
    S.myLost = true; stopPlay(); S.phase = 'ended';
    const sendLost = () => send('lost', {score, week}); sendLost(); setTimeout(safe(sendLost), 500); setTimeout(safe(sendLost), 1500);
    const theirs = S.oppState ? S.oppState.score : 0;
    fillEnd(endInner(`You lost. ${esc(S.oppNick)} had ${theirs} trips.`));
    record(S.host ? 'p2' : 'p1', S.host ? score : theirs, S.host ? theirs : score);
  } else {
    if (S.myDone) return;
    S.myDone = {score, lost: !d.sprintDone}; send('done', {score});
    if (d.sprintDone) { try { HK.endDuel('Sprint finished! 🏁', '<div id="liveDuelEnd"><p class="hint">Waiting for your opponent…</p></div>'); } catch (_) {} }
    if (S.oppDone) decide(); else { const mine = S; S.waitT = setTimeout(safe(() => { if (S === mine) decide(); }), WAIT_DONE_MS); }
  }
}));
HK.on('newgame', safe(d => { if (d && !d.live && S.room) leave(); }));

function rematch() {
  if (!S.ch || S.phase !== 'ended') return;
  stopPlay(); S.phase = 'lobby'; S.ready = false; S.msg = ''; S.countText = ''; S.oppState = null; S.mm = null; S.oppLost = false; S.oppDone = null; S.myDone = null; S.myLost = false;
  track(); try { HK.menu(); } catch (_) {} refresh();
}

// ---------- opponent strip ----------
function buildStrip() {
  const strip = HK.oppStrip(); if (!strip) return;
  strip.innerHTML = '<b class="ldN"></b><span class="ldS">0</span><span class="ldW">wk 1</span>' +
    '<span style="display:inline-block;width:38px;height:6px;border-radius:3px;background:rgba(128,128,128,.35);overflow:hidden;vertical-align:middle"><i class="ldD" style="display:block;height:100%;width:0;background:#e5484d"></i></span>' +
    '<canvas class="ldC" width="60" height="38" style="border-radius:4px;background:#e9e4d8;cursor:pointer;vertical-align:middle"></canvas>';
  const q = s => strip.querySelector(s);
  S.ui = {n: q('.ldN'), s: q('.ldS'), w: q('.ldW'), d: q('.ldD'), c: q('.ldC')};
  if (S.ui.n) S.ui.n.textContent = S.oppNick;
  if (S.ui.c) S.ui.c.onclick = safe(() => { S.big = !S.big; S.ui.c.width = S.big ? 240 : 60; S.ui.c.height = S.big ? 152 : 38; drawMap(); });
  drawMap();
}
function renderStrip() {
  const u = S.ui; if (!u) return;
  if (u.n) u.n.textContent = S.oppNick;
  const st = S.oppState; if (st) { if (u.s) u.s.textContent = String(st.score); if (u.w) u.w.textContent = 'wk ' + st.week; if (u.d) u.d.style.width = Math.round(st.danger * 100) + '%'; }
  drawMap();
}
function drawMap() {
  const u = S.ui, mm = S.mm; if (!u || !u.c || !u.c.getContext) return;
  const g = u.c.getContext('2d'); if (!g) return;
  const cw = u.c.width, ch = u.c.height; g.clearRect(0, 0, cw, ch); g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, cw, ch);
  if (!mm) return;
  const r = mm.rect, k = Math.min(cw / r.w, ch / r.h), ox = (cw - r.w * k) / 2, oy = (ch - r.h * k) / 2;
  const px = x => ox + (x - r.x + .5) * k, py = y => oy + (y - r.y + .5) * k;
  g.strokeStyle = '#4a4a4a'; g.lineWidth = Math.max(1, k * .5); g.beginPath();
  for (let i = 0; i + 1 < mm.roads.length; i += 2) { const a = mm.roads[i], b = mm.roads[i + 1]; g.moveTo(px(a % mm.W), py(Math.floor(a / mm.W))); g.lineTo(px(b % mm.W), py(Math.floor(b / mm.W))); }
  g.stroke();
  const col = c => c < 0 ? '#9a9a9a' : COLORS[c % COLORS.length], s = Math.max(2, k * .8);
  for (const [i, c] of mm.houses) { g.fillStyle = col(c); g.fillRect(px(i % mm.W) - s / 2, py(Math.floor(i / mm.W)) - s / 2, s, s); }
  for (const [x, y, c] of mm.dests) { g.fillStyle = col(c); g.fillRect(px(x) - s / 2, py(y) - s / 2, s, s); }
}
})();
